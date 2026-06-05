export interface ReservationSlots {
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_min: number | null;
  headcount: number | null;
  campus: string | null;
  building: string | null;
  space: string | null;
}

const SUPPORTED_TIME_MINUTES = new Set([0, 30]);
const MAX_FUTURE_BOOKING_MONTHS = 2;
const EARLIEST_GENERAL_RESERVATION_START_MINUTES = 8 * 60;
const LATEST_GENERAL_RESERVATION_END_MINUTES = 23 * 60;

export function emptyFilledSlots<T extends ReservationSlots = ReservationSlots>(): T {
  return {
    date: null,
    start_time: null,
    end_time: null,
    duration_min: null,
    headcount: null,
    campus: null,
    building: null,
    space: null,
  } as T;
}

export function clearTimeSlots<T extends ReservationSlots>(
  slots: T | null | undefined,
): T {
  return {
    ...emptyFilledSlots<T>(),
    ...(slots ?? {}),
    start_time: null,
    end_time: null,
  } as T;
}

export function isSearchReady(slots: ReservationSlots | null | undefined): boolean {
  if (!slots) return false;
  return Boolean(
    slots.date &&
      slots.start_time &&
      (slots.end_time || slots.duration_min != null) &&
      slots.headcount != null,
  );
}

function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match?.[1] || !match[2]) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`;
}

function koreanMeridiemToCanonical(value: string | undefined): 'am' | 'pm' | null {
  if (!value) return null;
  if (/(오전|아침|새벽)/.test(value)) return 'am';
  if (/(오후|점심|낮|저녁|밤)/.test(value)) return 'pm';
  return null;
}

function toClockMinutes(
  hourValue: string | undefined,
  minuteValue: string | undefined,
  halfValue: string | undefined,
  meridiemValue: string | undefined,
): number | null {
  if (!hourValue) return null;
  let hour = Number.parseInt(hourValue, 10);
  const minute = halfValue ? 30 : minuteValue ? Number.parseInt(minuteValue, 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;

  const meridiem = koreanMeridiemToCanonical(meridiemValue);
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour === 24 && minute !== 0) return null;
  return hour * 60 + minute;
}

interface ContextualMeridiemRange {
  startMinutes: number;
  endMinutes: number;
  startIndex: number;
  endIndex: number;
}

function extractContextualMeridiemRange(text: string): ContextualMeridiemRange | null {
  const rangePattern =
    /(오전|오후|아침|점심|낮|저녁|밤|새벽)\s*(\d{1,2})\s*시(?!간)(?:\s*(?:(반)|([0-5]?\d)\s*분))?\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)(?:\s*(?:(반)|([0-5]?\d)\s*분))?/;
  const match = rangePattern.exec(text);
  if (!match?.[1] || !match[2] || !match[5]) return null;

  const startMinutes = toClockMinutes(match[2], match[4], match[3], match[1]);
  const endMinutes = toClockMinutes(match[5], match[7], match[6], match[1]);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;

  const endText = `${match[5]}시`;
  const endIndex = text.indexOf(endText, (match.index ?? 0) + match[0].indexOf(match[5]));
  const startText = `${match[2]}시`;
  const startIndex = text.indexOf(startText, match.index ?? 0);
  return {
    startMinutes,
    endMinutes,
    startIndex,
    endIndex,
  };
}

function extractBareEveningHalfHourRange(text: string): ContextualMeridiemRange | null {
  const rangePattern =
    /(\d{1,2})\s*시\s*반\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)(?:\s*(?:(반)|([0-5]?\d)\s*분))?/;
  const match = rangePattern.exec(text);
  if (!match?.[1] || !match[2]) return null;

  const startHour = Number.parseInt(match[1], 10);
  const endHour = Number.parseInt(match[2], 10);
  const endMinute = match[3] ? 30 : match[4] ? Number.parseInt(match[4], 10) : 0;
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute) ||
    startHour < 1 ||
    startHour > 11 ||
    endHour < 1 ||
    endHour > 11 ||
    endMinute < 0 ||
    endMinute > 59 ||
    endHour <= startHour
  ) {
    return null;
  }

  const startMinutes = (startHour + 12) * 60 + 30;
  const endMinutes = (endHour + 12) * 60 + endMinute;
  const startText = `${match[1]}시`;
  const endText = `${match[2]}시`;
  const startIndex = text.indexOf(startText, match.index ?? 0);
  const endIndex = text.indexOf(endText, (match.index ?? 0) + match[0].indexOf(match[2]));
  return {
    startMinutes,
    endMinutes,
    startIndex,
    endIndex,
  };
}

export function applyContextualMeridiemRange<T extends ReservationSlots>(
  slots: T,
  text: string,
): T {
  const range = extractContextualMeridiemRange(text) ?? extractBareEveningHalfHourRange(text);
  if (!range) return slots;

  const startTime = minutesToTime(range.startMinutes);
  const endTime = minutesToTime(range.endMinutes);
  if (slots.start_time === startTime && slots.end_time === endTime) return slots;

  return {
    ...slots,
    start_time: startTime,
    end_time: endTime,
    duration_min: range.endMinutes - range.startMinutes,
  };
}

export function deriveEndTime(
  slots: ReservationSlots | null | undefined,
): string | null {
  if (!slots) return null;
  if (slots.end_time) return slots.end_time;
  if (!slots.start_time || slots.duration_min == null) return null;
  const startMinutes = timeToMinutes(slots.start_time);
  if (startMinutes == null) return null;
  return minutesToTime(startMinutes + slots.duration_min);
}

export function normalizeSlotEndTime<T extends ReservationSlots>(slots: T): T {
  if (slots.end_time) return slots;
  const endTime = deriveEndTime(slots);
  return endTime ? { ...slots, end_time: endTime } : slots;
}

export function crossesMidnight(slots: ReservationSlots | null | undefined): boolean {
  if (!slots) return false;
  const startMinutes = timeToMinutes(slots.start_time);
  const endMinutes = timeToMinutes(slots.end_time);
  if (startMinutes != null && endMinutes != null && endMinutes <= startMinutes) {
    return true;
  }
  if (startMinutes != null && slots.duration_min != null) {
    return startMinutes + slots.duration_min >= 24 * 60;
  }
  return false;
}

export function isSupportedReservationMinute(minute: number): boolean {
  return SUPPORTED_TIME_MINUTES.has(minute);
}

export function usesUnsupportedReservationMinute(
  slots: ReservationSlots | null | undefined,
): boolean {
  if (!slots) return false;
  const startMinutes = timeToMinutes(slots.start_time);
  const endMinutes = timeToMinutes(slots.end_time);
  if (startMinutes != null && !isSupportedReservationMinute(startMinutes % 60)) {
    return true;
  }
  if (endMinutes != null && !isSupportedReservationMinute(endMinutes % 60)) {
    return true;
  }
  if (startMinutes != null && slots.duration_min != null) {
    return !isSupportedReservationMinute((startMinutes + slots.duration_min) % 60);
  }
  return false;
}

export function hasAmbiguousBareMeridiemTime(text: string): boolean {
  const contextualRange = extractContextualMeridiemRange(text) ?? extractBareEveningHalfHourRange(text);
  const matches = text.matchAll(/(\d{1,2})\s*시(?!간)(?:\s*([0-5]?\d)\s*분)?/g);
  for (const match of matches) {
    const hour = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12) continue;

    const startIndex = match.index ?? 0;
    if (
      contextualRange &&
      startIndex >= contextualRange.startIndex &&
      startIndex <= contextualRange.endIndex
    ) {
      continue;
    }

    const before = text.slice(Math.max(0, startIndex - 8), startIndex);
    const segment = `${before}${match[0]}`;
    if (/(오전|오후|아침|점심|낮|저녁|밤|새벽|정오|자정)/.test(segment)) {
      continue;
    }

    return true;
  }
  return false;
}

export function isLikelyOutsideGeneralReservationHours(
  slots: ReservationSlots | null | undefined,
): boolean {
  if (!slots) return false;
  const startMinutes = timeToMinutes(slots.start_time);
  const endMinutes = timeToMinutes(deriveEndTime(slots));
  if (startMinutes == null || endMinutes == null) return false;
  return (
    startMinutes < EARLIEST_GENERAL_RESERVATION_START_MINUTES ||
    endMinutes > LATEST_GENERAL_RESERVATION_END_MINUTES
  );
}

function parseIsoDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function isoDateToEpochDay(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const time = Date.UTC(year, month - 1, day);
  if (Number.isNaN(time)) return null;
  return Math.floor(time / 86_400_000);
}

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const date = parseIsoDateOnly(value);
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
}

export function getFutureBookingWindowEndDate(
  now: string,
  monthsAhead = MAX_FUTURE_BOOKING_MONTHS,
): string | null {
  const today = parseIsoDateParts(now);
  if (!today) return null;
  const lastDayOfTargetMonth = new Date(Date.UTC(today.year, today.month + monthsAhead, 0));
  return formatIsoDate(
    lastDayOfTargetMonth.getUTCFullYear(),
    lastDayOfTargetMonth.getUTCMonth() + 1,
    lastDayOfTargetMonth.getUTCDate(),
  );
}

export function isBeyondFutureBookingWindow(
  slots: ReservationSlots | null | undefined,
  now: string,
  monthsAhead = MAX_FUTURE_BOOKING_MONTHS,
): boolean {
  if (!slots?.date) return false;
  const windowEndDate = getFutureBookingWindowEndDate(now, monthsAhead);
  if (!windowEndDate) return false;
  const windowEndDay = isoDateToEpochDay(windowEndDate);
  const slotDay = isoDateToEpochDay(slots.date);
  if (windowEndDay == null || slotDay == null) return false;
  return slotDay > windowEndDay;
}
