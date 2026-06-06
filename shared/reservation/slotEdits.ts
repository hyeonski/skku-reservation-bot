/**
 * 자연어 슬롯 편집 파서 — 서버(/parse)와 확장(chatHandler)이 공유한다.
 *
 * 이전에는 server/src/routes/parse.ts 와 extension/src/background/chatSlotCorrections.ts
 * 에 거의 동일한 복제본이 있었고 미묘하게 갈라져 있었다(가드 정규식 범위, parseKoreanClock
 * 앵커링). 강한 검증 기준으로 더 넓게 잡는 서버 동작을 정본으로 단일화했다.
 */

import { minutesToTime, type ReservationSlots, timeToMinutes } from './slotPolicy';

export type MeridiemContext = 'am' | 'pm' | null;

export function getMeridiemContext(time: string | null | undefined): MeridiemContext {
  const minutes = timeToMinutes(time ?? null);
  if (minutes == null) return null;
  return minutes >= 12 * 60 ? 'pm' : 'am';
}

export function parseKoreanClock(text: string, context: MeridiemContext = null): string | null {
  const normalized = text.replace(/\s+/g, '');
  const match = normalized.match(/^(오전|오후)?(\d{1,2})시(?:([0-5]?\d)분)?$/);
  if (!match?.[2]) return null;
  let hour = Number.parseInt(match[2], 10);
  const minute = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 24) {
    return null;
  }
  const meridiem = match[1];
  if (meridiem === '오후' && hour < 12) hour += 12;
  if (meridiem === '오전' && hour === 12) hour = 0;
  if (!meridiem && context === 'pm' && hour < 12) hour += 12;
  if (!meridiem && context === 'am' && hour === 12) hour = 0;
  if (hour === 24 && minute !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

export function parseExplicitDateEdit(
  text: string,
  baseDate: string | null | undefined,
  referenceNow?: string | null,
): string | null {
  const base = baseDate ? new Date(`${baseDate}T00:00:00Z`) : null;
  const reference = referenceNow ? new Date(referenceNow) : new Date();
  const anchor =
    base && !Number.isNaN(base.getTime())
      ? base
      : !Number.isNaN(reference.getTime())
        ? reference
        : new Date();
  const baseYear = anchor.getUTCFullYear();
  const baseMonth = anchor.getUTCMonth() + 1;

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

/**
 * 직전 슬롯(base)에 대한 인라인 수정 의도를 텍스트에서 읽어 갱신된 슬롯을 반환한다.
 * 수정 신호가 없거나 변화가 없으면 null.
 */
export function applyInlineSlotEdits<T extends ReservationSlots>(
  base: T | null,
  text: string,
  referenceNow?: string | null,
): T | null {
  if (!base || !/(바꾸|바꿔|변경|수정|아니|다시|찾아|시간(?:은|을|는)?|\d+\s*명\s*으로)/.test(text)) {
    return null;
  }

  const next = { ...base } as T;
  const slot: ReservationSlots = next;
  let changed = false;
  let explicitSlotValue = false;
  const meridiemContext = getMeridiemContext(slot.start_time);

  const explicitDate = parseExplicitDateEdit(text, slot.date, referenceNow);
  if (explicitDate) {
    explicitSlotValue = true;
    if (explicitDate !== slot.date) {
      slot.date = explicitDate;
      changed = true;
    }
  }

  const headcountMatch = text.match(/(\d+)\s*명/);
  if (headcountMatch?.[1]) {
    const headcount = Number.parseInt(headcountMatch[1], 10);
    if (Number.isFinite(headcount) && headcount > 0) {
      explicitSlotValue = true;
      if (headcount !== slot.headcount) {
        slot.headcount = headcount;
        changed = true;
      }
    }
  }

  const rangeMatch = text.match(
    /(\d{1,2})\s*시(?!간)(?:\s*\d{1,2}\s*분)?\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)/,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const start = parseKoreanClock(`${rangeMatch[1]}시`, meridiemContext);
    const end = parseKoreanClock(`${rangeMatch[2]}시`, meridiemContext);
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (start && end && startMin != null && endMin != null && endMin > startMin) {
      explicitSlotValue = true;
      slot.start_time = start;
      slot.end_time = end;
      slot.duration_min = endMin - startMin;
      changed = true;
    }
  } else {
    const startMatch = text.match(
      /(?:시간(?:은|을|는)?\s*)?((?:오전|오후)?\s*\d{1,2}\s*시(?!간)(?:\s*\d{1,2}\s*분)?)(?:\s*부터)?/,
    );
    const start = startMatch?.[1] ? parseKoreanClock(startMatch[1], meridiemContext) : null;
    if (start) {
      explicitSlotValue = true;
      if (start !== slot.start_time) {
        slot.start_time = start;
        changed = true;
      }
    }
  }

  const durationMatch = text.match(/(\d+)\s*시간/);
  if (durationMatch?.[1]) {
    const hours = Number.parseInt(durationMatch[1], 10);
    if (Number.isFinite(hours) && hours > 0) {
      explicitSlotValue = true;
      if (slot.duration_min !== hours * 60) {
        slot.duration_min = hours * 60;
        changed = true;
      }
    }
  }

  const startMin = timeToMinutes(slot.start_time);
  if (startMin != null && slot.duration_min != null) {
    const endTime = minutesToTime(startMin + slot.duration_min);
    if (endTime !== slot.end_time) {
      slot.end_time = endTime;
      changed = true;
    }
  }

  return changed || explicitSlotValue ? next : null;
}
