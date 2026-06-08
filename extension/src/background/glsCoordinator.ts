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
  ReservationFormData,
  SpaceCandidate,
  SearchLogEntry,
} from '../shared/types';
import { resolveCampusCode } from '../../../shared/reservation/campus';
import type {
  BgCheckBridge,
  BgCheckSession,
  BgCheckAvailability,
  BgReadFormSnapshot,
  BgClearPreviewForm,
  BgPreviewReservation,
  BgSubmitReservation,
  ContentBridgeState,
  ContentFormSnapshotResult,
  ContentSessionState,
  ContentAvailabilityResult,
  ContentPreviewResult,
  ContentSubmitResult,
  BgCandidateProposal,
  BgSearchStarted,
  BgCandidateResult,
  BgSubmitStatus,
} from '../shared/messages';

/**
 * 사이드패널로 직접 broadcast 되는 메시지들 (BG_SEARCH_STARTED 등).
 * AutomationStatus 와 달리 카드 단위 진행 상태를 풍부하게 표현한다.
 * SW 가 chrome.runtime.sendMessage 로 일괄 송신하되, 사이드패널이 닫혀 있으면
 * 무시 (errors swallowed).
 */
export type CoordinatorBroadcast = BgSearchStarted | BgCandidateResult | BgSubmitStatus;
import * as apiClient from './apiClient';
import {
  candidateSupportsHeadcount,
  describeCapacityMismatch,
} from '../shared/spaceCapacity';

const GLS_URL = 'https://kingoinfo.skku.edu/';
const GLS_URL_MATCH = 'https://kingoinfo.skku.edu/*';
const QUEUES_SESSION_KEY = 'gls_queues_v1';

// ----- per-conversation queue state -----

export interface CandidateQueueState {
  conversationId: string;
  tabId: number;
  date: string;
  requestedHeadcount: number;
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
const activeStatusEmitters = new Map<string, (s: AutomationStatus) => void>();

function makeGlsTabClosedMessage(): string {
  return 'GLS 창이 닫혔어요. GLS 탭을 다시 열어 예약 가능 여부를 확인해 주세요.';
}

chrome.tabs.onRemoved.addListener((tabId) => {
  let changed = false;
  for (const [conversationId, state] of queues.entries()) {
    if (state.tabId !== tabId) continue;
    queues.delete(conversationId);
    activeStatusEmitters
      .get(conversationId)
      ?.({ kind: 'error', message: makeGlsTabClosedMessage() });
    activeStatusEmitters.delete(conversationId);
    changed = true;
  }
  if (changed) {
    void persistQueues();
  }
});

async function persistQueues(): Promise<void> {
  try {
    const obj: Record<string, CandidateQueueState> = {};
    for (const [k, v] of queues) obj[k] = v;
    await chrome.storage.session.set({ [QUEUES_SESSION_KEY]: obj });
  } catch {
    // session storage may not be available — non-fatal.
  }
}

async function rehydrateQueues(): Promise<void> {
  try {
    const got = await chrome.storage.session.get(QUEUES_SESSION_KEY);
    const obj = got?.[QUEUES_SESSION_KEY] as Record<string, CandidateQueueState> | undefined;
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) queues.set(k, v);
  } catch {
    // ignore
  }
}

const queuesReady = rehydrateQueues();
const cancelledConversations = new Set<string>();

export async function waitForQueuesRehydrated(): Promise<void> {
  await queuesReady;
}

export function getQueue(conversationId: string): CandidateQueueState | undefined {
  return queues.get(conversationId);
}

export function setQueueTabId(conversationId: string, tabId: number): void {
  const state = queues.get(conversationId);
  if (!state) return;
  state.tabId = tabId;
  void persistQueues();
}

export function clearQueue(conversationId: string): void {
  const state = queues.get(conversationId);
  cancelledConversations.add(conversationId);
  queues.delete(conversationId);
  void persistQueues();
  if (state?.tabId !== undefined) {
    void chrome.tabs.reload(state.tabId).catch(() => {});
  }
}

export function markQueuesDirty(): void {
  void persistQueues();
}

// ----- small chrome.* promise helpers -----

