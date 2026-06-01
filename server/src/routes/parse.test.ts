import assert from 'node:assert/strict';
import test from 'node:test';
import type { FilledSlots } from '../schemas/parse.js';

process.env.LLM_API_KEY ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://localhost/test';

const { __parseRouteTestables } = await import('./parse.js');

const baseSlots: FilledSlots = {
  date: null,
  start_time: null,
  end_time: null,
  duration_min: null,
  headcount: 30,
  campus: null,
  building: null,
  space: null,
};

test('inline slot edits do not treat ordinary date/time follow-up as modification', () => {
  const result = __parseRouteTestables.applyInlineSlotEdits(
    baseSlots,
    '8월 25일 18시부터 2시간',
  );

  assert.equal(result, null);
});

test('inline slot edits still apply explicit time correction', () => {
  const result = __parseRouteTestables.applyInlineSlotEdits(
    {
      ...baseSlots,
      date: '2026-08-25',
      start_time: '18:00',
      end_time: '20:00',
      duration_min: 120,
    },
    '시간은 20시부터 1시간으로 바꿔줘',
  );

  assert.equal(result?.start_time, '20:00');
  assert.equal(result?.end_time, '21:00');
  assert.equal(result?.duration_min, 60);
  assert.equal(result?.headcount, 30);
});

test('obvious small talk is handled as out of scope before LLM parsing', () => {
  assert.equal(
    __parseRouteTestables.isLikelyOutOfScopeSmallTalk('오늘 점심 뭐 먹지?'),
    true,
  );
});

test('reservation-like requests are not treated as small talk', () => {
  assert.equal(
    __parseRouteTestables.isLikelyOutOfScopeSmallTalk(
      '9월 21일 18시부터 1시간 20명 E2E 테스트 회의실',
    ),
    false,
  );
});

test('impossible headcount is rejected before LLM parsing', () => {
  const result = __parseRouteTestables.makeImpossibleInputResult(
    '9월 21일 18시 0명 E2E 테스트 회의',
  );

  assert.equal(result?.ready_to_search, false);
  assert.equal(result?.missing_required.includes('headcount'), true);
  assert.match(result?.assistant_message ?? '', /1명 이상/);
});

test('impossible clock is rejected before LLM parsing', () => {
  const result = __parseRouteTestables.makeImpossibleInputResult(
    '9월 21일 25시 10명 E2E 테스트 회의',
  );

  assert.equal(result?.ready_to_search, false);
  assert.equal(result?.missing_required.includes('start_time'), true);
  assert.match(result?.assistant_message ?? '', /0시부터 23시/);
});

test('unsupported minute unit is rejected before LLM parsing', () => {
  const result = __parseRouteTestables.makeImpossibleInputResult(
    '6월 22일 18시 10분부터 19시 40분까지 10명 E2E 분 단위 테스트 회의',
  );

  assert.equal(result?.ready_to_search, false);
  assert.equal(result?.missing_required.includes('start_time'), true);
  assert.equal(result?.missing_required.includes('end_time'), true);
  assert.match(result?.assistant_message ?? '', /30분 단위/);
});

test('supported half-hour unit is not rejected before LLM parsing', () => {
  assert.equal(
    __parseRouteTestables.makeImpossibleInputResult(
      '6월 22일 18시 30분부터 20시까지 10명 E2E 반 단위 테스트 회의',
    ),
    null,
  );
});

test('bare 12-hour clock is rejected before LLM parsing', () => {
  const result = __parseRouteTestables.makeImpossibleInputResult(
    '6월 22일 6시부터 2시간 10명 E2E 오전 오후 확인 테스트 회의',
  );

  assert.equal(result?.ready_to_search, false);
  assert.equal(result?.missing_required.includes('start_time'), true);
  assert.match(result?.assistant_message ?? '', /오전\/오후/);
});

test('explicit meridiem and contextual early clock are not rejected before LLM parsing', () => {
  assert.equal(
    __parseRouteTestables.makeImpossibleInputResult(
      '6월 22일 오후 6시부터 2시간 10명 E2E 오후 테스트 회의',
    ),
    null,
  );
  assert.equal(
    __parseRouteTestables.makeImpossibleInputResult(
      '6월 22일 새벽 3시부터 5시까지 10명 E2E 새벽 시간 테스트 회의',
    ),
    null,
  );
});

