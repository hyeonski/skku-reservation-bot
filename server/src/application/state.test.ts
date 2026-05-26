import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationState } from './state.js';
import { buildReminderCandidate } from './reminders.js';
import { applyDeterministicSlotCorrections } from './slotCorrections.js';

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

test('buildApplicationState separates student council group from activity wording', () => {
  const result = buildApplicationState({
    history: [{ role: 'user', content: '소프트웨어학과 학생회 동아리 연습' }],
    latestUserMessage: '소프트웨어학과 학생회 동아리 연습',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.applicationState.draft?.organization, '소프트웨어학과 학생회');
  assert.equal(result.applicationState.draft?.eventName, '소프트웨어학과 학생회 동아리 연습');
});

test('buildApplicationState parses multiple explicit application fields', () => {
  const result = buildApplicationState({
    history: [
      { role: 'assistant', content: '신청서에는 어떤 단체의 어떤 행사로 넣을까요? 예: 소프트웨어학과 학생회 정기회의' },
      {
        role: 'user',
        content:
          '주관단체: 소프트웨어학과 학생회 행사명: 동아리 연습 목적: 동아리 연습 진행 행사구분: 학생회/동아리',
      },
    ],
    latestUserMessage:
      '주관단체: 소프트웨어학과 학생회 행사명: 동아리 연습 목적: 동아리 연습 진행 행사구분: 학생회/동아리',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.applicationState.draft?.organization, '소프트웨어학과 학생회');
  assert.equal(result.applicationState.draft?.eventName, '동아리 연습');
  assert.equal(result.applicationState.draft?.purpose, '동아리 연습 진행');
  assert.equal(result.applicationState.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState.needs_application_collection, false);
});

test('buildApplicationState parses multiple explicit application fields without colons', () => {
  const result = buildApplicationState({
    history: [
      { role: 'assistant', content: '신청서에는 어떤 단체의 어떤 행사로 넣을까요? 예: 소프트웨어학과 학생회 정기회의' },
      {
        role: 'user',
        content:
          '주관단체는 소프트웨어학과 학생회 행사명은 동아리 연습 목적은 동아리 연습 진행 행사구분은 학생회 동아리',
      },
    ],
    latestUserMessage:
      '주관단체는 소프트웨어학과 학생회 행사명은 동아리 연습 목적은 동아리 연습 진행 행사구분은 학생회 동아리',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.applicationState.draft?.organization, '소프트웨어학과 학생회');
  assert.equal(result.applicationState.draft?.eventName, '동아리 연습');
  assert.equal(result.applicationState.draft?.purpose, '동아리 연습 진행');
  assert.equal(result.applicationState.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState.needs_application_collection, false);
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
  assert.equal(result.applicationState.suggested_memory.reason, 'frequency');
  assert.equal(result.applicationState.suggested_memory.count, 3);
  assert.equal(result.applicationState.suggested_memory.frequency, '3_in_recent_4');
  assert.equal(result.applicationState.suggested_memory.confidence, 0.75);
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
  assert.equal(result.applicationState.suggested_memory.reason, 'reuse_signal');
  assert.equal(result.applicationState.suggested_memory.count, null);
  assert.equal(result.applicationState.suggested_memory.confidence, 0.72);
  assert.equal(result.applicationState.recommendation.frequency, 'reuse_signal');
});

test('buildApplicationState prioritizes explicit reuse signal over unrelated frequent pattern', () => {
  const frequentBasketball = Array.from({ length: 10 }, (_, index) => ({
    conversationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    label: '농구동아리 정기훈련',
    formData: {
      hangsaGbCode: '111',
      organization: '농구동아리',
      eventName: '정기훈련',
      headcount: 10,
      purpose: '정기훈련 진행',
    },
  }));
  const targetMemories = Array.from({ length: 2 }, (_, index) => ({
    conversationId: `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
    label: '소프트웨어학과 학생회 정기회의',
    formData: {
      hangsaGbCode: '111',
      organization: '소프트웨어학과 학생회',
      eventName: '정기회의',
      headcount: 10,
      purpose: '정기회의 진행',
    },
  }));
  const latestUserMessage =
    '2026년 7월 14일 10시부터 12시까지 10명 예약해줘 지난번처럼 소프트웨어학과 학생회 정기회의';

  const result = buildApplicationState({
    history: [{ role: 'user', content: latestUserMessage }],
    latestUserMessage,
    baseIntent: 'new_reservation',
    baseAssistantMessage: '찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-07-14',
      start_time: '10:00',
      end_time: '12:00',
      headcount: 10,
    },
    readyToSearch: true,
    previousState: null,
    memories: [...frequentBasketball, ...targetMemories],
  });

  assert.ok(result.applicationState.suggested_memory);
  assert.equal(result.applicationState.suggested_memory.reason, 'reuse_signal');
  assert.equal(
    result.applicationState.suggested_memory.formData.organization,
    '소프트웨어학과 학생회',
  );
  assert.equal(result.applicationState.suggested_memory.formData.eventName, '정기회의');
});

test('buildReminderCandidate does not emit below threshold', () => {
  const formData = {
    hangsaGbCode: '111',
    organization: '소프트웨어학과 학생회',
    eventName: '정기회의',
    headcount: 8,
    purpose: '정기회의 진행',
  };

  const candidate = buildReminderCandidate([
    {
      id: 'a',
      slots: { ...baseSlots, date: '2026-05-05', start_time: '18:00', end_time: '20:00' },
      formData,
      confirmedSpaceLabel: '학생회관 401호',
    },
    {
      id: 'b',
      slots: { ...baseSlots, date: '2026-05-12', start_time: '18:00', end_time: '20:00' },
      formData,
      confirmedSpaceLabel: '학생회관 401호',
    },
  ], '2026-05-13');

  assert.equal(candidate, null);
});

test('buildReminderCandidate emits weekly pattern at threshold', () => {
  const formData = {
    hangsaGbCode: '111',
    organization: '소프트웨어학과 학생회',
    eventName: '정기회의',
    headcount: 8,
    purpose: '정기회의 진행',
  };

  const candidate = buildReminderCandidate([
    {
      id: 'a',
      slots: { ...baseSlots, date: '2026-05-05', start_time: '18:00', end_time: '20:00' },
      formData,
      confirmedSpaceLabel: '학생회관 401호',
    },
    {
      id: 'b',
      slots: { ...baseSlots, date: '2026-05-12', start_time: '18:00', end_time: '20:00' },
      formData,
      confirmedSpaceLabel: '학생회관 401호',
    },
    {
      id: 'c',
      slots: { ...baseSlots, date: '2026-05-19', start_time: '18:00', end_time: '20:00' },
      formData,
      confirmedSpaceLabel: '학생회관 401호',
    },
  ], '2026-05-20');

  assert.ok(candidate);
  assert.equal(candidate.proposedDate, '2026-05-26');
  assert.equal(candidate.startTime, '18:00');
  assert.equal(candidate.endTime, '20:00');
  assert.equal(candidate.organization, '소프트웨어학과 학생회');
  assert.equal(candidate.eventName, '정기회의');
  assert.match(candidate.prompt, /지난번처럼 학생회관 401호/);
});

test('applyDeterministicSlotCorrections updates retry headcount chip', () => {
  const result = applyDeterministicSlotCorrections(
    '100명으로 줄여서 다시',
    { ...baseSlots, headcount: 1000 },
    'new_reservation',
  );

  assert.equal(result.changed, true);
  assert.equal(result.intent, 'modify_slot');
  assert.equal(result.filledSlots.headcount, 100);
  assert.equal(result.readyToSearch, true);
  assert.deepEqual(result.missingRequired, []);
  assert.match(result.assistantMessage ?? '', /100명/);
});

test('applyDeterministicSlotCorrections updates retry time and next week chips', () => {
  const timeResult = applyDeterministicSlotCorrections(
    '시간대 19–21시로',
    baseSlots,
    'new_reservation',
  );

  assert.equal(timeResult.changed, true);
  assert.equal(timeResult.filledSlots.start_time, '19:00');
  assert.equal(timeResult.filledSlots.end_time, '21:00');
  assert.equal(timeResult.filledSlots.duration_min, null);

  const dateResult = applyDeterministicSlotCorrections(
    '다음 주 같은 요일로',
    baseSlots,
    'new_reservation',
  );

  assert.equal(dateResult.changed, true);
  assert.equal(dateResult.filledSlots.date, '2026-05-27');
});
