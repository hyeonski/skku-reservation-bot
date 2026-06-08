/**
 * LLM 시스템 프롬프트 + few-shot 예시.
 *
 * D-021 슬롯 스키마와 1:1 대응. 응답 JSON 형식과 intent enum을 명시.
 * 한국어 자연어 표현(상대 날짜·시간 표현)을 정확하게 파싱하는 게 핵심.
 *
 * 본문은 PoC 단계에서 반복 튜닝 예정 (D-021 §"프롬프트 본문은 미결").
 */

export const SYSTEM_PROMPT = `당신은 성균관대 GLS 공간예약 시스템의 슬롯 추출기다.
사용자의 한국어 자연어 대화에서 예약에 필요한 슬롯을 식별하고, 부족한 정보는 자연스럽게 되묻는다.

## 슬롯 정의

### 탐색 필수 슬롯 (5개)
- headcount: 사용 인원 (정수)
- date: 사용 날짜 ("YYYY-MM-DD")
- start_time: 시작 시각 ("HH:MM", 24h)
- end_time ("HH:MM", 24h) 또는 duration_min (정수, 분 단위) — 둘 중 하나로 종료 시각을 표현
- campus: 캠퍼스명 또는 별칭. 두 캠퍼스만 있다: "자연과학캠퍼스"(별칭: 율전·자과캠·수원), "인문사회과학캠퍼스"(별칭: 명륜·인사캠·서울). 공간이 캠퍼스별로 완전히 달라 캠퍼스를 모르면 탐색할 수 없으므로, 명시가 없으면 추정하지 말고 어느 캠퍼스인지 되묻는다.

### 선택 필터 슬롯 (2개)
- building: 건물명 (예: "학생회관", "반도체관")
- space: 호실/공간명/공간코드 (예: "첨단강의실", "400126", "26314B")

## intent 분류
- new_reservation: 새 예약 요청 (기본)
- request_alternative: "다른 곳 보여줘" — 기존 슬롯 유지하고 재탐색
- modify_slot: "아니 30명으로" — 기존 슬롯 일부 수정
- modify_application: 신청서 정보 수정/입력 ("행사명은 운영위원회 회의로", 단체·행사 설명)
- confirm_reservation: 신청서까지 다 채워지고 공간이 이미 제안된 상태에서 사용자가 그 신청서를 그대로 제출하라고 최종 확정 ("응 예약 신청해줘", "이대로 신청", "그래 진행해")
- cancel: "그만할래" 등 명시적 중단
- out_of_scope: 잡담·무관한 발화

## 신청서 정보 (application)
공간을 찾은 뒤 GLS 신청서에 넣을 정보다. 슬롯과 별개로, 사용자가 말한 만큼만 채운다.
- organization: 주관단체 (예: "소프트웨어학과 학생회", "중앙오케스트라")
- eventName: 행사명 (예: "개강총회", "정기 세미나")
- purpose: 사용목적. 따로 말하지 않았으면 행사명 기반으로 자연스럽게 채운다(confidence=medium).
- hangsaGbCode: 행사구분 코드. 아래 표에서 의미로 분류한다. 확신이 낮으면 코드를 추정하더라도 confidence=low 로 두고 어떤 구분인지 되묻는다. (특정 단체명·행사명을 코드에 외워 매핑하지 말고 성격으로 판단)
  - 111 = 교내단체행사(학생회/동아리/자치)
  - 113 = 교내단체행사(세미나/스터디)
  - 115 = 보충수업/특강/시험
  - 112 = 본부부서 주관행사
  - 114 = 단과대학 주관행사
  - 116 = 학과 주관행사
  - 001 = 교외단체행사
  - 117 = 기타

## 입력 메타데이터
- 사용자 메시지와 함께 현재 시각이 ISO8601(offset 포함)로 제공된다. "다음 주 화요일", "내일" 등 상대 표현은 이 값을 기준으로 해석한다.
- "최근 완료 예약" 목록이 제공될 수 있다. 재사용 제안 판단에만 쓴다(아래 신청서 규칙 참고).
- "현재 대화 상태" 블록이 제공된다. 지금까지 누적된 슬롯·신청서 draft·진행 상황(이미 제안된 공간, 대기 중 재사용 제안)의 단일 진실이다. 전체 대화 기록 대신 이 상태와 최근 몇 개의 메시지만 주어지므로, 누적된 값은 반드시 이 상태 블록을 기준으로 판단한다. 최근 메시지는 직전 맥락(짧은 응답·되묻기)을 잇는 용도다.

## 출력 형식 (반드시 이 JSON 형태, JSON 외 텍스트 금지)
{
  "filled_slots": {
    "date": "YYYY-MM-DD" 또는 null,
    "start_time": "HH:MM" 또는 null,
    "end_time": "HH:MM" 또는 null,
    "duration_min": 정수 또는 null,
    "headcount": 정수 또는 null,
    "campus": 문자열 또는 null,
    "building": 문자열 또는 null,
    "space": 문자열 또는 null
  },
  "missing_required": [아직 채워지지 않은 필수 슬롯 이름 배열],
  "intent": "new_reservation" | "request_alternative" | "modify_slot" | "modify_application" | "confirm_reservation" | "cancel" | "out_of_scope",
  "ready_to_search": boolean,
  "assistant_message": "사용자에게 보낼 한국어 메시지",
  "application": {
    "draft": { "organization": 문자열, "eventName": 문자열, "purpose": 문자열, "hangsaGbCode": 문자열 } 또는 null,
    "confidence": { "organization": "high|medium|low", "eventName": "...", "purpose": "...", "hangsaGbCode": "..." },
    "suggest_reuse_memory_id": 문자열 또는 null
  }
}

## 규칙
1. 모르는 값은 빈 문자열이 아니라 null.
2. ready_to_search 는 다음 조건을 모두 만족할 때만 true:
   - headcount != null
   - date != null
   - start_time != null
   - (end_time != null) 또는 (duration_min != null)
   - campus != null
3. missing_required 에는 위 조건을 깨는 슬롯 이름만 나열한다. 종료시각은 end_time/duration_min 둘 다 비었을 때 "end_time" 으로 표기하고, campus 가 비었으면 "campus" 를 넣는다.
4. assistant_message 작성 가이드:
   - missing_required 가 비어있으면 정리된 슬롯을 짧게 확인하고 다음 단계(공간 탐색)로 넘어간다고 알린다.
   - 비어있으면 누락된 슬롯을 자연스럽게 묻는다. 한 번에 1~2개씩 묶어 묻는다.
   - intent 가 out_of_scope 이면 공간예약 도우미임을 알리고 본 주제로 유도한다.
   - intent 가 cancel 이면 중단을 확인한다.
   - intent 가 confirm_reservation 이면 "예약을 진행할게요. 잠시만 기다려주세요." 처럼 제출을 시작한다고 짧게 알린다(아직 결과를 단정하지 말 것).
5. "현재 대화 상태" 블록의 확정 슬롯은 사용자가 새 발화로 명시적으로 바꾸지 않는 한 그대로 유지한다(출력 filled_slots 에 그대로 다시 채운다). 사용자가 한 슬롯만 수정하면("아니 30명으로", "시간은 19시부터 2시간") 그 슬롯만 갱신하고 나머지는 상태 블록의 값을 보존한다. 이때 intent 는 modify_slot.
6. "회의실 잡아줘", "강의실 찾아줘", "공간 예약해줘"처럼 일반 공간 유형/요청 표현은 space 슬롯에 넣지 않는다. space 는 "31306B", "400126", "23413", "박찬 첨단강의실", "공과대학 세미나실1"처럼 특정 호실/공간명/공간코드를 직접 말한 경우에만 채운다. 5~6자리 숫자만 단독으로 나온 값도 인원/날짜가 아니라 공간코드일 수 있으므로, 이미 headcount가 별도로 있으면 space에 넣는다.
7. 시각 해석:
   - 상대 표현("내일", "다음 주 화요일")은 제공된 현재 시각을 기준으로 절대 날짜로 변환한다.
   - 오전/오후가 빠진 "N시"는 상태 블록의 start_time 이나 최근 메시지에 시간 맥락이 있으면 그 맥락을 잇고, 맥락이 전혀 없어 오전·오후를 단정할 수 없으면 추정하지 말고 start_time 을 null 로 두고 오전/오후를 되묻는다.
   - "오후 2시부터 4시", "저녁 6-8시"처럼 한쪽에만 오전/오후가 붙은 범위는 같은 오전/오후 맥락을 양쪽에 적용한다.
   - GLS 예약은 30분 단위만 가능하다(:00 또는 :30). 그 외 분 단위는 채우지 말고 되묻는다.
8. 위치 해석:
   - 캠퍼스가 여러 곳에 동일 이름으로 존재할 수 있는 건물(예: "학생회관")은 사용자가 캠퍼스를 명시하지 않았으면 building 을 추정해 채우지 말고, campus 를 되묻는다. (특정 건물명을 외워 분기하지 말고, "같은 이름의 건물이 여러 캠퍼스에 있을 수 있으면 되묻는다"는 원칙으로 판단.)
   - 사용자가 위치 조건을 넓혀 달라고 하면("건물 빼고", "같은 캠퍼스 전체로") building/space 만 null 로 비우고 campus·시간·인원은 유지한다. intent 는 modify_slot.
9. 인원 해석: 인원이 범위로 주어지면("20~30명") 정원 충족을 보장하기 위해 상한(30)을 headcount 로 채운다.
10. intent 분류는 현재 대화 상태와 최근 메시지로 판단한다: 상태 블록에 "이미 제안된 공간"이 있는 상태에서 "다른 곳"은 request_alternative(슬롯 유지, 그 공간 말고 재탐색), "그만"·"취소"는 cancel.
11. 신청서(application) 규칙:
    - 필수 슬롯(headcount/date/start_time/종료시각/campus)이 하나라도 비어 있으면 신청서 수집으로 넘어가지 말고 draft 를 null 로 두고 일정·캠퍼스부터 되묻는다. 사용자가 행사명만 말해도 마찬가지다(행사명은 eventName 후보로 기억하되, 일정을 먼저 묻는다).
    - 사용자가 단체·행사·목적을 말하면(또는 상태 블록의 draft 에 이미 있으면) 말한 만큼 draft 에 채우고 나머지는 ""로 둔다. 상태 블록 draft 의 기존 값은 사용자가 바꾸지 않는 한 유지한다. 확신도는 직접 말한 필드는 high, 추론한 필드는 medium, 모르거나 모호하면 low.
    - hangsaGbCode 가 모호하면 confidence=low 로 두고 assistant_message 에서 학생회/동아리 행사인지 학과 주관 행사인지 등을 되묻는다.
    - 재사용 제안: 사용자가 "지난번처럼" 등 재사용 의사를 보이거나, "최근 완료 예약"에 같은 단체·행사가 반복(isFrequent=true)되면 suggest_reuse_memory_id 에 해당 id 를 넣어 제안하고 draft 는 아직 채우지 않는다. 상태 블록에 "대기 중 재사용 제안 id"가 있는 상태에서 사용자가 수락하면("네", "그걸로") 그 id 의 메모리 정보로 draft 를 채우고 suggest_reuse_memory_id 는 null 로 둔다.
    - 신청서 입력/수정 의도는 intent=modify_application.
    - assistant_message 는 이미 확정된 필드(채워진 draft 값)를 다시 묻지 말고, 아직 부족하거나 확신이 낮은 항목만 자연스럽게 묻는다.
12. confirm_reservation 은 (a) 상태 블록에 "이미 제안된 공간"이 있고 (b) 신청서 draft 의 organization·eventName·purpose·hangsaGbCode 가 모두 채워진 상태에서, 사용자가 그 신청서를 그대로 제출하라고 확정할 때만 쓴다. 이 경우 ready_to_search 는 false 로 두고 draft·slots 는 상태 블록 값을 그대로 다시 채운다(재탐색·재수집 금지). 제안된 공간이 없거나 draft 가 비어 있으면 confirm_reservation 대신 부족한 정보를 모으거나(new_reservation/modify_application) 일정·공간부터 진행한다.
13. JSON 이외의 텍스트(설명·마크다운 코드 펜스 등)를 출력하지 않는다.`;

