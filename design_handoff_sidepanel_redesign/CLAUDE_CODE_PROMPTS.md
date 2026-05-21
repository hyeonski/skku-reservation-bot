# Claude Code 시작 프롬프트

각 phase별로 복붙해서 쓰세요. Claude Code 세션 하나당 한 phase씩 권장 (컨텍스트 깨끗하게 유지).

작업 디렉터리는 `skku-reservation-bot/` 루트라고 가정. 핸드오프 폴더는 `design_handoff_sidepanel_redesign/`에 있다고 가정.

---

## 0. 전체 컨텍스트 잡기 (모든 phase 시작 전 공통)

```
이 프로젝트는 성균관대학교 GLS 공간예약을 자동화하는 크롬 확장입니다.
기존 코드베이스는 extension/ (Vite + @crxjs + React 18 + TS, MV3) 와 server/ (Fastify + Prisma + MySQL) 로 구성되어 있습니다.

새로운 사이드패널 UI 디자인을 핸드오프 받았습니다. 먼저 다음을 읽어주세요:
- design_handoff_sidepanel_redesign/README.md (개요)
- design_handoff_sidepanel_redesign/01-architecture-change.md ~ 07-file-mapping.md (모든 사양 문서)
- design_handoff_sidepanel_redesign/prototype/ (HTML 프로토타입 — 픽셀 단위 참조용)
- docs/PRD.md, docs/DECISIONS.md (배경)

읽고 나서, 핸드오프 패키지가 기존 코드베이스와 충돌하는 부분이나 모호한 부분이 있으면 먼저 질문해주세요. 명확하면 다음 phase 진행 지시를 기다려주세요.
```

---

## Phase 0 — 사이드패널 마이그레이션 (0.5일)

```
design_handoff_sidepanel_redesign/01-architecture-change.md 의 가이드에 따라 popup → 사이드패널 마이그레이션을 수행해주세요.

작업 범위:
1. extension/manifest.json 갱신 — side_panel 추가, permissions에 sidePanel 추가, action.default_popup 제거
2. extension/src/sidepanel/ 디렉터리 생성 (index.html, main.tsx, App.tsx — 일단 "사이드패널 동작 확인" 정도의 더미 컨텐츠)
3. extension/src/background/serviceWorker.ts 에 chrome.sidePanel.setPanelBehavior 추가
4. extension/src/popup/ 디렉터리는 일단 그대로 두되, 빌드에서 제외되도록 manifest entry만 제거 (다음 phase에서 본격 삭제)

빌드(pnpm build) 통과 + chrome://extensions 에서 reload 후 액션 아이콘 클릭 시 사이드패널이 열리는지 확인하고 끝내주세요. TypeScript 타입 에러 없어야 합니다.
```

---

## Phase 1a — 정적 UI (1일)

```
사이드패널 UI를 정적으로 구현합니다. 데이터는 모두 mock, 상호작용은 화면 전환만 동작.

읽을 문서:
- design_handoff_sidepanel_redesign/02-screens.md
- design_handoff_sidepanel_redesign/03-design-tokens.md
- design_handoff_sidepanel_redesign/04-components.md
- design_handoff_sidepanel_redesign/07-file-mapping.md

작업 범위:
1. extension/src/sidepanel/styles.css 작성 — design_handoff_sidepanel_redesign/prototype/styles.css 의 토큰과 클래스를 가져오되, 07-file-mapping.md "CSS 처리" 섹션에 명시된 클래스만 추리기 (.stage, .chrome-window 등 데모용은 빼기)
2. extension/src/sidepanel/components/ 아래 다음 컴포넌트 생성 (모두 props 받아서 정적 렌더):
   - ChatHeader, ChatThread, ChatComposer, HintChips, TypingIndicator, ChatMessage
   - Onboarding (2스텝, useState로 step 관리)
   - SessionList, SessionItem
   - ReminderBanner (P3 placeholder — props로 데이터 받음, 데이터 없으면 null)
   - ChatStarter
   - cards/ 폴더에 SearchProgressCard, RecommendationCard, DraftCard, NoSpaceCard, GLSLoginCard, SubmitProgressCard, P2SuggestCard
3. extension/src/sidepanel/App.tsx — view 라우팅 ("onboarding" | "sessions" | "chat-start" | "chat"). 일단 mock data로 모든 화면에 들어가볼 수 있게 navigate
4. 아이콘은 일단 인라인 SVG로 (design_handoff_sidepanel_redesign/prototype/ui.jsx 의 Icon 컴포넌트 참고). 나중에 lucide-react로 교체할 수 있게 추상화
5. extension/src/popup/ 디렉터리 완전 삭제

성공 기준:
- 빌드 통과 + 사이드패널 열어서 모든 화면(온보딩 2스텝, 세션 목록, 채팅 시작, 채팅 thread mock)을 클릭으로 탐색 가능
- 디자인 토큰 (색·타입·간격) 이 prototype과 동일하게 보임
- TypeScript 타입 에러 0개

데이터는 모두 mock이므로 실제 API 호출 없음. 진행 후 스크린샷이나 동작 영상으로 검토 받기 위해 의도된 phase별 화면 상태를 어떻게 점프해서 볼 수 있는지 README 같은 곳에 메모해주세요.
```

