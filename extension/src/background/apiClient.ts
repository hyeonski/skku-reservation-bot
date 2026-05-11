/**
 * 서버 API 호출 래퍼 (D-019, D-021, D-024).
 *
 * 모든 요청에 X-Client-Id 헤더 자동 부착 (getOrCreateClientId).
 */

import type { ParseResult, SpaceCandidate, ChatMessage, FilledSlots, Intent } from '../shared/types';
import { getOrCreateClientId } from '../shared/clientId';

export const SERVER_BASE_URL = 'http://localhost:3000';

export interface ParseArgs {
  conversationId: string;
  history: ChatMessage[];
  now?: string; // ISO; default = new Date().toISOString()
}

export type ConversationStatus = 'active' | 'completed' | 'abandoned_user' | 'abandoned_timeout';

export interface ConversationDto {
  id: string;
  clientId: string;
  status: ConversationStatus;
  history: ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface UpsertConversationBody {
  history: ChatMessage[];
  status?: ConversationStatus;
  lastIntent?: Intent | null;
  lastFilledSlots?: FilledSlots | null;
}

export interface ListSpacesArgs {
  headcount: number;
  campusCode?: string;
  buildingNo?: string;
  userOrgCode?: string;
}

class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const clientId = await getOrCreateClientId();
  const headers = new Headers(init.headers);
  headers.set('X-Client-Id', clientId);
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const res = await fetch(`${SERVER_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text);
  }
  // Empty 204 → cast undefined as T
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export async function parse(args: ParseArgs): Promise<ParseResult> {
  const body = {
    conversation_id: args.conversationId,
    history: args.history,
    now: args.now ?? new Date().toISOString(),
  };
  return request<ParseResult>('/parse', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function upsertConversation(
  id: string,
  body: UpsertConversationBody,
): Promise<ConversationDto> {
  return request<ConversationDto>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getConversation(id: string): Promise<ConversationDto> {
  return request<ConversationDto>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

export async function abandonConversation(id: string): Promise<ConversationDto> {
  return request<ConversationDto>(`/conversations/${encodeURIComponent(id)}/abandon`, {
    method: 'POST',
  });
}

export async function listSpaces(args: ListSpacesArgs): Promise<SpaceCandidate[]> {
  const params = new URLSearchParams();
  params.set('headcount', String(args.headcount));
  if (args.campusCode) params.set('campusCode', args.campusCode);
  if (args.buildingNo) params.set('buildingNo', args.buildingNo);
  if (args.userOrgCode) params.set('userOrgCode', args.userOrgCode);
  return request<SpaceCandidate[]>(`/spaces?${params.toString()}`, { method: 'GET' });
}

export { ApiError };
