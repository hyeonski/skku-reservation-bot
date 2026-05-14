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
  ReservationFormData,
} from '../shared/messages';
import type { AutomationStatus, FilledSlots, Intent } from '../shared/types';
import * as apiClient from './apiClient';
import * as gls from './glsCoordinator';
import { getOrCreateClientId } from '../shared/clientId';

interface PendingStartRequest {
  conversationId: string;
  slots: FilledSlots;
  candidates?: import('../shared/types').SpaceCandidate[];
  pendingFormData?: ReservationFormData;
}

// ---------- per-conversation context (history + last parse) ----------

interface ConversationContext {
  conversationId: string;
  history: import('../shared/types').ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
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
      lastStatus: { kind: 'idle' },
      pendingStart: null,
      lastProposed: null,
    };
    contexts.set(conversationId, ctx);
  }
  return ctx;
}

function resolveSearchSlots(ctx: ConversationContext): {
  date: string;
  startTime: string;
  endTime: string;
} | null {
  const slots = ctx.pendingStart?.slots ?? ctx.lastFilledSlots;
  if (!slots?.date || !slots.start_time || !slots.end_time) return null;
  return {
    date: slots.date,
    startTime: slots.start_time,
    endTime: slots.end_time,
  };
}

async function shouldSkipNavigationPrompt(): Promise<boolean> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return !!activeTab?.url?.startsWith(GLS_URL_PREFIX);
  } catch {
    return false;
  }
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
        const ctx = contexts.get(msg.conversationId);
        const queue = gls.getQueue(msg.conversationId);
        sendResponse({
          status: ctx?.lastStatus ?? { kind: 'idle' },
          lastFilledSlots: ctx?.lastFilledSlots ?? null,
          history: ctx?.history ?? [],
          lastProposed: queue?.lastProposed ?? ctx?.lastProposed ?? null,
          pendingFormData: queue?.pendingFormData ?? ctx?.pendingStart?.pendingFormData ?? null,
        });
      })().catch((e) => sendResponse({ error: (e as Error).message }));
      return true;
    }

    case 'POPUP_DEV_LIST_SPACES':
      apiClient
        .listSpaces({
          headcount: msg.headcount,
          ...(msg.campusCode ? { campusCode: msg.campusCode } : {}),
          ...(msg.buildingNo ? { buildingNo: msg.buildingNo } : {}),
        })
        .then((candidates) => sendResponse({ ok: true, candidates }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DEV_RUN_AUTOMATION':
      handleDevRunAutomation(msg)
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

  ctx.lastIntent = result.intent;
  ctx.lastFilledSlots = result.filled_slots;

  // Append assistant message to local history so subsequent persists carry it.
  const historyWithAssistant: import('../shared/types').ChatMessage[] = [
    ...msg.history,
    { role: 'assistant', content: result.assistant_message },
  ];
  ctx.history = historyWithAssistant;
  void persistContexts();

  // Mirror to server (D-018). Fire-and-forget; failure shouldn't block UX.
  void apiClient
    .upsertConversation(msg.conversationId, {
      history: historyWithAssistant,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
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
  const pending: PendingStartRequest = {
    conversationId: msg.conversationId,
    slots: msg.slots,
  };
  pendingStarts.set(msg.conversationId, pending);
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.pendingStart = pending;
  void persistContexts();
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

  // formData 우선순위:
  //   1. 사용자가 confirm 시 함께 보낸 값 (chat 흐름의 행사메타 collector — 아직 미구현)
  //   2. queue 에 미리 저장된 pendingFormData (DevPanel 또는 향후 행사메타 사전입력)
  //   3. TODO placeholder (디버그 폴백 — 실제 GLS에서는 거부될 가능성)
  const formData: ReservationFormData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ({
      hangsaGbCode: '113',
      organization: '미입력',
      eventName: '공간예약 신청',
      headcount: queue?.requestedHeadcount ?? candidate.capacityMax,
      purpose: '회의',
    } as ReservationFormData);

  if (queue) queue.pendingFormData = formData;
  if (ctx.pendingStart) ctx.pendingStart.pendingFormData = formData;
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
        void apiClient
          .upsertConversation(msg.conversationId, {
            history: ctx.history,
            status: 'completed',
            lastIntent: ctx.lastIntent,
            lastFilledSlots: ctx.lastFilledSlots,
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

  const formData: ReservationFormData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ({
      hangsaGbCode: '113',
      organization: '미입력',
      eventName: '공간예약 신청',
      headcount: queue?.requestedHeadcount ?? candidate.capacityMax,
      purpose: '회의',
    } as ReservationFormData);

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
  if (!result.available) {
    const reason = result.conflicts?.[0]?.info ?? '폼 미리보기를 준비하지 못했습니다.';
    throw new Error(reason);
  }
}

async function handleDevRunAutomation(
  msg: Extract<PopupToBackground, { type: 'POPUP_DEV_RUN_AUTOMATION' }>,
): Promise<void> {
  // Dev 진입점 — 채팅·LLM·서버 전부 우회.
  // 슬롯·후보·formData 를 popup의 DevPanel에서 그대로 받아 runReservationFlow 에 주입.
  const emit = makeStatusEmitter(msg.conversationId);
  // SW context도 만들어두면 popup 재오픈 시 status 복원 가능
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.lastFilledSlots = msg.slots;
  const pending = {
    conversationId: msg.conversationId,
    slots: msg.slots,
    candidates: msg.candidates,
    pendingFormData: msg.formData,
  };
  ctx.pendingStart = pending;
  void persistContexts();

  pendingStarts.set(msg.conversationId, pending);
  if (await shouldSkipNavigationPrompt()) {
    void gls
      .runReservationFlow({
        conversationId: msg.conversationId,
        slots: msg.slots,
        candidates: msg.candidates,
        pendingFormData: msg.formData,
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

async function handleCancel(
  msg: Extract<PopupToBackground, { type: 'POPUP_CANCEL' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  const ctx = contexts.get(msg.conversationId);
  if (ctx) ctx.pendingStart = null;
  contexts.delete(msg.conversationId);
  void persistContexts();
  try {
    await apiClient.abandonConversation(msg.conversationId);
  } catch (e) {
    console.warn('[SW] abandonConversation failed:', e);
  }
}
