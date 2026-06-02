import type {
  ChatMessage,
  ConversationSessionSummary,
  ReservationFormData,
} from '../shared/types';
import {
  CONVERSATION_INDEX_KEY,
  isPlaceholderConversationSummary,
  makeConversationSessionSummary,
  mergeConversationSessionSummaries,
  shouldAppearInConversationHistory,
  SNAPSHOT_PREFIX,
} from '../shared/conversationSessions';
import { emptyFilledSlots } from '../../../shared/reservation/slotPolicy';
import * as apiClient from './apiClient';
import {
  contexts,
  getOrCreateContext,
  persistContexts,
  type ConversationContext,
} from './contextStore';

export async function loadConversationIndex(): Promise<ConversationSessionSummary[]> {
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

export async function saveConversationIndex(
  index: ConversationSessionSummary[],
): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONVERSATION_INDEX_KEY]: index });
  } catch {
    // non-fatal
  }
}

export async function removeConversationIndexEntry(
  conversationId: string,
): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = current.filter((item) => item.id !== conversationId);
  await saveConversationIndex(next);
  return next;
}

export async function persistConversationSnapshot(ctx: ConversationContext): Promise<void> {
  try {
    await chrome.storage.local.set({
      [`${SNAPSHOT_PREFIX}${ctx.conversationId}`]: {
        history: ctx.history,
        lastFilledSlots: ctx.lastFilledSlots,
        applicationState: ctx.applicationState,
        conversationStatus: ctx.conversationStatus,
        lastStatus: ctx.lastStatus,
        lastProposed: ctx.lastProposed,
        pendingFormData: ctx.pendingStart?.pendingFormData ?? null,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
        confirmedSpaceCode: ctx.confirmedSpaceCode,
        confirmedSpaceLabel: ctx.confirmedSpaceLabel,
        updatedAt: ctx.updatedAt,
      },
    });
  } catch {
    // local snapshot is a resilience aid; never block the live flow.
  }
}

export function buildSummaryFromContext(
  ctx: ConversationContext,
): ConversationSessionSummary {
  return makeConversationSessionSummary({
    id: ctx.conversationId,
    title: ctx.title,
    status: ctx.conversationStatus,
    updatedAt: ctx.updatedAt,
    confirmedReservationLabel: ctx.confirmedReservationLabel,
    confirmedSpaceCode: ctx.confirmedSpaceCode,
    confirmedSpaceLabel: ctx.confirmedSpaceLabel,
    messages: ctx.history,
    lastFilledSlots: ctx.lastFilledSlots,
  });
}

export function buildSummaryFromServer(
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
    title: row.title,
    status: row.status,
    updatedAt: row.updatedAt,
    confirmedReservationLabel: row.confirmedReservationLabel,
    confirmedSpaceCode: row.confirmedSpaceCode,
    confirmedSpaceLabel: row.confirmedSpaceLabel,
    firstUserMessage: row.firstUserMessage,
    lastMessagePreview: row.lastMessagePreview,
    lastFilledSlots: row.lastFilledSlots,
  });
}

export async function syncConversationIndexWithSummary(
  summary: ConversationSessionSummary,
): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = mergeConversationSessionSummaries(current, [summary]);
  await saveConversationIndex(next);
  return next;
}

export async function syncConversationSummaryFromContext(
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
    await removeConversationSnapshot(ctx.conversationId);
    return removeConversationIndexEntry(ctx.conversationId);
  }
  await persistConversationSnapshot(ctx);
  return syncConversationIndexWithSummary(buildSummaryFromContext(ctx));
}

export async function refreshConversationIndexFromServer(): Promise<
  ConversationSessionSummary[]
