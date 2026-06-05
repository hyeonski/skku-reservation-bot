import assert from 'node:assert/strict';

import {
  getSlotKey,
  getTimeBucket,
  sortSpacesByPersonalizedHistory,
  type CompletedSpaceHistoryEntry,
  type SoftRejectedSpaceEvent,
} from '../src/application/spacePersonalization.js';
import { getGeneralSmallHeadcountCapacityMax } from '../src/application/spaceSizing.js';
import type { SpaceDto } from '../src/schemas/space.js';

function space(
  glsSpaceCode: string,
  capacityMax: number,
  buildingNo: string,
  isUserOrgPreferred = false,
): SpaceDto {
  return {
    glsSpaceCode,
    campusCode: '1',
    buildingNo,
    campusName: 'campus',
    buildingName: `building-${buildingNo}`,
    roomName: `room-${glsSpaceCode}`,
    capacityMin: 1,
    capacityMax,
    useJojikName: null,
    contents: null,
    limitTimeHHMM: null,
    isUserOrgPreferred,
    personalizationReason: null,
  };
}

function history(
  confirmedSpaceCode: string,
  date: string,
  startTime: string,
  buildingNo: string,
  recencyRank: number,
): CompletedSpaceHistoryEntry {
  return {
    confirmedSpaceCode,
    confirmedSpaceLabel: null,
    confirmedBuildingNo: buildingNo,
    confirmedBuildingName: `building-${buildingNo}`,
    lastFilledSlots: {
      date,
      start_time: startTime,
      end_time: '11:00',
      duration_min: 60,
      headcount: 4,
      campus: null,
      building: null,
      space: null,
    },
    completedAt: new Date(Date.UTC(2026, 5, 3, 0, 0, recencyRank)),
    updatedAt: new Date(Date.UTC(2026, 5, 3, 0, 0, recencyRank)),
  };
}

function rejected(
  spaceCode: string,
  date: string | null,
  startTime: string | null,
): SoftRejectedSpaceEvent {
  return {
    spaceCode,
    date,
    startTime,
    createdAt: new Date(Date.UTC(2026, 5, 3, 0, 0, 0)),
  };
}

const baseSpaces = [
  space('A', 10, '101'),
  space('B', 20, '102'),
  space('C', 30, '103'),
];

assert.equal(getTimeBucket('06:00'), 'morning');
assert.equal(getTimeBucket('12:30'), 'lunch');
assert.equal(getTimeBucket('14:00'), 'afternoon');
assert.equal(getTimeBucket('18:00'), 'evening');
assert.equal(getTimeBucket('22:00'), 'night');
assert.equal(getSlotKey('2026-06-01', '09:00'), getSlotKey('2026-06-08', '11:30'));

assert.deepEqual(
  sortSpacesByPersonalizedHistory(baseSpaces, [], [], {
    date: '2026-06-01',
    startTime: '09:00',
  }).map((item) => item.glsSpaceCode),
  ['A', 'B', 'C'],
  'no history keeps the existing capacity order',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [
      history('C', '2026-06-01', '09:00', '103', 0),
      history('C', '2026-06-08', '11:30', '103', 1),
    ],
    [],
    { date: '2026-06-15', startTime: '10:00' },
  ).map((item) => item.glsSpaceCode),
  ['C', 'A', 'B'],
  'same weekday and time bucket moves the repeated space forward',
);

const sameSlotReasonResult = sortSpacesByPersonalizedHistory(
  baseSpaces,
  [
    history('C', '2026-06-01', '09:00', '103', 0),
    history('C', '2026-06-08', '11:30', '103', 1),
    history('C', '2026-06-15', '10:00', '103', 2),
  ],
  [],
  { date: '2026-06-22', startTime: '10:00' },
);
assert.equal(
  sameSlotReasonResult[0]?.personalizationReason,
  '최근 같은 요일·시간대 예약에서 3회 사용',
  'same-slot repeated confirmed space gets a user-facing reason',
);
assert.equal(
  sameSlotReasonResult.find((item) => item.glsSpaceCode === 'A')?.personalizationReason,
  null,
  'candidate without personalization history keeps a null reason',
);

