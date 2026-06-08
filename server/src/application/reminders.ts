export const REMINDER_PATTERN_THRESHOLD = 3;

/** 같은 패턴을 연속 이 횟수만큼 거절하면 그 패턴을 음소거한다. */
export const MUTE_THRESHOLD = 3;

const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/**
 * 패턴 감지 입력. ReservationRecord 테이블의 평면 행을 그대로 받는다.
 * (이전엔 Conversation의 JSON slots/formData를 파싱했으나, 이제 정제된 행을 직접 사용한다.)
 */
export interface ReservationPatternInput {
  date: string;
  startTime: string;
  endTime: string;
  headcount: number;
  organization: string;
  eventName: string;
  purpose: string;
  hangsaGbCode: string;
  spaceLabel?: string | null;
  spaceCode?: string | null;
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
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  headcount: number;
  hangsaGbCode: string;
  organization: string;
  eventName: string;
  purpose: string;
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

export function weekdayOf(date: string): number | null {
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

/**
 * 패턴 식별 키 = 요일 | 시작 | 종료 | 주관단체(소문자) | 행사명(소문자).
 * Reminder.patternKey 및 PatternMute.patternKey 와 동일 포맷 — 음소거 매칭에 재사용.
 */
export function patternKeyOf(input: {
  weekday: number;
  startTime: string;
  endTime: string;
  organization: string;
  eventName: string;
}): string {
  return [
    input.weekday,
    input.startTime,
    input.endTime,
    input.organization.toLowerCase(),
    input.eventName.toLowerCase(),
  ].join('|');
}

function groupKeyOf(entry: GroupEntry): string {
  return patternKeyOf(entry);
}

function hangsaLabelOf(code: string): string | null {
  const labels: Record<string, string> = {
    '111': '학생회/동아리',
    '113': '세미나/스터디',
    '115': '보충수업/특강/시험',
    '112': '본부부서주관행사',
    '114': '단과대학주관행사',
    '116': '학과주관행사',
    '001': '교외단체행사',
    '117': '기타',
  };
  return labels[code] ?? null;
}

function toEntry(input: ReservationPatternInput): GroupEntry | null {
  if (!input.date || !input.startTime || !input.endTime) return null;

  const weekday = weekdayOf(input.date);
  if (weekday == null) return null;

  const organization = normalizeWhitespace(input.organization);
  const eventName = normalizeWhitespace(input.eventName);
  const purpose = normalizeWhitespace(input.purpose);
  if (!organization || !eventName) return null;

  if (!input.headcount || input.headcount <= 0) return null;

  return {
    date: input.date,
    weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    headcount: input.headcount,
    hangsaGbCode: normalizeWhitespace(input.hangsaGbCode),
    organization,
    eventName,
    purpose,
    spaceLabel: normalizeWhitespace(input.spaceLabel ?? '') || null,
    spaceCode: normalizeWhitespace(input.spaceCode ?? '') || null,
  };
}

function buildSpacePrompt(spaceLabel: string | null, spaceCode: string | null): string {
  if (spaceLabel && spaceCode) return ` 공간코드 ${spaceCode} (${spaceLabel})`;
  if (spaceCode) return ` 공간코드 ${spaceCode}`;
  if (spaceLabel) return ` 희망공간: ${spaceLabel}`;
  return '';
}

export function todayKstIso(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildReminderCandidate(
  inputs: ReservationPatternInput[],
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
  const hangsaLabel = hangsaLabelOf(latest.hangsaGbCode);
  const purpose = latest.purpose || `${latest.eventName} 진행`;
  const prompt =
    `${proposedDate} ${latest.startTime}부터 ${latest.endTime}까지 ${latest.headcount}명 예약해줘` +
    `${buildSpacePrompt(latest.spaceLabel, latest.spaceCode)}. ` +
    `주관단체: ${latest.organization}. ` +
    `행사명: ${latest.eventName}. ` +
    (hangsaLabel ? `행사구분: ${hangsaLabel}. ` : '') +
    `사용목적: ${purpose}.`;

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