> {
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

export async function removeConversationSnapshot(conversationId: string): Promise<void> {
  try {
    await chrome.storage.local.remove(`${SNAPSHOT_PREFIX}${conversationId}`);
  } catch {
    // non-fatal
  }
}

export async function hydrateContextFromSnapshot(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const got = await chrome.storage.local.get(`${SNAPSHOT_PREFIX}${conversationId}`);
    const snapshot = got?.[`${SNAPSHOT_PREFIX}${conversationId}`] as
      | Partial<ConversationContext & { pendingFormData: ReservationFormData | null }>
      | undefined;
    if (!snapshot) return null;
    const ctx = getOrCreateContext(conversationId);
    ctx.history = Array.isArray(snapshot.history) ? snapshot.history : [];
    ctx.lastFilledSlots = snapshot.lastFilledSlots ?? null;
    ctx.applicationState = snapshot.applicationState ?? null;
    ctx.conversationStatus = snapshot.conversationStatus ?? 'active';
    ctx.lastStatus = snapshot.lastStatus ?? { kind: 'idle' };
    ctx.lastProposed = snapshot.lastProposed ?? null;
    ctx.pendingStart = snapshot.pendingFormData
      ? {
          conversationId,
          slots: ctx.lastFilledSlots ?? emptyFilledSlots(),
          pendingFormData: snapshot.pendingFormData,
        }
      : null;
    ctx.confirmedReservationLabel = snapshot.confirmedReservationLabel ?? null;
    ctx.confirmedSpaceCode = snapshot.confirmedSpaceCode ?? null;
    ctx.confirmedSpaceLabel = snapshot.confirmedSpaceLabel ?? null;
    ctx.updatedAt = snapshot.updatedAt ?? new Date().toISOString();
    await persistContexts();
    return ctx;
  } catch {
    return null;
  }
}

export async function hydrateContextFromSummary(
  conversationId: string,
): Promise<ConversationContext | null> {
  const summary = (await loadConversationIndex()).find((item) => item.id === conversationId);
  if (!summary) return null;
  const ctx = getOrCreateContext(conversationId);
  ctx.history = summary.lastMessagePreview
    ? [{ role: 'assistant', content: summary.lastMessagePreview, ts: summary.updatedAt }]
    : [];
  ctx.conversationStatus = summary.status;
  ctx.lastStatus =
    summary.status === 'completed'
      ? { kind: 'done', spaceCode: summary.confirmedSpaceCode ?? 'completed' }
      : { kind: 'idle' };
  ctx.confirmedReservationLabel = summary.confirmedReservationLabel ?? null;
  ctx.confirmedSpaceCode = summary.confirmedSpaceCode ?? null;
  ctx.confirmedSpaceLabel = summary.confirmedSpaceLabel ?? null;
  ctx.updatedAt = summary.updatedAt;
  await persistContexts();
  return ctx;
}

export async function hydrateContextFromServer(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const dto = await apiClient.getConversation(conversationId);
    const ctx = getOrCreateContext(conversationId);
    ctx.history = dto.history;
    ctx.title = dto.title;
    ctx.lastIntent = dto.lastIntent;
    ctx.lastFilledSlots = dto.lastFilledSlots;
    ctx.applicationState = dto.lastApplicationState;
    ctx.conversationStatus = dto.status;
    ctx.confirmedReservationLabel = dto.confirmedReservationLabel;
    ctx.confirmedSpaceCode = dto.confirmedSpaceCode;
    ctx.confirmedSpaceLabel = dto.confirmedSpaceLabel;
    ctx.updatedAt = dto.updatedAt;
    ctx.lastStatus = { kind: 'idle' };
    ctx.pendingStart = null;
    ctx.lastProposed = null;
    ctx.loginPrompt = null;
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

export async function mirrorConversation(
  conversationId: string,
  body: apiClient.UpsertConversationBody,
  warnLabel: string,
): Promise<void> {
  try {
    const dto = await apiClient.upsertConversation(conversationId, body);
    const ctx = contexts.get(conversationId);
    if (!ctx) return;
    ctx.title = dto.title;
    ctx.conversationStatus = dto.status;
    ctx.confirmedReservationLabel = dto.confirmedReservationLabel;
    ctx.confirmedSpaceCode = dto.confirmedSpaceCode;
    ctx.confirmedSpaceLabel = dto.confirmedSpaceLabel;
    ctx.updatedAt = dto.updatedAt;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
  } catch (e) {
    console.warn(warnLabel, e);
  }
}
