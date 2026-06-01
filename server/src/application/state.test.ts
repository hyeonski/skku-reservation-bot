import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationState } from './state.js';
import { buildReminderCandidate } from './reminders.js';
import { ApplicationState } from '../schemas/parse.js';

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

test('buildApplicationState derives application draft embedded in initial reservation request', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'user',
        content: '7월 23일 18시부터 2시간 20명 SW학생회 E2E 테스트 운영회의 예약해줘',
      },
    ],
    latestUserMessage: '7월 23일 18시부터 2시간 20명 SW학생회 E2E 테스트 운영회의 예약해줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-07-23',
      duration_min: 120,
      end_time: null,
      headcount: 20,
    },
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState?.draft?.organization, 'SW학생회');
  assert.equal(result.applicationState?.draft?.eventName, 'SW학생회 E2E 테스트 운영회의');
  assert.equal(result.applicationState?.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState?.needs_application_collection, false);
});

test('buildApplicationState does not treat "목적으로" as an explicit empty purpose label', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'user',
        content:
          '10월 31일 16시부터 2시간 20명 컴공 학생회 E2E 회귀28 운영위원회 회의 목적으로 회의실 잡아줘',
      },
    ],
    latestUserMessage:
      '10월 31일 16시부터 2시간 20명 컴공 학생회 E2E 회귀28 운영위원회 회의 목적으로 회의실 잡아줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-10-31',
      start_time: '16:00',
      end_time: null,
      duration_min: 120,
      headcount: 20,
    },
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState?.draft?.organization, '컴공 학생회');
  assert.equal(
    result.applicationState?.draft?.eventName,
    '컴공 학생회 E2E 회귀28 운영위원회 회의',
  );
  assert.equal(result.applicationState?.draft?.purpose, '컴공 학생회 E2E 회귀28 운영위원회 회의 진행');
  assert.equal(result.applicationState?.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState?.needs_application_collection, false);
});

test('buildApplicationState returns serializable partial draft when organization is missing', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'user',
        content: '7월 23일 18시부터 2시간 12명 E2E 테스트 덮어쓰기 방지 회의실 잡아줘',
      },
    ],
    latestUserMessage: '7월 23일 18시부터 2시간 12명 E2E 테스트 덮어쓰기 방지 회의실 잡아줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-07-23',
      duration_min: 120,
      end_time: null,
      headcount: 12,
    },
    readyToSearch: true,
    previousState: null,
    memories: [],
  });

  assert.equal(result.applicationState.draft?.organization, '');
  assert.deepEqual(result.applicationState.missing_application, [
    'organization',
    'hangsaGbCode',
  ]);
  assert.doesNotThrow(() => ApplicationState.parse(result.applicationState));
});

test('buildApplicationState treats rich application follow-up as draft details when multiple fields are missing', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'assistant',
        content: '단체와 행사명을 알려주세요',
      },
      {
        role: 'user',
        content: 'SW학생회 운영회의',
      },
    ],
    latestUserMessage: 'SW학생회 운영회의',
    baseIntent: 'modify_application',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      headcount: 10,
    },
    readyToSearch: false,
    previousState: {
      draft: {
        hangsaGbCode: '117',
        organization: '',
        eventName: 'E2E 테스트 다중정정',
        headcount: 10,
        purpose: 'E2E 테스트 다중정정 진행',
      },
      missing_application: ['organization', 'hangsaGbCode'],
      needs_application_collection: true,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'low',
        eventName: 'medium',
        purpose: 'medium',
        hangsaGbCode: 'low',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.organization, 'SW학생회');
  assert.equal(result.applicationState.draft?.eventName, 'SW학생회 운영회의');
  assert.equal(result.applicationState.draft?.hangsaGbCode, '111');
  assert.equal(result.applicationState.needs_application_collection, false);
});

