/**
 * GLS 자동화 오케스트레이터 (D-013 흐름 + D-027 탭 처리).
 *
 * 책임:
 * - GLS 탭 찾기/생성 (chrome.tabs.query → chrome.tabs.create)
 * - content script에 BG_CHECK_SESSION 보내 로그인 상태 확인
 * - 미로그인 시 popup에 LOGIN_REQUIRED 상태 푸시
 * - listSpaces로 후보 받아오기 → 후보 순회하며 BG_CHECK_AVAILABILITY 전송
 * - 가용 공간 찾으면 popup에 BG_CANDIDATE_PROPOSAL 푸시 → 사용자 confirm 대기 (return)
 * - submitConfirmedReservation()으로 제출 단계 진행
 *
 * 비활성 탭에서도 자동화 시도 (D-027). 단계별 실패 시 활성화 안내로 fallback (TODO 슬라이스 9에서 강화).
 */

import type { FilledSlots, AutomationStatus, SpaceCandidate } from '../shared/types';
import type {
  BgCheckSession,
  BgCheckAvailability,
  BgSubmitReservation,
  ContentSessionState,
  ContentAvailabilityResult,
  ContentSubmitResult,
  BgCandidateProposal,
  ReservationFormData,
} from '../shared/messages';
import * as apiClient from './apiClient';

const GLS_URL = 'https://kingoinfo.skku.edu/';
const GLS_URL_MATCH = 'https://kingoinfo.skku.edu/*';

// ----- per-conversation queue state -----

export interface CandidateQueueState {
  conversationId: string;
  tabId: number;
  date: string;
  startHour: number;
  endHour: number;
  startTime: string; // HH:MM (for submit echo)
  endTime: string;
  remaining: SpaceCandidate[]; // not-yet-checked candidates
  totalCount: number;
  triedCount: number;
  lastProposed: SpaceCandidate | null;
}

const queues = new Map<string, CandidateQueueState>();

export function getQueue(conversationId: string): CandidateQueueState | undefined {
  return queues.get(conversationId);
}

export function clearQueue(conversationId: string): void {
  queues.delete(conversationId);
}

// ----- small chrome.* promise helpers -----

async function findOrCreateGlsTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: GLS_URL_MATCH });
  if (tabs.length > 0 && tabs[0].id !== undefined) {
    return tabs[0];
  }
  return chrome.tabs.create({ url: GLS_URL, active: false });
}

async function sendToTab<TReq, TRes>(tabId: number, msg: TReq): Promise<TRes> {
  // MV3: chrome.tabs.sendMessage returns a Promise if no callback supplied.
  return (await chrome.tabs.sendMessage(tabId, msg)) as TRes;
}

function pickFirstCampusBuilding(slots: FilledSlots): { campusCode?: string; buildingNo?: string } {
  // slots.building is a free-form name string per types.ts; without a resolver we
  // pass nothing here. Server-side filtering by building/campus can be wired
  // later once a name→code lookup is in place.
  if (slots.building) {
    // Intentionally no-op for now; placeholder for future resolver.
  }
  return {};
}

function parseHourFromHHMM(hhmm: string | null): number {
  if (!hhmm) throw new Error('time slot missing');
  const [h] = hhmm.split(':');
  return Number.parseInt(h, 10);
}

// ----- flow entry -----

export interface RunReservationFlowArgs {
  conversationId: string;
  slots: FilledSlots;
  onStatusChange: (s: AutomationStatus) => void;
}

export async function runReservationFlow(args: RunReservationFlowArgs): Promise<void> {
  const { conversationId, slots, onStatusChange } = args;

  if (slots.headcount == null) {
    onStatusChange({ kind: 'error', message: 'headcount이 비어 있습니다.' });
    return;
  }
  if (!slots.date || !slots.start_time || !slots.end_time) {
    onStatusChange({ kind: 'error', message: '날짜·시간 슬롯이 비어 있습니다.' });
    return;
  }

  onStatusChange({ kind: 'opening_gls' });

  let tab: chrome.tabs.Tab;
  try {
    tab = await findOrCreateGlsTab();
  } catch (e) {
    onStatusChange({ kind: 'error', message: `GLS 탭 열기 실패: ${(e as Error).message}` });
    return;
  }
  if (tab.id === undefined) {
    onStatusChange({ kind: 'error', message: 'GLS 탭 ID 확보 실패' });
    return;
  }
  const tabId = tab.id;

  // session check
  let session: ContentSessionState;
  try {
    session = await sendToTab<BgCheckSession, ContentSessionState>(tabId, { type: 'BG_CHECK_SESSION' });
  } catch (e) {
    // Likely content script not ready (e.g. tab just opened) — surface as login_required so
    // the user activates the tab and the content script can initialize.
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    onStatusChange({ kind: 'login_required' });
    return;
  }
  if (!session.loggedIn) {
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    onStatusChange({ kind: 'login_required' });
    return;
  }

  // fetch candidates
  let candidates: SpaceCandidate[];
  try {
    candidates = await apiClient.listSpaces({
      headcount: slots.headcount,
      ...pickFirstCampusBuilding(slots),
    });
  } catch (e) {
    onStatusChange({ kind: 'error', message: `후보 조회 실패: ${(e as Error).message}` });
    return;
  }

  if (candidates.length === 0) {
    onStatusChange({ kind: 'no_candidate' });
    return;
  }

  const startHour = parseHourFromHHMM(slots.start_time);
  const endHour = parseHourFromHHMM(slots.end_time);

  const state: CandidateQueueState = {
    conversationId,
    tabId,
    date: slots.date,
    startHour,
    endHour,
    startTime: slots.start_time,
    endTime: slots.end_time,
    remaining: [...candidates],
    totalCount: candidates.length,
    triedCount: 0,
    lastProposed: null,
  };
  queues.set(conversationId, state);

  onStatusChange({ kind: 'searching', tried: 0, total: state.totalCount });

  await searchNext(state, onStatusChange);
}

