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

// ---------- per-conversation context (history + last parse) ----------

interface ConversationContext {
  conversationId: string;
  history: import('../shared/types').ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  lastStatus: AutomationStatus;
}

const contexts = new Map<string, ConversationContext>();

const SESSION_KEY = 'sw_contexts_v1';

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
    };
    contexts.set(conversationId, ctx);
  }
  return ctx;
}

// ---------- popup status pushing ----------

function makeStatusEmitter(conversationId: string): (s: AutomationStatus) => void {
  return (status) => {
    const ctx = getOrCreateContext(conversationId);
    ctx.lastStatus = status;
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
  void rehydrateContexts();
});

// Best-effort rehydrate on cold module load too.
void rehydrateContexts();

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

    case 'POPUP_CONFIRM_RESERVATION':
      handleConfirm(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CANCEL':
      handleCancel(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_GET_STATUS': {
      const ctx = contexts.get(msg.conversationId);
      sendResponse({
        status: ctx?.lastStatus ?? { kind: 'idle' },
        lastFilledSlots: ctx?.lastFilledSlots ?? null,
      });
      return false;
    }

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
  // Run async; don't await full completion because it intentionally returns
  // early once a candidate is proposed (awaiting POPUP_CONFIRM_RESERVATION).
  void gls
    .runReservationFlow({
      conversationId: msg.conversationId,
      slots: msg.slots,
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

  if (!msg.confirmed) {
    // User rejected the proposed candidate — try the next one.
    void gls.continueAfterRejection(msg.conversationId, emit).catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
    return;
  }

  if (!queue || !queue.lastProposed) {
    emit({ kind: 'error', message: '제안된 후보가 없습니다.' });
    return;
  }

  // formData 우선순위:
  //   1. 사용자가 confirm 시 함께 보낸 값 (chat 흐름의 행사메타 collector — 아직 미구현)
  //   2. queue 에 미리 저장된 pendingFormData (DevPanel 또는 향후 행사메타 사전입력)
  //   3. TODO placeholder (디버그 폴백 — 실제 GLS에서는 거부될 가능성)
  const formData: ReservationFormData =
    msg.formData ??
    queue.pendingFormData ??
    ({
      hangsaGbCode: 'TODO',
      organization: 'TODO',
      eventName: 'TODO',
      headcount: queue.lastProposed.capacityMin,
      purpose: 'TODO',
    } as ReservationFormData);

  void gls
    .submitConfirmedReservation({
      conversationId: msg.conversationId,
      candidate: queue.lastProposed,
      formData,
      date: queue.date,
      startTime: queue.startTime,
      endTime: queue.endTime,
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

async function handleDevRunAutomation(
  msg: Extract<PopupToBackground, { type: 'POPUP_DEV_RUN_AUTOMATION' }>,
): Promise<void> {
  // Dev 진입점 — 채팅·LLM·서버 전부 우회.
  // 슬롯·후보·formData 를 popup의 DevPanel에서 그대로 받아 runReservationFlow 에 주입.
  const emit = makeStatusEmitter(msg.conversationId);
  // SW context도 만들어두면 popup 재오픈 시 status 복원 가능
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.lastFilledSlots = msg.slots;
  void persistContexts();

  void gls
    .runReservationFlow({
      conversationId: msg.conversationId,
      slots: msg.slots,
      candidates: msg.candidates,
      pendingFormData: msg.formData,
      forceNewTab: true, // dev 모드는 항상 새 탭 — stale state 회피
      onStatusChange: emit,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

async function handleCancel(
  msg: Extract<PopupToBackground, { type: 'POPUP_CANCEL' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  contexts.delete(msg.conversationId);
  void persistContexts();
  try {
    await apiClient.abandonConversation(msg.conversationId);
  } catch (e) {
    console.warn('[SW] abandonConversation failed:', e);
  }
}
