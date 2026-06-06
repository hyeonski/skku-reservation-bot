import type { ApplicationState, ParseResult } from '../shared/types';
import {
  applyContextualMeridiemRange,
  clearTimeSlots,
  crossesMidnight,
  emptyFilledSlots,
  hasAmbiguousBareMeridiemTime,
  isBeyondFutureBookingWindow,
  isLikelyOutsideGeneralReservationHours,
  usesUnsupportedReservationMinute,
} from '../../../shared/reservation/slotPolicy';
import {
  MAX_RESERVATION_DURATION_MIN,
  SLOT_GUARD_MESSAGES,
  getSlotDurationMinutes,
  overDurationMessage,
} from '../../../shared/reservation/slotGuards';

export function applySameDayTimeOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!crossesMidnight(result.filled_slots)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['start_time', 'end_time'],
    filled_slots: clearTimeSlots(result.filled_slots),
    assistant_message: SLOT_GUARD_MESSAGES.crosses_midnight,
    application_state: previousApplicationState ?? result.application_state,
  };
}

export function applyTimeGranularityOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!usesUnsupportedReservationMinute(result.filled_slots)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['start_time', 'end_time'],
    filled_slots: clearTimeSlots(result.filled_slots),
    assistant_message: SLOT_GUARD_MESSAGES.unsupported_minute,
    application_state: previousApplicationState ?? result.application_state,
  };
}

export function applyAmbiguousMeridiemOverride(
  result: ParseResult,
  text: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!hasAmbiguousBareMeridiemTime(text)) return result;
  return {
    ...result,
    intent: result.intent,
    ready_to_search: false,
    missing_required: Array.from(new Set([...result.missing_required, 'start_time'])),
    filled_slots: clearTimeSlots(result.filled_slots),
    assistant_message: SLOT_GUARD_MESSAGES.ambiguous_meridiem,
    application_state: previousApplicationState ?? result.application_state,
  };
}

export function applyContextualMeridiemRangeOverride(
  result: ParseResult,
  text: string,
): ParseResult {
  const filledSlots = applyContextualMeridiemRange(result.filled_slots, text);
  return filledSlots === result.filled_slots
    ? result
    : {
        ...result,
        filled_slots: filledSlots,
      };
}

export function applyGeneralReservationHoursOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!isLikelyOutsideGeneralReservationHours(result.filled_slots)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['start_time', 'end_time'],
    filled_slots: clearTimeSlots(result.filled_slots),
    assistant_message: SLOT_GUARD_MESSAGES.outside_hours,
    application_state: previousApplicationState ?? result.application_state,
  };
}

export function applyDurationLimitOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  const durationMin = getSlotDurationMinutes(result.filled_slots);
  if (durationMin == null || durationMin <= MAX_RESERVATION_DURATION_MIN) return result;
  const hours = Math.round((durationMin / 60) * 10) / 10;
  return {
    ...result,
    intent: 'out_of_scope',
    ready_to_search: false,
    missing_required: [],
    assistant_message: overDurationMessage(hours),
    application_state: previousApplicationState ?? result.application_state,
  };
}

export function applyFutureBookingWindowOverride(
  result: ParseResult,
  now: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!isBeyondFutureBookingWindow(result.filled_slots, now)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['date'],
    filled_slots: emptyFilledSlots(),
    assistant_message: SLOT_GUARD_MESSAGES.beyond_window,
    application_state: previousApplicationState ?? result.application_state,
  };
}
