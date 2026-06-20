import assert from 'node:assert/strict';

import { deriveAction } from '../src/application/state.js';
import type { FilledSlots } from '../src/schemas/parse.js';

const empty: FilledSlots = {
  date: null,
  start_time: null,
  end_time: null,
  duration_min: null,
  headcount: null,
  campus: null,
  building: null,
  space: null,
};

// 탐색 가능한 완성 슬롯(isSearchReady true).
const complete: FilledSlots = {
  date: '2026-06-25',
  start_time: '18:00',
  end_time: null,
  duration_min: 120,
  headcount: 10,
  campus: '율전',
  building: null,
  space: null,
};

// --- 첫 탐색: 슬롯이 막 완성되면 search ---
assert.equal(
  deriveAction({ previousSlots: empty, nextSlots: complete, signal: 'info', hasCandidate: false, appComplete: false }).action,
  'search',
  '필수 슬롯 첫 완성 → search',
);

// --- 미완성 슬롯이면 탐색 안 함 ---
assert.equal(
  deriveAction({ previousSlots: empty, nextSlots: empty, signal: 'info', hasCandidate: false, appComplete: false }).action,
  'none',
  '슬롯 미완성 → none',
);

// --- cascade: 완성 상태에서 슬롯 변경 → 재탐색(후보 유무 무관) ---
const changed: FilledSlots = { ...complete, headcount: 30 };
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: changed, signal: 'info', hasCandidate: true, appComplete: false }).action,
  'search',
  '후보 있는데 슬롯 변경 → 재탐색(cascade)',
);

// --- 슬롯 그대로(신청서만 변경) → 재탐색 안 함(후보 보존) ---
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'info', hasCandidate: true, appComplete: false }).action,
  'none',
  '슬롯 불변(신청서만 변경) → none, 후보 보존',
);

// --- request_alternative: 후보 있으면 다음 후보, 없으면 none ---
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'request_alternative', hasCandidate: true, appComplete: false }).action,
  'next_candidate',
  '다른 곳 + 후보 존재 → next_candidate',
);
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'request_alternative', hasCandidate: false, appComplete: false }).action,
  'none',
  '다른 곳인데 후보 없음 → none',
);

// --- accept: canSubmit(후보 ∧ 신청서완성)이면 fill_form(폼만), 아니면 none ---
const acceptReady = deriveAction({
  previousSlots: complete, nextSlots: complete, signal: 'accept', hasCandidate: true, appComplete: true,
});
assert.equal(acceptReady.action, 'fill_form', 'accept + canSubmit → fill_form(제출 아님)');
assert.equal(acceptReady.canSubmit, true);

assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'accept', hasCandidate: true, appComplete: false }).action,
  'none',
  'accept인데 신청서 미완성 → none',
);
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'accept', hasCandidate: false, appComplete: true }).action,
  'none',
  'accept인데 후보 없음 → none',
);

// --- cancel / out_of_scope: 항상 none (데이터 트랙 보존은 호출측 책임) ---
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'cancel', hasCandidate: true, appComplete: true }).action,
  'none',
);
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: empty, signal: 'out_of_scope', hasCandidate: false, appComplete: false }).action,
  'none',
);

// --- canSubmit 파생 ---
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'info', hasCandidate: true, appComplete: true }).canSubmit,
  true,
);
assert.equal(
  deriveAction({ previousSlots: complete, nextSlots: complete, signal: 'info', hasCandidate: false, appComplete: true }).canSubmit,
  false,
);

console.log('verify-derive-action: OK');
