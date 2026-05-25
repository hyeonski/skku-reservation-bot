/**
 * Phase 1a mock fixtures — design_handoff_sidepanel_redesign/prototype/data.jsx
 * 를 TypeScript 로 옮긴 것. Phase 1b 에서 실제 서버/automation 응답으로 교체된다.
 */

import type {
  DraftFields,
  DraftSuggestedFlags,
  P2Recommendation,
  ReminderData,
  RecommendationSlots,
  SearchCandidate,
  SessionSummary,
  SpaceSummary,
} from './types';

export const MOCK_SESSIONS: SessionSummary[] = [
  {
    id: 'c-000',
    title: '5/22 학회 워크샵 장소',
    preview: '신청서 어떤 단체로 넣을까요?',
    when: '진행 중',
    status: 'active',
  },
  {
    id: 'c-001',
    title: '다음 주 화요일 학생회 운영회의',
    preview: '예약 완료 · 학생회관 401호',
    when: '방금 전',
    status: 'completed',
  },
  {
    id: 'c-002',
    title: '5월 14일 운영진 미팅',
    preview: '행사명은 정기회의로 변경했어요.',
    when: '6일 전',
    status: 'completed',
  },
  {
    id: 'c-003',
    title: '이번 주 금요일 동아리 연습',
    preview: '조건 맞는 공간이 없어 보류',
    when: '1주일 전',
    status: 'abandoned',
  },
  {
    id: 'c-004',
    title: '5월 7일 학회 세미나',
    preview: '예약 완료 · 반도체관 첨단강의실',
    when: '2주 전',
    status: 'completed',
  },
  {
    id: 'c-005',
    title: '스터디룸 잡아줘',
    preview: '그만할래',
    when: '2주 전',
    status: 'abandoned',
  },
  {
    id: 'c-006',
    title: '신입생 환영회 장소',
    preview: '예약 완료 · 학생회관 대강당',
    when: '3주 전',
    status: 'completed',
  },
];

export const MOCK_REMINDER: ReminderData = {
  id: 'r-001',
  status: 'active',
  title: '다음 주 화요일도 학생회 운영회의 예약하시겠어요?',
  pattern: '최근 4주 연속 매주 화요일 18:00–20:00 SW학생회 회의',
  proposed: {
    date: '2026-05-26 (화)',
    time: '18:00–20:00',
    space: '학생회관 401호',
    group: 'SW학생회',
    event: '운영회의',
    prompt: '2026-05-26 18:00부터 20:00까지 20명 SW학생회 운영회의 예약해줘 지난번처럼 학생회관 401호',
  },
};

export const MOCK_CANDIDATES: SearchCandidate[] = [
  {
    code: '230304',
    name: '회의실 A',
    building: '학생회관',
    result: 'fail',
    why: '18:00 충돌',
  },
  {
    code: '230401',
    name: '401호',
    building: '학생회관',
    result: 'found',
    why: '전 시간대 가용',
  },
];

export const MOCK_RECOMMENDED_SPACE: SpaceSummary = {
  code: '230401',
  name: '401호',
  building: '학생회관',
  capa: '최대 25명',
  useJojikName: '소프트웨어융합대학 행정실',
  contents: '학생회·동아리 행사 우선, 수업 시간 중 소음 유의',
  limitTimeHHMM: '2200',
};

export const MOCK_RECOMMENDED_SLOTS: RecommendationSlots = {
  date: '5/21(목)',
  start: '18:00',
  end: '20:00',
};

export const MOCK_DRAFT: DraftFields = {
  category: '회의/학회',
  group: 'SW학생회',
  event: '운영회의',
  headcount: '20명',
  purpose: '소프트웨어학과 학생회 주간 정기 운영회의',
};

export const MOCK_DRAFT_SUGGESTED: DraftSuggestedFlags = {
  category: true,
  group: true,
  event: true,
  purpose: true,
};

export const MOCK_P2: P2Recommendation = {
  when: '5/14(수)',
  group: 'SW학생회',
  event: '운영회의',
  frequencyHint: '최근 4회 같은 행사로 신청',
};
