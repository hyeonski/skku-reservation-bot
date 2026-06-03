import type { FilledSlots, ReservationFormData } from '../schemas/parse.js';

export const REMINDER_PATTERN_THRESHOLD = 3;

const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export interface ReminderPatternInput {
  id: string;
  slots: FilledSlots | null;
  formData: ReservationFormData | null;
  confirmedSpaceLabel?: string | null;
  confirmedSpaceCode?: string | null;
}

export interface ReminderCandidate {
  patternKey: string;
  title: string;
  pattern: string;
  proposedDate: string;
  startTime: string;
  endTime: string;
  headcount: number;
  organization: string;
  eventName: string;
  spaceLabel: string | null;
  spaceCode: string | null;
  prompt: string;
}

interface GroupEntry {
  source: ReminderPatternInput;
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  headcount: number;
  organization: string;
  eventName: string;
  spaceLabel: string | null;
  spaceCode: string | null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parseIsoDate(date: string): { y: number; m: number; d: number } | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number.parseInt(match[1]!, 10);
  const m = Number.parseInt(match[2]!, 10);
  const d = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

function toUtcMs(date: string): number {
  const parsed = parseIsoDate(date);
  if (!parsed) return Number.NaN;
  return Date.UTC(parsed.y, parsed.m - 1, parsed.d);
}

function weekdayOf(date: string): number | null {
  const ms = toUtcMs(date);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).getUTCDay();
}

function addDaysIso(date: string, days: number): string {
  const ms = toUtcMs(date);
  if (!Number.isFinite(ms)) return date;
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nextWeeklyDateAfter(lastDate: string, todayIso: string): string {
  let proposed = addDaysIso(lastDate, 7);
  while (proposed <= todayIso) {
    proposed = addDaysIso(proposed, 7);
  }
  return proposed;
}

function groupKeyOf(entry: GroupEntry): string {
  return [
    entry.weekday,
    entry.startTime,
    entry.endTime,
    entry.organization.toLowerCase(),
    entry.eventName.toLowerCase(),
  ].join('|');
}

function toEntry(source: ReminderPatternInput): GroupEntry | null {
  const slots = source.slots;
  const formData = source.formData;
  if (!slots || !formData) return null;
  if (!slots.date || !slots.start_time || !slots.end_time) return null;

  const weekday = weekdayOf(slots.date);
  if (weekday == null) return null;

  const organization = normalizeWhitespace(formData.organization);
  const eventName = normalizeWhitespace(formData.eventName);
  if (!organization || !eventName) return null;

  const headcount = slots.headcount ?? formData.headcount;
  if (!headcount || headcount <= 0) return null;

  return {
    source,
    date: slots.date,
    weekday,
    startTime: slots.start_time,
    endTime: slots.end_time,
    headcount,
    organization,
    eventName,
    spaceLabel: normalizeWhitespace(source.confirmedSpaceLabel ?? '') || null,
    spaceCode: normalizeWhitespace(source.confirmedSpaceCode ?? '') || null,
  };
}

function buildSpacePrompt(spaceLabel: string | null, spaceCode: string | null): string {
  if (spaceLabel && spaceCode) return ` 지난번처럼 ${spaceLabel} ${spaceCode}호`;
  if (spaceCode) return ` 공간코드 ${spaceCode}`;
  if (spaceLabel) return ` 지난번처럼 ${spaceLabel}`;
  return '';
}

export function todayKstIso(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildReminderCandidate(
  inputs: ReminderPatternInput[],
  todayIso = todayKstIso(),
): ReminderCandidate | null {
  const groups = new Map<string, GroupEntry[]>();

  for (const input of inputs) {
    const entry = toEntry(input);
    if (!entry) continue;
    const key = groupKeyOf(entry);
    const existing = groups.get(key);
    if (existing) existing.push(entry);
    else groups.set(key, [entry]);
  }

  let best: { key: string; entries: GroupEntry[] } | null = null;
  for (const [key, entries] of groups) {
    if (entries.length < REMINDER_PATTERN_THRESHOLD) continue;
    entries.sort((a, b) => toUtcMs(b.date) - toUtcMs(a.date));
    if (!best || toUtcMs(entries[0]!.date) > toUtcMs(best.entries[0]!.date)) {
      best = { key, entries };
    }
  }
  if (!best) return null;

  const latest = best.entries[0]!;
  const proposedDate = nextWeeklyDateAfter(latest.date, todayIso);
  const weekdayLabel = WEEKDAYS_KO[latest.weekday] ?? '같은 요일';
  const spaceLabel = latest.spaceLabel ?? '이전 추천 공간';
  const prompt =
    `${proposedDate} ${latest.startTime}부터 ${latest.endTime}까지 ` +
    `${latest.headcount}명 ${latest.organization} ${latest.eventName} 예약해줘` +
    buildSpacePrompt(latest.spaceLabel, latest.spaceCode);

  return {
    patternKey: best.key,
    title: `다음 ${weekdayLabel}도 ${latest.organization} ${latest.eventName} 예약하시겠어요?`,
    pattern: `최근 ${best.entries.length}회 반복 · 매주 ${weekdayLabel} ${latest.startTime}–${latest.endTime} ${latest.organization} ${latest.eventName}`,
    proposedDate,
    startTime: latest.startTime,
    endTime: latest.endTime,
    headcount: latest.headcount,
    organization: latest.organization,
    eventName: latest.eventName,
    spaceLabel,
    spaceCode: latest.spaceCode,
    prompt,
  };
}
