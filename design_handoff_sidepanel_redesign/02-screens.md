# 02. 화면 스펙

사이드패널 컨테이너는 폭 **400px** (Chrome이 조절 가능, 360~480px 범위 대응). 모든 화면은 다음 셸 안에 들어갑니다:

```
┌─────────────────────────────────────┐
│ Sidepanel chrome bar (32px)         │ ← Chrome이 그려주는 부분이지만,
│ [SK] SKKU 예약 봇 ▾   [⚙][×]        │   디자인 일관성을 위해 우리도 동일한 룩으로 그림
├─────────────────────────────────────┤
│ Popup header (48px)                 │
│ [☰] [SK] 제목                  [+]  │
├─────────────────────────────────────┤
│                                     │
│ Screen body (스크롤 영역)            │
│                                     │
├─────────────────────────────────────┤
│ Footer (조건부)                      │
│   - 채팅 화면일 때만: 힌트 칩 + 입력  │
└─────────────────────────────────────┘
```

3개 메인 화면이 있고 각 화면이 popup header + body 영역을 다르게 채웁니다:

- 온보딩 (`view: "onboarding"`)
- 세션 목록 (`view: "sessions"`)
- 채팅 (`view: "chat"` — 채팅 머신 phase에 따라 컨텐츠가 변함)

`view` 상태는 App.tsx의 useState로 관리. URL 기반 라우팅 불필요.

---

## 화면 1 — 온보딩

**언제**: 확장 최초 설치 직후 1회. `chrome.storage.local`의 `onboardingComplete` flag로 판단.

**스텝 수**: 2개 (점 인디케이터로 표시)

### 스텝 0 — 환영

- 히어로: 동심원 3개 (점선, accent 컬러) 위에 64×64 둥근 정사각형, "SKKU" 텍스트
  - 점선원: 130/180/230px 지름, `border: 1px dashed oklch(0.55 0.12 264 / 0.4)`
  - 글리프: `background: var(--accent)`, `border-radius: 16px`, `font-family: JetBrains Mono`, `font-weight: 700`, `font-size: 22px`, `color: white`, `box-shadow: 0 12px 24px oklch(0.55 0.12 264 / 0.3)`
- H1: "공간예약, 채팅 한 번이면 끝나요"
- 본문: "건물별로 시간표 열어보지 마세요. \"다음 주 화요일 6시 20명 회의실\" 한마디면 빈 공간 찾고 신청서까지 자동으로 채워드려요."
- CTA: [다음]

### 스텝 1 — 사용 예시

- 히어로 없음
- H1: "이렇게 말해보세요"
- 본문: "정확히 안 적어도 돼요. 누락된 정보는 에이전트가 다시 물어봐요."
- 예시 카드 4개 (큰따옴표가 left:-2px top:0 절대 위치한 Georgia serif 24px):
  - "내일 6시 20명 학생회 회의"
  - "다음 주 화요일 14시부터 2시간"
  - "5/27 오후 3시 50명 행사장"
  - "이번 주 금요일 빈 회의실"
- CTA: [시작하기]

### 공통

- 상단: 진행 점 (4px 높이, 활성은 28px 폭 accent 컬러, 비활성은 18px 폭 회색)
- 우상단: [건너뛰기] ghost 버튼
- 하단 풋: 스텝 0~1 전이 시 [←] 뒤로 + [CTA] 가로 배치

상세 스타일은 `prototype/styles.css`의 `.onboard*` 클래스 참조.

---

## 화면 2 — 세션 목록

**언제**: 온보딩 완료 후, 또는 채팅 화면에서 헤더 [☰] 클릭 시.

### 구조

```
[Popup header: SK SKKU 예약 봇 .... +]
[reminder banner (있을 때)]
[divider "진행 중 · 완료된 대화"]
[session item × N (최대 10)]
```

### Reminder Banner (P3 — 패턴 리마인드)

> P3 기능. UI는 P1 단계에서 만들되 데이터는 placeholder. 서버에서 패턴 분석 응답이 들어오면 활성화.

- 배경: `linear-gradient(135deg, var(--accent-soft), var(--bg))` + `radial-gradient` 오버레이
- 테두리: `1px solid var(--accent)`
- 라벨 (작은 글씨 uppercase): "✨ 패턴 알림 · Phase 3"
- 제목: "다음 주 화요일도 학생회 운영회의 예약하시겠어요?"
- 메타 (mono): "최근 4주 연속 매주 화요일 18:00–20:00 SW학생회 회의"
- 칩 3개 (mono, pill, 1px border): `📅 2026-05-26 (화)`, `🕒 18:00–20:00`, `🏢 학생회관 401호`
- 액션: [네, 예약할게요] primary, [나중에] secondary
- "네" 누르면 → 새 채팅 세션 생성 + 미리 채워진 슬롯으로 P1 플로우 시작
- "나중에" → 배너 dismiss (서버에 dismissed 기록)

