/**
 * Background Service Worker — MV3 entry (D-026, D-027).
 *
 * 책임:
 * - popup ↔ content ↔ server 메시지 라우팅
 * - 자동화 오케스트레이션 (chat 응답 → 후보 조회 → content 통신 → confirm → submit)
 * - 진행 중 상태를 chrome.storage.session에 mirror (SW idle 종료 대비)
 */

import type {
  PopupToBackground,
  ContentToBackground,
  BgChatResponse,
  BgStatusUpdate,
  BgReservationDone,
  ApplicationStateResponse,
  ConversationListResponse,
} from '../shared/messages';
import type {
  AutomationStatus,
  FilledSlots,
  Intent,
  ApplicationState,
  ReservationFormData,
  ConversationSessionSummary,
  ConversationStatus,
  ChatMessage,
} from '../shared/types';
import * as apiClient from './apiClient';
import * as gls from './glsCoordinator';
import { getOrCreateClientId } from '../shared/clientId';
import {
  CONVERSATION_INDEX_KEY,
  isPlaceholderConversationSummary,
  SNAPSHOT_PREFIX,
  makeConversationSessionSummary,
  mergeConversationSessionSummaries,
  shouldAppearInConversationHistory,
} from '../shared/conversationSessions';

interface PendingStartRequest {
  conversationId: string;
  slots: FilledSlots;
  candidates?: import('../shared/types').SpaceCandidate[];
  pendingFormData?: ReservationFormData;
}

// ---------- per-conversation context (history + last parse) ----------

interface ConversationContext {
  conversationId: string;
  history: ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  conversationStatus: ConversationStatus;
  confirmedReservationLabel: string | null;
  updatedAt: string;
  lastStatus: AutomationStatus;
  pendingStart: PendingStartRequest | null;
  lastProposed: import('../shared/types').SpaceCandidate | null;
}

const contexts = new Map<string, ConversationContext>();
const pendingStarts = new Map<string, PendingStartRequest>();

const SESSION_KEY = 'sw_contexts_v1';
const GLS_URL_PREFIX = 'https://kingoinfo.skku.edu/';
const rehydrationReady = (async () => {
  await rehydrateContexts();
  await gls.waitForQueuesRehydrated();
})();

async function persistContexts(): Promise<void> {
  try {
    const obj: Record<string, ConversationContext> = {};
    for (const [k, v] of contexts) obj[k] = v;
    await chrome.storage.session.set({ [SESSION_KEY]: obj });
  } catch {
    // session storage may not be available — non-fatal.
  }
}

async function rehydrateContexts(): Promise<void> {
  try {
    const got = await chrome.storage.session.get(SESSION_KEY);
    const obj = got?.[SESSION_KEY] as Record<string, ConversationContext> | undefined;
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) contexts.set(k, v);
  } catch {
    // ignore
  }
}

function getOrCreateContext(conversationId: string): ConversationContext {
  let ctx = contexts.get(conversationId);
  if (!ctx) {
    ctx = {
      conversationId,
      history: [],
      lastIntent: null,
      lastFilledSlots: null,
      applicationState: null,
      conversationStatus: 'active',
      confirmedReservationLabel: null,
      updatedAt: new Date().toISOString(),
      lastStatus: { kind: 'idle' },
      pendingStart: null,
      lastProposed: null,
    };
    contexts.set(conversationId, ctx);
  } else {
    ctx.conversationStatus ??= 'active';
    ctx.confirmedReservationLabel ??= null;
    ctx.updatedAt ??= new Date().toISOString();
  }
  return ctx;
}

async function loadConversationIndex(): Promise<ConversationSessionSummary[]> {
  try {
    const got = await chrome.storage.local.get(CONVERSATION_INDEX_KEY);
    const stored = got?.[CONVERSATION_INDEX_KEY];
    return Array.isArray(stored)
      ? (stored as ConversationSessionSummary[]).filter(
          (summary) => !isPlaceholderConversationSummary(summary),
        )
      : [];
  } catch {
    return [];
  }
}