---

## Phase 1b — 채팅 머신 + 서버 연결 (2일)

```
정적으로 만든 채팅 UI에 실제 상태 머신과 서버 연결을 붙입니다.

읽을 문서:
- design_handoff_sidepanel_redesign/05-state-machine.md (가장 중요)
- design_handoff_sidepanel_redesign/06-mock-vs-real.md
- docs/DECISIONS.md 의 D-018, D-021, D-024

작업 범위:
1. extension/src/sidepanel/hooks/useChatStateMachine.ts 신규
   - 05-state-machine.md 의 phase enum + 전이 그래프 그대로 구현
   - 사용자 메시지 송신 시 POST /parse 호출 (X-Client-Id 헤더 포함)
   - 응답의 filled_slots, missing_required, intent, assistant_message, ready_to_search 처리
   - history는 클라이언트 권위 (D-018)
2. 메시지마다 POST /conversations/:id (mirror) 호출
3. phase에 따라 ChatHeader.sessionLabel, ChatComposer.placeholder, HintChips 갱신
4. extension/src/background/apiClient.ts 의 기존 함수 재사용. 없는 함수는 추가
5. 세션 목록 (SessionList) — 진입 시 GET /conversations 호출, 응답을 ConversationSummary[] 로 매핑
6. 세션 삭제 — DELETE /conversations/:id (낙관적 UI)
7. 신규 대화 시작 — 클라이언트가 UUID 발급, 첫 메시지 송신 시점에 자동으로 conversations 테이블에 row 생성됨

GLS 자동화는 아직 mock. SearchProgressCard, RecommendationCard 등은 데이터만 들어오면 표시되도록 두되, 실제 GLS 호출은 다음 phase에서.

성공 기준:
- "내일 6시 20명 학생회 회의" 입력 시 슬롯이 추출되어 헤더에 반영되고, 누락 슬롯이 있으면 봇이 되묻기
- 슬롯 충족 후 "탐색 중" 상태로 진입 (mock SearchProgressCard 표시)
- 세션 목록에서 진입/삭제/새 대화 동작
- TypeScript 타입 에러 0개
```

---

## Phase 1c — GLS 자동화 통합 (2일)

```
사이드패널의 채팅 머신을 실제 GLS 자동화와 연결합니다.

읽을 문서:
- design_handoff_sidepanel_redesign/05-state-machine.md 의 "GLS 자동화 상태와의 동기화"
- design_handoff_sidepanel_redesign/06-mock-vs-real.md 의 항목 3, 4, 5, 7
- docs/DECISIONS.md D-010, D-026, D-027
- docs/GLS_DOM_NOTES.md
- 기존 extension/src/background/glsCoordinator.ts, extension/src/content/glsAgent.ts, formFiller.ts

작업 범위:
1. extension/src/shared/messages.ts 에 신규 메시지 타입 추가 (06-mock-vs-real.md 끝부분 표 참조)
2. background/glsCoordinator.ts — 사이드패널로부터 START_SEARCH 받으면:
   - GET /spaces 로 후보 받음
   - 후보를 직렬로 content script로 BG_CHECK_AVAILABILITY 송신
   - 각 결과를 BG_SEARCH_PROGRESS 로 사이드패널에 broadcast
3. 사이드패널은 BG_SEARCH_PROGRESS 받아 SearchProgressCard 의 currentIdx/candidates 업데이트
4. 가용 공간 찾으면 RecommendationCard 렌더
5. 사용자가 신청 메타 채팅으로 입력 → DraftCard 표시 → "제출" 시 BG_SUBMIT_RESERVATION
6. background는 content script로 submission 진행, 진행 상태를 BG_SUBMIT_STATUS 로 broadcast (filling → saving → saved)
7. 완료 시 chrome.notifications + 사이드패널에 BG_RESERVATION_DONE → 채팅 phase = "done"

성공 기준:
- 실제 GLS 탭에서 후보 검증 → 추천 → 폼 자동 작성 → 저장까지 end-to-end 동작
- 검증 진행 상태가 사이드패널 SearchProgressCard 에 실시간으로 반영
- 완료 알림 노출
```

