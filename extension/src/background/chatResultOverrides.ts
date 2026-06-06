import type { ApplicationState, ParseResult } from '../shared/types';
import {
  applyContextualMeridiemRange,
  clearTimeSlots,
  hasAmbiguousBareMeridiemTime,
} from '../../../shared/reservation/slotPolicy';
import {
  SLOT_GUARD_MESSAGES,
  type SlotStateGuardReason,
  evaluateSlotStateGuards,
} from '../../../shared/reservation/slotGuards';

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

/**
 * 슬롯 상태 가드(미래창/자정/30분/시간대/길이)를 공유 평가기로 1회 적용.
 * intent 매핑은 클라 동작 유지: over_duration 만 out_of_scope, 나머지는 new_reservation.
 */
const GUARD_FORCES_OUT_OF_SCOPE = new Set<SlotStateGuardReason>(['over_duration']);

export function applySlotStateGuards(
  result: ParseResult,
  now: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  const outcome = evaluateSlotStateGuards(result.filled_slots, now);
  if (!outcome) return result;
  return {
    ...result,
    intent: GUARD_FORCES_OUT_OF_SCOPE.has(outcome.reason) ? 'out_of_scope' : 'new_reservation',
    ready_to_search: false,
    missing_required: outcome.missingRequired,
    filled_slots: outcome.filledSlots,
    assistant_message: outcome.message,
    application_state: previousApplicationState ?? result.application_state,
  };
}