assert.equal(
  sortSpacesByPersonalizedHistory(
    [space('C', 30, '103')],
    [
      history('C', '2026-06-01', '09:00', '103', 0),
      history('C', '2026-06-08', '11:30', '103', 1),
    ],
    [],
    { date: '2026-06-15', startTime: '10:00' },
  )[0]?.personalizationReason,
  '최근 같은 요일·시간대 예약에서 2회 사용',
  'single exact-match candidate still gets a personalization reason',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [
      history('C', '2026-06-02', '09:00', '103', 0),
      history('B', '2026-06-01', '09:00', '102', 1),
    ],
    [],
    { date: '2026-06-08', startTime: '10:00' },
  ).map((item) => item.glsSpaceCode),
  ['B', 'C', 'A'],
  'a different weekday does not receive the same-slot bonus',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [
      history('C', '2026-06-02', '09:00', '103', 0),
      history('C', '2026-06-09', '15:00', '103', 1),
    ],
    [],
    {},
  ).map((item) => item.glsSpaceCode),
  ['C', 'A', 'B'],
  'without request date/startTime, global usage and recency still apply',
);

const globalReasonResult = sortSpacesByPersonalizedHistory(
  baseSpaces,
  [
    history('C', '2026-06-02', '09:00', '103', 0),
    history('C', '2026-06-09', '15:00', '103', 1),
  ],
  [],
  {},
);
assert.equal(
  globalReasonResult[0]?.personalizationReason,
  '최근 완료 예약에서 자주 사용한 공간',
  'global confirmed usage gets a positive user-facing reason',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    [
      space('A', 10, '101'),
      space('B', 20, '103'),
    ],
    [
      history('C', '2026-06-02', '09:00', '103', 0),
    ],
    [],
    {},
  ).map((item) => item.glsSpaceCode),
  ['A', 'B'],
  'without request date/startTime, same-building history does not reorder candidates by itself',
);

const sameBuildingReasonResult = sortSpacesByPersonalizedHistory(
  [
    space('A', 10, '101'),
    space('B', 20, '103'),
  ],
  [
    history('C', '2026-06-02', '09:00', '103', 0),
  ],
  [],
  { date: '2026-06-09', startTime: '10:00' },
);
assert.equal(
  sameBuildingReasonResult.find((item) => item.glsSpaceCode === 'B')?.personalizationReason,
  '같은 건물 사용 이력이 있어 우선 확인',
  'same-building confirmed history gets a positive user-facing reason',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    [
      space('A', 10, '101', true),
      space('B', 20, '102', false),
    ],
    [
      history('B', '2026-06-01', '09:00', '102', 0),
      history('B', '2026-06-08', '09:00', '102', 1),
    ],
    [],
    { date: '2026-06-15', startTime: '09:00' },
  ).map((item) => item.glsSpaceCode),
  ['A', 'B'],
  'user organization priority remains the primary ordering group',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [
      history('C', '2026-06-01', '09:00', '103', 0),
      history('C', '2026-06-08', '11:30', '103', 1),
    ],
    [],
    { date: '2026-06-15', startTime: '10:00' },
  ).map((item) => item.glsSpaceCode),
  ['C', 'A', 'B'],
  'empty soft rejects preserves the P0 result',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [],
    [rejected('A', '2026-06-01', '09:00')],
    { date: '2026-06-08', startTime: '10:00' },
  ).map((item) => item.glsSpaceCode),
  ['B', 'C', 'A'],
  'same-slot soft reject moves the rejected candidate back without excluding it',
);
assert.equal(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [],
    [rejected('A', '2026-06-01', '09:00')],
    { date: '2026-06-08', startTime: '10:00' },
  ).find((item) => item.glsSpaceCode === 'A')?.personalizationReason,
  null,
  'soft reject alone does not create a positive personalization reason',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [history('A', '2026-06-01', '15:00', '101', 0)],
    [rejected('A', '2026-06-01', '09:00')],
    { date: '2026-06-09', startTime: '15:00' },
  ).map((item) => item.glsSpaceCode),
  ['A', 'B', 'C'],
  'other-slot soft reject applies only the weak global penalty',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [history('C', '2026-06-01', '09:00', '103', 0)],
    [rejected('C', '2026-06-01', '09:00')],
    { date: '2026-06-08', startTime: '09:00' },
  ).map((item) => item.glsSpaceCode),
  ['C', 'A', 'B'],
  'one soft reject does not overwhelm a strong completed-reservation preference',
);

assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    [
      space('A', 10, '101', true),
      space('B', 20, '102', false),
    ],
    [],
    [rejected('A', '2026-06-01', '09:00')],
    { date: '2026-06-08', startTime: '09:00' },
  ).map((item) => item.glsSpaceCode),
  ['A', 'B'],
  'user organization priority remains first even with a soft reject',
);

// --- time bucket boundary edges (UC-142 시간대 버킷 정확도의 토대) ---
assert.equal(getTimeBucket('11:00'), 'morning', '11시는 오전 버킷');
assert.equal(getTimeBucket('12:00'), 'lunch', '12시는 점심 버킷');
assert.equal(getTimeBucket('13:30'), 'lunch', '13시대는 점심 버킷');
assert.equal(getTimeBucket('14:00'), 'afternoon', '14시는 오후 버킷');
assert.equal(getTimeBucket('17:59'), 'afternoon', '17시대는 오후 버킷');
assert.equal(getTimeBucket('18:00'), 'evening', '18시는 저녁 버킷');
assert.equal(getTimeBucket('21:00'), 'evening', '21시는 저녁 버킷');
assert.equal(getTimeBucket('22:00'), 'night', '22시는 야간 버킷');
assert.equal(getTimeBucket('05:00'), 'night', '새벽은 야간 버킷');
assert.equal(getTimeBucket('99:99'), 'night', '비정상 시각은 야간 버킷으로 안전 폴백');

assert.equal(getSlotKey(null, '09:00'), null, '날짜가 없으면 슬롯키 없음');
assert.equal(getSlotKey('2026-06-01', null), null, '시작시간이 없으면 슬롯키 없음');
assert.equal(getSlotKey('not-a-date', '09:00'), null, '형식이 틀린 날짜는 슬롯키 없음');

// --- 슬롯 매칭이 없으면 최근성(recency)으로 갈린다 (UC-134/135 정렬 토대) ---
assert.deepEqual(
  sortSpacesByPersonalizedHistory(
    baseSpaces,
    [
      // 둘 다 요청 슬롯과 무관 → 전역 확정(+2) 동률, recency 로 분리
      history('C', '2026-06-15', '09:00', '103', 0), // 더 최근(rank 0)
      history('B', '2026-06-08', '15:00', '102', 1),
    ],
    [],
    { date: '2026-07-01', startTime: '08:00' }, // 수요일·오전: 어느 이력과도 같은 슬롯 아님
  ).map((item) => item.glsSpaceCode),
  ['C', 'B', 'A'],
  'no same-slot match: more recent global usage ranks first via recency bonus',
);

// --- 같은 슬롯 확정(+10)이 같은 건물(+3)보다 강하다 ---
const slotBeatsBuilding = sortSpacesByPersonalizedHistory(
  [
    space('A', 10, '999'), // 이력 건물(103)과 무관
    space('B', 20, '103'), // 같은 건물 이력 보유
    space('C', 30, '103'), // 같은 건물 + 같은 슬롯 확정 이력
  ],
  [
    history('C', '2026-06-01', '09:00', '103', 0),
    history('C', '2026-06-08', '11:30', '103', 1),
  ],
  [],
  { date: '2026-06-15', startTime: '10:00' }, // 월요일·오전 → C 이력과 같은 슬롯
);
assert.equal(
  slotBeatsBuilding[0]?.glsSpaceCode,
  'C',
  'same-slot confirmed (+10) outranks same-building-only (+3)',
);
assert.equal(
  slotBeatsBuilding[0]?.personalizationReason,
  '최근 같은 요일·시간대 예약에서 2회 사용',
  'same-slot reason reflects the repeated count',
);

// --- small-headcount general requests avoid oversized fallback spaces (UC-93) ---
assert.equal(
  getGeneralSmallHeadcountCapacityMax({ headcount: 2, hasExplicitLocation: false }),
  24,
  '2-person general requests cap candidates to small rooms',
);
assert.equal(
  getGeneralSmallHeadcountCapacityMax({ headcount: 3, hasExplicitLocation: false }),
  24,
  '3-person general requests still use the small-room cap',
);
assert.equal(
  getGeneralSmallHeadcountCapacityMax({ headcount: 4, hasExplicitLocation: false }),
  null,
  'larger general requests keep the normal candidate pool',
);
assert.equal(
  getGeneralSmallHeadcountCapacityMax({ headcount: 2, hasExplicitLocation: true }),
  null,
  'explicit building or room requests bypass the small-room cap',
);

console.log('space personalization verification passed');
