import type { SpaceDto } from '../schemas/space.js';

export const RECENT_COMPLETED_CONVERSATION_LIMIT = 40;
export const RECENT_SPACE_FEEDBACK_EVENT_LIMIT = 100;
export const RECENT_SPACE_FEEDBACK_EVENT_DAYS = 90;

export const SPACE_PERSONALIZATION_WEIGHTS = {
  sameSlotConfirmed: 10,
  sameBuildingConfirmed: 3,
  globalConfirmed: 2,
  recency: 1,
  sameSlotRejected: 4,
  globalRejected: 1,
} as const;

export type TimeBucket = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';

// 완료 예약 이력 1건. ReservationRecord 행에서 직접 매핑한다.
// (이전엔 Conversation의 lastFilledSlots JSON을 파싱했으나, 이제 정제된 값을 직접 받는다.)
export interface CompletedSpaceHistoryEntry {
  confirmedSpaceCode: string;
  confirmedBuildingNo: string | null;
  confirmedBuildingName: string | null;
  date: string | null;
  startTime: string | null;
}

export interface SoftRejectedSpaceEvent {
  spaceCode: string;
  date: string | null;
  startTime: string | null;
  createdAt: Date;
}

interface ParsedHistoryEntry {
  confirmedSpaceCode: string;
  confirmedBuildingNo: string | null;
  confirmedBuildingName: string | null;
  slotKey: string | null;
  recencyRank: number;
}

interface ParsedSoftRejectEntry {
  spaceCode: string;
  slotKey: string | null;
}

interface ScoredSpace<T extends SpaceDto> {
  space: T;
  score: number;
  baseIndex: number;
  personalizationReason: string | null;
}

export type PersonalizedSpace<T extends SpaceDto> = T & {
  personalizationReason: string | null;
};

interface SpacePersonalizationSignals {
  sameSlotConfirmedCount: number;
  sameBuildingConfirmedCount: number;
  globalConfirmedCount: number;
  recencyBonus: number;
  sameSlotRejectedCount: number;
  globalRejectedCount: number;
}

export function getTimeBucket(startTime: string): TimeBucket {
  const hour = Number(startTime.slice(0, 2));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'night';
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 13) return 'lunch';
  if (hour >= 14 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 21) return 'evening';
  return 'night';
}

export function getWeekdayKey(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return String(parsed.getUTCDay());
}

export function getSlotKey(date: string | null | undefined, startTime: string | null | undefined): string | null {
  if (!date || !startTime) return null;
  const weekday = getWeekdayKey(date);
  if (weekday == null) return null;
  return `${weekday}:${getTimeBucket(startTime)}`;
}

