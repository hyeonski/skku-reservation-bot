import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationState } from './state.js';

const baseSlots = {
  date: '2026-05-20',
  start_time: '18:00',
  end_time: '20:00',
  duration_min: null,
  headcount: 8,
  campus: null,
  building: null,
  space: null,
} as const;

test('buildApplicationState derives application draft from one-line description', () => {
  const result = buildApplicationState({
    history: [{ role: 'user', content: '소프트웨어학과 학생회 정기회의' }],
    latestUserMessage: '소프트웨어학과 학생회 정기회의',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState?.draft?.organization, '소프트웨어학과 학생회');
  assert.equal(result.applicationState?.draft?.eventName, '소프트웨어학과 학생회 정기회의');
  assert.equal(result.applicationState?.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState?.needs_application_collection, false);
});

test('buildApplicationState applies explicit eventName modification on existing draft', () => {
  const result = buildApplicationState({
    history: [
      { role: 'assistant', content: '어떤 항목을 바꿀까요? "행사명은 ..."처럼 말씀해 주세요.' },
      { role: 'user', content: '행사명은 운영위원회 회의로 바꿔줘' },
    ],
    latestUserMessage: '행사명은 운영위원회 회의로 바꿔줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: {
      draft: {
        hangsaGbCode: '111',
        organization: '소프트웨어학과 학생회',
        eventName: '소프트웨어학과 학생회 정기회의',
        headcount: 8,
        purpose: '소프트웨어학과 학생회 정기회의 진행',
      },
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      confidence: {
        organization: 'high',
        eventName: 'high',
        purpose: 'medium',
        hangsaGbCode: 'high',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.eventName, '운영위원회 회의');
  assert.equal(result.applicationState.draft?.purpose, '운영위원회 회의 진행');
  assert.equal(result.applicationState.source, 'user_modified');
});

test('buildApplicationState suggests prior memory instead of auto applying it', () => {
  const result = buildApplicationState({
    history: [{ role: 'user', content: '학생회 회의실 잡아줘' }],
    latestUserMessage: '학생회 회의실 잡아줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories: [
      {
        conversationId: '11111111-1111-4111-8111-111111111111',
        label: '소프트웨어학과 학생회 정기회의',
        formData: {
          hangsaGbCode: '111',
          organization: '소프트웨어학과 학생회',
          eventName: '소프트웨어학과 학생회 정기회의',
          headcount: 8,
          purpose: '소프트웨어학과 학생회 정기회의 진행',
        },
      },
    ],
  });

  assert.equal(result.applicationState.draft, null);
  assert.equal(result.applicationState.suggested_memory?.label, '소프트웨어학과 학생회 정기회의');
  assert.equal(result.applicationState.needs_application_collection, true);
});
