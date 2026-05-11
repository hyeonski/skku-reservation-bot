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
  building: z.string().nullable(),
  space: z.string().nullable(),
});
export type FilledSlots = z.infer<typeof FilledSlots>;

export const Intent = z.enum([
  'new_reservation',
  'request_alternative',
  'modify_slot',
  'cancel',
  'out_of_scope',
]);
export type Intent = z.infer<typeof Intent>;

export const ParseResponse = z.object({
  conversation_id: z.string().uuid(),
  filled_slots: FilledSlots,
  missing_required: z.array(z.string()),
  intent: Intent,
  ready_to_search: z.boolean(),
  assistant_message: z.string(),
});
export type ParseResponse = z.infer<typeof ParseResponse>;
