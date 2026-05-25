# 04. 컴포넌트 스펙

각 컴포넌트는 `prototype/ui.jsx` 또는 `screens.jsx`에 구현되어 있습니다. 아래는 production 코드에서 재현할 때 참고할 props/state/스타일 요약.

## ChatHeader

```ts
interface ChatHeaderProps {
  title: string;           // "5/21 학생회 운영회의" 또는 "새 대화"
  sessionLabel?: string;   // phaseLabel(phase) — 부제목 위치
  onBack: () => void;      // [☰] 클릭 → 세션 목록
  onNew?: () => void;      // [+] 클릭 → 새 대화 시작
}
```

- 좌측 [☰] icon button (28×28, transparent hover bg)
- 가운데: 22×22 글리프 + title + (` · ${sessionLabel}` faint)
- 우측 [+] icon button

## ChatComposer

```ts
interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;     // phasePlaceholder(phase)
  disabled: boolean;       // searching/submitting/awaiting-login 시 true
}
```

- textarea auto-grow (22~90px)
- Enter 전송 / Shift+Enter 줄바꿈
- 전송 버튼: textarea가 비었거나 disabled면 비활성 색 (`var(--bg-strong)` bg, faint text)

## HintChips

```ts
interface HintChipsProps {
  chips: string[];
  onClick: (chip: string) => void;
}
```

각 칩 클릭 = 그 텍스트로 메시지 전송 (사용자 입력란에 자동 채우는 게 아니라 바로 send).

칩 목록은 phase별로 다름 — `phaseHints` 매핑 (P1 구현 시 hardcode):

| phase | hints |
|---|---|
| `slots-end` | `["20시까지", "2시간", "한 시간만"]` |
| `slots-count` | `["10명", "20명", "30명"]` |
| `meta-collect` | `["SW학생회 운영회의", "동아리 연습", "학회 세미나"]` |
| `draft` | `["제출", "행사명만 바꾸기", "다른 공간"]` |
| `failed-retry` | 동적: `["{smaller}명으로 줄여서 다시", "시간대 19–21시로", "다음 주 같은 요일로"]` |

LLM 응답에 `suggested_replies: string[]` 필드를 추가해서 서버에서 내려주는 것도 좋은 옵션 (P1+ 검토).

---

## Cards (`align-self: stretch` — 전폭)

모든 카드의 공통 구조:

```tsx
<div className="card">
  <div className="card-head">
    <div className="title">{title}</div>
    <div className="tag {success|accent|warning|muted}">{tag}</div>
  </div>
  <div className="card-body">{children}</div>
  <div className="card-actions">{buttons}</div>
</div>
```

`card-actions`는 옵션 — 없으면 그 부분 생략.

### SearchProgressCard

```ts
interface SearchProgressCardProps {
  candidates: Array<{
    code: string;
    name: string;
    building: string;
    result: "found" | "fail" | "pending";
    why?: string;       // 사유 텍스트 (예: "18:00 충돌", "수업 충돌")
  }>;
  currentIdx: number;   // 검증 중인 후보의 인덱스
  found: boolean;       // 찾았는지
  frozen?: boolean;     // 더 이상 활성 아님 (재시도로 새 카드가 생성됐을 때)
}
```

- 제목: "빈 공간 찾는 중", 우상단 accent 태그 "검증 N/M"
- 진행바 (`var(--bg-muted)` 트랙, `var(--accent)` fill, 3px 높이)
- 후보 리스트 — 각 row 14×14 marker + 이름 + 우측 why
  - `pending` → 회색 빈 원
  - `active` (currentIdx == i, 검증 중) → accent 테두리 + 회전 (`spin 1s linear infinite`)
  - `found` → 초록 채움 + ✓
  - `done` (fail) → muted 채움 + ✗
- frozen=true → 모든 항목이 done/found 최종 상태로 표시, 진행바 100%

### RecommendationCard