async function saveConversationIndex(index: ConversationSessionSummary[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONVERSATION_INDEX_KEY]: index });
  } catch {
    // non-fatal
  }
}

async function removeConversationIndexEntry(conversationId: string): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = current.filter((item) => item.id !== conversationId);
  await saveConversationIndex(next);
  return next;
}

function buildSummaryFromContext(ctx: ConversationContext): ConversationSessionSummary {
  return makeConversationSessionSummary({
    id: ctx.conversationId,
    status: ctx.conversationStatus,
    updatedAt: ctx.updatedAt,
    confirmedReservationLabel: ctx.confirmedReservationLabel,
    messages: ctx.history,
    lastFilledSlots: ctx.lastFilledSlots,
  });
}

function buildSummaryFromServer(
  row: apiClient.ConversationSummaryDto,
): ConversationSessionSummary | null {
  if (
    !shouldAppearInConversationHistory({
      status: row.status,
      messages: row.firstUserMessage
        ? [{ role: 'user', content: row.firstUserMessage }]
        : [],
      lastFilledSlots: row.lastFilledSlots,
      confirmedReservationLabel: row.confirmedReservationLabel,
      lastMessagePreview: row.lastMessagePreview,
    })
  ) {
    return null;
  }
  return makeConversationSessionSummary({
    id: row.id,
    status: row.status,
    updatedAt: row.updatedAt,
    confirmedReservationLabel: row.confirmedReservationLabel,
    firstUserMessage: row.firstUserMessage,
    lastMessagePreview: row.lastMessagePreview,
    lastFilledSlots: row.lastFilledSlots,
  });
}

async function syncConversationIndexWithSummary(
  summary: ConversationSessionSummary,
): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = mergeConversationSessionSummaries(current, [summary]);
  await saveConversationIndex(next);
  return next;
}

async function syncConversationSummaryFromContext(
  ctx: ConversationContext,
): Promise<ConversationSessionSummary[]> {
  if (
    !shouldAppearInConversationHistory({
      status: ctx.conversationStatus,
      messages: ctx.history,
      lastFilledSlots: ctx.lastFilledSlots,
      applicationState: ctx.applicationState,
      confirmedReservationLabel: ctx.confirmedReservationLabel,
    })
  ) {
    return removeConversationIndexEntry(ctx.conversationId);
  }
  return syncConversationIndexWithSummary(buildSummaryFromContext(ctx));
}

async function refreshConversationIndexFromServer(): Promise<ConversationSessionSummary[]> {
  const localIndex = await loadConversationIndex();
  const remoteRows = await apiClient.listConversations();
  const remoteIndex = remoteRows
    .map((row) => buildSummaryFromServer(row))
    .filter((row): row is ConversationSessionSummary => row !== null);
  const contextIndex = [...contexts.values()]
    .filter((ctx) =>
      shouldAppearInConversationHistory({
        status: ctx.conversationStatus,
        messages: ctx.history,
        lastFilledSlots: ctx.lastFilledSlots,
        applicationState: ctx.applicationState,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
      }),
    )
    .map((ctx) => buildSummaryFromContext(ctx));
  const merged = mergeConversationSessionSummaries(localIndex, remoteIndex, contextIndex);
  await saveConversationIndex(merged);
  return merged;
}

async function removeConversationSnapshot(conversationId: string): Promise<void> {
  try {
    await chrome.storage.local.remove(`${SNAPSHOT_PREFIX}${conversationId}`);
  } catch {
    // non-fatal
  }
}