데이터 소스(P3 구현 시): `GET /reminders` (신설) — `{ pattern, proposed: {date, time, space, group, event} }` 또는 `null`.

### Session Item

```
[●] 제목 ........................ 시간
    프리뷰 한 줄
                                    [⋮]
```

- 좌측 status dot (6×6 원):
  - `completed` → 초록 `var(--success)`
  - `active` → 파랑 `var(--accent)` + `pulse` 애니메이션 (1.6s infinite)
  - `abandoned_user` / `abandoned_timeout` → `var(--text-faint)` (회색)
- 제목 (13px, weight 500): 한 줄, ellipsis. D-024 `GET /conversations` 응답에서 첫 슬롯이 채워진 시점의 자연어 요약 (예: "5/21 학생회 운영회의").
- 시간 (10.5px mono, faint): 상대시간 ("방금 전", "6일 전", "진행 중")
- 프리뷰 (11.5px muted): 마지막 봇 메시지 또는 완료 시 결과 요약 ("예약 완료 · 학생회관 401호")
- hover 시 우측에 [🗑️] 메뉴 노출, 클릭 시 → 1.5초간 [✓] 표시 후 삭제 확정 (낙관적 UI)
- 호버: 행 전체 `background: var(--bg-muted)`
- 행 클릭 → 채팅 화면으로 전환하며 이력 복원

### API 매핑

- 진입 시 `GET /conversations` 호출 (`X-Client-Id` 헤더) → `deletedAt IS NULL`인 최근 10개
- 삭제: `DELETE /conversations/:id` (논리 삭제)
- 새 대화 [+] → `chat-start` 화면 (예시 칩과 빈 컴포저)

상세 스타일: `.sessions-list`, `.session-item`, `.reminder-banner` in `prototype/styles.css`.

---

## 화면 3 — 채팅

### 헤더

```
[☰] [SK] 5/21 학생회 운영회의 · 탐색 중            [+]
```

- 좌측 [☰] → 세션 목록으로 복귀
- [SK] 글리프 (22×22, accent bg, mono bold)
- 제목: 슬롯이 채워지면 자동 생성 (예: `{date} {event}`). 슬롯 비어있으면 "새 대화"
- 부제목 (faint, "· phase 라벨"): 현재 phase의 한국어 라벨 — `phaseLabel()` 함수 참조

### 본문 — Thread

- padding 16/14/8/14
- gap 10px
- `align-items: flex-start` (사용자 메시지는 본인 `align-self: flex-end`로 우측)
- 메시지 종류:
  - 사용자 말풍선 (user bubble — accent 배경, white text)
  - 봇 말풍선 (bot bubble — muted bg)
  - 타이핑 인디케이터 (3개 dots, 각 6×6, 0.15s씩 지연된 bounce)
  - 카드 (`align-self: stretch`, 전폭 사용) — 추천/초안/검색진행/실패/로그인/P2 제안

### 풋터 — Composer

- 힌트 칩 (조건부, 6~8px gap, wrap, pill 모양 — 칩 클릭 = 그 텍스트로 사용자 메시지 전송)
- 컴포저 (배경 subtle, 포커스 시 강조):
  - textarea (auto-grow 22~90px)
  - 전송 버튼 30×30 (accent bg, white send icon, 비활성 시 muted)
  - Enter = 전송, Shift+Enter = 줄바꿈

### Composer disabled 조건

다음 phase일 때 입력 disable:
- `searching` (GLS 탭에서 검증 중)
- `submitting` (제출 진행 중)
- `awaiting-login` / `awaiting-relogin` (사용자가 로그인 버튼 누르고 GLS 탭에서 로그인 완료할 때까지)

상세 phase 머신: `05-state-machine.md`

---

## 모달/오버레이

채팅 내부에서 모달은 사용하지 않습니다. 모든 인터랙션은:
- 채팅 카드 안의 액션 버튼
- 힌트 칩
- 채팅 입력
- 또는 별도 화면(세션 목록 등)으로 전환

예외: **GLS 로그인 오버레이는 사이드패널이 아니라 왼쪽 GLS 페이지 위에 모달처럼 표시**됩니다. 이건 실제 구현에서는 사용자가 직접 GLS 탭에서 로그인하므로 우리가 만들 필요 없음 — 프로토타입에서는 시연용으로만 그린 것.
