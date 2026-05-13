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

import type {
  FilledSlots,
  AutomationStatus,
  SpaceCandidate,
  SearchLogEntry,
} from '../shared/types';
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
  /** 각 후보 시도 결과 누적 — popup 에 탐색 로그로 노출. */
  log: SearchLogEntry[];
  /** Dev panel·미래의 행사메타 collector가 미리 채워둔 formData. confirm 시 fallback 으로 사용. */
  pendingFormData?: ReservationFormData;
}

const queues = new Map<string, CandidateQueueState>();

export function getQueue(conversationId: string): CandidateQueueState | undefined {
  return queues.get(conversationId);
}

export function clearQueue(conversationId: string): void {
  queues.delete(conversationId);
}

// ----- small chrome.* promise helpers -----

async function findOrCreateGlsTab(forceNew = false): Promise<chrome.tabs.Tab> {
  if (!forceNew) {
    const tabs = await chrome.tabs.query({ url: GLS_URL_MATCH });
    if (tabs.length > 0 && tabs[0].id !== undefined) {
      return tabs[0];
    }
  }
  // 새 탭은 background 로 (active:false) 열어 popup 이 닫히지 않도록 한다.
  // popup 은 새 탭이 활성화되면 자동 dismiss 되기 때문. 자동화는 비활성 탭에서도
  // content script + nexacro 가 정상 동작 (검증 2026-05-13). 사용자가 진행을 보고
  // 싶으면 수동으로 탭 전환.
  return chrome.tabs.create({ url: GLS_URL, active: false });
}

async function sendToTab<TReq, TRes>(tabId: number, msg: TReq): Promise<TRes> {
  // MV3: chrome.tabs.sendMessage returns a Promise if no callback supplied.
  return (await chrome.tabs.sendMessage(tabId, msg)) as TRes;
}

/**
 * 탭이 `status: 'complete'` 가 될 때까지 대기 (chrome.tabs.onUpdated 구독).
 * background 탭이라도 정상 로딩되긴 하나, 새로 만든 직후엔 'loading' 상태고
 * content_scripts 의 document_idle 이 아직 발화 안 됐을 수 있어 안전장치 필요.
 */
async function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  try {
    const t = await chrome.tabs.get(tabId);
    if (t.status === 'complete') return;
  } catch {
    /* tab maybe gone */
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`tab ${tabId} did not reach 'complete' in ${timeoutMs}ms`));
    }, timeoutMs);
    const listener = (
      updatedId: number,
      info: chrome.tabs.TabChangeInfo,
    ): void => {
      if (updatedId !== tabId) return;
      if (info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * 새로 만든 (또는 막 만든) GLS 탭에서 content script 가 로드돼서
 * BG_CHECK_SESSION 에 응답할 때까지 폴링한다.
 *
 * 1) 먼저 chrome.tabs.onUpdated 로 탭이 complete 될 때까지 대기 — content_scripts
 *    가 document_idle 에서 inject 되므로 그 이전에는 sendMessage 가 무조건 실패.
 * 2) 그 후 sendMessage 폴링으로 listener 등록 시점까지 대기.
 */