```ts
interface RecommendationCardProps {
  space: {
    code: string;
    name: string;        // "401호"
    building: string;    // "학생회관"
    floor: string;       // "4층"
    capa: string;        // "최대 25명"
    useJojikName?: string;  // 학과 우선 안내 — 있으면 dept-warn 표시
    contents?: string;   // GLS CONTENTS 공지문 — 길면 truncate
    limitTimeHHMM?: string;
  };
  slots: {
    date: string;
    start: string;
    end: string;
  };
  onAlternative?: () => void;  // "다른 공간 찾기" 버튼
}
```

- 좌측 44×44 ph (accent-soft bg, building 아이콘 22×22)
- name (14/600), building+floor (12/muted)
- meta rows: 정원/시간/날짜 3개 (11.5px, label/value)
- dept-warn (옵션): warning-soft 박스, "ⓘ ${useJojikName} 우선 공간 — 신청 시 학생회 명의 권장"
- actions: "다른 공간 찾기" small btn

추천 자체는 메시지로만 떠 있는 안내이고, 사용자가 "이 공간으로 진행"하겠다는 명시는 다음 단계(신청 메타 수집)에서 받음. UI상 추천카드에서 즉시 confirm 버튼은 없음 (단, 향후 UX 개선으로 추가 가능).

### DraftCard

```ts
interface DraftCardProps {
  draft: {
    category?: string;
    group?: string;
    event?: string;
    headcount?: string;
    purpose?: string;
  };
  suggested: Partial<Record<keyof Draft, boolean>>;  // 어느 필드가 P2 추천으로 채워졌는지
  submitting: boolean;
  onSubmit: () => void;
  onEdit: () => void;     // 단순히 hints 칩을 "행사명을 ...로", "주관단체는 ...로" 등으로 갱신
  superseded?: boolean;   // 이전 draft 카드 (대체됨) — 흐림 처리
}
```

- 5줄 그리드 (80px label / 1fr value):
  - 행사구분 / 주관단체 / 행사명 / 행사인원 / 사용목적
- value:
  - 빈 값 → italic muted "미입력"
  - P2로 채워짐 → ✨ 이모지 + 값
  - 일반 → 그대로 강조 표시
- actions: [GLS 제출] primary, [수정] secondary (수정 누르면 hints만 갱신, 입력은 채팅으로)
- superseded=true → opacity 0.55, 헤더 태그 "교체됨" muted, 본문은 collapse

### NoSpaceCard

```ts
interface NoSpaceCardProps {
  summary?: string;   // "5/21 18:00–20:00, 200명 조건으로 ... 모두 점유 중이었습니다."
}
```

- alert 아이콘 + "조건에 맞는 공간이 없어요" 제목
- summary 본문
- 액션 버튼 없음 — 후속 조정은 hints 칩 + 채팅 입력으로

### GLSLoginCard

```ts
interface GLSLoginCardProps {
  variant: "needed" | "expired";       // 처음 로그인 필요 / 세션 만료
  loggingIn: boolean;                  // 로그인 진행 중 (verifyLogin 대기)
  onOpenLogin: () => void;             // 새 탭에서 GLS 로그인 페이지 열기
}
```

- 헤더 아이콘 18×18 (warning-soft bg, lock 아이콘)
- variant별 카피:
  - `needed` → "GLS 로그인이 필요해요" / "예약은 사용자님의 GLS 계정으로 직접 진행돼요. 새 탭에서 로그인하시면 이어서 진행할게요."
  - `expired` → "GLS 세션이 만료됐어요" / "검증 도중에 GLS 로그인이 풀렸어요. 다시 로그인하시면 멈춘 지점부터 이어서 진행할게요."
- 도메인 칩 (mono, muted bg): `🔒 kingoinfo.skku.edu`
- 액션: 
  - 평상시 [GLS 로그인 열기] / [다시 로그인] primary
  - loggingIn=true → 비활성 "로그인 확인 중…"
