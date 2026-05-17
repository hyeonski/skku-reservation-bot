/**
 * /parse 라우트 Zod 스키마 — D-021 계약.
 */

import { z } from 'zod';

export const MessageRole = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRole>;

export const ChatMessage = z.object({
  role: MessageRole,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ParseRequest = z.object({
  conversation_id: z.string().uuid(),
  history: z.array(ChatMessage),
  now: z.string().datetime({ offset: true }),
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

export const Intent = z.enum([
  'new_reservation',
  'request_alternative',
  'modify_slot',
  'modify_application',
  'cancel',
  'out_of_scope',
]);
export type Intent = z.infer<typeof Intent>;

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

export const SuggestedApplicationMemory = z.object({
  conversationId: z.string().uuid(),
  label: z.string(),
  formData: ReservationFormData,
});
export type SuggestedApplicationMemory = z.infer<typeof SuggestedApplicationMemory>;

export const ApplicationState = z.object({
  draft: ReservationFormData.nullable(),
  missing_application: z.array(ApplicationField),
  needs_application_collection: z.boolean(),
  suggested_memory: SuggestedApplicationMemory.nullable(),
  confidence: z.record(ApplicationField, ConfidenceLevel),
  source: z.enum(['conversation', 'memory', 'user_modified']).nullable(),
});
export type ApplicationState = z.infer<typeof ApplicationState>;

export const ParseResponse = z.object({
  conversation_id: z.string().uuid(),
  filled_slots: FilledSlots,
  missing_required: z.array(z.string()),
  intent: Intent,
  ready_to_search: z.boolean(),
  assistant_message: z.string(),
  application_state: ApplicationState,
});
export type ParseResponse = z.infer<typeof ParseResponse>;