async function waitForContentReady(tabId: number, timeoutMs = 20000): Promise<ContentSessionState> {
  const startedAt = Date.now();
  try {
    await waitForTabComplete(tabId, Math.min(15000, timeoutMs - 2000));
  } catch (e) {
    // complete 신호 못 받아도 일단 polling 시도 — 실패하면 아래에서 surface.
  }
  const remaining = Math.max(2000, timeoutMs - (Date.now() - startedAt));
  const deadline = Date.now() + remaining;
  let lastErr: Error | null = null;
  while (Date.now() < deadline) {
    try {
      const res = await sendToTab<BgCheckSession, ContentSessionState>(tabId, {
        type: 'BG_CHECK_SESSION',
      });
      return res;
    } catch (e) {
      lastErr = e as Error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(
    `content script not ready in ${timeoutMs}ms: ${lastErr?.message ?? 'unknown'}`,
  );
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

/**
 * end_time 이 null 이고 duration_min 만 있는 경우 (LLM 이 "2시간" 같은 표현을
 * duration_min 으로 채운 케이스) start_time + duration_min 으로 계산.
 * 24h 넘어가는 자정 over flow 는 분 단위만 % 1440 으로 wrap.
 */
function deriveEndTime(slots: FilledSlots): string | null {
  if (slots.end_time) return slots.end_time;
  if (!slots.start_time || slots.duration_min == null) return null;
  const [hRaw, mRaw] = slots.start_time.split(':');
  const startMin = Number.parseInt(hRaw!, 10) * 60 + Number.parseInt(mRaw!, 10);
  const endMin = (startMin + slots.duration_min) % (24 * 60);
  const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
  const em = String(endMin % 60).padStart(2, '0');
  return `${eh}:${em}`;
}

// ----- flow entry -----

export interface RunReservationFlowArgs {
  conversationId: string;
  slots: FilledSlots;
  onStatusChange: (s: AutomationStatus) => void;
  /** Dev: candidates 를 외부에서 주입하면 서버 /spaces 호출을 건너뛴다. */
  candidates?: SpaceCandidate[];
  /** Dev: confirm 시 사용할 formData 를 미리 큐에 저장. */
  pendingFormData?: ReservationFormData;
  /** Dev: 기존 탭 재사용 대신 새 탭 강제 생성. */
  forceNewTab?: boolean;
}

export async function runReservationFlow(args: RunReservationFlowArgs): Promise<void> {
  const { conversationId, slots, onStatusChange } = args;

  if (slots.headcount == null) {
    onStatusChange({ kind: 'error', message: 'headcount이 비어 있습니다.' });
    return;
  }
  // LLM 이 end_time 대신 duration_min 만 채우는 경우가 있어 정규화.
  const endTime = deriveEndTime(slots);
  if (!slots.date || !slots.start_time || !endTime) {
    onStatusChange({ kind: 'error', message: '날짜·시간 슬롯이 비어 있습니다.' });
    return;
  }

  onStatusChange({ kind: 'opening_gls' });

  let tab: chrome.tabs.Tab;
  try {
    tab = await findOrCreateGlsTab(args.forceNewTab === true);
  } catch (e) {
    onStatusChange({ kind: 'error', message: `GLS 탭 열기 실패: ${(e as Error).message}` });
    return;
  }
  if (tab.id === undefined) {
    onStatusChange({ kind: 'error', message: 'GLS 탭 ID 확보 실패' });
    return;
  }
  const tabId = tab.id;

  // session check — content script 가 로드될 때까지 폴링 (새 탭은 inject 까지 시간 필요).
  let session: ContentSessionState;
  try {
    session = await waitForContentReady(tabId);
  } catch (e) {
    onStatusChange({
      kind: 'error',
      message: `GLS 페이지 준비 실패: ${(e as Error).message}`,
    });
    return;
  }
  if (!session.loggedIn) {
    await chrome.tabs.update(tabId, { active: true }).catch(() => {});
    onStatusChange({ kind: 'login_required' });
    return;
  }

  // fetch candidates (또는 dev 주입 사용)
  let candidates: SpaceCandidate[];
  if (args.candidates && args.candidates.length > 0) {
    candidates = args.candidates;
  } else {
    try {
      candidates = await apiClient.listSpaces({
        headcount: slots.headcount,
        ...pickFirstCampusBuilding(slots),
      });
    } catch (e) {
      onStatusChange({ kind: 'error', message: `후보 조회 실패: ${(e as Error).message}` });
      return;
    }
  }

  if (candidates.length === 0) {
    onStatusChange({ kind: 'no_candidate', log: [] });
    return;
  }

  const startHour = parseHourFromHHMM(slots.start_time);
  const endHour = parseHourFromHHMM(endTime);

  const state: CandidateQueueState = {
    conversationId,
    tabId,
    date: slots.date,
    startHour,
    endHour,
    startTime: slots.start_time,
    endTime,
    remaining: [...candidates],
    totalCount: candidates.length,
    triedCount: 0,
    lastProposed: null,
    log: [],
    pendingFormData: args.pendingFormData,
  };
  queues.set(conversationId, state);

  onStatusChange({
    kind: 'searching',
    tried: 0,
    total: state.totalCount,
    log: state.log,
  });

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
    // 시도 시작 시점 — 현재 후보 표시
    onStatusChange({
      kind: 'searching',
      tried: state.triedCount,
      total: state.totalCount,
      log: state.log,
    });

    let result: ContentAvailabilityResult;
    try {
      result = await sendToTab<BgCheckAvailability, ContentAvailabilityResult>(state.tabId, {
        type: 'BG_CHECK_AVAILABILITY',
        candidate,
        date: state.date,
        startHour: state.startHour,
        endHour: state.endHour,
        // formData 가 미리 있으면 preview 단계에서 폼 채움 (dev panel / 향후 행사메타 collector).
        formData: state.pendingFormData,
        startTime: state.startTime,
        endTime: state.endTime,
      });
    } catch (e) {
      // Transient content error — 로그에 실패로 남기고 다음 후보로.
      state.log.push({
        glsSpaceCode: candidate.glsSpaceCode,
        buildingName: candidate.buildingName,
        roomName: candidate.roomName,
        available: false,
        conflicts: [
          { kind: '예약', timeTerm: '', info: `통신 오류: ${(e as Error).message}` },
        ],
      });
      onStatusChange({
        kind: 'searching',
        tried: state.triedCount,
        total: state.totalCount,
        log: state.log,
      });
      continue;
    }

    state.log.push({
      glsSpaceCode: candidate.glsSpaceCode,
      buildingName: candidate.buildingName,
      roomName: candidate.roomName,
      available: result.available,
      conflicts: result.conflicts ?? [],
    });

    if (result.loginRequired) {
      await chrome.tabs.update(state.tabId, { active: true }).catch(() => {});
      onStatusChange({ kind: 'login_required' });
      queues.delete(state.conversationId);
      return;
    }

    if (result.available) {
      state.lastProposed = candidate;
      onStatusChange({
        kind: 'candidate_found',
        spaceCode: candidate.glsSpaceCode,
        spaceName: candidate.roomName,
        log: state.log,
      });
      const proposal: BgCandidateProposal = {
        type: 'BG_CANDIDATE_PROPOSAL',
        conversationId: state.conversationId,
        candidate,
      };
      try {
        await chrome.runtime.sendMessage(proposal);
      } catch {
        /* popup not open */
      }
      return;
    }

    // 충돌 — 다음 후보 시도. 누적 로그 emit.
    onStatusChange({
      kind: 'searching',
      tried: state.triedCount,
      total: state.totalCount,
      log: state.log,
    });
  }

  onStatusChange({ kind: 'no_candidate', log: state.log });
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
