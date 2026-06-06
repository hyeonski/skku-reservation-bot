import assert from 'node:assert/strict';

import { buildApplicationState } from '../src/application/state.js';
import type { FilledSlots } from '../src/schemas/parse.js';

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

const memory = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  label: '소프트웨어학과 학생회 운영진 정기회의',
  formData: {
    hangsaGbCode: '113',
    organization: '소프트웨어학과 학생회',
    eventName: '운영진 정기회의',
    headcount: 20,
    purpose: '운영진 정기회의 진행',
  },
};

const reuseHit = buildApplicationState({
  history: [{ role: 'user', content: '저번처럼 해줘' }],
  latestUserMessage: '저번처럼 해줘',
  baseIntent: 'modify_application',
  baseAssistantMessage: '신청 정보를 이렇게 채울게요. 아래 카드에서 확인해 주세요.',
  filledSlots: emptySlots,
  readyToSearch: false,
  previousState: null,
  memories: [memory],
});

assert.equal(reuseHit.applicationState.draft, null);
assert.equal(reuseHit.applicationState.suggested_memory?.conversationId, memory.conversationId);
assert.match(reuseHit.assistantMessage, /지난번|같은 정보/);
assert.equal(reuseHit.applicationState.recommendation?.event, '운영진 정기회의');

const reuseMiss = buildApplicationState({
  history: [{ role: 'user', content: '저번처럼 해줘' }],
  latestUserMessage: '저번처럼 해줘',
  baseIntent: 'modify_application',
  baseAssistantMessage: '신청 정보를 이렇게 채울게요. 아래 카드에서 확인해 주세요.',
  filledSlots: emptySlots,
  readyToSearch: false,
  previousState: null,
  memories: [],
});

assert.equal(reuseMiss.applicationState.draft, null);
assert.equal(reuseMiss.applicationState.suggested_memory, null);
assert.match(reuseMiss.assistantMessage, /지난 신청 정보를 찾지 못했어요/);

const description = buildApplicationState({
  history: [{ role: 'user', content: '운영진 정기회의' }],
  latestUserMessage: '운영진 정기회의',
  baseIntent: 'modify_application',
  baseAssistantMessage: '신청서에는 어떤 단체의 어떤 행사로 넣을까요?',
  filledSlots: { ...emptySlots, headcount: 20 },
  readyToSearch: false,
  previousState: null,
  memories: [],
});

assert.equal(description.applicationState.draft?.eventName, '운영진 정기회의');
assert.equal(description.applicationState.draft?.headcount, 20);
