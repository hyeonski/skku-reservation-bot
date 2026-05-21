// ===== Mock data + bot script =====

const todayLabel = "5/20(수)"; // demo "오늘"
const tomorrowLabel = "5/21(목)";

const MOCK_SESSIONS = [
  {
    id: "c-000",
    title: "5/22 학회 워크샵 장소",
    preview: "신청서 어떤 단체로 넣을까요?",
    when: "진행 중",
    status: "active",
  },
  {
    id: "c-001",
    title: "다음 주 화요일 학생회 운영회의",
    preview: "예약 완료 · 학생회관 401호",
    when: "방금 전",
    status: "completed",
  },
  {
    id: "c-002",
    title: "5월 14일 운영진 미팅",
    preview: "행사명은 정기회의로 변경했어요.",
    when: "6일 전",
    status: "completed",
  },
  {
    id: "c-003",
    title: "이번 주 금요일 동아리 연습",
    preview: "조건 맞는 공간이 없어 보류",
    when: "1주일 전",
    status: "abandoned",
  },
  {
    id: "c-004",
    title: "5월 7일 학회 세미나",
    preview: "예약 완료 · 반도체관 첨단강의실",
    when: "2주 전",
    status: "completed",
  },
  {
    id: "c-005",
    title: "스터디룸 잡아줘",
    preview: "그만할래",
    when: "2주 전",
    status: "abandoned",
  },
  {
    id: "c-006",
    title: "신입생 환영회 장소",
    preview: "예약 완료 · 학생회관 대강당",
    when: "3주 전",
    status: "completed",
  },
];

// P3 reminder pattern (서버가 이력 분석해서 보내는 가상의 패턴)
const P3_REMINDER = {
  title: "다음 주 화요일도 학생회 운영회의 예약하시겠어요?",
  pattern: "최근 4주 연속 매주 화요일 18:00–20:00 SW학생회 회의",
  proposed: {
    date: "2026-05-26 (화)",
    time: "18:00–20:00",
    space: "학생회관 401호",
    group: "SW학생회",
    event: "운영회의",
  },
};

// 후보 공간 (검증 시퀀스용)
const CANDIDATE_SPACES = [
  {
    code: "230304",
    name: "회의실 A",
    building: "학생회관",
    capa: "최대 30명",
    floor: "3층",
    result: "fail",
    why: "18:00 충돌",
  },
  {
    code: "230401",
    name: "401호",
    building: "학생회관",
    capa: "최대 25명",
    floor: "4층",
    result: "found",
    why: "전 시간대 가용",
  },
];

// Phase 2 — 직전 학생회 회의 정보 (인라인 추천용)
const PREV_RESERVATION = {
  group: "SW학생회",
  event: "운영회의",
  purpose: "소프트웨어학과 학생회 주간 정기 운영회의",
  category: "회의/학회",
  when: "5/14(수)",
};

window.MOCK_DATA = {
  todayLabel,
  tomorrowLabel,
  MOCK_SESSIONS,
  P3_REMINDER,
  CANDIDATE_SPACES,
  PREV_RESERVATION,
};
