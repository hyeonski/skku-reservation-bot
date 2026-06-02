import type { ReservationFormData, SpaceCandidate } from '../shared/types';
import { deriveEndTime } from '../../../shared/reservation/slotPolicy';
import * as gls from './glsCoordinator';
import type { ConversationContext } from './contextStore';

export function resolveSearchSlots(ctx: ConversationContext): {
  date: string;
  startTime: string;
  endTime: string;
} | null {
  const queue = gls.getQueue(ctx.conversationId);
  if (queue?.date && queue.startTime && queue.endTime) {
    return {
      date: queue.date,
      startTime: queue.startTime,
      endTime: queue.endTime,
    };
  }

  const slots = ctx.pendingStart?.slots ?? ctx.lastFilledSlots;
  const endTime = deriveEndTime(slots);
  if (!slots?.date || !slots.start_time || !endTime) return null;
  return {
    date: slots.date,
    startTime: slots.start_time,
    endTime,
  };
}

export function hasCompleteReservationForm(
  formData: ReservationFormData | null | undefined,
): formData is ReservationFormData {
  return Boolean(
    formData &&
      formData.hangsaGbCode.trim() &&
      formData.organization.trim() &&
      formData.eventName.trim() &&
      formData.purpose.trim() &&
      formData.headcount > 0,
  );
}

export function summarizeReservationLabel(formData: ReservationFormData): string {
  const eventName = formData.eventName.trim();
  const organization = formData.organization.trim();
  if (!eventName) return organization || '예약 신청';
  if (!organization || eventName.includes(organization)) return eventName;
  return `${organization} ${eventName}`;
}

export function summarizeSpaceLabel(candidate: SpaceCandidate): string {
  return `${candidate.buildingName} ${candidate.roomName}`.trim();
}

export function syncApplicationDraftToAutomation(
  ctx: ConversationContext,
  draft: ReservationFormData | null,
): void {
  const normalizedDraft = hasCompleteReservationForm(draft) ? draft : undefined;
  const queue = gls.getQueue(ctx.conversationId);
  if (queue) {
    queue.pendingFormData = normalizedDraft;
    gls.markQueuesDirty();
  }
  if (ctx.pendingStart) {
    ctx.pendingStart.pendingFormData = normalizedDraft;
  }
}
