# 07. 파일 매핑 — 기존 코드베이스 ↔ 신규

## 기존 `extension/src/popup/` 컴포넌트 처리

기존 popup의 컴포넌트들은 대부분 사이드패널로 그대로 가져갈 수 있지만, 디자인이 크게 바뀌었으므로 **새로 작성**을 권장합니다. 기존 코드는 로직 참고용으로만.

| 기존 파일 | 처리 | 신규 위치 (또는 매핑) |
|---|---|---|
| `popup/index.html` | 삭제 | `sidepanel/index.html` 신규 |
| `popup/main.tsx` | 삭제 | `sidepanel/main.tsx` 신규 |
| `popup/App.tsx` | 참고 후 폐기 | `sidepanel/App.tsx` 신규 |
| `popup/styles.css` | 폐기 | `sidepanel/styles.css` 신규 (`prototype/styles.css` 기준) |
| `popup/components/ChatHistory.tsx` | 참고 후 폐기 | `sidepanel/components/ChatThread.tsx` 신규 |
| `popup/components/ChatInput.tsx` | 참고 후 폐기 | `sidepanel/components/ChatComposer.tsx` 신규 |
| `popup/components/ChatMessage.tsx` | 참고 후 폐기 | `sidepanel/components/ChatMessage.tsx` 신규 |
| `popup/components/ConversationPicker.tsx` | 참고 후 폐기 | `sidepanel/components/SessionList.tsx` 신규 |
| `popup/components/ReservationReviewPanel.tsx` | 참고 후 폐기 | `sidepanel/components/cards/DraftCard.tsx` 신규 |
| `popup/hooks/useConversation.ts` | **유지 + 확장** | `sidepanel/hooks/useConversation.ts` — `/parse`, history sync 등 로직 재사용 |

## 신규 파일

`extension/src/sidepanel/` 아래:

```
sidepanel/
├── index.html
├── main.tsx
├── App.tsx                       — view 라우팅 (onboarding/sessions/chat-start/chat), 글로벌 state
├── styles.css                    — prototype/styles.css 를 가져와서 React 환경에 맞게 정리
│
├── components/
│   ├── ChatHeader.tsx
│   ├── ChatThread.tsx
│   ├── ChatComposer.tsx
│   ├── HintChips.tsx
│   ├── TypingIndicator.tsx
│   ├── ChatMessage.tsx           — 사용자/봇 말풍선
│   ├── Onboarding.tsx
│   ├── SessionList.tsx
│   ├── SessionItem.tsx
│   ├── ReminderBanner.tsx        — P3 (구현 시)
│   ├── ChatStarter.tsx           — 빈 채팅 + 예시 카드
│   └── cards/
│       ├── SearchProgressCard.tsx
│       ├── RecommendationCard.tsx
│       ├── DraftCard.tsx
│       ├── NoSpaceCard.tsx
│       ├── GLSLoginCard.tsx
│       ├── SubmitProgressCard.tsx
│       └── P2SuggestCard.tsx     — P2 (구현 시)
│
├── hooks/
│   ├── useConversation.ts        — 기존 hook 확장
│   ├── useChatStateMachine.ts    — 신규: phase, slots, draft, message dispatch
│   ├── useGLSStatusSync.ts       — 신규: background로부터 BG_SEARCH_PROGRESS 등 수신
│   └── useReminder.ts            — 신규 (P3): GET /reminders
│
├── icons.tsx                     — Lucide 래퍼 또는 인라인 SVG
└── utils/
    ├── phaseHints.ts             — phase별 hint 칩 매핑
    ├── phaseLabels.ts            — phase별 한국어 라벨
    └── parseModification.ts      — 클라이언트 측 메타 수정 파싱 (LLM fallback)
```

## 기존 코드 그대로 활용

다음은 변경 없이 유지:

| 디렉터리 | 비고 |
|---|---|
| `extension/src/background/` | `serviceWorker.ts`에 사이드패널 메시지 핸들러 추가 (D-026 메시지 타입 확장) |
| `extension/src/content/` | 변경 없음 |
| `extension/src/shared/` | `messages.ts`에 신규 메시지 타입 추가 (06-mock-vs-real.md 참조) |
| `shared/gls/` | 변경 없음 |
| `server/` | P1 범위는 기존 API 그대로. P3에서 `/reminders` 신설 |

## manifest.json

