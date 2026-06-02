import type {
  ChatMessage,
  FilledSlots,
  ParseResult,
  ReservationFormData,
} from '../shared/types';
import { isSearchReady } from '../../../shared/reservation/slotPolicy';

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

export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1] ?? '', 10);
  const minute = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`;
}

type MeridiemContext = 'am' | 'pm' | null;

function getMeridiemContext(time: string | null | undefined): MeridiemContext {
  const minutes = timeToMinutes(time ?? null);
  if (minutes == null) return null;
  return minutes >= 12 * 60 ? 'pm' : 'am';
}

function parseKoreanClock(text: string, context: MeridiemContext = null): string | null {
  const match = text.match(/(?:오전|오후)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/);
  if (!match?.[1]) return null;
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const hasExplicitMeridiem = /오전|오후/.test(match[0]);
  if (/오후/.test(match[0]) && hour < 12) hour += 12;
  if (/오전/.test(match[0]) && hour === 12) hour = 0;
  if (!hasExplicitMeridiem && context === 'pm' && hour < 12) hour += 12;
  if (!hasExplicitMeridiem && context === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function addDaysToIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
}

function parseExplicitDateEdit(text: string, baseDate: string | null | undefined): string | null {
  if (!baseDate) return null;
  const base = new Date(`${baseDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const baseYear = base.getUTCFullYear();
  const baseMonth = base.getUTCMonth() + 1;

  const monthDay = text.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (monthDay?.[2] && monthDay[3]) {
    const year = monthDay[1] ? Number.parseInt(monthDay[1], 10) : baseYear;
    return formatIsoDate(year, Number.parseInt(monthDay[2], 10), Number.parseInt(monthDay[3], 10));
  }

  const numeric = text.match(/(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})(?!\d)/);
  if (numeric?.[2] && numeric[3]) {
    const year = numeric[1] ? Number.parseInt(numeric[1], 10) : baseYear;
    return formatIsoDate(year, Number.parseInt(numeric[2], 10), Number.parseInt(numeric[3], 10));
  }

  const dayOnly = text.match(/(?:^|[^\d])(\d{1,2})\s*일(?:[^\d]|$)/);
  if (dayOnly?.[1] && !/\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text)) {
    return formatIsoDate(baseYear, baseMonth, Number.parseInt(dayOnly[1], 10));
  }

  return null;
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

export function applyInlineSlotEdits(
  base: FilledSlots | null,
  text: string,
): FilledSlots | null {
  if (!base) return null;
  const normalized = text.trim();
  if (!/(바꾸|변경|수정|아니|다시|찾아)/.test(normalized)) {
    return null;
  }

  const next: FilledSlots = { ...base };
  let changed = false;
  let explicitSlotValue = false;
  const meridiemContext = getMeridiemContext(base.start_time);

  const explicitDate = parseExplicitDateEdit(normalized, base.date);
  if (explicitDate) {
    explicitSlotValue = true;
    if (explicitDate !== next.date) {
      next.date = explicitDate;
      changed = true;
    }
  }

  const headcountMatch = normalized.match(/(\d+)\s*명/);
  if (headcountMatch?.[1]) {
    const headcount = Number.parseInt(headcountMatch[1], 10);
    if (Number.isFinite(headcount) && headcount > 0) {
      explicitSlotValue = true;
      if (headcount !== next.headcount) {
        next.headcount = headcount;
        changed = true;
      }
    }
  }

  const rangeMatch = normalized.match(
    /(\d{1,2})\s*시(?!간)(?:\s*\d{1,2}\s*분)?\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)/,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const start = parseKoreanClock(`${rangeMatch[1]}시`, meridiemContext);
    const end = parseKoreanClock(`${rangeMatch[2]}시`, meridiemContext);
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (start && end && startMin != null && endMin != null && endMin > startMin) {
      explicitSlotValue = true;
      if (
        next.start_time !== start ||
        next.end_time !== end ||
        next.duration_min !== endMin - startMin
      ) {
        next.start_time = start;
        next.end_time = end;
        next.duration_min = endMin - startMin;
        changed = true;
      }
    }
  } else {
    const startMatch = normalized.match(
      /(?:시간(?:은|을|는)?\s*)?((?:오전|오후)?\s*\d{1,2}\s*시(?!간)(?:\s*\d{1,2}\s*분)?)(?:\s*부터)?/,
    );
    const start = startMatch?.[1] ? parseKoreanClock(startMatch[1], meridiemContext) : null;
    if (start) {
      explicitSlotValue = true;
      if (start !== next.start_time) {
        next.start_time = start;
        changed = true;
      }
    }
  }

  const durationMatch = normalized.match(/(\d+)\s*시간/);
  if (durationMatch?.[1]) {
    const hours = Number.parseInt(durationMatch[1], 10);
    if (Number.isFinite(hours) && hours > 0) {
      explicitSlotValue = true;
      if (next.duration_min !== hours * 60) {
        next.duration_min = hours * 60;
        changed = true;
      }
    }
  }

  const startMin = timeToMinutes(next.start_time);
  if (startMin != null && next.duration_min != null) {
    const endTime = minutesToTime(startMin + next.duration_min);
    if (endTime !== next.end_time) {
      next.end_time = endTime;
      changed = true;
    }
  }

  return changed || explicitSlotValue ? next : null;
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
  if (!candidate || headcount == null) return false;
  return candidate.capacityMin <= headcount && headcount <= candidate.capacityMax;
}
