import type { ApplicationState, FilledSlots, ParseResult } from '../shared/types';
import {
  applyContextualMeridiemRange,
  clearTimeSlots,
  crossesMidnight,
  emptyFilledSlots,
  hasAmbiguousBareMeridiemTime,
  isBeyondFutureBookingWindow,
  isLikelyOutsideGeneralReservationHours,
  timeToMinutes,
  usesUnsupportedReservationMinute,
} from '../../../shared/reservation/slotPolicy';

const MAX_RESERVATION_DURATION_MIN = 8 * 60;

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
    assistant_message:
      '자정을 넘기는 예약은 지원하지 않아요. 같은 날짜 안에서 시작·종료 시간이 끝나도록 다시 알려주세요.',
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
    assistant_message:
      'GLS 공간예약은 30분 단위 시간만 안정적으로 처리할 수 있어요. 예: 18:00 또는 18:30처럼 다시 알려주세요.',
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
    assistant_message:
      '오전/오후가 빠진 시간은 헷갈릴 수 있어요. 예: 오전 6시 또는 오후 6시처럼 다시 알려주세요.',
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
    assistant_message:
      '새벽이나 심야 시간대는 일반 GLS 공간예약 가능 시간 밖으로 보여요. 예: 09:00부터 22:00 사이처럼 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}

function getSlotDurationMinutes(slots: FilledSlots | null | undefined): number | null {
  if (!slots) return null;
  if (slots.duration_min != null) return slots.duration_min;
  const startMin = timeToMinutes(slots.start_time);
  const endMin = timeToMinutes(slots.end_time);
  if (startMin == null || endMin == null) return null;
  const delta = endMin >= startMin ? endMin - startMin : endMin + 24 * 60 - startMin;
  return delta > 0 ? delta : null;
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
    assistant_message: `한 번에 ${hours}시간 예약은 제한을 넘을 수 있어요. 안전하게 진행하려면 최대 8시간 이내로 나누거나 시간을 줄여서 요청해 주세요.`,
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
    assistant_message:
      '너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}