test('buildApplicationState accepts seminar follow-up as organization and event classification', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'assistant',
        content: '단체와 행사명을 알려주세요',
      },
      {
        role: 'user',
        content: 'AI학회 E2E 회귀27 세미나',
      },
    ],
    latestUserMessage: 'AI학회 E2E 회귀27 세미나',
    baseIntent: 'modify_application',
    baseAssistantMessage: '단체와 행사명을 알려주세요',
    filledSlots: {
      ...baseSlots,
      headcount: 10,
    },
    readyToSearch: false,
    previousState: {
      draft: {
        hangsaGbCode: '113',
        organization: '',
        eventName: 'AI학회 E2E 회귀27 세미나',
        headcount: 10,
        purpose: 'AI학회 E2E 회귀27 세미나 진행',
      },
      missing_application: ['organization', 'hangsaGbCode'],
      needs_application_collection: true,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'low',
        eventName: 'medium',
        purpose: 'medium',
        hangsaGbCode: 'low',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.organization, 'AI학회');
  assert.equal(result.applicationState.draft?.eventName, 'AI학회 E2E 회귀27 세미나');
  assert.equal(result.applicationState.draft?.hangsaGbCode, '113');
  assert.equal(result.applicationState.needs_application_collection, false);
});

test('buildApplicationState keeps asking when collection follow-up has ambiguous event type', () => {
  const result = buildApplicationState({
    history: [
      {
        role: 'assistant',
        content: '단체와 행사명을 알려주세요',
      },
      {
        role: 'user',
        content: '기능검증팀 E2E 애매한 모임',
      },
    ],
    latestUserMessage: '기능검증팀 E2E 애매한 모임',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: {
      ...baseSlots,
      headcount: 12,
    },
    readyToSearch: false,
    previousState: {
      draft: {
        hangsaGbCode: '117',
        organization: '',
        eventName: 'E2E 애매한 모임',
        headcount: 12,
        purpose: 'E2E 애매한 모임 진행',
      },
      missing_application: ['organization', 'hangsaGbCode'],
      needs_application_collection: true,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'low',
        eventName: 'medium',
        purpose: 'medium',
        hangsaGbCode: 'low',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.organization, '기능검증팀');
  assert.equal(result.applicationState.draft?.eventName, '기능검증팀 E2E 애매한 모임');
  assert.equal(result.applicationState.draft?.hangsaGbCode, '117');
  assert.deepEqual(result.applicationState.missing_application, ['hangsaGbCode']);
  assert.equal(result.applicationState.needs_application_collection, true);
  assert.match(result.assistantMessage, /학생회\/동아리 행사|학과 주관 행사/);
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

test('buildApplicationState asks to shorten overlong event names before draft completion', () => {
  const result = buildApplicationState({
    history: [
      { role: 'assistant', content: '단체와 행사명을 알려주세요' },
      {
        role: 'user',
        content:
          '주관단체는 기능검증팀, 행사명은 E2E 길이 제한 테스트 회의 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이로 해줘',
      },
    ],
    latestUserMessage:
      '주관단체는 기능검증팀, 행사명은 E2E 길이 제한 테스트 회의 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이로 해줘',
    baseIntent: 'modify_application',
    baseAssistantMessage: '단체와 행사명을 알려주세요',
    filledSlots: baseSlots,
    readyToSearch: false,
    previousState: {
      draft: null,
      missing_application: ['organization', 'eventName', 'purpose', 'hangsaGbCode'],
      needs_application_collection: true,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'low',
        eventName: 'low',
        purpose: 'low',
        hangsaGbCode: 'low',
      },
      source: null,
    },
    memories: [],
  });

  assert.equal(result.applicationState.needs_application_collection, true);
  assert.equal(result.applicationState.missing_application.includes('eventName'), true);
  assert.match(result.assistantMessage, /행사명이 너무 길어요/);
  assert.match(result.assistantMessage, /50자 이내/);
});

test('buildApplicationState bounds multiple explicit field modifications by labels', () => {
  const result = buildApplicationState({
    history: [
      { role: 'assistant', content: '어떤 항목을 바꿀까요? "행사명은 ..."처럼 말씀해 주세요.' },
      {
        role: 'user',
        content:
          '시간은 20시부터 1시간으로, 행사명은 E2E 테스트 다중수정 회의로 바꾸고 주관단체는 기능검증팀으로 바꿔줘',
      },
    ],
    latestUserMessage:
      '시간은 20시부터 1시간으로, 행사명은 E2E 테스트 다중수정 회의로 바꾸고 주관단체는 기능검증팀으로 바꿔줘',
    baseIntent: 'new_reservation',
    baseAssistantMessage: '가능한 공간을 찾아볼게요.',
    filledSlots: baseSlots,
    readyToSearch: true,
    previousState: {
      draft: {
        hangsaGbCode: '111',
        organization: '율전 학생회',
        eventName: '율전 학생회관 E2E 테스트',
        headcount: 30,
        purpose: '율전 학생회관 E2E 테스트 진행',
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
  assert.equal(result.applicationState.draft?.eventName, 'E2E 테스트 다중수정 회의');
  assert.equal(result.applicationState.draft?.organization, '기능검증팀');
  assert.equal(result.applicationState.draft?.purpose, 'E2E 테스트 다중수정 회의 진행');
});

test('buildApplicationState applies bare headcount correction on existing draft', () => {
  const result = buildApplicationState({
    history: [
      { role: 'user', content: '7월 28일 19시부터 2시간 15명 율전 학생회관 E2E 테스트 정정 회의실 잡아줘' },
      { role: 'assistant', content: '7/28(화) 19:00부터 2시간, 15명으로 가능한 공간을 찾아볼게요.' },
      { role: 'user', content: '아니 30명으로' },
    ],
    latestUserMessage: '아니 30명으로',
    baseIntent: 'modify_slot',
    baseAssistantMessage: '인원을 30명으로 수정했어요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-07-28',
      start_time: '19:00',
      duration_min: 120,
      headcount: 15,
    },
    readyToSearch: true,
    previousState: {
      draft: {
        hangsaGbCode: '111',
        organization: '율전 학생회관 E2E 테스트 동아리',
        eventName: '율전 학생회관 E2E 테스트 동아리',
        headcount: 15,
        purpose: '율전 학생회관 E2E 테스트 동아리 진행',
      },
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'high',
        eventName: 'medium',
        purpose: 'medium',
        hangsaGbCode: 'high',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.headcount, 30);
  assert.equal(result.applicationState.draft?.eventName, '율전 학생회관 E2E 테스트 동아리');
  assert.equal(result.applicationState.source, 'user_modified');
});

test('buildApplicationState preserves slot headcount correction in application draft', () => {
  const result = buildApplicationState({
    history: [
      { role: 'user', content: '9월 25일 19시부터 2시간 15명 율전 학생회관' },
      { role: 'assistant', content: '9/25(금) 19:00부터 2시간, 15명으로 가능한 공간을 찾아볼게요.' },
      { role: 'user', content: '아니 30명으로' },
    ],
    latestUserMessage: '아니 30명으로',
    baseIntent: 'modify_slot',
    baseAssistantMessage: '조건을 수정했어요. 같은 조건으로 다시 검색할게요.',
    filledSlots: {
      ...baseSlots,
      date: '2026-09-25',
      start_time: '19:00',
      duration_min: 120,
      headcount: 30,
    },
    readyToSearch: true,
    previousState: {
      draft: {
        hangsaGbCode: '111',
        organization: '율전 학생회',
        eventName: '율전 학생회관',
        headcount: 15,
        purpose: '율전 학생회관 진행',
      },
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'high',
        eventName: 'medium',
        purpose: 'medium',
        hangsaGbCode: 'high',
      },
      source: 'conversation',
    },
    memories: [],
  });

  assert.equal(result.intent, 'modify_application');
  assert.equal(result.applicationState.draft?.headcount, 30);
  assert.equal(result.applicationState.draft?.eventName, '율전 학생회관');
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