// 탭을 활성화하고 그 탭이 속한 윈도우도 foreground 로 올린다.
async function focusTab(tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab> {
  if (tab.id === undefined) {
    return tab;
  }
  const updated = await chrome.tabs.update(tab.id, { active: true });
  if (updated.windowId !== undefined) {
    await chrome.windows.update(updated.windowId, { focused: true }).catch(() => {});
  }
  return updated;
}

// 재사용 가능한 GLS 탭이 있으면 그 탭에 포커스를 주고, 없으면 새 탭을 active 로 연다.
// 어느 경로든 결과 탭은 항상 foreground 라서 사용자가 진행 상황을 바로 본다.
// (구 popup 시절엔 새 탭 활성화 시 popup 이 dismiss 되어 background 로 열었으나,
//  현재는 사이드패널이라 탭이 활성화돼도 닫히지 않는다.)
async function findOrCreateGlsTab(forceNew = false): Promise<chrome.tabs.Tab> {
  if (!forceNew) {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const reusable =
      (activeTab?.url?.startsWith(GLS_URL) && activeTab.id !== undefined
        ? activeTab
        : undefined) ??
      (await chrome.tabs.query({ url: GLS_URL_MATCH })).find((tab) => tab.id !== undefined);
    if (reusable?.id !== undefined) {
      return focusTab(reusable);
    }
  }
  return chrome.tabs.create({ url: GLS_URL, active: true });
}

async function sendToTab<TReq, TRes>(tabId: number, msg: TReq): Promise<TRes> {
  // MV3: chrome.tabs.sendMessage returns a Promise if no callback supplied.
  return (await chrome.tabs.sendMessage(tabId, msg)) as TRes;
}

function getAutomationMessageType(msg: unknown): string {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return 'unknown';
  const type = (msg as { type?: unknown }).type;
  return typeof type === 'string' ? type : 'unknown';
}

function automationMessageTimeoutMs(msg: unknown): number {
  switch (getAutomationMessageType(msg)) {
    case 'BG_CHECK_AVAILABILITY':
      return 25000;
    case 'BG_CLEAR_PREVIEW_FORM':
    case 'BG_READ_FORM_SNAPSHOT':
      return 10000;
    default:
      return 60000;
  }
}

function isTimeoutMessage(message: string): boolean {
  return /timed out|timeout/i.test(message);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isGlsLikeUrl(url?: string): boolean {
  return !!url && (
    url.startsWith(GLS_URL) || url.startsWith('https://login.skku.edu/')
  );
}

function isMissingReceiverError(message: string): boolean {
  return message.includes('Receiving end does not exist')
    || message.includes('Could not establish connection')
    || message.includes('message port closed');
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

async function ensureContentReady(tabId: number, timeoutMs = 20000): Promise<ContentSessionState> {
  try {
    return await waitForContentReady(tabId, timeoutMs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!isGlsLikeUrl(tab?.url) || !isMissingReceiverError(message)) {
      throw e;
    }

    console.warn('[BG] content script missing; reloading tab once', { tabId, url: tab?.url });
    await chrome.tabs.reload(tabId).catch(() => {});
    return waitForContentReady(tabId, timeoutMs);
  }
}

async function waitForBridgeReady(tabId: number, timeoutMs = 12000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastMessage = 'unknown';
  while (Date.now() < deadline) {
    try {
      const res = await sendToTab<BgCheckBridge, ContentBridgeState>(tabId, {
        type: 'BG_CHECK_BRIDGE',
      });
      if (res.ready) return;
      lastMessage = res.error ?? 'bridge not ready';
    } catch (e) {
      lastMessage = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`main-world bridge not ready in ${timeoutMs}ms: ${lastMessage}`);
}

async function waitForAutomationReady(tabId: number, timeoutMs = 20000): Promise<ContentSessionState> {
  const session = await waitForContentReady(tabId, timeoutMs);
  if (!session.loggedIn) return session;
  await waitForBridgeReady(tabId, Math.max(4000, Math.min(12000, timeoutMs)));
  return session;
}

async function ensureAutomationReady(tabId: number, timeoutMs = 20000): Promise<ContentSessionState> {
  try {
    return await waitForAutomationReady(tabId, timeoutMs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (!isGlsLikeUrl(tab?.url)) {
      throw e;
    }
    if (!isMissingReceiverError(message) && !message.includes('main-world bridge not ready')) {
      throw e;
    }

    console.warn('[BG] automation bridge not ready; reloading tab once', { tabId, url: tab?.url, message });
    await chrome.tabs.reload(tabId).catch(() => {});
    return waitForAutomationReady(tabId, timeoutMs);
  }
}

async function sendToAutomationTab<TReq, TRes>(tabId: number, msg: TReq): Promise<TRes> {
  const messageType = getAutomationMessageType(msg);
  const timeoutMs = automationMessageTimeoutMs(msg);
  try {
    return await withTimeout(
      sendToTab<TReq, TRes>(tabId, msg),
      timeoutMs,
      `automation message ${messageType}`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isMissingReceiverError(message)) {
      throw e;
    }
    await ensureAutomationReady(tabId);
    return withTimeout(
      sendToTab<TReq, TRes>(tabId, msg),
      timeoutMs,
      `automation message ${messageType} after bridge recovery`,
    );
  }
}

/**
 * BG_CANDIDATE_RESULT.why 텍스트로 쓸 짧은 충돌 사유 — SearchProgressCard 우측의
 * mono 작은 글씨에 들어간다. 충돌이 0개면 빈 문자열, 여러 개면 첫 항목만.
 */
function summarizeConflicts(
  conflicts: ContentAvailabilityResult['conflicts'] | undefined,
): string {
  if (!conflicts || conflicts.length === 0) return '충돌';
  const first = conflicts[0]!;
  const timePart = first.timeTerm?.trim();
  if (timePart && first.kind) return `${timePart} ${first.kind}`;
  if (first.kind) return `${first.kind} 충돌`;
  return '충돌';
}

function pickSearchFilters(
  slots: FilledSlots,
): { campusCode?: string; buildingNo?: string; building?: string; space?: string } {
  const campusCode = resolveCampusCode(slots.campus);
  const space = normalizeSearchSpaceFilter(slots.space);
  return {
    ...(campusCode ? { campusCode } : {}),
    ...(slots.building ? { building: slots.building.trim() } : {}),
    ...(space ? { space } : {}),
  };
}

function normalizeSearchSpaceFilter(space: string | null): string | undefined {
  const normalized = String(space ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  const compact = normalized.replace(/\s+/g, '');
  if (/^(회의실|강의실|공간|방|장소)$/.test(compact)) return undefined;

  const meaningful = compact.replace(
    /(회의실|공간|방|예약|대여|잡아줘|잡아주세요|찾아줘|찾아주세요|예약해줘|예약해주세요|빌려줘|빌려주세요)/g,
    '',
  );
  if (!meaningful) return undefined;

  return normalized;
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

function hasFormValue(value: string | undefined): boolean {
  return String(value ?? '').replace(/\s+/g, '').length > 0;
}

function hasUserDraftValue(value: string | undefined): boolean {
  const normalized = String(value ?? '').replace(/\s+/g, '');
  return normalized.length > 0 && normalized !== '선택';
}

function hasExistingReservationDraft(snapshot: Record<string, string>): boolean {
  const userFields = [
    'hangsaGbCode',
    'hangsaRendered',
    'organization',
    'organizationRendered',
    'eventName',
    'eventNameRendered',
    'headcount',
    'headcountRendered',
    'purpose',
    'purposeRendered',
  ];
  if (userFields.some((field) => hasFormValue(snapshot[field]))) {
    return true;
  }

  const selectedReservationFields = [
    'spaceCode',
    'spaceText',
    'startTime',
    'startText',
    'startRendered',
    'endTime',
    'endText',
    'endRendered',
  ];
  return selectedReservationFields.some((field) => hasFormValue(snapshot[field]));
}

function hasUserManagedDraftFields(snapshot: Record<string, string>): boolean {
  const userFields = [
    'hangsaGbCode',
    'hangsaRendered',
    'organization',
    'organizationRendered',
    'eventName',
    'eventNameRendered',
    'purpose',
    'purposeRendered',
  ];
  return userFields.some((field) => hasUserDraftValue(snapshot[field]));
}

function normalizeSnapshotText(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, '');
}

function snapshotFieldMatches(
  snapshotValue: string | undefined,
  expected: string | number | undefined,
): boolean {
  if (!hasFormValue(snapshotValue) || expected === undefined) return true;
  return normalizeSnapshotText(snapshotValue).includes(normalizeSnapshotText(String(expected)));
}

function snapshotTimeMatches(snapshotValue: string | undefined, expected: string): boolean {
  if (!hasFormValue(snapshotValue)) return true;
  const expectedHHMM = expected.slice(0, 5);
  return normalizeSnapshotText(snapshotValue).includes(expectedHHMM);
}

function snapshotDateMatches(snapshotValue: string | undefined, expected: string): boolean {
  if (!hasFormValue(snapshotValue)) return true;
  const normalized = normalizeSnapshotText(snapshotValue).replace(/[.]/g, '-');
  return normalized.includes(expected);
}

function snapshotMatchesManagedPreview(
  snapshot: Record<string, string>,
  state: CandidateQueueState | undefined,
): state is CandidateQueueState {
  if (!state?.lastProposed) return false;
  const candidate = state.lastProposed;
  const spaceText = `${snapshot.spaceCode ?? ''} ${snapshot.spaceText ?? ''}`;
  if (
    hasFormValue(spaceText) &&
    !spaceText.includes(candidate.glsSpaceCode) &&
    !spaceText.includes(candidate.roomName)
  ) {
    return false;
  }

  if (!snapshotDateMatches(snapshot.date || snapshot.dateRendered, state.date)) return false;
  if (!snapshotTimeMatches(snapshot.startTime || snapshot.startText || snapshot.startRendered, state.startTime)) return false;
  if (!snapshotTimeMatches(snapshot.endTime || snapshot.endText || snapshot.endRendered, state.endTime)) return false;

  const formData = state.pendingFormData;
  if (!formData) return true;
  return (
    snapshotFieldMatches(snapshot.organization || snapshot.organizationRendered, formData.organization) &&
    snapshotFieldMatches(snapshot.eventName || snapshot.eventNameRendered, formData.eventName) &&
    snapshotFieldMatches(snapshot.headcount || snapshot.headcountRendered, formData.headcount) &&
    snapshotFieldMatches(snapshot.purpose || snapshot.purposeRendered, formData.purpose)
  );
}

function isNoActiveReservationPopup(error: string | undefined): boolean {
  return !!error && (
    error.includes('no popupFrame open') ||
    error.includes('popupFrame') ||
    error.includes('popup divManage form not ready')
  );
}

async function readCurrentFormSnapshot(tabId: number): Promise<ContentFormSnapshotResult> {
  return sendToAutomationTab<BgReadFormSnapshot, ContentFormSnapshotResult>(tabId, {
    type: 'BG_READ_FORM_SNAPSHOT',
  });
}

// ----- flow entry -----

export interface RunReservationFlowArgs {
  conversationId: string;
  slots: FilledSlots;
  onStatusChange: (s: AutomationStatus) => void;
  /**
   * 사이드패널이 (사용 시) 풍부한 진행 메시지를 받을 수 있도록 별도 broadcast.
   * 기존 onStatusChange 는 AutomationStatus 단일 값이지만 SearchProgressCard 는
   * 후보 리스트와 currentIdx 까지 필요해서 분리.
   * 없으면 no-op — popup 만 있던 시절 호출자와 호환.
   */
  emitBroadcast?: (msg: CoordinatorBroadcast) => void;
  /** Dev: candidates 를 외부에서 주입하면 서버 /spaces 호출을 건너뛴다. */
  candidates?: SpaceCandidate[];
  /** Dev: confirm 시 사용할 formData 를 미리 큐에 저장. */
  pendingFormData?: ReservationFormData;
  /** Dev: 기존 탭 재사용 대신 새 탭 강제 생성. */
  forceNewTab?: boolean;
  /** 로그인 완료 직후처럼 이미 준비된 GLS 탭이 있으면 재사용한다. */
  existingTabId?: number;
}

export async function runReservationFlow(args: RunReservationFlowArgs): Promise<void> {
  const { conversationId, slots, onStatusChange } = args;
  const emitBroadcast = args.emitBroadcast ?? (() => {});
  cancelledConversations.delete(conversationId);

  if (slots.headcount == null) {
    onStatusChange({ kind: 'error', message: 'headcount이 비어 있습니다.' });
    return;
  }
  const requestedHeadcount = slots.headcount;
  // LLM 이 end_time 대신 duration_min 만 채우는 경우가 있어 정규화.
  const endTime = deriveEndTime(slots);
  if (!slots.date || !slots.start_time || !endTime) {
    onStatusChange({ kind: 'error', message: '날짜·시간 슬롯이 비어 있습니다.' });
    return;
  }

  onStatusChange({ kind: 'opening_gls' });

  let tab: chrome.tabs.Tab;
  try {
    if (args.existingTabId !== undefined) {
      tab =
        (await chrome.tabs.get(args.existingTabId).catch(() => undefined)) ??
        (await findOrCreateGlsTab(args.forceNewTab === true));
    } else {
      tab = await findOrCreateGlsTab(args.forceNewTab === true);
    }
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
    session = await ensureAutomationReady(tabId);
  } catch (e) {
    onStatusChange({
      kind: 'error',
      message: `GLS 페이지 준비 실패: ${(e as Error).message}`,
    });
    return;
  }
  if (!session.loggedIn) {
    onStatusChange({ kind: 'login_required', reason: 'needed' });
    return;
  }

  let existingForm: ContentFormSnapshotResult;
  try {
    existingForm = await readCurrentFormSnapshot(tabId);
  } catch (e) {
    onStatusChange({
      kind: 'error',
      message: `GLS 신청서 상태 확인 실패: ${(e as Error).message}`,
    });
    return;
  }
  if (existingForm.ok && existingForm.snapshot && hasExistingReservationDraft(existingForm.snapshot)) {
    const currentQueue = queues.get(conversationId);
    if (
      snapshotMatchesManagedPreview(existingForm.snapshot, currentQueue) ||
      !hasUserManagedDraftFields(existingForm.snapshot)
    ) {
      try {
        await sendToAutomationTab<BgClearPreviewForm, { ok: true }>(tabId, {
          type: 'BG_CLEAR_PREVIEW_FORM',
        });
      } catch (e) {
        onStatusChange({
          kind: 'error',
          message: `기존 미리보기 신청서를 정리하지 못해 자동화를 시작하지 않았어요: ${(e as Error).message}`,
        });
        return;
      }
    } else {
      onStatusChange({
        kind: 'error',
        message: 'GLS에서 작성 중인 신청서가 있어 덮어쓰지 않았어요. 기존 신청서를 저장하거나 닫은 뒤 다시 시도해 주세요.',
      });
      return;
    }
  }
  if (!existingForm.ok && !isNoActiveReservationPopup(existingForm.error)) {
    onStatusChange({
      kind: 'error',
      message: 'GLS 신청서 상태를 안전하게 확인하지 못해 자동화를 시작하지 않았어요. GLS 화면을 확인한 뒤 다시 시도해 주세요.',
    });
    return;
  }

  // fetch candidates (사전 주입 후보가 있으면 우선 사용)
  let candidates: SpaceCandidate[];
  if (args.candidates && args.candidates.length > 0) {
    candidates = args.candidates;
  } else {
    try {
      candidates = await apiClient.listSpaces({
        headcount: requestedHeadcount,
        date: slots.date,
        startTime: slots.start_time,
        ...pickSearchFilters(slots),
      });
    } catch (e) {
      onStatusChange({ kind: 'error', message: `후보 조회 실패: ${(e as Error).message}` });
      return;
    }
  }
  const capacityRejected = candidates.filter(
    (candidate) => !candidateSupportsHeadcount(candidate, requestedHeadcount),
  );
  if (capacityRejected.length > 0) {
    candidates = candidates.filter((candidate) => candidateSupportsHeadcount(candidate, requestedHeadcount));
  }

  if (candidates.length === 0) {
    onStatusChange({
      kind: 'no_candidate',
      log: capacityRejected.map((candidate) => ({
        glsSpaceCode: candidate.glsSpaceCode,
        buildingName: candidate.buildingName,
        roomName: candidate.roomName,
        available: false,
        conflicts: [
          {
            kind: '정원',
            timeTerm: '',
            info: describeCapacityMismatch(candidate, requestedHeadcount),
          },
        ],
      })),
    });
    return;
  }

  const orderedCandidates = [...candidates];

  const startHour = parseHourFromHHMM(slots.start_time);
  const endHour = parseHourFromHHMM(endTime);

  const state: CandidateQueueState = {
    conversationId,
    tabId,
    date: slots.date,
    requestedHeadcount,
    startHour,
    endHour,
    startTime: slots.start_time,
    endTime,
    remaining: [...orderedCandidates],
    totalCount: orderedCandidates.length,
    triedCount: 0,
    lastProposed: null,
    log: [],
    pendingFormData: args.pendingFormData,
  };
  queues.set(conversationId, state);
  void persistQueues();

  // 검증 시작 시점에 사이드패널이 후보 리스트 전체를 받을 수 있도록 1회 broadcast.
  // (이후 BG_CANDIDATE_RESULT 가 후보 단위로 도착)
  emitBroadcast({
    type: 'BG_SEARCH_STARTED',
    conversationId,
    candidates: [...orderedCandidates],
  });

  onStatusChange({
    kind: 'searching',
    tried: 0,
    total: state.totalCount,
    log: state.log,
  });

  activeStatusEmitters.set(conversationId, onStatusChange);
  await searchNext(state, onStatusChange, emitBroadcast);
  if (queues.get(conversationId) !== state) {
    activeStatusEmitters.delete(conversationId);
  }
}

function isQueueActive(state: CandidateQueueState): boolean {
  return !cancelledConversations.has(state.conversationId) && queues.get(state.conversationId) === state;
}

/**
 * Iterate the remaining queue until one candidate is available, then propose it
 * to the popup and return. If none available, emit no_candidate and clear queue.
 */
async function searchNext(
  state: CandidateQueueState,
  onStatusChange: (s: AutomationStatus) => void,
  emitBroadcast: (msg: CoordinatorBroadcast) => void = () => {},
): Promise<void> {
  while (state.remaining.length > 0) {
    if (!isQueueActive(state)) return;
    const candidate = state.remaining.shift()!;
    state.triedCount += 1;
    void persistQueues();
    // 시도 시작 시점 — 현재 후보 표시
    onStatusChange({
      kind: 'searching',
      tried: state.triedCount,
      total: state.totalCount,
      log: state.log,
    });

    let result: ContentAvailabilityResult;
    try {
      result = await sendToAutomationTab<BgCheckAvailability, ContentAvailabilityResult>(state.tabId, {
        type: 'BG_CHECK_AVAILABILITY',
        candidate,
        date: state.date,
        startHour: state.startHour,
        endHour: state.endHour,
      });
    } catch (e) {
      if (!isQueueActive(state)) return;
      const message = (e as Error).message;
      const tabStillExists = await chrome.tabs.get(state.tabId).then(() => true).catch(() => false);
      if (!tabStillExists) {
        queues.delete(state.conversationId);
        activeStatusEmitters.delete(state.conversationId);
        onStatusChange({ kind: 'error', message: makeGlsTabClosedMessage() });
        void persistQueues();
        return;
      }
      if (isTimeoutMessage(message)) {
        queues.delete(state.conversationId);
        activeStatusEmitters.delete(state.conversationId);
        state.log.push({
          glsSpaceCode: candidate.glsSpaceCode,
          buildingName: candidate.buildingName,
          roomName: candidate.roomName,
          available: false,
          conflicts: [
            {
              kind: '제외',
              timeTerm: '',
              info: `검증 시간 초과: ${message}`,
            },
          ],
        });
        emitBroadcast({
          type: 'BG_CANDIDATE_RESULT',
          conversationId: state.conversationId,
          spaceCode: candidate.glsSpaceCode,
          available: false,
          why: '검증 시간 초과',
          currentIdx: state.triedCount - 1,
          total: state.totalCount,
        });
        onStatusChange({
          kind: 'error',
          message: 'GLS 후보 검증이 오래 걸려 자동화를 중단했어요. 같은 조건으로 다시 시도하거나 날짜/시간을 바꿔주세요.',
        });
        void persistQueues();
        return;
      }
      // Transient content error — 로그에 실패로 남기고 다음 후보로.
      state.log.push({
        glsSpaceCode: candidate.glsSpaceCode,
        buildingName: candidate.buildingName,
        roomName: candidate.roomName,
        available: false,
        conflicts: [
          { kind: '예약', timeTerm: '', info: `통신 오류: ${message}` },
        ],
      });
      onStatusChange({
        kind: 'searching',
        tried: state.triedCount,
        total: state.totalCount,
        log: state.log,
      });
      emitBroadcast({
        type: 'BG_CANDIDATE_RESULT',
        conversationId: state.conversationId,
        spaceCode: candidate.glsSpaceCode,
        available: false,
        why: '통신 오류',
        currentIdx: state.triedCount - 1,
        total: state.totalCount,
      });
      void persistQueues();
      continue;
    }

    if (!isQueueActive(state)) return;

    state.log.push({
      glsSpaceCode: candidate.glsSpaceCode,
      buildingName: candidate.buildingName,
      roomName: candidate.roomName,
      available: result.available,
      conflicts: result.conflicts ?? [],
    });

    if (result.timedOut) {
      queues.delete(state.conversationId);
      activeStatusEmitters.delete(state.conversationId);
      emitBroadcast({
        type: 'BG_CANDIDATE_RESULT',
        conversationId: state.conversationId,
        spaceCode: candidate.glsSpaceCode,
        available: false,
        why: '검증 시간 초과',
        currentIdx: state.triedCount - 1,
        total: state.totalCount,
      });
      onStatusChange({
        kind: 'error',
        message: 'GLS 후보 검증이 오래 걸려 자동화를 중단했어요. 같은 조건으로 다시 시도하거나 날짜/시간을 바꿔주세요.',
      });
      void persistQueues();
      return;
    }

    if (result.loginRequired) {
      // 로그인 만료 — 사이드패널이 GLSLoginCard 를 띄울 수 있도록 알린다.
      emitBroadcast({
        type: 'BG_CANDIDATE_RESULT',
        conversationId: state.conversationId,
        spaceCode: candidate.glsSpaceCode,
        available: false,
        why: '로그인 필요',
        currentIdx: state.triedCount - 1,
        total: state.totalCount,
      });
      state.remaining.unshift(candidate);
      state.triedCount = Math.max(0, state.triedCount - 1);
      onStatusChange({
        kind: 'login_required',
        reason: 'expired',
        resumeIdx: state.triedCount,
      });
      void persistQueues();
      return;
    }

    if (result.available) {
      if (!isQueueActive(state)) return;
      state.lastProposed = candidate;
      void persistQueues();
      emitBroadcast({
        type: 'BG_CANDIDATE_RESULT',
        conversationId: state.conversationId,
        spaceCode: candidate.glsSpaceCode,
        available: true,
        why: '가용',
        currentIdx: state.triedCount - 1,
        total: state.totalCount,
      });
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

    // 충돌 — 다음 후보 시도. 누적 로그 + 사이드패널용 single-candidate 결과 모두 emit.
    emitBroadcast({
      type: 'BG_CANDIDATE_RESULT',
      conversationId: state.conversationId,
      spaceCode: candidate.glsSpaceCode,
      available: false,
      why: summarizeConflicts(result.conflicts),
      currentIdx: state.triedCount - 1,
      total: state.totalCount,
    });
    onStatusChange({
      kind: 'searching',
      tried: state.triedCount,
      total: state.totalCount,
      log: state.log,
    });
  }

  if (!isQueueActive(state)) return;
  onStatusChange({ kind: 'no_candidate', log: state.log });
  queues.delete(state.conversationId);
  void persistQueues();
}

/**
 * Called by SW when user rejects a proposed candidate: drop it and keep searching.
 */
export async function continueAfterRejection(
  conversationId: string,
  onStatusChange: (s: AutomationStatus) => void,
  emitBroadcast: (msg: CoordinatorBroadcast) => void = () => {},
): Promise<void> {
  const state = queues.get(conversationId);
  if (!state) return;
  state.lastProposed = null;
  try {
    await sendToAutomationTab<BgClearPreviewForm, { ok: true }>(state.tabId, {
      type: 'BG_CLEAR_PREVIEW_FORM',
    });
  } catch (e) {
    console.warn('[BG] clear preview form before next candidate failed', e);
  }
  void persistQueues();
  await searchNext(state, onStatusChange, emitBroadcast);
}

export async function resumeQueuedSearch(
  conversationId: string,
  onStatusChange: (s: AutomationStatus) => void,
  emitBroadcast: (msg: CoordinatorBroadcast) => void = () => {},
  existingTabId?: number,
): Promise<void> {
  const state = queues.get(conversationId);
  if (!state) return;
  if (existingTabId !== undefined) {
    state.tabId = existingTabId;
  }
  void persistQueues();

  try {
    await ensureAutomationReady(state.tabId);
  } catch (e) {
    onStatusChange({
      kind: 'error',
      message: `GLS 페이지 준비 실패: ${(e as Error).message}`,
    });
    return;
  }

  onStatusChange({
    kind: 'searching',
    tried: state.triedCount,
    total: state.totalCount,
    log: state.log,
  });
  await searchNext(state, onStatusChange, emitBroadcast);
}

export interface PreviewReservationArgs {
  conversationId: string;
  candidate: SpaceCandidate;
  formData: ReservationFormData;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * 실제 저장 없이 현재 후보 공간에 대해 모달을 다시 열고 신청서를 채운다.
 * 검증/데모 중 "제출 직전 상태"를 눈으로 확인할 때 사용.
 */
export async function previewReservationForm(
  args: PreviewReservationArgs,
): Promise<ContentPreviewResult> {
  const state = queues.get(args.conversationId);
  const tabId = state?.tabId ?? (await findOrCreateGlsTab()).id;
  if (tabId === undefined) {
    throw new Error('GLS 탭 ID 확보 실패');
  }

  await ensureAutomationReady(tabId);
  return sendToAutomationTab<BgPreviewReservation, ContentPreviewResult>(tabId, {
    type: 'BG_PREVIEW_RESERVATION',
    candidate: args.candidate,
    date: args.date,
    formData: args.formData,
    startTime: args.startTime,
    endTime: args.endTime,
  });
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
  emitBroadcast?: (msg: CoordinatorBroadcast) => void;
}

export async function submitConfirmedReservation(args: SubmitConfirmedArgs): Promise<boolean> {
  const { conversationId, candidate, formData, onStatusChange } = args;
  const emitBroadcast = args.emitBroadcast ?? (() => {});
  const state = queues.get(conversationId);
  const tabId = state?.tabId ?? (await findOrCreateGlsTab()).id;
  if (tabId === undefined) {
    onStatusChange({ kind: 'error', message: 'GLS 탭 ID 확보 실패' });
    return false;
  }

  onStatusChange({ kind: 'submitting' });
  let latestAvailability: ContentAvailabilityResult;
  try {
    await ensureAutomationReady(tabId);
    latestAvailability = await sendToAutomationTab<BgCheckAvailability, ContentAvailabilityResult>(tabId, {
      type: 'BG_CHECK_AVAILABILITY',
      candidate,
      date: args.date,
      startHour: parseHourFromHHMM(args.startTime),
      endHour: parseHourFromHHMM(args.endTime),
      startTime: args.startTime,
      endTime: args.endTime,
      strictPreview: true,
    });
  } catch (e) {
    onStatusChange({ kind: 'error', message: `제출 직전 빈 공간 재확인 실패: ${(e as Error).message}` });
    return false;
  }
  if (!latestAvailability.available) {
    const reason = summarizeConflicts(latestAvailability.conflicts);
    onStatusChange({
      kind: 'error',
      message: `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요. (${reason}) 다른 공간이나 시간을 선택해 주세요.`,
    });
    return false;
  }

  // 사이드패널의 SubmitProgressCard 가 진행바를 그릴 수 있도록 단계별 emit.
  // content script 는 fill→save 를 atomic 하게 처리하므로 'saving' 은 정확한
  // 경계 없이 0.8 초 후 fake transition. 정확한 신호가 필요해지면 content
  // script 에서 별도 BG_SUBMIT_PROGRESS 메시지를 emit 하도록 확장.
  emitBroadcast({ type: 'BG_SUBMIT_STATUS', conversationId, step: 'filling' });
  const savingTimer = setTimeout(() => {
    emitBroadcast({ type: 'BG_SUBMIT_STATUS', conversationId, step: 'saving' });
  }, 800);

  let result: ContentSubmitResult;
  try {
    await ensureAutomationReady(tabId);
    result = await sendToAutomationTab<BgSubmitReservation, ContentSubmitResult>(tabId, {
      type: 'BG_SUBMIT_RESERVATION',
      candidate,
      formData,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
    });
  } catch (e) {
    clearTimeout(savingTimer);
    onStatusChange({ kind: 'error', message: `제출 메시지 실패: ${(e as Error).message}` });
    return false;
  }
  clearTimeout(savingTimer);

  if (!result.ok) {
    onStatusChange({ kind: 'error', message: result.error ?? '제출 실패' });
    return false;
  }

  emitBroadcast({ type: 'BG_SUBMIT_STATUS', conversationId, step: 'saved' });
  onStatusChange({ kind: 'done', spaceCode: result.spaceCode });
  try {
    await chrome.notifications.create(`reservation-${conversationId}`, {
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: '신청 저장 완료',
      message: `${candidate.buildingName} ${candidate.roomName} (${args.date} ${args.startTime}-${args.endTime}) 신청이 저장되었습니다. 최종 승인은 GLS에서 확인하세요.`,
      priority: 2,
    });
  } catch {
    // notifications icon may not yet exist — non-fatal.
  }
  queues.delete(conversationId);
  void persistQueues();
  return true;
}