`01-architecture-change.md` 참조. 핵심:
- `side_panel.default_path` 추가
- `permissions`에 `"sidePanel"` 추가
- `action.default_popup` 제거 (또는 popup도 유지하려면 그대로)

## 패키지 의존성

기존 의존성으로 충분. 추가 옵션:
- `lucide-react` — 아이콘 (인라인 SVG 대신)
- `dayjs` 또는 `date-fns` — "방금 전", "3일 전" 같은 상대시간 렌더링

react/react-dom는 이미 있을 것 (확장 popup이 React로 짜여있으므로).

## CSS 처리

`prototype/styles.css`를 그대로 가져가되:
1. `body`, `html`에 적용된 글로벌 스타일은 `sidepanel/index.html` 안에서만 유효하도록 scope 조정
2. 프로토타입의 `.stage`, `.chrome-window`, `.chrome-titlebar`, `.chrome-addrbar`, `.gls-*`, `.sidepanel-chrome`, `.os-notif`, `.gls-login-overlay`, `.login-modal*` 클래스는 **모두 제거** — 데모용 합성 뷰일 뿐, 실제 사이드패널에서는 불필요
3. `.popup`, `.popup-head`, `.popup-body`, `.popup-foot` → 사이드패널 루트로 의미 변경. 그림자/둥근모서리 제거 (Chrome이 그림자 그림)

**필요한 클래스만 추리면:**
- `.popup-head`, `.popup-title`, `.icon-btn`, `.popup-body`, `.popup-foot`
- `.thread`, `.msg`, `.bubble`, `.typing`, `.d`
- `.composer`, `.composer-hints`, `.hint-chip`, `.send-btn`
- `.card`, `.card-head`, `.card-body`, `.card-actions`, `.title`, `.tag`
- `.rec-space`, `.ph`, `.rec-meta`, `.dept-warn`
- `.draft-list`, `.draft-row`
- `.search-progress`, `.search-list`, `.search-item`, `.marker`, `.progress-bar`, `.fill`
- `.btn`, 변형 (`.primary`, `.ghost`, `.danger`, `.small`)
- `.onboard*`
- `.sessions-list`, `.session-item`, `.status-pill`, `.sessions-divider`
- `.reminder-banner`, `.pattern-pill`
- `.gls-login-card`, `.login-icon`, `.login-body`, `.login-domain`
- `.p2-suggest`, `.icon`, `.content`, `.src`, `.actions`
- `.example-list`, `.example-item`
- 토큰 (`:root` 블록)

CSS 모듈 또는 styled-components 변환은 팀 선호에 맞춰. 가장 빠른 길은 그냥 `styles.css` 하나로 두고 className 사용.

## 단계별 구현 순서 (제안)

1. **Phase 0: 마이그레이션 (0.5일)**
   - manifest 갱신, sidepanel/ 디렉터리 생성, 빌드 동작 확인
   - 빈 사이드패널이 열리는지

2. **Phase 1a: 정적 UI (1일)**
   - 디자인 토큰 styles.css 가져오기
   - Onboarding, SessionList (mock data), ChatStarter, ChatThread (mock messages) 모두 정적으로 렌더
   - 화면 전환만 작동 (view state)

3. **Phase 1b: 채팅 머신 + 서버 연결 (2일)**
   - `useChatStateMachine` 구현
   - `/parse` 연결, 슬롯필링 분기 동작
   - 메시지 mirror (`/conversations/:id`)
   - `/spaces` 후보 조회 → background `START_SEARCH` 메시지 → SearchProgressCard 동기화

4. **Phase 1c: GLS 자동화 통합 (2일)**
   - background ↔ content script 메시지 라우팅 정리
   - 검증 결과 받아 RecommendationCard 렌더
   - 신청 메타 수집 → DraftCard
   - 제출 → SubmitProgressCard → 완료 통지

5. **Phase 1d: 분기 (1일)**
   - GLSLoginCard (needed + expired)
   - NoSpaceCard + 재시도
   - 메타 수정 명령
   - 대안 요청

6. **Phase 2: P2 인라인 추천 (0.5일)**
   - `/parse` 응답의 `application_state.recommendation` 처리
   - P2SuggestCard 렌더링

7. **Phase 3: 패턴 리마인드 (1일)**
   - 서버 `/reminders` 엔드포인트 신설
   - 패턴 분석 로직 (sql cron 또는 lazy)
   - ReminderBanner 표시 + accept/dismiss

총 **~8일** 예상 (1인 기준).