- 클릭 시 → `chrome.tabs.create({url: "https://kingoinfo.skku.edu"})` + background SW에서 polling으로 로그인 완료 감지 → completion 시 카드가 자동으로 "로그인 확인 중…" 풀고 채팅 흐름 재개

여러 로그인 카드가 채팅 이력에 누적될 수 있음 — **가장 최근 카드만 활성**, 이전 카드는 그대로 두되 클릭 disabled.

### P2SuggestCard (Phase 2)

```ts
interface P2SuggestCardProps {
  prev: {
    when: string;       // "5/14"
    group: string;      // "SW학생회"
    event: string;      // "운영회의"
    frequencyHint?: string;  // "최근 4회 같은 행사로 신청"
  };
  onAccept: () => void;
  onDecline: () => void;
}
```

P2이므로 channel: D-021 `/parse` 응답에 `application_state.recommendation` 같은 필드가 추가되면 표시. 데이터:

```
{
  "recommendation": {
    "from_conversation_id": "c-002",
    "group": "SW학생회",
    "event": "운영회의",
    "category": "회의/학회",
    "purpose": "소프트웨어학과 학생회 주간 정기 운영회의",
    "confidence": 0.85,           // 표시는 안 하지만 임계값 미만이면 추천 안 함
    "frequency": "4_in_recent_4"  // 표시용 텍스트 키
  }
}
```

UI는 봇 메시지 안에 카드 형태 (`.p2-suggest` 클래스):
- 좌측 ✨ 아이콘 16×16 (accent-soft bg)
- 본문: "지난주(${when})처럼 **${group} ${event}**로 작성할까요?"
- 부가: "최근 4회 같은 행사로 신청"
- 액션: [네, 같게요] primary, [다른 행사예요] secondary

Accept → draft를 prev 정보로 채우고 `suggested = {category: true, group: true, event: true, purpose: true}` 설정.
Decline → 일반 메타 수집 단계로 진입.

---

## ReminderBanner (Phase 3 — 세션 목록 상단)

```ts
interface ReminderBannerProps {
  reminder: {
    title: string;
    pattern: string;
    proposed: {
      date: string;
      time: string;
      space: string;
      group: string;
      event: string;
    };
  };
  onAccept: () => void;
  onDismiss: () => void;
}
```

스타일 상세는 `02-screens.md` 참조. 데이터 소스는 P3 진입 시 신설할 `GET /reminders` 엔드포인트.

---

## SessionList

```ts
interface SessionListProps {
  sessions: ConversationSummary[];
  reminder: ReminderData | null;
  onPick: (s: ConversationSummary) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onAcceptReminder: () => void;
  onDismissReminder: () => void;
}
```

`ConversationSummary` 타입:
```ts
{
  id: string;
  title: string;          // 자동 생성된 제목
  preview: string;        // 마지막 메시지 또는 완료 결과
  when: string;           // "방금 전" / "1주일 전" / "진행 중"
  status: "active" | "completed" | "abandoned_user" | "abandoned_timeout";
}
```

서버 응답을 그대로 매핑. `D-024 GET /conversations`.

---

## Onboarding

```ts
interface OnboardingProps {
  onComplete: () => void;   // chrome.storage.local.set({onboardingComplete: true})
  onSkip: () => void;       // 동일하게 처리하되 통계로 구분 가능
}
```

내부 state: `step: 0 | 1`. 2스텝 자체 관리. 외부 라우팅 불필요.

---

## 컴포넌트 트리

```
App
├── Onboarding             (view === "onboarding")
├── SessionList            (view === "sessions")
│   ├── ReminderBanner?
│   └── SessionItem × N
├── ChatStarter            (view === "chat-start")
│   └── example cards
└── ChatScreen             (view === "chat")
    ├── ChatHeader
    ├── ChatThread
    │   └── ChatMessage | Card | TypingIndicator
    └── ChatFooter
        ├── HintChips?
        └── ChatComposer
```
