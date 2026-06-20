/**
 * /parse 라우트 Zod 스키마 — D-021 계약.
 */

import { z } from 'zod';

export const MessageRole = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRole>;

export const ChatMessage = z.object({
  role: MessageRole,
  content: z.string(),
  ts: z.string().datetime().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ParseRequest = z.object({
  conversation_id: z.string().uuid(),
  history: z.array(ChatMessage),
  now: z.string().datetime({ offset: true }),
  client_last_filled_slots: z.lazy(() => FilledSlots).nullable().optional(),
  client_last_application_state: z.lazy(() => ApplicationState).nullable().optional(),
  // 직전에 가용으로 제안된 공간 라벨(예: "명륜 학생회관 219호"). "다른 곳" 재탐색 맥락에 쓴다.
  client_last_proposed_space: z.string().nullable().optional(),
});
export type ParseRequest = z.infer<typeof ParseRequest>;

export const FilledSlots = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  duration_min: z.number().int().positive().nullable(),
  headcount: z.number().int().positive().nullable(),
  campus: z.string().nullable(),
  building: z.string().nullable(),
  space: z.string().nullable(),
});
export type FilledSlots = z.infer<typeof FilledSlots>;

/**
 * 흐름-제어 화행(speech-act). LLM 이 직접 출력하는 유일한 의도 신호.
 * "어느 트랙(slots/application)이 바뀌나"는 화행이 아니라 값 diff 로 서버가 판단.
 */
export const Signal = z.enum([
  'info',
  'accept',
  'request_alternative',
  'cancel',
  'out_of_scope',
]);
export type Signal = z.infer<typeof Signal>;

/**
 * transition 의 부수효과로 클라가 실행할 액션. 서버 reducer(deriveAction)가
 * (현재 slots/application, 화행, 후보 유무)에서 결정론적으로 파생한다.
 * - search: 새/재 탐색 시작 (필수 슬롯 충족 시)
 * - next_candidate: 이미 찾은 후보 리스트에서 다음 후보 ("다른 곳")
 * - fill_form: 신청 폼만 채움(미리보기). 실제 제출은 버튼 전용이라 여기 없음.
 * - none: 클라는 메시지·상태만 갱신
 */
export const Action = z.enum(['search', 'next_candidate', 'fill_form', 'none']);
export type Action = z.infer<typeof Action>;

export const ApplicationField = z.enum([
  'organization',
  'eventName',
  'purpose',
  'hangsaGbCode',
]);
export type ApplicationField = z.infer<typeof ApplicationField>;

export const ConfidenceLevel = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

export const ReservationFormData = z.object({
  hangsaGbCode: z.string().min(1),
  organization: z.string().min(1),
  eventName: z.string().min(1),
  headcount: z.number().int().positive(),
  purpose: z.string().min(1),
});
export type ReservationFormData = z.infer<typeof ReservationFormData>;

export const ReservationDraftData = ReservationFormData.extend({
  hangsaGbCode: z.string(),
  organization: z.string(),
  eventName: z.string(),
  purpose: z.string(),
});
export type ReservationDraftData = z.infer<typeof ReservationDraftData>;

export const SuggestedApplicationMemory = z.object({
  conversationId: z.string().uuid(),
  label: z.string(),
  formData: ReservationFormData,
  reason: z.enum(['frequency', 'reuse_signal']),
  count: z.number().int().positive().nullable(),
  frequency: z.string(),
  confidence: z.number().min(0).max(1),
});
export type SuggestedApplicationMemory = z.infer<typeof SuggestedApplicationMemory>;

export const ApplicationRecommendation = z.object({
  from_conversation_id: z.string().uuid(),
  group: z.string(),
  event: z.string(),
  category: z.string(),
  purpose: z.string(),
  confidence: z.number().min(0).max(1),
  frequency: z.string(),
});
export type ApplicationRecommendation = z.infer<typeof ApplicationRecommendation>;

export const ApplicationState = z.object({
  draft: ReservationDraftData.nullable(),
  missing_application: z.array(ApplicationField),
  needs_application_collection: z.boolean(),
  suggested_memory: SuggestedApplicationMemory.nullable(),
  recommendation: ApplicationRecommendation.nullable(),
  confidence: z.record(ApplicationField, ConfidenceLevel),
  source: z.enum(['conversation', 'memory', 'user_modified']).nullable(),
});
export type ApplicationState = z.infer<typeof ApplicationState>;

export const ParseResponse = z.object({
  conversation_id: z.string().uuid(),
  filled_slots: FilledSlots,
  missing_required: z.array(z.string()),
  ready_to_search: z.boolean(),
  assistant_message: z.string(),
  application_state: ApplicationState,
  /** 흐름-제어 화행. 클라는 cancel lifecycle 판단에만 쓴다(그 외엔 action 으로 충분). */
  signal: Signal,
  /** 클라가 실행만 하는 파생 액션(서버 reducer 산출). */
  action: Action,
  /** 후보 제안됨 ∧ 신청서 완성 — 폼/제출 버튼 노출 게이트. */
  can_submit: z.boolean(),
});
export type ParseResponse = z.infer<typeof ParseResponse>;