test('student council organization wording is not narrowed to student center building', () => {
  const result = __parseRouteTestables.applyStudentCouncilBuildingDisambiguation(
    {
      filled_slots: {
        date: '2026-06-22',
        start_time: '18:00',
        end_time: '20:00',
        duration_min: 120,
        headcount: 12,
        campus: null,
        building: '학생회관',
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '공간을 찾아볼게요.',
    },
    '6월 22일 18시부터 2시간 12명 학생회 E2E 회귀 테스트 회의',
  );

  assert.equal(result.filled_slots.building, null);
});

test('explicit student center building wording is preserved', () => {
  const result = __parseRouteTestables.applyStudentCouncilBuildingDisambiguation(
    {
      filled_slots: {
        date: '2026-06-22',
        start_time: '18:00',
        end_time: '20:00',
        duration_min: 120,
        headcount: 12,
        campus: null,
        building: '학생회관',
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '공간을 찾아볼게요.',
    },
    '6월 22일 18시부터 2시간 12명 학생회관 연습실 E2E 테스트',
  );

  assert.equal(result.filled_slots.building, '학생회관');
});

test('past parsed slots are not allowed to continue reservation flow', () => {
  const result = __parseRouteTestables.applyImpossibleSlotOverride(
    {
      filled_slots: {
        date: '2026-05-31',
        start_time: '14:00',
        end_time: null,
        duration_min: null,
        headcount: 10,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['end_time'],
      intent: 'new_reservation',
      ready_to_search: false,
      assistant_message: '몇 시간 동안 사용하실 예정인가요?',
    },
    '2026-06-01T08:17:00+09:00',
  );

  assert.equal(result.ready_to_search, false);
  assert.deepEqual(result.filled_slots, {
    date: null,
    start_time: null,
    end_time: null,
    duration_min: null,
    headcount: null,
    campus: null,
    building: null,
    space: null,
  });
  assert.equal(result.missing_required.includes('date'), true);
  assert.match(result.assistant_message, /지난 날짜/);
});

test('future parsed slots are left unchanged', () => {
  const input = {
    filled_slots: {
      date: '2026-06-02',
      start_time: '14:00',
      end_time: null,
      duration_min: null,
      headcount: 10,
      campus: null,
      building: null,
      space: null,
    },
    missing_required: ['end_time'],
    intent: 'new_reservation' as const,
    ready_to_search: false,
    assistant_message: '몇 시간 동안 사용하실 예정인가요?',
  };

  const result = __parseRouteTestables.applyImpossibleSlotOverride(
    input,
    '2026-06-01T08:17:00+09:00',
  );

  assert.equal(result, input);
});

test('far future parsed slots are rejected before search', () => {
  const result = __parseRouteTestables.applyFutureBookingWindowOverride(
    {
      filled_slots: {
        date: '2027-12-31',
        start_time: '18:00',
        end_time: '20:00',
        duration_min: 120,
        headcount: 10,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '공간을 찾아볼게요.',
    },
    '2026-06-01T08:17:00+09:00',
  );

  assert.equal(result.ready_to_search, false);
  assert.equal(result.missing_required.includes('date'), true);
  assert.match(result.assistant_message, /너무 먼 날짜/);
});

test('parsed unsupported minute unit is rejected before search', () => {
  const result = __parseRouteTestables.applyTimeGranularityOverride({
    filled_slots: {
      date: '2026-06-22',
      start_time: '18:10',
      end_time: '19:40',
      duration_min: 90,
      headcount: 10,
      campus: null,
      building: null,
      space: null,
    },
    missing_required: [],
    intent: 'new_reservation',
    ready_to_search: true,
    assistant_message: '공간을 찾아볼게요.',
  });

  assert.equal(result.ready_to_search, false);
  assert.equal(result.missing_required.includes('start_time'), true);
  assert.match(result.assistant_message, /30분 단위/);
});

test('cross-midnight parsed range is rejected before search', () => {
  const result = __parseRouteTestables.applySameDayTimeOverride({
    filled_slots: {
      date: '2026-06-02',
      start_time: '22:00',
      end_time: '01:00',
      duration_min: null,
      headcount: 10,
      campus: null,
      building: null,
      space: null,
    },
    missing_required: [],
    intent: 'new_reservation',
    ready_to_search: true,
    assistant_message: '공간을 찾아볼게요.',
  });

  assert.equal(result.ready_to_search, false);
  assert.equal(result.missing_required.includes('start_time'), true);
  assert.equal(result.missing_required.includes('end_time'), true);
  assert.match(result.assistant_message, /자정을 넘기는 예약/);
});

test('duration that reaches the next day is rejected before search', () => {
  const result = __parseRouteTestables.applySameDayTimeOverride({
    filled_slots: {
      date: '2026-06-02',
      start_time: '23:00',
      end_time: null,
      duration_min: 60,
      headcount: 10,
      campus: null,
      building: null,
      space: null,
    },
    missing_required: [],
    intent: 'new_reservation',
    ready_to_search: true,
    assistant_message: '공간을 찾아볼게요.',
  });

  assert.equal(result.ready_to_search, false);
  assert.match(result.assistant_message, /자정을 넘기는 예약/);
});