---

## Phase 1d — 분기 시나리오 (1일)

```
P1의 마지막 — 다음 분기들을 구현합니다.

읽을 문서:
- design_handoff_sidepanel_redesign/05-state-machine.md 의 메시지 시퀀스 (GLS 로그인, 세션 만료, 실패 재시도, 메타 수정)
- design_handoff_sidepanel_redesign/06-mock-vs-real.md 의 항목 4, 5

작업 범위:
1. GLS 로그인 필요 시퀀스:
   - background SW가 검증 시작 전 세션 체크
   - 미로그인 시 LOGIN_NEEDED 송신 → 사이드패널이 GLSLoginCard variant="needed" 렌더, phase = awaiting-login
   - 사용자가 카드의 [GLS 로그인 열기] 클릭 → chrome.tabs.create로 GLS 페이지 열기
   - background는 해당 탭의 URL 변경 listen, kingoinfo.skku.edu 로 돌아오면 LOGIN_COMPLETE 송신
   - 사이드패널은 LOGIN_COMPLETE 받아 검증 재개

2. 세션 만료 시퀀스:
   - 검증 도중 content script가 login.skku 리다이렉트 감지하면 SESSION_EXPIRED + resumeIdx 송신
   - 사이드패널이 GLSLoginCard variant="expired" 렌더, phase = awaiting-relogin
   - 로그인 완료 후 iterateSearch(resumeIdx) 부터 재개

3. 후보 없음 → 재시도 시퀀스:
   - 모든 후보 점유 → NoSpaceCard 렌더, phase = failed-retry
   - hint 칩과 사용자 입력에서 slots.count, slots.start/end, slots.date 조정 추출
   - retrySearch 호출 (새 SearchProgressCard 생성, 이전은 frozen)

4. 메타 수정:
   - draft phase에서 "행사명을 X로", "주관단체는 Y로" 등 입력 시
   - LLM /parse 응답의 intent가 "modify_slot" 일 때 draft 필드 업데이트
   - 클라이언트 fallback 정규식은 utils/parseModification.ts (prototype/app.jsx의 parseModification 참고)
   - 업데이트 후 새 DraftCard 렌더, 이전 카드는 superseded=true 흐리게 표시

5. 대안 요청 ("다른 공간 찾기" 또는 "다른 곳"):
   - 추천 카드 또는 draft phase에서 가능
   - 현재 RecommendationCard 의 onAlternative 핸들러 또는 채팅 명령에서 트리거
   - background로 BG_FIND_ALTERNATIVE 송신, 현재 후보 제외하고 다음 가용 공간 검색

성공 기준:
- 위 4가지 분기 모두 시각적으로 자연스럽게 처리됨
- 로그인 필요/만료 시 사용자가 헷갈리지 않음 (카드 안에 명확한 안내 + 액션)
- 재시도 후에도 정상 flow 로 복귀 가능
```

---

## Phase 2 — 인라인 추천 (0.5일)

