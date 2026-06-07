import type { ConversationSessionSummary } from '../shared/types';
import {
  makeConversationSessionSummary,
  MAX_CONVERSATION_INDEX_ITEMS,
  shouldAppearInConversationHistory,
} from '../shared/conversationSessions';
import * as apiClient from './apiClient';
import {
  contexts,
  getOrCreateContext,
  persistContexts,
  type ConversationContext,
} from './contextStore';

// 서버가 대화 목록·내용의 단일 진실(source of truth)이다.
// 클라이언트는 chrome.storage.local에 어떤 대화 데이터도 영속화하지 않는다.
// 진행 중 자동화 런타임 상태(lastStatus/lastProposed/pendingStart 등)만
// chrome.storage.session(contextStore)에 휘발성으로 백업해 SW 재시작을 견딘다.

/**
 * 서버 미동기화/오프라인 폴백 전용. 서버에 도달 못 했을 때만 인메모리 컨텍스트로
 * 목록을 임시 구성한다. 영속 저장소가 아니므로 삭제된 대화를 부활시키지 않는다.
 */
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

function sortAndCap(summaries: ConversationSessionSummary[]): ConversationSessionSummary[] {
  return [...summaries]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_CONVERSATION_INDEX_ITEMS);
}

/** 서버 권위 목록. 서버 응답만으로 구성하며 로컬과 머지하지 않는다. */
export async function listConversationsFromServer(): Promise<ConversationSessionSummary[]> {
  const remoteRows = await apiClient.listConversations();
  const summaries = remoteRows
    .map((row) => buildSummaryFromServer(row))
    .filter((row): row is ConversationSessionSummary => row !== null);
  return sortAndCap(summaries);
}

/** 서버 도달 불가 시에만 쓰는 인메모리 폴백 목록(영속 아님). */
export function listConversationsFromMemory(): ConversationSessionSummary[] {
  const summaries = [...contexts.values()]
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
  return sortAndCap(summaries);
}

/**
 * 명시적 부재(404/삭제) 시 클라이언트 런타임 흔적을 제거한다.
 * 로컬 영속 캐시가 없으므로 인메모리 + 세션 백업만 정리하면 된다.
 */
export async function purgeConversationLocally(conversationId: string): Promise<void> {
  contexts.delete(conversationId);
  await persistContexts();
}

function preferRuntimeStatus(
  previous: ConversationContext['lastStatus'] | undefined,
): ConversationContext['lastStatus'] {
  if (previous && previous.kind !== 'idle') return previous;
  return previous ?? { kind: 'idle' };
}

/**
 * 서버를 권위로 대화 내용을 복원한다. 서버에 없는 런타임 상태
 * (lastStatus/lastProposed/pendingStart/loginPrompt)는 인메모리(세션 백업에서
 * 복원된) 이전 컨텍스트에서 그대로 보존한다. 404면 null을 반환한다.
 */
export async function hydrateContextFromServer(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const dto = await apiClient.getConversation(conversationId);
    // 서버에 없는 진행 중 런타임은 덮어쓰기 전에 먼저 보존한다.
    const previous = contexts.get(conversationId);
    const runtimeStatus = previous?.lastStatus;
    const runtimeProposed = previous?.lastProposed ?? null;
    const runtimePending = previous?.pendingStart ?? null;
    const runtimeLogin = previous?.loginPrompt ?? null;

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
    ctx.lastStatus = preferRuntimeStatus(runtimeStatus);
    ctx.lastProposed = runtimeProposed;
    ctx.pendingStart = runtimePending;
    ctx.loginPrompt = runtimeLogin;
    await persistContexts();
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
  } catch (e) {
    console.warn(warnLabel, e);
  }
}

/**
 * 레거시 chrome.storage.local 대화 캐시(인덱스 + 스냅샷) 일괄 제거.
 * 서버-권위 전환 이전에 쌓인 stale 데이터를 청소한다. SW 시작 시 1회 호출.
 */
export async function purgeLegacyLocalStorage(): Promise<void> {
  const LEGACY_INDEX_KEY = 'gls_conversation_index_v1';
  const LEGACY_SNAPSHOT_PREFIX = 'gls_popup_snapshot_v1_';
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(
      (k) => k === LEGACY_INDEX_KEY || k.startsWith(LEGACY_SNAPSHOT_PREFIX),
    );
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  } catch {
    // non-fatal
  }
}