async function hydrateContextFromServer(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const dto = await apiClient.getConversation(conversationId);
    const ctx = getOrCreateContext(conversationId);
    ctx.history = dto.history;
    ctx.lastIntent = dto.lastIntent;
    ctx.lastFilledSlots = dto.lastFilledSlots;
    ctx.applicationState = dto.lastApplicationState;
    ctx.conversationStatus = dto.status;
    ctx.confirmedReservationLabel = dto.confirmedReservationLabel;
    ctx.updatedAt = dto.updatedAt;
    ctx.lastStatus = { kind: 'idle' };
    ctx.pendingStart = null;
    ctx.lastProposed = null;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
    return ctx;
  } catch (error) {
    if (error instanceof apiClient.ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function deriveEndTime(slots: FilledSlots | null | undefined): string | null {
  if (!slots) return null;
  if (slots.end_time) return slots.end_time;
  if (!slots.start_time || slots.duration_min == null) return null;
  const [hRaw, mRaw] = slots.start_time.split(':');
  const startMin = Number.parseInt(hRaw ?? '', 10) * 60 + Number.parseInt(mRaw ?? '', 10);
  if (!Number.isFinite(startMin)) return null;
  const endMin = (startMin + slots.duration_min) % (24 * 60);
  const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
  const em = String(endMin % 60).padStart(2, '0');
  return `${eh}:${em}`;
}

function resolveSearchSlots(ctx: ConversationContext): {
  date: string;
  startTime: string;
  endTime: string;
} | null {
  const queue = gls.getQueue(ctx.conversationId);
  if (queue?.date && queue.startTime && queue.endTime) {
    return {
      date: queue.date,
      startTime: queue.startTime,
      endTime: queue.endTime,
    };
  }

  const slots = ctx.pendingStart?.slots ?? ctx.lastFilledSlots;
  const endTime = deriveEndTime(slots);
  if (!slots?.date || !slots.start_time || !endTime) return null;
  return {
    date: slots.date,
    startTime: slots.start_time,
    endTime,
  };
}

function hasCompleteReservationForm(
  formData: ReservationFormData | null | undefined,
): formData is ReservationFormData {
  return Boolean(
    formData &&
      formData.hangsaGbCode.trim() &&
      formData.organization.trim() &&
      formData.eventName.trim() &&
      formData.purpose.trim() &&
      formData.headcount > 0,
  );
}

function summarizeReservationLabel(formData: ReservationFormData): string {
  const eventName = formData.eventName.trim();
  const organization = formData.organization.trim();
  if (!eventName) return organization || '예약 신청';
  if (!organization || eventName.includes(organization)) return eventName;
  return `${organization} ${eventName}`;
}

function syncApplicationDraftToAutomation(
  ctx: ConversationContext,
  draft: ReservationFormData | null,
): void {
  const normalizedDraft = hasCompleteReservationForm(draft) ? draft : undefined;
  const queue = gls.getQueue(ctx.conversationId);
  if (queue) {
    queue.pendingFormData = normalizedDraft;
    gls.markQueuesDirty();
  }
  if (ctx.pendingStart) {
    ctx.pendingStart.pendingFormData = normalizedDraft;
  }
}

async function shouldSkipNavigationPrompt(): Promise<boolean> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return !!activeTab?.url?.startsWith(GLS_URL_PREFIX);
  } catch {
    return false;
  }
}

async function resumePendingStartIfReady(
  conversationId: string,
): Promise<void> {
  const ctx = getOrCreateContext(conversationId);
  const pending = pendingStarts.get(conversationId) ?? ctx.pendingStart;
  if (!pending) return;
  if (ctx.lastStatus.kind !== 'navigation_required') return;
  if (!(await shouldSkipNavigationPrompt())) return;

  const emit = makeStatusEmitter(conversationId);
  pendingStarts.delete(conversationId);
  ctx.pendingStart = pending;
  ctx.lastStatus = { kind: 'opening_gls' };
  ctx.updatedAt = new Date().toISOString();
  void persistContexts();

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      forceNewTab: false,
      onStatusChange: emit,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

// ---------- popup status pushing ----------

function makeStatusEmitter(conversationId: string): (s: AutomationStatus) => void {
  return (status) => {
    const ctx = getOrCreateContext(conversationId);
    ctx.lastStatus = status;
    if (status.kind === 'candidate_found') {
      ctx.lastProposed = gls.getQueue(conversationId)?.lastProposed ?? ctx.lastProposed;
    } else if (status.kind !== 'submitting') {
      ctx.lastProposed = null;
    }
    if (status.kind === 'done' || status.kind === 'no_candidate' || status.kind === 'idle') {
      ctx.pendingStart = null;
    }
    void persistContexts();

    const msg: BgStatusUpdate = {
      type: 'BG_STATUS_UPDATE',
      conversationId,
      status,
    };
    // popup may be closed — swallow errors.
    chrome.runtime.sendMessage(msg).catch(() => {});

    if (status.kind === 'done') {
      const doneMsg: BgReservationDone = {
        type: 'BG_RESERVATION_DONE',
        conversationId,
        spaceCode: status.spaceCode,
      };
      chrome.runtime.sendMessage(doneMsg).catch(() => {});
    }
  };
}

// ---------- lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  // Seed client_id early so first server call doesn't race.
  void getOrCreateClientId();
});

