/**
 * 서버 API 호출 래퍼 (D-019, D-021, D-024).
 *
 * 모든 요청에 X-Client-Id 헤더 자동 부착 (getOrCreateClientId).
 */

import type {
  ParseResult,
  SpaceCandidate,
  ChatMessage,
  FilledSlots,
  Intent,
  ApplicationState,
  ReservationFormData,
  ConversationStatus,
  ReminderDto,
} from '../shared/types';
import { getOrCreateClientId } from '../shared/clientId';

export const SERVER_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/+$/,
  '',
);

export interface ParseArgs {
  conversationId: string;
  history: ChatMessage[];
  now?: string; // ISO; default = new Date().toISOString()
}

export interface ConversationDto {
  id: string;
  status: ConversationStatus;
  title: string | null;
  history: ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  lastApplicationState: ApplicationState | null;
  confirmedReservationForm: ReservationFormData | null;
  confirmedReservationLabel: string | null;
  confirmedSpaceCode: string | null;
  confirmedSpaceLabel: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ConversationSummaryDto {
  id: string;
  status: ConversationStatus;
  title: string | null;
  updatedAt: string;
  completedAt: string | null;
  firstUserMessage: string | null;
  lastMessagePreview: string | null;
  lastFilledSlots: FilledSlots | null;
  confirmedReservationLabel: string | null;
  confirmedSpaceCode: string | null;
  confirmedSpaceLabel: string | null;
}

export interface UpsertConversationBody {
  history: ChatMessage[];
  status?: ConversationStatus;
  title?: string | null;
  lastIntent?: Intent | null;
  lastFilledSlots?: FilledSlots | null;
  lastApplicationState?: ApplicationState | null;
  confirmedReservationForm?: ReservationFormData | null;
  confirmedReservationLabel?: string | null;
  confirmedSpaceCode?: string | null;
  confirmedSpaceLabel?: string | null;
}

export interface ListSpacesArgs {
  headcount: number;
  campusCode?: string;
  buildingNo?: string;
  building?: string;
  space?: string;
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

  let res: Response;
  try {
    res = await fetch(`${SERVER_BASE_URL}${path}`, { ...init, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/failed to fetch|load failed|networkerror/i.test(message)) {
      throw new Error('API 서버에 연결할 수 없습니다. 네트워크 또는 서버 상태를 확인해 주세요.');
    }
    throw error;
  }
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

export async function listConversations(): Promise<ConversationSummaryDto[]> {
  return request<ConversationSummaryDto[]>('/conversations', {
    method: 'GET',
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return request<void>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function abandonConversation(id: string): Promise<ConversationDto> {
  return request<ConversationDto>(`/conversations/${encodeURIComponent(id)}/abandon`, {
    method: 'POST',
  });
}

export async function getReminder(): Promise<ReminderDto | null> {
  return request<ReminderDto | null>('/reminders', { method: 'GET' });
}

export async function dismissReminder(id: string): Promise<ReminderDto> {
  return request<ReminderDto>(`/reminders/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
  });
}

export async function acceptReminder(id: string): Promise<ReminderDto> {
  return request<ReminderDto>(`/reminders/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
  });
}

export async function listSpaces(args: ListSpacesArgs): Promise<SpaceCandidate[]> {
  const params = new URLSearchParams();
  params.set('headcount', String(args.headcount));
  if (args.campusCode) params.set('campusCode', args.campusCode);
  if (args.buildingNo) params.set('buildingNo', args.buildingNo);
  if (args.building) params.set('building', args.building);
  if (args.space) params.set('space', args.space);
  if (args.userOrgCode) params.set('userOrgCode', args.userOrgCode);
  return request<SpaceCandidate[]>(`/spaces?${params.toString()}`, { method: 'GET' });
}

export { ApiError };