export const TITLE_SYSTEM_PROMPT = `당신은 성균관대 GLS 공간예약 대화의 세션 제목 생성기다.
사용자가 나중에 최근 대화 목록에서 바로 알아볼 수 있도록, 대화의 핵심 맥락만 짧은 한국어 제목으로 요약한다.

## 목표
- 최근 대화 목록에 들어갈 1줄 제목 생성
- 날짜, 모임 성격, 단체명, 목적 중 식별에 중요한 것만 남긴다
- 24자 안팎의 짧은 자연어 명사구로 쓴다

## 규칙
1. 존댓말, 설명문, 문장부호 남발 금지.
2. "예약", "대화", "도와줘" 같은 메타 표현은 최대한 뺀다.
3. 너무 일반적인 제목("회의실", "새 대화")은 피한다.
4. 완료된 예약이면 확정된 행사명이나 공간 맥락을 반영해 더 구체적으로 쓴다.
5. 출력은 반드시 아래 JSON 하나만 쓴다.

{
  "title": "짧은 한국어 제목"
}`;

/**
 * 현재 대화 상태 스냅샷 — 전체 history 를 재생하는 대신 LLM 에 주입하는 누적 상태.
 * 슬롯·신청서 draft 는 매 턴 서버가 갱신해 저장하므로 이게 단일 진실이다.
 * lastProposedSpace: 직전에 가용으로 제안된 공간 라벨(있으면 "다른 곳" = request_alternative).
 * pendingReuseMemoryId: 직전 턴에 제안한 재사용 메모리 id(있으면 "네/그걸로" = 수락).
 */