chrome.runtime.onStartup?.addListener(() => {
  void rehydrationReady;
});

// Best-effort rehydrate on cold module load too.
void rehydrationReady;

// ---------- message router ----------

chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  // Distinguish popup-origin vs content-origin by sender.tab presence.
  const fromTab = sender.tab !== undefined;

  if (fromTab) {
    // Content → background messages. In this design, the coordinator awaits
    // tab responses via chrome.tabs.sendMessage's promise (the content script
    // replies via sendResponse), so unsolicited content-pushed messages are
    // rare. Acknowledge and drop.
    return false;
  }

  const msg = rawMsg as PopupToBackground;

  switch (msg.type) {
    case 'POPUP_CHAT_REQUEST':
      handleChatRequest(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ error: (e as Error).message }));
      return true;

    case 'POPUP_START_SEARCH':
      handleStartSearch(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CONFIRM_NAVIGATION':
      handleConfirmNavigation(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_RESUME_AFTER_LOGIN':
      handleResumeAfterLogin(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CONFIRM_RESERVATION':
      handleConfirm(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_APPLY_SUGGESTED_MEMORY':
      handleApplySuggestedMemory(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DISMISS_SUGGESTED_MEMORY':
      handleDismissSuggestedMemory(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_PREVIEW_RESERVATION':
      handlePreview(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CANCEL':
      handleCancel(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_GET_STATUS': {
      // popup 재오픈 시 호출. BG 가 들고 있는 대화 컨텍스트 + 자동화 큐 상태를
      // 반환해서 popup 이 history / 진행 상태 / 미확정 후보 카드 까지 복원할 수 있도록.
      void (async () => {
        await rehydrationReady;
        await resumePendingStartIfReady(msg.conversationId);
        const ctx =
          contexts.get(msg.conversationId) ??
          (await hydrateContextFromServer(msg.conversationId));
        const queue = gls.getQueue(msg.conversationId);
        sendResponse({
          status: ctx?.lastStatus ?? { kind: 'idle' },
          lastFilledSlots: ctx?.lastFilledSlots ?? null,
          history: ctx?.history ?? [],
          lastProposed: queue?.lastProposed ?? ctx?.lastProposed ?? null,
          pendingFormData: queue?.pendingFormData ?? ctx?.pendingStart?.pendingFormData ?? null,
          applicationState: ctx?.applicationState ?? null,
        });
      })().catch((e) => sendResponse({ error: (e as Error).message }));
      return true;
    }

    case 'POPUP_LIST_CONVERSATIONS':
      (async () => {
        await rehydrationReady;
        const localIndex = await loadConversationIndex();
        try {
          const conversations = await refreshConversationIndexFromServer();
          sendResponse({ ok: true, conversations });
        } catch (e) {
          console.warn('[SW] listConversations refresh failed:', e);
          sendResponse({ ok: true, conversations: localIndex });
        }
      })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DELETE_CONVERSATION':
      handleDeleteConversation(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    default:
      return false;
  }
});

// ---------- handlers ----------

async function handleChatRequest(
  msg: Extract<PopupToBackground, { type: 'POPUP_CHAT_REQUEST' }>,
): Promise<BgChatResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  // Trust the popup's history snapshot (clientside authority — D-018).
  ctx.history = msg.history;

  const result = await apiClient.parse({
    conversationId: msg.conversationId,
    history: msg.history,
    now: new Date().toISOString(),
  });

  ctx.conversationStatus = 'active';
  ctx.confirmedReservationLabel = null;
  ctx.updatedAt = new Date().toISOString();
  ctx.lastIntent = result.intent;
  ctx.lastFilledSlots = result.filled_slots;
  ctx.applicationState = result.application_state;
  syncApplicationDraftToAutomation(ctx, result.application_state.draft);

  // Append assistant message to local history so subsequent persists carry it.
  const historyWithAssistant: import('../shared/types').ChatMessage[] = [
    ...msg.history,
    { role: 'assistant', content: result.assistant_message },
  ];
  ctx.history = historyWithAssistant;
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);

  // Mirror to server (D-018). Fire-and-forget; failure shouldn't block UX.
  void apiClient
    .upsertConversation(msg.conversationId, {
      history: historyWithAssistant,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
    })
    .catch((e) => {
      console.warn('[SW] upsertConversation mirror failed:', e);
    });

  return { type: 'BG_CHAT_RESPONSE', result };
}

async function handleStartSearch(
  msg: Extract<PopupToBackground, { type: 'POPUP_START_SEARCH' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.conversationStatus = 'active';
  const pending: PendingStartRequest = {
    conversationId: msg.conversationId,
    slots: msg.slots,
    pendingFormData: hasCompleteReservationForm(ctx.applicationState?.draft)
      ? ctx.applicationState?.draft
      : undefined,
  };
  pendingStarts.set(msg.conversationId, pending);
  ctx.pendingStart = pending;
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  if (await shouldSkipNavigationPrompt()) {
    void gls
      .runReservationFlow({
        conversationId: pending.conversationId,
        slots: pending.slots,
        candidates: pending.candidates,
        pendingFormData: pending.pendingFormData,
        forceNewTab: false,
        onStatusChange: emit,
      })
      .catch((e) => {
        emit({ kind: 'error', message: (e as Error).message });
      });
    return;
  }
  emit({ kind: 'navigation_required' });
}

async function handleConfirmNavigation(
  msg: Extract<PopupToBackground, { type: 'POPUP_CONFIRM_NAVIGATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const pending = pendingStarts.get(msg.conversationId) ?? ctx.pendingStart;

  if (!msg.confirmed) {
    pendingStarts.delete(msg.conversationId);
    ctx.pendingStart = null;
    void persistContexts();
    emit({ kind: 'idle' });
    return;
  }

  if (!pending) {
    emit({ kind: 'error', message: '이동 대기 중인 예약 요청이 없습니다.' });
    return;
  }

  pendingStarts.delete(msg.conversationId);
  ctx.pendingStart = pending;
  void persistContexts();

  try {
    await gls.revealOrCreateGlsTab();
  } catch (e) {
    emit({ kind: 'error', message: `GLS 탭 이동 실패: ${(e as Error).message}` });
    return;
  }

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      forceNewTab: false,
      onStatusChange: emit,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

async function handleResumeAfterLogin(
  msg: Extract<PopupToBackground, { type: 'POPUP_RESUME_AFTER_LOGIN' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const pending = ctx.pendingStart;
  if (!pending) {
    emit({ kind: 'error', message: '다시 시작할 예약 요청을 찾지 못했습니다.' });
    return;
  }

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      forceNewTab: false,
      onStatusChange: emit,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

async function handleConfirm(
  msg: Extract<PopupToBackground, { type: 'POPUP_CONFIRM_RESERVATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const queue = gls.getQueue(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const candidate = queue?.lastProposed ?? ctx.lastProposed;

  if (!msg.confirmed) {
    // User rejected the proposed candidate — try the next one.
    void gls.continueAfterRejection(msg.conversationId, emit).catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
    return;
  }

  if (!candidate) {
    emit({ kind: 'error', message: '제안된 후보가 없습니다.' });
    return;
  }

  const formData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ctx.applicationState?.draft ??
    null;

  if (!hasCompleteReservationForm(formData)) {
    emit({ kind: 'error', message: '신청 정보가 아직 완성되지 않았습니다. 먼저 신청 정보를 알려 주세요.' });
    return;
  }

  if (queue) queue.pendingFormData = formData;
  if (ctx.pendingStart) ctx.pendingStart.pendingFormData = formData;
  if (ctx.applicationState) {
    ctx.applicationState = {
      ...ctx.applicationState,
      draft: formData,
      source: ctx.applicationState.source ?? 'conversation',
    };
  }
  gls.markQueuesDirty();
  void persistContexts();

  const slots = resolveSearchSlots(ctx);
  if (!slots) {
    emit({ kind: 'error', message: '제출할 예약 슬롯을 복원하지 못했습니다.' });
    return;
  }

  void gls
    .submitConfirmedReservation({
      conversationId: msg.conversationId,
      candidate,
      formData,
      date: slots.date,
      startTime: slots.startTime,
      endTime: slots.endTime,
      onStatusChange: emit,
    })
    .then(async () => {
      // Mark conversation completed on server (mirror).
      const ctx = contexts.get(msg.conversationId);
      if (ctx) {
        ctx.conversationStatus = 'completed';
        ctx.confirmedReservationLabel = summarizeReservationLabel(formData);
        ctx.updatedAt = new Date().toISOString();
        void persistContexts();
        void syncConversationSummaryFromContext(ctx);
        void apiClient
          .upsertConversation(msg.conversationId, {
            history: ctx.history,
            status: 'completed',
            lastIntent: ctx.lastIntent,
            lastFilledSlots: ctx.lastFilledSlots,
            lastApplicationState: ctx.applicationState,
            confirmedReservationForm: formData,
            confirmedReservationLabel: ctx.confirmedReservationLabel,
          })
          .catch((e) => console.warn('[SW] completed mirror failed:', e));
      }
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

async function handlePreview(
  msg: Extract<PopupToBackground, { type: 'POPUP_PREVIEW_RESERVATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const queue = gls.getQueue(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const candidate = queue?.lastProposed ?? ctx.lastProposed;
  if (!candidate) {
    throw new Error('미리보기할 후보가 없습니다.');
  }
  if (candidate.glsSpaceCode !== msg.spaceCode) {
    throw new Error('현재 제안된 후보와 미리보기 대상이 다릅니다.');
  }

  const formData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ctx.applicationState?.draft ??
    null;

  if (!hasCompleteReservationForm(formData)) {
    throw new Error('신청 정보가 아직 완성되지 않았습니다.');
  }

  if (queue) queue.pendingFormData = formData;
  if (ctx.pendingStart) ctx.pendingStart.pendingFormData = formData;
  gls.markQueuesDirty();
  void persistContexts();

  const slots = resolveSearchSlots(ctx);
  if (!slots) {
    throw new Error('미리보기할 예약 슬롯을 복원하지 못했습니다.');
  }

  const result = await gls.previewReservationForm({
    conversationId: msg.conversationId,
    candidate,
    formData,
    date: slots.date,
    startTime: slots.startTime,
    endTime: slots.endTime,
  });

  if (result.loginRequired) {
    emit({ kind: 'login_required' });
    return;
  }
  if (!result.ok) {
    throw new Error(result.error ?? '폼 미리보기를 준비하지 못했습니다.');
  }
}

async function handleApplySuggestedMemory(
  msg: Extract<PopupToBackground, { type: 'POPUP_APPLY_SUGGESTED_MEMORY' }>,
): Promise<ApplicationStateResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const suggestion = ctx.applicationState?.suggested_memory;
  if (!suggestion) {
    return { ok: false, error: '적용할 추천 신청 정보가 없습니다.' };
  }

  const headcount =
    ctx.lastFilledSlots?.headcount ??
    gls.getQueue(msg.conversationId)?.requestedHeadcount ??
    suggestion.formData.headcount;
  const formData: ReservationFormData = {
    ...suggestion.formData,
    headcount: headcount ?? suggestion.formData.headcount,
  };

  ctx.applicationState = {
    ...(ctx.applicationState ?? {
      draft: null,
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      confidence: {
        organization: 'high',
        eventName: 'high',
        purpose: 'high',
        hangsaGbCode: 'high',
      },
      source: 'memory',
    }),
    draft: formData,
    missing_application: [],
    needs_application_collection: false,
    suggested_memory: null,
    confidence: {
      organization: 'high',
      eventName: 'high',
      purpose: 'high',
      hangsaGbCode: 'high',
    },
    source: 'memory',
  };
  ctx.updatedAt = new Date().toISOString();
  syncApplicationDraftToAutomation(ctx, formData);
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  void apiClient
    .upsertConversation(msg.conversationId, {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    })
    .catch((e) => console.warn('[SW] applySuggestedMemory mirror failed:', e));

  return { ok: true, applicationState: ctx.applicationState };
}

async function handleDismissSuggestedMemory(
  msg: Extract<PopupToBackground, { type: 'POPUP_DISMISS_SUGGESTED_MEMORY' }>,
): Promise<ApplicationStateResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const current = ctx.applicationState;
  if (!current) {
    return { ok: false, error: '신청 상태를 찾지 못했습니다.' };
  }

  ctx.applicationState = {
    ...current,
    suggested_memory: null,
    draft: null,
    source: null,
    missing_application: ['organization', 'eventName', 'purpose', 'hangsaGbCode'],
    needs_application_collection: true,
    confidence: {
      organization: 'low',
      eventName: 'low',
      purpose: 'low',
      hangsaGbCode: 'low',
    },
  };
  ctx.updatedAt = new Date().toISOString();
  syncApplicationDraftToAutomation(ctx, null);
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  void apiClient
    .upsertConversation(msg.conversationId, {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    })
    .catch((e) => console.warn('[SW] dismissSuggestedMemory mirror failed:', e));

  return { ok: true, applicationState: ctx.applicationState };
}

async function handleCancel(
  msg: Extract<PopupToBackground, { type: 'POPUP_CANCEL' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.pendingStart = null;
  ctx.lastProposed = null;
  ctx.lastStatus = { kind: 'idle' };
  ctx.conversationStatus = 'abandoned_user';
  ctx.updatedAt = new Date().toISOString();
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  try {
    const abandoned = await apiClient.abandonConversation(msg.conversationId);
    ctx.history = abandoned.history;
    ctx.lastIntent = abandoned.lastIntent;
    ctx.lastFilledSlots = abandoned.lastFilledSlots;
    ctx.applicationState = abandoned.lastApplicationState;
    ctx.conversationStatus = abandoned.status;
    ctx.confirmedReservationLabel = abandoned.confirmedReservationLabel;
    ctx.updatedAt = abandoned.updatedAt;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
  } catch (e) {
    console.warn('[SW] abandonConversation failed:', e);
  }
}

async function handleDeleteConversation(
  msg: Extract<PopupToBackground, { type: 'POPUP_DELETE_CONVERSATION' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  contexts.delete(msg.conversationId);
  await persistContexts();
  await removeConversationSnapshot(msg.conversationId);
  await removeConversationIndexEntry(msg.conversationId);

  try {
    await apiClient.deleteConversation(msg.conversationId);
  } catch (e) {
    console.warn('[SW] deleteConversation failed:', e);
    throw e;
  }

  try {
    await refreshConversationIndexFromServer();
  } catch (e) {
    console.warn('[SW] refresh after delete failed:', e);
  }
}
