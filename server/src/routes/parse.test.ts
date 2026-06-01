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
