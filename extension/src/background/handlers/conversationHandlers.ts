import type { PopupToBackground } from '../../shared/messages';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import { contexts, pendingStarts, persistContexts } from '../contextStore';
import {
  hydrateContextFromServer,
  hydrateContextFromSnapshot,
  hydrateContextFromSummary,
  loadConversationIndex,
  refreshConversationIndexFromServer,
  removeConversationIndexEntry,
  removeConversationSnapshot,
} from '../conversationPersistence';
import { resumePendingStartIfReady } from './reservationHandlers';

export async function handleGetStatus(
  msg: Extract<PopupToBackground, { type: 'POPUP_GET_STATUS' }>,
  rehydrationReady: Promise<void>,
) {
  await rehydrationReady;
  await resumePendingStartIfReady(msg.conversationId);
  let ctx =
    contexts.get(msg.conversationId) ??
    (await hydrateContextFromServer(msg.conversationId)) ??
    (await hydrateContextFromSnapshot(msg.conversationId)) ??
    (await hydrateContextFromSummary(msg.conversationId));
  const localSummary = (await loadConversationIndex()).find(
    (item) => item.id === msg.conversationId,
  );
  if (localSummary?.status === 'completed' && ctx?.conversationStatus !== 'completed') {
    ctx = await hydrateContextFromSummary(msg.conversationId);
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
  const localIndex = await loadConversationIndex();
  try {
    const conversations = await refreshConversationIndexFromServer();
    return { ok: true, conversations };
  } catch (e) {
    console.warn('[SW] listConversations refresh failed:', e);
    return { ok: true, conversations: localIndex };
  }
}

export async function handleDeleteConversation(
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