```
완료된 과거 대화를 기반으로 채팅 안에서 "지난번처럼 X로 작성할까요?" 인라인 추천을 표시합니다.

읽을 문서:
- design_handoff_sidepanel_redesign/04-components.md 의 P2SuggestCard 섹션
- design_handoff_sidepanel_redesign/06-mock-vs-real.md 의 항목 6
- docs/DECISIONS.md D-013 의 "신청 메타 수집" 섹션

서버 작업:
1. server/src/routes/parse.ts — /parse 응답에 application_state.recommendation 필드 추가
2. 응답 생성 로직:
   - 사용자(client_id)의 deletedAt IS NULL & status = completed 대화 중
   - 최근 N개(=4)에서 lastFilledSlots + draft 정보 분석
   - 동일한 group + event 조합이 임계값(3회 이상) 등장하면 추천 후보로 구성
   - confidence 점수 + frequency 텍스트 키 함께 반환
   - 임계값 미만이면 recommendation = null

클라이언트 작업:
3. ChatStateMachine 에서 phase = "recommended" 진입 시점에 응답에 recommendation 있으면:
   - phase = "meta-p2" 로 전환
   - P2SuggestCard 메시지 추가
4. accept → draft 채우고 suggested 플래그 설정, phase = "draft"
5. decline → phase = "meta-collect"

성공 기준:
- 같은 단체로 3번 이상 예약한 사용자가 새 예약 시 카드가 등장
- accept 시 DraftCard 의 해당 필드들이 ✨ 표시와 함께 채워짐
```

---

## Phase 3 — 패턴 리마인드 (1일)

```
사용자의 정기적인 예약 패턴을 감지해서 세션 목록 상단에 배너로 노출합니다. 정기예약 자동 등록이 아니라, **리마인드**입니다.

읽을 문서:
- design_handoff_sidepanel_redesign/04-components.md 의 ReminderBanner 섹션
- design_handoff_sidepanel_redesign/02-screens.md 의 "Reminder Banner (P3)" 섹션
- design_handoff_sidepanel_redesign/06-mock-vs-real.md 의 항목 8

서버 작업:
1. server/prisma/schema.prisma — Reminder 모델 추가:
   - id, clientId, patternText, proposedDate, proposedStart, proposedEnd, proposedSpaceCode, proposedGroup, proposedEvent
   - status enum: active | dismissed | accepted
   - detectedAt, dismissedAt
2. 패턴 감지 cron 또는 lazy 함수:
   - 완료 대화의 lastFilledSlots + draft 정보 모으기
   - 같은 요일 + 같은 시작시간 + 같은 단체 + 같은 행사 = 3회 이상 연속 패턴
   - 다음 발생 예상일(다음 같은 요일)에 해당 사용자의 다른 active/completed reservation 없을 때
   - 임계값 충족 시 Reminder 생성
3. routes:
   - GET /reminders → 현재 사용자의 active 리마인드 (최대 1개)
   - POST /reminders/:id/dismiss → status = dismissed
   - POST /reminders/:id/accept → status = accepted (실제 예약 시작은 클라이언트가 별도로)

클라이언트 작업:
4. extension/src/sidepanel/hooks/useReminder.ts — SessionList 진입 시 GET /reminders 호출
5. SessionList 상단에 ReminderBanner 렌더 (데이터 있을 때만)
6. "네 예약할게요" → 새 대화 시작 + initialPrompt 으로 미리 채워진 슬롯 전달 + 곧바로 메타 P2 추천 같은 형태로 진행
7. "나중에" → POST /reminders/:id/dismiss, 배너 사라짐

성공 기준:
- 동일 패턴 3회 이상 완료한 사용자가 다음 같은 요일 임박 시 배너 노출
- accept 시 자동으로 채팅 진입 + 슬롯 미리 채워짐
- dismiss 시 다음번 진입 때 배너 다시 안 뜸
```

---

## Phase 별 마무리 공통

각 phase 종료 시 Claude Code에게 추가로 시키면 좋은 것:

```
- pnpm exec tsc --noEmit 통과 확인
- pnpm build 통과 확인
- chrome://extensions 에서 reload 후 수동 동작 확인 (어떤 시나리오를 점검했는지 보고)
- 이번 phase에서 추가된 README 메모 (문제점, 추후 개선 아이디어, 알려진 제약)
```

## 추가 팁

- **Phase 0 → 1a는 한 세션에서 같이 가능** — 둘 다 정적 작업이라 컨텍스트 공유 이득.
- **Phase 1b, 1c, 1d는 별도 세션 권장** — 각각 외부 시스템(서버/GLS) 연결이 들어가서 컨텍스트가 커짐.
- 막히는 부분 있으면 디자인 충돌인지 사양 모호함인지 구분해서 알려달라고 해주세요.
- prototype/index.html 을 직접 열어서 의도된 동작을 보여주는 게 가장 빠른 디버깅 방법.