function normalizeBuildingName(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function isSameBuilding<T extends SpaceDto>(space: T, history: ParsedHistoryEntry): boolean {
  if (history.confirmedBuildingNo && history.confirmedBuildingNo === space.buildingNo) {
    return true;
  }
  const historyBuildingName = normalizeBuildingName(history.confirmedBuildingName);
  const candidateBuildingName = normalizeBuildingName(space.buildingName);
  return historyBuildingName != null && historyBuildingName === candidateBuildingName;
}

function getRecencyBonus(recencyRank: number): number {
  if (recencyRank < 0 || recencyRank >= RECENT_COMPLETED_CONVERSATION_LIMIT) return 0;
  return (
    SPACE_PERSONALIZATION_WEIGHTS.recency *
    (RECENT_COMPLETED_CONVERSATION_LIMIT - recencyRank) /
    RECENT_COMPLETED_CONVERSATION_LIMIT
  );
}

function getSpacePersonalizationSignals<T extends SpaceDto>(
  space: T,
  history: ParsedHistoryEntry[],
  softRejects: ParsedSoftRejectEntry[],
  requestSlotKey: string | null,
): SpacePersonalizationSignals {
  const signals: SpacePersonalizationSignals = {
    sameSlotConfirmedCount: 0,
    sameBuildingConfirmedCount: 0,
    globalConfirmedCount: 0,
    recencyBonus: 0,
    sameSlotRejectedCount: 0,
    globalRejectedCount: 0,
  };

  for (const entry of history) {
    if (entry.confirmedSpaceCode === space.glsSpaceCode) {
      signals.globalConfirmedCount += 1;
      signals.recencyBonus = Math.max(signals.recencyBonus, getRecencyBonus(entry.recencyRank));
      if (requestSlotKey != null && entry.slotKey === requestSlotKey) {
        signals.sameSlotConfirmedCount += 1;
      }
    }
    if (requestSlotKey != null && isSameBuilding(space, entry)) {
      signals.sameBuildingConfirmedCount += 1;
    }
  }

  for (const entry of softRejects) {
    if (entry.spaceCode !== space.glsSpaceCode) continue;
    signals.globalRejectedCount += 1;
    if (requestSlotKey != null && entry.slotKey === requestSlotKey) {
      signals.sameSlotRejectedCount += 1;
    }
  }

  return signals;
}

function scoreSpace(signals: SpacePersonalizationSignals): number {
  return (
    signals.sameSlotConfirmedCount * SPACE_PERSONALIZATION_WEIGHTS.sameSlotConfirmed +
    signals.sameBuildingConfirmedCount * SPACE_PERSONALIZATION_WEIGHTS.sameBuildingConfirmed +
    signals.globalConfirmedCount * SPACE_PERSONALIZATION_WEIGHTS.globalConfirmed +
    signals.recencyBonus -
    signals.sameSlotRejectedCount * SPACE_PERSONALIZATION_WEIGHTS.sameSlotRejected -
    signals.globalRejectedCount * SPACE_PERSONALIZATION_WEIGHTS.globalRejected
  );
}

function getPersonalizationReason(signals: SpacePersonalizationSignals): string | null {
  if (signals.sameSlotConfirmedCount > 0) {
    return `최근 같은 요일·시간대 예약에서 ${signals.sameSlotConfirmedCount}회 사용`;
  }
  if (signals.globalConfirmedCount > 0) {
    return signals.globalConfirmedCount >= 2
      ? '최근 완료 예약에서 자주 사용한 공간'
      : '최근 완료 예약에서 사용한 공간';
  }
  if (signals.sameBuildingConfirmedCount > 0) {
    return '같은 건물 사용 이력이 있어 우선 확인';
  }
  return null;
}

export function sortSpacesByPersonalizedHistory<T extends SpaceDto>(
  spaces: T[],
  historyEntries: CompletedSpaceHistoryEntry[],
  softRejectEntries: SoftRejectedSpaceEvent[] = [],
  request: { date?: string | null; startTime?: string | null } = {},
): PersonalizedSpace<T>[] {
  if (spaces.length === 0 || (historyEntries.length === 0 && softRejectEntries.length === 0)) {
    return spaces.map((space) => ({ ...space, personalizationReason: null }));
  }

  const requestSlotKey = getSlotKey(request.date, request.startTime);
  const history = historyEntries
    .filter((entry) => entry.confirmedSpaceCode.trim().length > 0)
    .map((entry, index): ParsedHistoryEntry => ({
      confirmedSpaceCode: entry.confirmedSpaceCode,
      confirmedBuildingNo: entry.confirmedBuildingNo,
      confirmedBuildingName: entry.confirmedBuildingName,
      slotKey: getSlotKey(entry.date, entry.startTime),
      recencyRank: index,
    }));
  const softRejects = softRejectEntries
    .filter((entry) => entry.spaceCode.trim().length > 0)
    .map((entry): ParsedSoftRejectEntry => ({
      spaceCode: entry.spaceCode,
      slotKey: getSlotKey(entry.date, entry.startTime),
    }));

  if (history.length === 0 && softRejects.length === 0) {
    return spaces.map((space) => ({ ...space, personalizationReason: null }));
  }

  const scored = spaces.map((space, index): ScoredSpace<T> => {
    const signals = getSpacePersonalizationSignals(space, history, softRejects, requestSlotKey);
    return {
      space,
      baseIndex: index,
      score: scoreSpace(signals),
      personalizationReason: getPersonalizationReason(signals),
    };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.baseIndex - b.baseIndex;
  });

  return scored.map((entry) => ({
    ...entry.space,
    personalizationReason: entry.personalizationReason,
  }));
}