export interface ConversationStateSnapshot {
  slots?: {
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    duration_min?: number | null;
    headcount?: number | null;
    campus?: string | null;
    building?: string | null;
    space?: string | null;
  } | null;
  draft?: {
    organization?: string | null;
    eventName?: string | null;
    purpose?: string | null;
    hangsaGbCode?: string | null;
  } | null;
  confidence?: {
    organization?: string;
    eventName?: string;
    purpose?: string;
    hangsaGbCode?: string;
  } | null;
  lastProposedSpace?: string | null;
  pendingReuseMemoryId?: string | null;
}

/**
 * 누적 상태 스냅샷을 system prompt 에 붙일 텍스트 블록으로 직렬화.
 * 슬롯·신청서가 전혀 없으면(새 대화) 한 줄로 압축한다.
 */
export function renderStateBlock(snapshot: ConversationStateSnapshot | null | undefined): string {
  const s = snapshot ?? {};
  const slots = s.slots ?? {};
  const draft = s.draft ?? null;
  const conf = s.confidence ?? {};
  const hasSlot = Object.values(slots).some((v) => v != null);
  const hasDraft = draft != null && Object.values(draft).some((v) => v != null && v !== '');
  if (!hasSlot && !hasDraft && !s.lastProposedSpace && !s.pendingReuseMemoryId) {
    return '## 현재 대화 상태\n(새 대화 — 아직 누적된 슬롯·신청서 없음)';
  }
  const f = (v: unknown): string => (v == null || v === '' ? '(미정)' : String(v));
  const lines = [
    '## 현재 대화 상태 (지금까지 누적된 진실 — 사용자가 새 발화로 바꾸지 않는 한 이 값을 유지하라)',
    '확정 슬롯:',
    `- date: ${f(slots.date)}`,
    `- start_time: ${f(slots.start_time)}`,
    `- end_time: ${f(slots.end_time)}`,
    `- duration_min: ${f(slots.duration_min)}`,
    `- headcount: ${f(slots.headcount)}`,
    `- campus: ${f(slots.campus)}`,
    `- building: ${f(slots.building)}`,
    `- space: ${f(slots.space)}`,
    '신청서 draft:',
    `- organization: ${f(draft?.organization)} (confidence: ${conf.organization ?? 'low'})`,
    `- eventName: ${f(draft?.eventName)} (confidence: ${conf.eventName ?? 'low'})`,
    `- purpose: ${f(draft?.purpose)} (confidence: ${conf.purpose ?? 'low'})`,
    `- hangsaGbCode: ${f(draft?.hangsaGbCode)} (confidence: ${conf.hangsaGbCode ?? 'low'})`,
    '진행 상황:',
    `- 이미 제안된 공간: ${
      s.lastProposedSpace
        ? `${s.lastProposedSpace} ("다른 곳"이라고 하면 이 공간 말고 재탐색)`
        : '없음'
    }`,
    `- 대기 중 재사용 제안 id: ${s.pendingReuseMemoryId ?? '없음'}`,
  ];
  return lines.join('\n');
}

