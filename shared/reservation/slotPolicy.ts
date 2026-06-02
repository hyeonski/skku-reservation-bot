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
const MAX_FUTURE_BOOKING_DAYS = 180;

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
  const matches = text.matchAll(/(\d{1,2})\s*시(?!간)(?:\s*([0-5]?\d)\s*분)?/g);
  for (const match of matches) {
    const hour = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12) continue;

    const startIndex = match.index ?? 0;
    const before = text.slice(Math.max(0, startIndex - 8), startIndex);
    const segment = `${before}${match[0]}`;
    if (/(오전|오후|아침|점심|낮|저녁|밤|새벽|정오|자정)/.test(segment)) {
      continue;
    }

    return true;
  }
  return false;
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

export function isBeyondFutureBookingWindow(
  slots: ReservationSlots | null | undefined,
  now: string,
  maxFutureBookingDays = MAX_FUTURE_BOOKING_DAYS,
): boolean {
  if (!slots?.date) return false;
  const today = parseIsoDateOnly(now);
  if (!today) return false;
  const todayDay = isoDateToEpochDay(today);
  const slotDay = isoDateToEpochDay(slots.date);
  if (todayDay == null || slotDay == null) return false;
  return slotDay - todayDay > maxFutureBookingDays;
}
