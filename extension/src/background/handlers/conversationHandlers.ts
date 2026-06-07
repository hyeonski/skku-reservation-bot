import type { PopupToBackground } from '../../shared/messages';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import {
  contexts,
  pendingStarts,
  persistContexts,
  type ConversationContext,
} from '../contextStore';
import {
  hydrateContextFromServer,
  listConversationsFromMemory,
  listConversationsFromServer,
  purgeConversationLocally,
} from '../conversationPersistence';
import { resumePendingStartIfReady } from './reservationHandlers';

export async function handleGetStatus(
  msg: Extract<PopupToBackground, { type: 'POPUP_GET_STATUS' }>,
  rehydrationReady: Promise<void>,
) {
  await rehydrationReady;
  await resumePendingStartIfReady(msg.conversationId);
  // 서버가 대화 내용의 권위. 매 조회마다 서버에서 가져오고, 서버에 없는 진행 중
  // 런타임(상태/후보/대기 폼)은 hydrateContextFromServer가 인메모리에서 보존한다.
  const previous = contexts.get(msg.conversationId) ?? null;
  let ctx: ConversationContext | null;
  try {
    ctx = await hydrateContextFromServer(msg.conversationId);
    if (!ctx) {
      // 404 = 명시적 부재(삭제/초기화). 로컬 런타임 흔적을 지우고 빈 상태 반환.
      await purgeConversationLocally(msg.conversationId);
    }
  } catch (e) {
    // 서버 도달 불가(오프라인 등) → 인메모리 폴백(영속 아님). 부활 위험 없음.
    console.warn('[SW] getStatus server fetch failed; using in-memory ctx:', e);
    ctx = previous;
  }
  const queue = gls.getQueue(msg.conversationId);
  const restoredStatus =
    ctx?.conversationStatus === 'completed'
      ? { kind: 'done' as const, spaceCode: ctx.confirmedSpaceCode ?? 'completed' }
      : (ctx?.lastStatus ?? { kind: 'idle' as const });

  return {
    status: restoredStatus,
    lastFilledSlots: ctx?.lastFilledSlots ?? null,
    history: ctx?.history ?? [],
    lastProposed: queue?.lastProposed ?? ctx?.lastProposed ?? null,
    pendingFormData: queue?.pendingFormData ?? ctx?.pendingStart?.pendingFormData ?? null,
    applicationState: ctx?.applicationState ?? null,
    conversationStatus: ctx?.conversationStatus ?? 'active',
  };
}

export async function handleListConversations(rehydrationReady: Promise<void>) {
  await rehydrationReady;
  try {
    const conversations = await listConversationsFromServer();
    return { ok: true, conversations };
  } catch (e) {
    console.warn('[SW] listConversations failed; using in-memory fallback:', e);
    return { ok: true, conversations: listConversationsFromMemory() };
  }
}

export async function handleDeleteConversation(
  msg: Extract<PopupToBackground, { type: 'POPUP_DELETE_CONVERSATION' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  contexts.delete(msg.conversationId);
  await persistContexts();

  try {
    await apiClient.deleteConversation(msg.conversationId);
  } catch (e) {
    console.warn('[SW] deleteConversation failed:', e);
    throw e;
  }
}
