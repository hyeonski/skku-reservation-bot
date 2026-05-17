/**
 * /conversations 라우트 Zod 스키마 (D-018, D-024).
 */

import { z } from 'zod';
import { ChatMessage, ApplicationState, ReservationFormData } from './parse.js';

export const ConversationStatus = z.enum([
  'active',
  'completed',
  'abandoned_user',
  'abandoned_timeout',
]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const UpsertConversationBody = z.object({
  history: z.array(ChatMessage),
  status: ConversationStatus.optional(), // 미지정 시 active 유지
  lastIntent: z.string().nullable().optional(),
  lastFilledSlots: z.unknown().optional(),
  lastApplicationState: ApplicationState.nullable().optional(),
  confirmedReservationForm: ReservationFormData.nullable().optional(),
  confirmedReservationLabel: z.string().nullable().optional(),
});
export type UpsertConversationBody = z.infer<typeof UpsertConversationBody>;

export const ConversationDto = z.object({
  id: z.string().uuid(),
  status: ConversationStatus,
  history: z.array(ChatMessage),
  lastIntent: z.string().nullable(),
  lastFilledSlots: z.unknown(),
  lastApplicationState: ApplicationState.nullable(),
  confirmedReservationForm: ReservationFormData.nullable(),
  confirmedReservationLabel: z.string().nullable(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type ConversationDto = z.infer<typeof ConversationDto>;

export const ConversationSummaryDto = z.object({
  id: z.string().uuid(),
  status: ConversationStatus,
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  firstUserMessage: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastFilledSlots: z.unknown(),
  confirmedReservationLabel: z.string().nullable(),
});
export type ConversationSummaryDto = z.infer<typeof ConversationSummaryDto>;