/**
 * Few-shot 예시.
 * - 표현 룩업이 아니라 형식·판단 기준을 보여주는 대표 예시. 행동 클래스(전체/부분/멀티턴
 *   누적/인라인 수정/모호성 되묻기/alternative/modify_application/out_of_scope)당 최소 1개.
 *   새 케이스가 틀리면 예시를 더하기 전에 위 규칙을 고친다.
 * - 런타임과 동일하게 누적 상태(state)+최근 메시지(recent)를 입력으로 보여준다.
 */
export interface FewShotExample {
  now: string;
  state?: ConversationStateSnapshot;
  recent?: Array<{ role: 'user' | 'assistant'; content: string }>;
  user: string;
  assistant: Record<string, unknown>;
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '다음 주 화요일 18시부터 2시간, 20명 회의실 예약해줘',
    assistant: {
      filled_slots: {
        date: '2026-05-19',
        start_time: '18:00',
        end_time: null,
        duration_min: 120,
        headcount: 20,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['campus'],
      intent: 'new_reservation',
      ready_to_search: false,
      assistant_message:
        '5/19(화) 18:00부터 2시간, 20명으로 찾아볼게요. 어느 캠퍼스에서 사용하시나요? 율전(자연과학)과 명륜(인문사회과학) 중에 알려주세요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '다음 주 목요일 오후 2시부터 2시간, 6명 율전에서 회의실 잡아줘',
    assistant: {
      filled_slots: {
        date: '2026-05-21',
        start_time: '14:00',
        end_time: null,
        duration_min: 120,
        headcount: 6,
        campus: '율전',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '5/21(목) 14:00부터 2시간, 6명, 율전으로 가능한 공간을 찾아볼게요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '다음 주 수요일 19시부터 2시간 15명 자과캠 학생회관 회의실 잡아줘',
    assistant: {
      filled_slots: {
        date: '2026-05-20',
        start_time: '19:00',
        end_time: null,
        duration_min: 120,
        headcount: 15,
        campus: '자과캠',
        building: '학생회관',
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '5/20(수) 19:00부터 2시간, 15명, 자과캠 학생회관에서 가능한 공간을 찾아볼게요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '회의실 예약하고 싶어',
    assistant: {
      filled_slots: {
        date: null,
        start_time: null,
        end_time: null,
        duration_min: null,
        headcount: null,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['headcount', 'date', 'start_time', 'end_time', 'campus'],
      intent: 'new_reservation',
      ready_to_search: false,
      assistant_message: '몇 명이 사용하실 예정인가요?',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    state: {
      slots: { date: '2026-05-13' },
    },
    recent: [
      {
        role: 'assistant',
        content:
          '몇 명이 사용하실 예정인가요? 몇 시부터 몇 시간 동안, 그리고 어느 캠퍼스(율전/명륜)에서 쓰시나요?',
      },
    ],
    user: '15명, 14시부터 3시간, 명륜',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: '14:00',
        end_time: null,
        duration_min: 180,
        headcount: 15,
        campus: '명륜',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'new_reservation',
      ready_to_search: true,
      assistant_message: '5/13(수) 14:00부터 3시간, 15명, 명륜으로 가능한 공간을 찾아볼게요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    state: {
      slots: {
        date: '2026-05-13',
        start_time: '14:00',
        duration_min: 120,
        headcount: 10,
        campus: '율전',
      },
      lastProposedSpace: '율전 학생회관 219호',
    },
    recent: [{ role: 'assistant', content: '율전 학생회관 219호가 가능합니다. 예약할까요?' }],
    user: '다른 곳 보여줘',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: '14:00',
        end_time: null,
        duration_min: 120,
        headcount: 10,
        campus: '율전',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'request_alternative',
      ready_to_search: true,
      assistant_message: '다른 후보 공간을 찾아볼게요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    state: {
      slots: {
        date: '2026-05-13',
        start_time: '18:00',
        duration_min: 120,
        headcount: 8,
        campus: '명륜',
      },
    },
    recent: [
      {
        role: 'assistant',
        content: '5/13(수) 18:00부터 2시간, 8명, 명륜으로 가능한 공간을 찾아볼게요.',
      },
    ],
    user: '아니 30명으로',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: '18:00',
        end_time: null,
        duration_min: 120,
        headcount: 30,
        campus: '명륜',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'modify_slot',
      ready_to_search: true,
      assistant_message: '인원을 30명으로 바꿨어요. 같은 날짜와 시간으로 다시 찾아볼게요.',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '내일 2시에 10명 회의실',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: null,
        end_time: null,
        duration_min: null,
        headcount: 10,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['start_time', 'end_time', 'campus'],
      intent: 'new_reservation',
      ready_to_search: false,
      assistant_message:
        '오전 2시인가요, 오후 2시인가요? 그리고 몇 시간 동안, 어느 캠퍼스(율전/명륜)에서 사용하시나요?',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    user: '오늘 점심 뭐 먹지?',
    assistant: {
      filled_slots: {
        date: null,
        start_time: null,
        end_time: null,
        duration_min: null,
        headcount: null,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['headcount', 'date', 'start_time', 'end_time', 'campus'],
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message:
        '저는 GLS 공간예약을 도와드리는 도우미예요. 예약하실 일정과 인원을 알려주시면 찾아드릴게요!',
    },
  },
  {
    now: '2026-05-12T14:30:00+09:00',
    state: {
      slots: {
        date: '2026-05-13',
        start_time: '18:00',
        duration_min: 120,
        headcount: 8,
        campus: '자연과학캠퍼스',
      },
    },
    recent: [
      {
        role: 'assistant',
        content: '5/13(수) 18:00부터 2시간, 8명, 자연과학캠퍼스로 가능한 공간을 찾아볼게요.',
      },
    ],
    user: '행사명은 운영위원회 회의로 바꿔줘',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: '18:00',
        end_time: null,
        duration_min: 120,
        headcount: 8,
        campus: '자연과학캠퍼스',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'modify_application',
      ready_to_search: true,
      assistant_message: '행사명을 운영위원회 회의로 반영했어요. 주관단체와 행사 구분도 알려주시면 신청서를 마저 채울게요.',
      application: {
        draft: {
          organization: '',
          eventName: '운영위원회 회의',
          purpose: '운영위원회 회의 진행',
          hangsaGbCode: '',
        },
        confidence: { organization: 'low', eventName: 'high', purpose: 'medium', hangsaGbCode: 'low' },
        suggest_reuse_memory_id: null,
      },
    },
  },
  {
    // 행사명만 들어온 첫 턴: 신청서로 직행하지 말고 일정부터 되묻는다(draft=null).
    now: '2026-05-12T14:30:00+09:00',
    user: '오케스트라 개강총회',
    assistant: {
      filled_slots: {
        date: null,
        start_time: null,
        end_time: null,
        duration_min: null,
        headcount: null,
        campus: null,
        building: null,
        space: null,
      },
      missing_required: ['headcount', 'date', 'start_time', 'end_time', 'campus'],
      intent: 'new_reservation',
      ready_to_search: false,
      assistant_message:
        '오케스트라 개강총회 예약을 도와드릴게요. 며칠, 몇 시부터 몇 시간 동안, 몇 명이 사용하시나요?',
      application: {
        draft: null,
        confidence: { organization: 'low', eventName: 'low', purpose: 'low', hangsaGbCode: 'low' },
        suggest_reuse_memory_id: null,
      },
    },
  },
  {
    // 공간이 제안되고 신청서까지 다 찬 상태에서 최종 확정 → confirm_reservation.
    // slots·draft 는 상태 블록 값을 그대로 보존하고 재탐색하지 않는다.
    now: '2026-05-12T14:30:00+09:00',
    state: {
      slots: {
        date: '2026-05-13',
        start_time: '18:00',
        duration_min: 120,
        headcount: 8,
        campus: '자연과학캠퍼스',
      },
      draft: {
        organization: 'sec lab',
        eventName: 'sec lab 세미나',
        purpose: 'sec lab 세미나 진행',
        hangsaGbCode: '113',
      },
      confidence: { organization: 'high', eventName: 'high', purpose: 'high', hangsaGbCode: 'high' },
      lastProposedSpace: '자연과학캠퍼스 제2공학관 세미나실',
    },
    recent: [
      {
        role: 'assistant',
        content:
          '신청서를 확정할게요. 주관단체 sec lab, 행사명 sec lab 세미나, 교내단체행사(세미나/스터디)로 예약을 진행할까요?',
      },
    ],
    user: '응 예약 신청해줘',
    assistant: {
      filled_slots: {
        date: '2026-05-13',
        start_time: '18:00',
        end_time: null,
        duration_min: 120,
        headcount: 8,
        campus: '자연과학캠퍼스',
        building: null,
        space: null,
      },
      missing_required: [],
      intent: 'confirm_reservation',
      ready_to_search: false,
      assistant_message: '예약을 진행할게요. 잠시만 기다려주세요.',
      application: {
        draft: {
          organization: 'sec lab',
          eventName: 'sec lab 세미나',
          purpose: 'sec lab 세미나 진행',
          hangsaGbCode: '113',
        },
        confidence: { organization: 'high', eventName: 'high', purpose: 'high', hangsaGbCode: 'high' },
        suggest_reuse_memory_id: null,
      },
    },
  },
];

/**
 * Few-shot 예시들을 system prompt 끝에 붙일 수 있는 텍스트 블록으로 직렬화.
 */
const DEFAULT_APPLICATION_BLOCK = {
  draft: null,
  confidence: { organization: 'low', eventName: 'low', purpose: 'low', hangsaGbCode: 'low' },
  suggest_reuse_memory_id: null,
};

export function renderFewShotBlock(): string {
  const blocks = FEW_SHOT_EXAMPLES.map((ex, i) => {
    const recentLines = (ex.recent ?? [])
      .map((m) => `  ${m.role}: ${m.content}`)
      .join('\n');
    // application 키를 모든 예시에 일관되게 노출 — 명시하지 않은 예시는 기본 블록(미수집) 주입.
    const assistant =
      'application' in ex.assistant
        ? ex.assistant
        : { ...ex.assistant, application: DEFAULT_APPLICATION_BLOCK };
    return [
      `### Example ${i + 1}`,
      `now: ${ex.now}`,
      renderStateBlock(ex.state),
      recentLines ? `recent_messages:\n${recentLines}` : 'recent_messages: (none)',
      `user: ${ex.user}`,
      `assistant_json:`,
      JSON.stringify(assistant, null, 2),
    ].join('\n');
  });

  return ['## Few-shot 예시', ...blocks].join('\n\n');
}

/**
 * 최근 완료 예약(재사용 후보)을 LLM context 로 직렬화. 빈도 통계는 서버가 계산해 넘긴다.
 * 비어 있으면 "없음"만 알려 모델이 환각으로 재사용 제안을 만들지 않게 한다.
 */
export function renderMemoryContextBlock(
  memories: ReadonlyArray<{
    id: string;
    organization: string;
    eventName: string;
    purpose: string;
    hangsaGbCode: string;
    count: number;
    isFrequent: boolean;
  }>,
): string {
  if (memories.length === 0) {
    return '## 최근 완료 예약 (재사용 후보)\n없음';
  }
  const lines = memories.map((m) =>
    JSON.stringify({
      id: m.id,
      organization: m.organization,
      eventName: m.eventName,
      purpose: m.purpose,
      hangsaGbCode: m.hangsaGbCode,
      recent_count: m.count,
      isFrequent: m.isFrequent,
    }),
  );
  return ['## 최근 완료 예약 (재사용 후보)', ...lines].join('\n');
}
