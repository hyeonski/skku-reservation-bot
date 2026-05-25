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
      recommendation: null,
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

test('buildApplicationState does not suggest for single memory without reuse signal', () => {
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

  assert.equal(result.applicationState.suggested_memory, null);
  assert.equal(result.applicationState.needs_application_collection, true);
});

test('buildApplicationState recommends memory when same group+event appears >= 3 times', () => {
  const sharedFormData = {
    hangsaGbCode: '111',
    organization: '소프트웨어학과 학생회',
    eventName: '정기회의',
    headcount: 8,
    purpose: '정기회의 진행',
  };

  const memories = [
    { conversationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', label: '소프트웨어학과 학생회 정기회의', formData: { ...sharedFormData } },
    { conversationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', label: '소프트웨어학과 학생회 정기회의', formData: { ...sharedFormData } },
    { conversationId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', label: '소프트웨어학과 학생회 정기회의', formData: { ...sharedFormData } },
  ];

  const result = buildApplicationState({
    history: [{ role: 'user', content: '내일 6시 20명' }],
    latestUserMessage: '내일 6시 20명',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories,
  });

  assert.equal(result.applicationState.draft, null);
  assert.ok(result.applicationState.suggested_memory);
  assert.ok(result.applicationState.recommendation);
  assert.equal(result.applicationState.suggested_memory.label, '최근 3회 같은 행사로 신청');
  assert.equal(result.applicationState.suggested_memory.formData.organization, '소프트웨어학과 학생회');
  assert.equal(result.applicationState.suggested_memory.conversationId, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  assert.equal(result.applicationState.recommendation.frequency, '3_in_recent_4');
  assert.equal(result.applicationState.recommendation.group, '소프트웨어학과 학생회');
  assert.equal(result.applicationState.recommendation.event, '정기회의');
  assert.equal(result.applicationState.recommendation.category, '학생회/동아리');
});

test('buildApplicationState does not suggest when same combo appears only 2 times', () => {
  const sharedFormData = {
    hangsaGbCode: '111',
    organization: '소프트웨어학과 학생회',
    eventName: '정기회의',
    headcount: 8,
    purpose: '정기회의 진행',
  };

  const memories = [
    { conversationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', label: '소프트웨어학과 학생회 정기회의', formData: { ...sharedFormData } },
    { conversationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', label: '소프트웨어학과 학생회 정기회의', formData: { ...sharedFormData } },
  ];

  const result = buildApplicationState({
    history: [{ role: 'user', content: '내일 6시 20명' }],
    latestUserMessage: '내일 6시 20명',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories,
  });

  assert.equal(result.applicationState.suggested_memory, null);
  assert.equal(result.applicationState.recommendation, null);
});

test('buildApplicationState suggests memory on reuse signal even below frequency threshold', () => {
  const memories = [
    {
      conversationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      label: '소프트웨어학과 학생회 정기회의',
      formData: {
        hangsaGbCode: '111',
        organization: '소프트웨어학과 학생회',
        eventName: '정기회의',
        headcount: 8,
        purpose: '정기회의 진행',
      },
    },
  ];

  const result = buildApplicationState({
    history: [{ role: 'user', content: '지난번처럼 잡아줘' }],
    latestUserMessage: '지난번처럼 잡아줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories,
  });

  assert.ok(result.applicationState.suggested_memory);
  assert.ok(result.applicationState.recommendation);
  assert.equal(result.applicationState.suggested_memory.label, '소프트웨어학과 학생회 정기회의');
  assert.equal(result.applicationState.recommendation.frequency, 'reuse_signal');
});
