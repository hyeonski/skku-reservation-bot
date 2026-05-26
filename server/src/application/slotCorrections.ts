import type { FilledSlots, Intent } from '../schemas/parse.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface SlotCorrectionResult {
  filledSlots: FilledSlots;
  intent: Intent;
  readyToSearch: boolean;
  missingRequired: string[];
  assistantMessage: string | null;
  changed: boolean;
}

function parseIsoDate(date: string): { y: number; m: number; d: number } | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    y: Number.parseInt(match[1]!, 10),
    m: Number.parseInt(match[2]!, 10),
    d: Number.parseInt(match[3]!, 10),
  };
}

function addDaysIso(date: string, days: number): string | null {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  const ms = Date.UTC(parsed.y, parsed.m - 1, parsed.d) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatSummary(slots: FilledSlots): string | null {
  if (!slots.date || !slots.start_time || !slots.headcount) return null;
  const parsed = parseIsoDate(slots.date);
  const weekday =
    parsed ? WEEKDAYS[new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).getUTCDay()] : null;
  const monthDay = parsed
    ? `${parsed.m}/${parsed.d}${weekday ? `(${weekday})` : ''}`
    : slots.date;
  const timePart = slots.end_time
    ? `${slots.start_time}부터 ${slots.end_time}까지`
    : slots.duration_min
      ? `${slots.start_time}부터 ${Math.round(slots.duration_min / 60)}시간`
      : `${slots.start_time}부터`;
  const filters = [slots.building, slots.space].filter(Boolean).join(', ');
  return `${monthDay} ${timePart}, ${slots.headcount}명${filters ? `, ${filters}` : ''}으로 가능한 공간을 다시 찾아볼게요.`;
}

function computeMissing(slots: FilledSlots): string[] {
  const missing: string[] = [];
  if (!slots.headcount) missing.push('headcount');
  if (!slots.date) missing.push('date');
  if (!slots.start_time) missing.push('start_time');
  if (!slots.end_time && !slots.duration_min) missing.push('end_time');
  return missing;
}

function normalizeHour(hour: string): string {
  return `${String(Number.parseInt(hour, 10)).padStart(2, '0')}:00`;
}

/**
 * Retry chips and terse corrections are part of the product UI, so handle them
 * deterministically instead of relying entirely on the LLM to preserve context.
 */
export function applyDeterministicSlotCorrections(
  latestUserMessage: string,
  slots: FilledSlots,
  intent: Intent,
): SlotCorrectionResult {
  const text = latestUserMessage.replace(/\s+/g, ' ').trim();
  const next: FilledSlots = { ...slots };
  let changed = false;

  const headcountMatch = text.match(/(\d{1,5})\s*명\s*으로?(?:\s*(?:줄|늘|바꾸|변경|다시|조정))?/);
  if (headcountMatch) {
    const headcount = Number.parseInt(headcountMatch[1]!, 10);
    if (Number.isFinite(headcount) && headcount > 0 && headcount !== next.headcount) {
      next.headcount = headcount;
      changed = true;
    }
  }

  const rangeMatch = text.match(/(\d{1,2})\s*(?:시)?\s*[~\-–]\s*(\d{1,2})\s*시?/);
  if (rangeMatch) {
    const startHour = Number.parseInt(rangeMatch[1]!, 10);
    const endHour = Number.parseInt(rangeMatch[2]!, 10);
    if (
      Number.isFinite(startHour) &&
      Number.isFinite(endHour) &&
      startHour >= 0 &&
      startHour <= 23 &&
      endHour >= 0 &&
      endHour <= 24
    ) {
      next.start_time = normalizeHour(rangeMatch[1]!);
      next.end_time = normalizeHour(rangeMatch[2]!);
      next.duration_min = null;
      changed = true;
    }
  }

  if (/다음\s*주\s*같은\s*요일/.test(text) && next.date) {
    const nextDate = addDaysIso(next.date, 7);
    if (nextDate && nextDate !== next.date) {
      next.date = nextDate;
      changed = true;
    }
  }

  const missingRequired = computeMissing(next);
  const readyToSearch = missingRequired.length === 0;
  return {
    filledSlots: next,
    intent: changed && intent !== 'cancel' ? 'modify_slot' : intent,
    readyToSearch,
    missingRequired,
    assistantMessage: changed && readyToSearch ? formatSummary(next) : null,
    changed,
  };
}