/**
 * Iterate the remaining queue until one candidate is available, then propose it
 * to the popup and return. If none available, emit no_candidate and clear queue.
 */
async function searchNext(
  state: CandidateQueueState,
  onStatusChange: (s: AutomationStatus) => void,
): Promise<void> {
  while (state.remaining.length > 0) {
    const candidate = state.remaining.shift()!;
    state.triedCount += 1;
    onStatusChange({
      kind: 'searching',
      tried: state.triedCount,
      total: state.totalCount,
    });

    let result: ContentAvailabilityResult;
    try {
      result = await sendToTab<BgCheckAvailability, ContentAvailabilityResult>(state.tabId, {
        type: 'BG_CHECK_AVAILABILITY',
        candidate,
        date: state.date,
        startHour: state.startHour,
        endHour: state.endHour,
      });
    } catch (e) {
      // Skip on transient content errors; continue with next candidate.
      continue;
    }

    if (result.available) {
      state.lastProposed = candidate;
      onStatusChange({
        kind: 'candidate_found',
        spaceCode: candidate.glsSpaceCode,
        spaceName: candidate.roomName,
      });
      // Push proposal to popup (popup may be closed; non-fatal).
      const proposal: BgCandidateProposal = {
        type: 'BG_CANDIDATE_PROPOSAL',
        conversationId: state.conversationId,
        candidate,
      };
      try {
        await chrome.runtime.sendMessage(proposal);
      } catch {
        // popup not open — fine. Status update was already emitted.
      }
      return; // wait for POPUP_CONFIRM_RESERVATION
    }
  }

  onStatusChange({ kind: 'no_candidate' });
  queues.delete(state.conversationId);
}

/**
 * Called by SW when user rejects a proposed candidate: drop it and keep searching.
 */
export async function continueAfterRejection(
  conversationId: string,
  onStatusChange: (s: AutomationStatus) => void,
): Promise<void> {
  const state = queues.get(conversationId);
  if (!state) return;
  state.lastProposed = null;
  await searchNext(state, onStatusChange);
}

// ----- submit confirmed reservation -----

export interface SubmitConfirmedArgs {
  conversationId: string;
  candidate: SpaceCandidate;
  formData: ReservationFormData;
  date: string;
  startTime: string;
  endTime: string;
  onStatusChange: (s: AutomationStatus) => void;
}

export async function submitConfirmedReservation(args: SubmitConfirmedArgs): Promise<void> {
  const { conversationId, candidate, formData, onStatusChange } = args;
  const state = queues.get(conversationId);
  const tabId = state?.tabId ?? (await findOrCreateGlsTab()).id;
  if (tabId === undefined) {
    onStatusChange({ kind: 'error', message: 'GLS 탭 ID 확보 실패' });
    return;
  }

  onStatusChange({ kind: 'submitting' });

  let result: ContentSubmitResult;
  try {
    result = await sendToTab<BgSubmitReservation, ContentSubmitResult>(tabId, {
      type: 'BG_SUBMIT_RESERVATION',
      candidate,
      formData,
    });
  } catch (e) {
    onStatusChange({ kind: 'error', message: `제출 메시지 실패: ${(e as Error).message}` });
    return;
  }

  if (!result.ok) {
    onStatusChange({ kind: 'error', message: result.error ?? '제출 실패' });
    return;
  }

  onStatusChange({ kind: 'done', spaceCode: result.spaceCode });
  try {
    await chrome.notifications.create(`reservation-${conversationId}`, {
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: '예약 완료',
      message: `${candidate.buildingName} ${candidate.roomName} (${args.date} ${args.startTime}-${args.endTime}) 예약이 완료되었습니다.`,
      priority: 2,
    });
  } catch {
    // notifications icon may not yet exist — non-fatal.
  }
  queues.delete(conversationId);
}
