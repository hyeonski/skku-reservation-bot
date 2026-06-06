import type {
  ChatMessage,
  FilledSlots,
  ParseResult,
  ReservationFormData,
} from '../shared/types';
import { isSearchReady } from '../../../shared/reservation/slotPolicy';
import { parseExplicitDateEdit } from '../../../shared/reservation/slotEdits';
import {
  candidateSupportsHeadcount as sharedCandidateSupportsHeadcount,
} from '../shared/spaceCapacity';

function hasAnyFilledSlot(slots: FilledSlots | null | undefined): boolean {
  if (!slots) return false;
  return Boolean(
    slots.date ||
      slots.start_time ||
      slots.end_time ||
      slots.duration_min != null ||
      slots.headcount != null ||
      slots.campus ||
      slots.building ||
      slots.space,
  );
}

export function preservePreviousSlotContext(
  result: ParseResult,
  previousSlots: FilledSlots | null,
): ParseResult {
  if (!previousSlots) return result;
  if (
    result.intent === 'cancel' ||
    hasAnyFilledSlot(result.filled_slots) ||
    !hasAnyFilledSlot(previousSlots)
  ) {
    return result;
  }

  return {
    ...result,
    filled_slots: previousSlots,
    ready_to_search: false,
  };
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function addDaysToIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyRetrySlotAdjustment(
  base: FilledSlots | null,
  text: string,
): FilledSlots | null {
  if (!base) return null;
  const next: FilledSlots = { ...base };
  let changed = false;

  const countMatch = text.match(/(\d+)\s*명/);
  if (countMatch) {
    const parsed = Number.parseInt(countMatch[1] ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== next.headcount) {
      next.headcount = parsed;
      changed = true;
    }
  }

  const rangeMatch = text.match(/(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*시/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1] ?? '', 10);
    const end = Number.parseInt(rangeMatch[2] ?? '', 10);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      next.start_time = formatHour(start);
      next.end_time = formatHour(end);
      next.duration_min = (end - start) * 60;
      changed = true;
    }
  }

  const durationMatch = text.match(/(\d+)\s*시간/);
  if (durationMatch && next.start_time) {
    const hours = Number.parseInt(durationMatch[1] ?? '', 10);
    if (Number.isFinite(hours) && hours > 0) {
      next.duration_min = hours * 60;
      const [sh, sm] = next.start_time.split(':');
      const endMin =
        Number.parseInt(sh ?? '0', 10) * 60 +
        Number.parseInt(sm ?? '0', 10) +
        hours * 60;
      next.end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      changed = true;
    }
  }

  const explicitDate = parseExplicitDateEdit(text, next.date);
  if (explicitDate) {
    if (explicitDate !== next.date) {
      next.date = explicitDate;
      changed = true;
    }
  } else if (/다음\s*주/.test(text) && next.date) {
    next.date = addDaysToIso(next.date, 7);
    changed = true;
  }

  if (!changed) return null;
  return next;
}

function extractHeadcountRangeUpper(text: string): number | null {
  const normalized = text.replace(/,/g, '');
  const matches = [
    normalized.match(/(\d+)\s*(?:명)?\s*[-–~]\s*(\d+)\s*명/),
    normalized.match(/(\d+)\s*명\s*(?:에서|부터)\s*(\d+)\s*명/),
  ];
  const match = matches.find(Boolean);
  if (!match) return null;

  const first = Number.parseInt(match[1] ?? '', 10);
  const second = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const upper = Math.max(first, second);
  return upper > 0 ? upper : null;
}

export function extractLatestHeadcountRangeUpper(
  history: ChatMessage[],
  latestMessage: string,
): number | null {
  const userTexts = history
    .filter((message) => message.role === 'user')
    .map((message) => message.content);
  if (userTexts[userTexts.length - 1] !== latestMessage) {
    userTexts.push(latestMessage);
  }

  for (let i = userTexts.length - 1; i >= 0; i -= 1) {
    const text = userTexts[i] ?? '';
    const upper = extractHeadcountRangeUpper(text);
    if (upper != null) return upper;
    if (/\d+\s*명/.test(text)) return null;
  }
  return null;
}

export function applyHeadcountRangeOverride(
  result: ParseResult,
  upper: number | null,
): ParseResult {
  if (upper == null || result.filled_slots.headcount === upper) return result;

  const previous = result.filled_slots.headcount;
  const filledSlots = {
    ...result.filled_slots,
    headcount: upper,
  };
  const missingRequired = result.missing_required.filter((field) => field !== 'headcount');
  const assistantMessage =
    previous != null
      ? result.assistant_message.replace(new RegExp(`${previous}\\s*명`, 'g'), `${upper}명`)
      : result.assistant_message;

  return {
    ...result,
    filled_slots: filledSlots,
    missing_required: missingRequired,
    ready_to_search: isSearchReady(filledSlots),
    assistant_message: assistantMessage,
    application_state: {
      ...result.application_state,
      draft: applyHeadcountToDraft(result.application_state.draft, upper),
    },
  };
}

export function applySlotCorrection(
  base: FilledSlots | null,
  text: string,
): FilledSlots | null {
  if (!base) return null;
  const normalized = text.trim();
  const headcountMatch = normalized.match(
    /^(?:아니(?:요)?\s*)?(?:인원(?:은|을|는)?\s*)?(\d+)\s*명(?:으로)?\s*(?:(?:바꿔?|변경|수정)(?:해줘|해주세요)?)?$/,
  );
  if (!headcountMatch) return null;

  const headcount = Number.parseInt(headcountMatch[1] ?? '', 10);
  if (!Number.isFinite(headcount) || headcount <= 0 || headcount === base.headcount) {
    return null;
  }

  return {
    ...base,
    headcount,
  };
}

export function applyHeadcountToDraft(
  draft: ReservationFormData | null,
  headcount: number | null,
): ReservationFormData | null {
  if (!draft || headcount == null) return draft;
  return {
    ...draft,
    headcount,
  };
}

export function candidateSupportsHeadcount(
  candidate: import('../shared/types').SpaceCandidate | null,
  headcount: number | null,
): boolean {
  return sharedCandidateSupportsHeadcount(candidate, headcount);
}
