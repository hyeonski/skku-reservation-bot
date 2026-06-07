import assert from 'node:assert/strict';

import { buildApplicationState, computeMemoryStats } from '../src/application/state.js';
import type { FilledSlots } from '../src/schemas/parse.js';
import type { LLMApplication } from '../src/llm/client.js';

const emptySlots: FilledSlots = {
  date: null,
  start_time: null,
  end_time: null,
  duration_min: null,
  headcount: null,
  campus: null,
  building: null,
  space: null,
};

const ALL_LOW: LLMApplication['confidence'] = {
  organization: 'low',
  eventName: 'low',
  purpose: 'low',
  hangsaGbCode: 'low',
};

const form = {
  hangsaGbCode: '113',
  organization: '소프트웨어학과 학생회',
  eventName: '운영진 정기회의',
  headcount: 20,
  purpose: '운영진 정기회의 진행',
};

// --- 재사용 제안: LLM 이 고른 메모리 id 를 서버 통계로 조립 (반복 ≥3 → frequency) ---
const frequentStats = computeMemoryStats([
  { conversationId: '11111111-1111-4111-8111-111111111111', label: '소프트웨어학과 운영진 정기회의', formData: form },
  { conversationId: '22222222-2222-4222-8222-222222222222', label: '소프트웨어학과 운영진 정기회의', formData: form },
  { conversationId: '33333333-3333-4333-8333-333333333333', label: '소프트웨어학과 운영진 정기회의', formData: form },
]);

const reuse = buildApplicationState({
  llmApplication: { draft: null, confidence: ALL_LOW, suggest_reuse_memory_id: '11111111-1111-4111-8111-111111111111' },
  filledSlots: emptySlots,
  readyToSearch: false,
  memoryStats: frequentStats,
});

assert.equal(reuse.applicationState.draft, null, 'reuse 제안 단계에선 draft 를 채우지 않는다');
assert.equal(
  reuse.applicationState.suggested_memory?.conversationId,
  '11111111-1111-4111-8111-111111111111',
);
assert.equal(reuse.applicationState.suggested_memory?.reason, 'frequency', '반복 3회는 frequency');
assert.equal(reuse.applicationState.suggested_memory?.count, 3);
assert.equal(reuse.applicationState.recommendation?.event, '운영진 정기회의');
assert.equal(reuse.assistantMessageOverride, null, 'LLM 메시지를 덮어쓰지 않는다(길이 위반 외)');

// --- LLM 이 모르는 id 를 골라도 안전하게 무시 ---
const reuseMiss = buildApplicationState({
  llmApplication: { draft: null, confidence: ALL_LOW, suggest_reuse_memory_id: 'no-such-id' },
  filledSlots: emptySlots,
  readyToSearch: false,
  memoryStats: frequentStats,
});
assert.equal(reuseMiss.applicationState.suggested_memory, null);

// --- LLM draft 정규화: 슬롯 headcount 를 draft 에 반영, 완성되면 needs_collection=false ---
const draftRes = buildApplicationState({
  llmApplication: {
    draft: {
      organization: '소프트웨어학과 학생회',
      eventName: '운영진 정기회의',
      purpose: '운영진 정기회의 진행',
      hangsaGbCode: '113',
    },
    confidence: { organization: 'high', eventName: 'high', purpose: 'medium', hangsaGbCode: 'high' },
    suggest_reuse_memory_id: null,
  },
  filledSlots: { ...emptySlots, headcount: 20 },
  readyToSearch: true,
  memoryStats: [],
});
assert.equal(draftRes.applicationState.draft?.eventName, '운영진 정기회의');
assert.equal(draftRes.applicationState.draft?.headcount, 20, 'draft headcount 는 슬롯에서 채운다');
assert.equal(
  draftRes.applicationState.needs_application_collection,
  false,
  '필드가 모두 차고 confidence 가 충분하면 수집 불필요',
);

// --- hangsa confidence 가 낮으면 미수집으로 남겨 되묻게 한다 ---
const lowHangsa = buildApplicationState({
  llmApplication: {
    draft: {
      organization: '중앙오케스트라',
      eventName: '개강총회',
      purpose: '개강총회 진행',
      hangsaGbCode: '117',
    },
    confidence: { organization: 'high', eventName: 'high', purpose: 'medium', hangsaGbCode: 'low' },
    suggest_reuse_memory_id: null,
  },
  filledSlots: { ...emptySlots, headcount: 30 },
  readyToSearch: true,
  memoryStats: [],
});
assert.ok(
  lowHangsa.applicationState.missing_application.includes('hangsaGbCode'),
  'confidence=low 인 hangsaGbCode 는 미수집으로 표시',
);
assert.equal(lowHangsa.applicationState.needs_application_collection, true);

// --- 스크린샷 버그 불변식: 행사명만 와서 슬롯이 비고 draft 가 없으면 신청서 수집으로 빠지지 않는다 ---
const eventNameOnly = buildApplicationState({
  llmApplication: { draft: null, confidence: ALL_LOW, suggest_reuse_memory_id: null },
  filledSlots: emptySlots,
  readyToSearch: false,
  memoryStats: [],
});
assert.equal(eventNameOnly.applicationState.draft, null);
assert.equal(
  eventNameOnly.applicationState.needs_application_collection,
  false,
  '슬롯이 비고 draft 가 없으면 needs_application_collection 은 false (조기 메타 수집 방지)',
);

console.log('verify-application-memory: OK');
