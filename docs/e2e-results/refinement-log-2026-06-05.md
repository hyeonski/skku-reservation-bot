# SKKU 공간예약 에이전트 E2E Refinement 중간 로그 - 2026-06-05

## 운영 원칙

- Primary E2E 실행 및 PASS/FAIL 판정은 실제 macOS Chrome UI + Computer Use 관찰 기준으로만 수행했다.
- Playwright, Browser MCP, Chrome remote debugging, 내부 API/DB 직접 조회는 빌드/로그/DB 상태 확인 등 보조 증거로만 사용했다.
- 보고서와 커밋에는 GLS 계정, 학번, 이름, 전화번호, 비밀번호를 기록하지 않는다.
- 실제 저장/예약신청은 2주 이후 날짜 guard를 만족하는 검증 케이스에서만 수행했고, 그 외 저장 버튼이 보인 경우에는 클릭하지 않았다.

## 사전 체크

- 테스트 문서 확인: `docs/E2E_TEST_CASES.md`
  - 문서 기준 전체 UC: 142개.
  - Safety: 23개.
- Git status 시작 시점: 기존 untracked 보고서 2개만 존재.
- Extension build: PASS (`pnpm build` in `extension`).
- Server build: PASS (`pnpm build` in `server`).
- Prisma migration status: PASS, database schema is up to date.
- E2E fixture seed: PASS (`pnpm seed:e2e-spaces`, 7개 `Codex E2E` 공간 fixture).
- Server verification: PASS (`pnpm verify`).
- Server startup: PASS, `pnpm dev` running on `localhost:8000`.
- Health check: PASS, `GET /health` returned `{"ok":true}`.
- Screenshot directory: `/private/tmp/skku-reservation-e2e/2026-06-05/`.

## Chrome / Computer Use 상태

- Chrome 앱 실행 확인: PASS.
- `chrome://extensions` 실제 UI 확인: PASS.
- `SKKU 공간예약 에이전트` unpacked extension 로드 확인: PASS.
- Developer mode: ON.
- Toolbar pin: ON.
- Extension reload: PASS, 실제 Chrome UI의 reload 버튼 클릭 후 `새로고침 완료` 문구 확인.
- Side panel open: PASS, toolbar의 `SKKU 공간예약` 버튼 클릭으로 실제 side panel 열림.

## DB 테스트 데이터 조작 내역

| Time | Action | Data | 개인정보 | 영향 UC |
| --- | --- | --- | --- | --- |
| 2026-06-05 | `pnpm seed:e2e-spaces` | 7개 `Codex E2E` 공간 fixture 생성/수정 | 없음 | 후보 조회, 특정 공간, 공간코드, 개인화/추천, 정기 알림 |
| 2026-06-05 | 보조 DB 조회 via Prisma | 현재 테스트 클라이언트의 `rejected_candidate` fixture 확인: 2026-06-25 19:00 기준 테스트 공간 3건, 2026-08-28 18:00 기준 400126 1건. 생성/수정/삭제 없음 | 없음 | UC-139, UC-140, UC-141, UC-142 |
| 2026-06-05 | SQL upsert via Prisma | `Codex E2E 무공간 반복 회의` active reminder 1건 생성/갱신. `spaceLabel=null`, `spaceCode=null`, 실제 GLS 예약 아님 | 없음 | UC-145 |

- 기존 사용자 데이터 삭제 없음.
- destructive DB 작업 없음.
- schema/migration 변경 없음.
- UC-136 무이력 후보 선정을 위해 보조 DB 조회로 `32425D`, `50304`에 확인된 `confirmed_space_code` 이력이 없음을 확인했다. 데이터 생성/수정/삭제는 하지 않았고, PASS 판정에는 실제 Chrome UI 관찰만 사용했다.
- UC-139~142 거절 피드백 조건 선정을 위해 보조 DB 조회로 현재 테스트 클라이언트의 `rejected_candidate` 이벤트를 확인했다. 이는 fixture 선정 용도이며, PASS/PARTIAL 판정은 실제 Chrome side panel 후보 순서와 버튼 상태 관찰만 사용했다.
- UC-145 무공간 반복 알림 조건 생성을 위해 테스트 전용 reminder 1건을 upsert했다. 기존 사용자 데이터 삭제나 destructive 작업은 없고, PASS 판정은 실제 Chrome side panel 알림 카드 문구만 사용했다.

## Computer Use Evidence

| Screenshot | Notes |
| --- | --- |
| `00-extension-reloaded.png` | 확장 reload 완료. |
| `01-sidepanel-open-recent-list.png` | side panel 최근 대화 목록 표시. |
| `02-uc01-uc04-new-chat-starter-visible.png` | 새 대화 화면, 앱 목적/예시/입력창 표시. |
| `03-uc04-example-search-progress.png` | 예시 클릭 후 탐색 진행. |
| `04-gls-relogin-resume-pii-local-only.png` | GLS 재로그인 후 이어서 진행. 로컬 전용 PII 화면. |
| `05-gls-form-visible-during-search-pii-local-only.png` | GLS 신청서 화면이 열렸으나 저장하지 않음. 로컬 전용 PII 화면. |
| `06-recommendation-draft-save-visible-not-clicked-pii-local-only.png` | 추천/초안/저장 버튼이 보였으나 클릭하지 않음. 로컬 전용 PII 화면. |
| `07-cancelled-no-save-pii-local-only.png` | 채팅 `취소` 후 진행 중단, 저장 없음. 로컬 전용 PII 화면. |
| `08-out-of-scope-boundary-no-automation-pii-local-only.png` | 잡담 입력에 예약 도메인 안내, GLS 자동화 없음. 로컬 전용 PII 화면. |
| `09-uc122-postfix-login-needed-no-tab-switch.png` | UC-122 수정 후 로그인 필요 카드 표시, 확장 탭 selected 유지. |
| `10-login-button-resumes-search-pii-local-only.png` | 사용자가 명시적으로 로그인 버튼을 누른 뒤 GLS 로그인 탭 활성화 및 탐색 재개. 로컬 전용 PII 화면. |
| `11-gls-form-search-resumed-pii-local-only.png` | 로그인 재개 후 GLS 신청 폼과 side panel 탐색 진행 표시. 로컬 전용 PII 화면. |
| `12-postfix-ascii-request-waiting.png` | 영어 요청 입력 후 처리 대기. |
| `13-postfix-korean-search-start.png` | timeout 수정 후 한글 요청 탐색 시작, `탐색 중...` placeholder 표시. |
| `14-postfix-timeout-error-visible.png` | 후보 검증 timeout 후 사용자-facing 오류와 입력창 복구 표시. |
| `15-uc06-missing-headcount-only.png` | 인원 누락 요청에서 인원만 질문하고 quick reply 표시. |
| `16-uc06-headcount-answer-starts-search.png` | `20명` quick reply 선택 후 같은 날짜/시간으로 재확인 시작. |
| `17-uc12-multi-change-search-start.png` | 여러 조건 수정 요청 직후 최신 조건으로 검색 시작. |
| `18-uc11-uc12-multi-condition-updated.png` | 날짜/시간/인원 수정 반영 및 timeout 복구 상태 표시. |
| `19-uc17-end-before-start.png` | 종료 시간이 시작보다 빠른 요청에서 사전 안내 후 탐색/저장 없음. |
| `20-uc23-unrealistic-headcount.png` | 9999명 요청에서 등록 공간 없음과 조정 안내 표시. |
| `21-uc26-too-long-duration.png` | 10시간 요청에서 최대 8시간 이내 분할/축소 안내. |
| `22-uc89-unsupported-minute.png` | 17분 시작 요청에서 30분 단위 재입력 안내. |
| `23-uc111-ambiguous-ampm.png` | 오전/오후 없는 6시 요청에서 재입력 안내. |
| `24-uc18-weird-input.png` | 빈 입력 disabled 확인 뒤 `@@@`에 이해 가능한 내용 재입력 안내. |
| `25-uc16-colloquial-abbrev.png` | `담주/화욜/여섯시/스무명`을 날짜·시간·인원으로 해석하고 누락 시간만 질문. |
| `26-uc44-partial-close-reopen-state.png` | side panel 닫기/다시 열기 뒤 직전 슬롯 질문과 quick reply 복원. |
| `27-uc45-search-progress-before-tab-switch.png` | `2시간` 선택 후 탐색 진행 카드와 `검증 1/7` 표시. |
| `28-uc45-other-tab-timeout-visible-pii-local-only.png` | GLS 탭 selected 상태에서도 side panel이 `검증 2/7` 및 timeout 안내로 갱신. 로컬 전용 PII 화면. |
| `29-uc56-recent-list-pii-local-only.png` | 최근 대화 목록에 테스트 대화 제목, 미리보기, 시간, 삭제 버튼 표시. 로컬 전용 PII 화면. |
| `30-uc58-restore-invalid-conversation-pii-local-only.png` | `@@@` 대화 선택 후 기존 입력과 재입력 안내 메시지 복원. 로컬 전용 PII 화면. |
| `31-uc61-switch-to-student-meeting-pii-local-only.png` | 다른 대화로 전환 후 별도 메시지와 취소 상태가 유지됨. 로컬 전용 PII 화면. |
| `32-uc57-no-empty-conversation-pii-local-only.png` | 빈 새 대화에서 아무 입력 없이 목록 복귀 후 빈 항목이 추가되지 않음. 로컬 전용 PII 화면. |
| `33-uc49-previous-like-request-pii-local-only.png` | 수정 전 `저번처럼 해줘`가 지난 신청 추천이 아니라 새 신청 정보 입력으로 오인됨. 로컬 전용 PII 화면. |
| `34-uc49-postfix-reuse-suggestion-pii-local-only.png` | 서버 수정 뒤 `최근 3회 같은 행사` 제안 문구 표시. 로컬 전용 PII 화면. |
| `35-uc51-reminder-card-after-memory-fixture.png` | 테스트 fixture 기반 반복 예약 패턴 알림 카드 표시. |
| `38-uc49-postfix-card-visible-after-draft-condition.png` | extension reload 뒤 새 대화에서 `저번처럼 해줘`가 제안 카드로 수렴. |
| `39-uc47-postfix-draft-card-visible-disabled-submit.png` | 제안 승인 뒤 신청서 미리보기 필드가 표시되고 memory-only 저장 버튼은 disabled. |
| `40-uc52-reminder-accept-starts-flow.png` | 수정 전 반복 알림 수락이 긴 행사명 오류로 멈춤. |
| `41-uc52-postfix-reminder-accept-no-long-title.png` | 수정 후 반복 알림 수락 prompt가 명시 필드로 전송되고 신청서 미리보기/탐색 시작. |
| `42-uc52-postfix-reminder-accept-progress-result.png` | UC-52 수정 후 탐색/로그인 대기 진행 상태. |
| `43-uc52-login-resume-after-reminder-accept-pii-local-only.png` | GLS 재로그인 후 이어가기 관찰. 로컬 전용 PII 화면. |
| `44-uc52-postfix-confirmation-pii-local-only.png` | 반복 알림 수락 후 추천 공간/신청서 확인 단계 도달. 로컬 전용 PII 화면. |
| `45-uc53-dismiss-reminder-pii-local-only.png` | 반복 알림 `나중에` 클릭 후 알림 카드가 사라지고 최근 대화 목록만 남음. 로컬 전용 PII 화면. |
| `46-uc54-past-reminder-hidden-future-visible-pii-local-only.png` | 지난 날짜 테스트 알림은 보이지 않고 다가오는 날짜 반복 알림만 표시됨. 로컬 전용 PII 화면. |
| `47-uc144-postfix-reminder-space-priority-pii-local-only.png` | 알림 수락 후 추천 공간/GLS 화면이 알림의 400126 공간으로 이어짐. 로컬 전용 PII 화면. |
| `73-uc48-reject-previous-like-new-event-prompt.png` | 지난 신청 제안 카드에서 `다른 행사예요` 클릭 후 새 행사 입력 상태로 돌아옴. |
| `74-uc95-postfix-facility-decline-no-draft.png` | 시설 조건 미지원 안내 후 잘못 파싱된 신청서 초안 없이 입력 상태로 복구됨. |
| `75-uc90-early-morning-time-decline-with-memory-suggestion.png` | 새벽 시간 요청에서 09:00-22:00 사이 재입력 안내로 멈춤. |
| `98-uc116-long-event-purpose-fail-silent-truncation.png` | 수정 전 장문 행사명/목적이 조용히 잘리고 반복 예약 거절로 오탐됨. |
| `99-uc116-post-fix-long-event-purpose-guard-pass.png` | 수정 후 장문 행사명은 제출 전 길이 제한 안내로 멈추고 저장 버튼이 노출되지 않음. |
| `100-uc118-contact-guard-precondition-draft-ready-no-save.png` | UC-118 조건 생성을 위한 추천/초안 화면, 저장 미클릭. |
| `101-uc118-contact-cleared-before-extension-submit-pii-local-only.png` | 실제 GLS 폼 연락처를 빈 값으로 만든 상태. 로컬 전용 PII 화면. |
| `102-uc118-contact-empty-guard-pass-no-save-pii-local-only.png` | 빈 연락처에서 side panel이 기본 연락처 guard 안내를 표시하고 저장 버튼 disabled. 로컬 전용 PII 화면. |

## Iteration 1 - 사전 체크와 핵심 smoke

### User Flow

1. Chrome `chrome://extensions`에서 unpacked extension 상태를 확인하고 reload 버튼을 실제로 클릭했다.
2. toolbar의 `SKKU 공간예약` 버튼으로 side panel을 열었다.
3. 최근 대화 목록과 새 대화 화면을 확인했다.
4. starter 예시 `6월 26일(금) 오후 6시부터 2시간 20명 학생회 회의`를 실제로 클릭했다.
5. GLS 로그인이 풀린 상태에서 side panel이 로그인 필요/재로그인 안내를 표시하는지 확인했다.
6. 제공된 GLS 계정으로 실제 GLS 로그인 화면에서만 로그인했다. Chrome 비밀번호 저장은 선택하지 않았다.
7. 추천/초안 화면까지 도달했고 `GLS 신청 저장` 버튼이 보였지만 클릭하지 않았다.
8. `취소`를 입력해 흐름을 중단했다.
9. 잡담 `오늘 점심 뭐 먹지?`를 입력해 예약으로 오해하지 않는지 확인했다.

### Result

- PASS: UC-04, UC-05, UC-14, UC-15, UC-19, UC-20, UC-21, UC-24, UC-25, UC-28, UC-32, UC-33, UC-41, UC-42, UC-62, UC-64, UC-65, UC-66, UC-70, UC-79, UC-98, UC-102, UC-107, UC-120.
- PARTIAL: UC-01, UC-03, UC-10.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Notes

- 추천된 공간은 실제 GLS 가용 검증 뒤 side panel에 표시됐다.
- 후보 탐색 중 `통신 오류`, `예약 충돌`, `제외 충돌` 등이 사람 말로 표시됐다.
- GLS 화면에는 타인 예약 정보가 보였지만 side panel의 사용자-facing 로그에는 타인의 개인정보가 노출되지 않았다.
- 현재 날짜 2026-06-05 기준 테스트 요청 날짜 2026-06-26은 2주 이후였으나, 저장 직전 검증으로 충분하다고 판단해 실제 저장은 하지 않았다.

## Iteration 2 - UC-122 Safety 실패와 수정

### Failure

- 관찰: GLS 세션이 만료된 후보 검증 중 확장이 `chrome.tabs.update(..., { active: true })`로 GLS 탭을 자동 활성화했다.
- 사용자 화면 결과: 사용자가 보던 확장 탭에서 GLS 탭으로 전환됐다.
- 기대 결과: UC-122는 GLS 탭으로 바꾸기 전에 사용자에게 묻거나, 사용자가 명시적으로 버튼을 누른 뒤 전환되어야 한다.
- Root cause: `extension/src/background/glsCoordinator.ts`의 `result.loginRequired` 처리에서 로그인 만료를 발견하자마자 GLS 탭을 active로 전환했다. side panel에는 이미 로그인 카드가 있으므로 자동 전환이 필요 없었다.

### Fix

- Commit: `044484d` (`fix: GLS 로그인 대기 중 탭 강제 전환을 막음`)
- File: `extension/src/background/glsCoordinator.ts`
- Change: `result.loginRequired` 분기에서 `chrome.tabs.update(state.tabId, { active: true })` 호출 제거.
- Design: 백그라운드 검증은 로그인 필요 상태를 side panel에 표시하고 멈춘다. 사용자가 `GLS 로그인 열기` 또는 `다시 로그인` 버튼을 눌렀을 때만 GLS 탭을 연다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. `pnpm build` in `server`: PASS.
3. `pnpm verify` in `server`: PASS.
4. 실제 Chrome UI에서 extension reload: PASS.
5. GLS 탭에서 로그아웃해 로그인 필요 조건을 만들었다.
6. 확장 관리 탭을 selected 상태로 둔 채 side panel에서 완전한 예약 요청을 입력했다.
7. 결과: 확장 관리 탭이 계속 selected 상태였고, side panel에 `GLS 로그인이 필요해요`, `GLS 로그인 열기`, `GLS 로그인 후 진행됩니다`가 표시됐다.
8. 결과: GLS 탭으로 자동 전환되지 않았다.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-122 | PASS after fix | `09-uc122-postfix-login-needed-no-tab-switch.png` |

## Iteration 3 - 후보 검증 장시간 정체와 timeout 복구

### Failure

- 관찰: 로그인 재개 후 실제 GLS 후보 검증이 `검증 1/7` 상태에서 장시간 정체됐다.
- 사용자 화면 결과: side panel은 `빈 공간 찾는 중`, `검증 1/7`, `중단`을 표시했지만 자동으로 원인/다음 행동 안내로 수렴하지 않았다.
- 기대 결과: UC-68/70 기준 응답이 오래 걸리면 무한 대기처럼 두지 않고, 현재 상태와 다음 행동을 알려줘야 한다.
- Root cause: background의 timeout이 있더라도 content script의 후보 검증 전체가 사용자-facing timeout 결과로 정리되지 않았다. timeout을 단순 후보 실패처럼 흘리면 GLS 조작이 꼬일 수 있으므로 queue를 정리하고 명확한 오류 상태로 전환해야 했다.

### Fix

- Commit: `5d87c0a` (`fix: GLS 후보 검증 지연을 사용자에게 안내`)
- Files:
  - `extension/src/content/contentScript.ts`
  - `extension/src/background/glsCoordinator.ts`
  - `extension/src/shared/messages.ts`
- Change:
  - `BG_CHECK_AVAILABILITY` content 처리에 25초 `withContentTimeout` 추가.
  - `ContentAvailabilityResult.timedOut` 플래그 추가.
  - background `searchNext`에서 timeout은 다음 후보로 계속 진행하지 않고 queue를 정리한 뒤 사용자에게 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 메시지를 표시.
- Safety: timeout 후에도 실제 저장/예약신청은 수행하지 않으며, submit path에는 영향을 주지 않는다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. `pnpm build` in `server`: PASS.
3. `pnpm verify` in `server`: PASS.
4. `git diff --check`: PASS.
5. 실제 Chrome UI에서 extension reload: PASS.
6. side panel 새 대화에서 영어 요청 입력: 한국어 재입력 안내로 graceful decline, GLS 자동화 없음.
7. side panel 같은 대화에서 한글 요청 입력: `빈 공간 찾는 중`, `준비 중`, `탐색 중...` 표시.
8. 후보 검증이 오래 걸린 뒤: `GLS 후보 검증이 오래 걸려 자동화를 중단했어요. 같은 조건으로 다시 시도하거나 날짜/시간을 바꿔주세요.` 표시 및 입력창 복구.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-27 | PASS | 중단 버튼 클릭 후 예약 진행 중단 메시지와 입력창 복구. |
| UC-43 | PASS | 재로그인 후 이어가기 메시지와 탐색 재개 확인. |
| UC-68 | PASS after fix | `14-postfix-timeout-error-visible.png` |
| UC-69 | PASS | `13-postfix-korean-search-start.png` |
| UC-70 | PASS after fix | timeout 오류가 명확히 표시되고 입력창이 복구됨. |
| UC-114 | PASS | 영어 요청에 한국어 재입력 안내, GLS 자동화 없음. |
| UC-132 | PASS | extension reload 후 새 대화/입력/오류 복구 정상 동작. |

## Iteration 4 - 입력 검증/Robustness 회귀 묶음

### User Flow

1. side panel에서 새 대화를 열고 `6월 30일 오후 4시부터 2시간 기능 검증 회의 예약해줘`를 입력했다.
2. 인원 질문만 뜨는지 확인한 뒤 quick reply `20명`을 클릭했다.
3. timeout 복구 후 `아니 7월 1일 오후 5시부터 1시간 30명으로 바꿔줘`를 입력했다.
4. 새 대화에서 종료 시간이 시작보다 빠른 요청, 9999명 요청, 10시간 요청, 17분 시작 요청, 오전/오후가 빠진 6시 요청을 각각 입력했다.
5. 새 대화 빈 입력 상태의 전송 버튼 disabled를 확인하고, `@@@`를 전송했다.
6. 새 대화에서 `담주 화욜 오후 여섯시 스무명 기능 검증 회의 예약해줘`를 입력했다.

### Result

- PASS: UC-06, UC-11, UC-12, UC-16, UC-17, UC-18, UC-23, UC-26, UC-89, UC-111.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- 서버/API/DB 직접 호출로 PASS 판정한 케이스 없음. 모든 판정은 실제 Chrome side panel 화면 문구와 버튼 상태 기준.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-06 | PASS | `15-uc06-missing-headcount-only.png`, `16-uc06-headcount-answer-starts-search.png` |
| UC-11 | PASS | `17-uc12-multi-change-search-start.png`, `18-uc11-uc12-multi-condition-updated.png` |
| UC-12 | PASS | `17-uc12-multi-change-search-start.png`, `18-uc11-uc12-multi-condition-updated.png` |
| UC-16 | PASS | `25-uc16-colloquial-abbrev.png` |
| UC-17 | PASS | `19-uc17-end-before-start.png` |
| UC-18 | PASS | `24-uc18-weird-input.png` |
| UC-23 | PASS | `20-uc23-unrealistic-headcount.png` |
| UC-26 | PASS | `21-uc26-too-long-duration.png` |
| UC-89 | PASS | `22-uc89-unsupported-minute.png` |
| UC-111 | PASS | `23-uc111-ambiguous-ampm.png` |

## Iteration 5 - 패널 복원과 다른 탭 진행

### User Flow

1. 진행 중인 `담주 화욜 오후 여섯시...` 대화에서 side panel을 실제 UI로 닫았다.
2. Chrome toolbar의 `SKKU 공간예약` 버튼으로 side panel을 다시 열었다.
3. 최근 대화 목록에서 직전 대화를 클릭해 메시지와 quick reply가 이어지는지 확인했다.
4. `2시간` quick reply를 클릭해 탐색을 시작했다.
5. 실제 GLS 탭을 클릭해 다른 탭 selected 상태로 전환했다.
6. side panel이 `검증 2/7`과 timeout 안내를 표시하는지 관찰했다.

### Result

- PARTIAL: UC-44. 닫았다 열어도 최근 대화 목록과 직전 슬롯 질문/quick reply가 복원됐다. 다만 문서의 엄격 Given인 추천 카드까지 받은 상태 복원은 아직 별도 실행이 필요하다.
- PASS: UC-45. 다른 GLS 탭 selected 상태에서도 side panel이 조용히 멈추지 않고 진행/timeout 상태를 표시했다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-44 | PARTIAL | `26-uc44-partial-close-reopen-state.png` |
| UC-45 | PASS | `27-uc45-search-progress-before-tab-switch.png`, `28-uc45-other-tab-timeout-visible-pii-local-only.png` |

## Iteration 6 - 여러 예약 관리

### User Flow

1. side panel의 대화 목록 버튼을 실제 UI로 클릭했다.
2. 최근 대화 목록에서 테스트 대화들의 제목, 미리보기, 시간, 삭제 버튼이 보이는지 확인했다.
3. `@@@` 테스트 대화를 클릭해 저장된 사용자 입력과 재입력 안내 메시지가 복원되는지 확인했다.
4. 목록으로 돌아가 `6/26 학생회 회의` 대화를 클릭해 다른 대화의 메시지와 취소 상태가 따로 보이는지 확인했다.
5. `새 대화` 버튼만 누른 뒤 아무 메시지도 보내지 않고 목록으로 돌아갔다.
6. 목록에 제목 없는 빈 대화가 추가되지 않았는지 확인했다.

### Result

- PASS: UC-56, UC-57, UC-58, UC-60, UC-61.
- NOT_RUN: UC-59. 실제 UI 삭제 조작은 삭제 확인이 필요해 실행하지 않았다.
- 실제 저장/예약신청: 없음.
- 테스트 데이터 삭제: 없음.
- 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-56 | PASS | `29-uc56-recent-list-pii-local-only.png` |
| UC-57 | PASS | `32-uc57-no-empty-conversation-pii-local-only.png` |
| UC-58 | PASS | `30-uc58-restore-invalid-conversation-pii-local-only.png` |
| UC-59 | NOT_RUN | 사용자 삭제 확인 대기. |
| UC-60 | PASS | `29-uc56-recent-list-pii-local-only.png` |
| UC-61 | PASS | `30-uc58-restore-invalid-conversation-pii-local-only.png`, `31-uc61-switch-to-student-meeting-pii-local-only.png` |

## Iteration 7 - 지난 신청 재사용과 반복 알림

### User Flow

1. 테스트 조건 생성을 위해 현재 테스트 클라이언트에 `Codex E2E 기능 검증 반복 회의` 완료 대화 3건을 upsert했다. 실제 GLS 예약은 아니며 개인정보는 포함하지 않았다.
2. 실제 Chrome UI에서 extension을 reload하고 toolbar의 `SKKU 공간예약` 버튼으로 side panel을 열었다.
3. 최근 대화 목록 상단의 `패턴 알림 · PHASE 3` 카드, 다음 금요일 날짜/시간/공간, `네, 예약할게요`, `나중에` 버튼을 확인했다.
4. 새 대화에서 `저번처럼 해줘`를 입력했다.
5. 수정 전에는 새 신청 입력으로 오인되는 것을 확인했고, 서버 수정 후 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?` 제안 카드가 표시되는 것을 확인했다.
6. `네, 같게요` 버튼을 실제 UI로 클릭했다.
7. 수정 전에는 `검토` phase와 제출 hint만 보이고 신청서 미리보기 본문이 보이지 않았다.
8. side panel 표시 조건 수정, extension build, 실제 Chrome UI reload 후 같은 흐름을 반복했다.
9. 최종 화면에서 `신청서 미리보기` 카드와 행사구분, 주관단체, 행사명, 행사인원, 사용목적이 표시되고, 후보 없는 memory-only 상태의 `GLS 신청 저장`은 disabled임을 확인했다.

### Failure

- UC-49: `저번처럼 해줘`가 지난 신청 제안 대신 새 신청 정보 입력으로 분류됐다.
- UC-47: 지난 신청을 승인해도 완성된 신청서 초안의 상세 필드가 side panel에 보이지 않았다.
- Root cause:
  - `server/src/application/state.ts`에서 explicit reuse signal 처리가 신청서 설명 추출보다 뒤에 있어 `저번처럼` 문장이 draft 설명으로 오인될 수 있었다.
  - `extension/src/sidepanel/ChatScene.tsx`에서 DraftCard 생성 조건이 `proposedCandidate`에 묶여 있어, memory-only draft는 phase만 `검토`로 바뀌고 카드 본문이 만들어지지 않았다.

### Fix

- Commit: `b5652c1` (`fix: 지난 신청 재사용 흐름을 우선 처리`)
- Files:
  - `server/src/application/state.ts`
  - `server/scripts/verify-application-memory.ts`
  - `server/package.json`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
  - `extension/src/sidepanel/ChatScene.tsx`
- Change:
  - 명시적 재사용 요청을 메모리 추천으로 먼저 처리하고, 메모리가 없으면 새 신청 설명으로 오인하지 않도록 했다.
  - memory suggestion/draft가 슬롯 질문보다 우선 보이도록 phase 우선순위를 조정했다.
  - 완성된 draft는 후보가 없어도 미리보기 카드로 표시하되, 후보가 없는 경우 저장 버튼은 disabled로 유지했다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. `pnpm build && pnpm verify` in `server`: PASS.
3. `git diff --check`: PASS.
4. 실제 Chrome UI `chrome://extensions`에서 reload 버튼 클릭: PASS, `새로고침 완료` 표시.
5. UC-49: `저번처럼 해줘` 후 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`와 `네, 같게요` 카드 표시.
6. UC-47: `네, 같게요` 클릭 뒤 신청서 미리보기 카드의 5개 필드 표시, `GLS 신청 저장` disabled.
7. UC-51: 최근 대화 목록 상단 반복 예약 패턴 알림 표시.
8. 실제 저장/예약신청: 없음.
9. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-47 | PASS after fix | `39-uc47-postfix-draft-card-visible-disabled-submit.png` |
| UC-49 | PASS after fix | `38-uc49-postfix-card-visible-after-draft-condition.png` |
| UC-51 | PASS | `35-uc51-reminder-card-after-memory-fixture.png` |

## Iteration 8 - 반복 알림 수락 prompt

### User Flow

1. 반복 알림 카드에서 `네, 예약할게요`를 실제 UI로 클릭했다.
2. 수정 전 화면은 `2026-07-10 18:00부터 20:00까지 20명 Codex E2E 기능 검증 반복 회의 예약해줘 지난번처럼...` 자연어 prompt를 전송했다.
3. 서버가 해당 전체 문장을 행사명처럼 해석해 `행사명이 너무 길어요. 현재 64자...` 오류를 표시했다.
4. server reminder prompt 생성 로직을 수정하고, 테스트용 reminder 1건만 새 prompt/status로 복구했다.
5. 같은 알림 카드의 `네, 예약할게요`를 다시 클릭했다.
6. 수정 후 화면은 `공간코드 400126`, `주관단체: Codex E2E`, `행사명: 기능 검증 반복 회의`, `행사구분: 세미나/스터디`, `사용목적: ...` 명시 필드 prompt를 전송했다.
7. GLS 세션이 풀려 로그인 대기 카드가 떴고, 실제 GLS 로그인 UI에서 로그인 후 `계속하기`를 눌러 진행했다.
8. 추천 공간 `첨단강의실(400126)`, `예약 가능`, 신청서 미리보기, `GLS 신청 저장` 확인 버튼까지 도달했다.
9. `GLS 신청 저장`은 클릭하지 않았다.

### Failure

- UC-52: 알림 수락이 조건 재입력 없이 시작되긴 했지만, 긴 행사명 오류로 확인 단계에 도달하지 못했다.
- Root cause:
  - `server/src/application/reminders.ts`가 알림 수락 prompt를 자유문장으로 만들었다.
  - 같은 문장 안의 날짜/시간/공간/재사용 문구가 신청서 eventName 추출 대상에 섞였다.

### Fix

- Commit: `e66595e` (`fix: 반복 알림 수락 prompt를 신청서 필드로 분리`)
- Files:
  - `server/src/application/reminders.ts`
  - `server/scripts/verify-reminder-space-code.ts`
- Change:
  - reminder prompt에서 `지난번처럼` 문구를 제거했다.
  - 공간은 `공간코드 ...`, 신청서는 `주관단체`, `행사명`, `행사구분`, `사용목적` 명시 필드로 생성한다.
  - verify 스크립트가 reminder prompt를 다시 신청서 상태로 빌드해도 eventName이 저장된 행사명 그대로 유지되는지 검사한다.

### Verification

1. `pnpm build && pnpm verify` in `server`: PASS.
2. `git diff --check`: PASS.
3. Computer Use 수정 전: `행사명이 너무 길어요...` 오류 재현.
4. Computer Use 수정 후: 알림 수락 prompt가 명시 필드로 전송되고 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`, `빈 공간 찾는 중`, `신청서 미리보기` 표시.
5. Computer Use 로그인 후: `추천 공간`, `예약 가능`, `첨단강의실(400126)`, `GLS 신청 저장` 확인 버튼 표시.
6. 실제 저장/예약신청: 없음.
7. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-52 | PASS after fix | `41-uc52-postfix-reminder-accept-no-long-title.png`, `44-uc52-postfix-confirmation-pii-local-only.png` |

## Iteration 9 - 반복 알림 dismiss

### User Flow

1. 테스트용 reminder 1건만 active 상태로 복구했다.
2. 실제 Chrome side panel 최근 대화 목록 상단에서 반복 알림 카드를 확인했다.
3. 알림 카드의 `나중에` 버튼을 실제 UI로 클릭했다.
4. 화면이 다시 최근 대화 목록으로 갱신되며 알림 카드가 사라졌다.

### DB Fixture

- SQL update via local DB client로 `Codex E2E 기능 검증 반복 회의` 테스트 reminder 1건의 `status`, `acceptedAt`, `dismissedAt`만 테스트 목적에 맞게 복구했다.
- 테스트 전용 데이터이며 실제 GLS 예약은 아니다.
- 개인정보 없음.

### Verification

1. Computer Use: `나중에` 클릭 후 `패턴 알림 · PHASE 3` 카드가 사라지고 `진행 중 · 완료된 대화` 목록만 표시됨.
2. Computer Use: dismiss 직후 자동 예약 신청, 자동 GLS 저장, 중복 알림 재노출 없음.
3. 실제 저장/예약신청: 없음.
4. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-53 | PASS | `45-uc53-dismiss-reminder-pii-local-only.png` |

## Iteration 10 - 지난 날짜 반복 알림 정리

### User Flow

1. 테스트용 reminder로 지난 날짜 2026-06-04 active 1건과 다가오는 날짜 2026-07-17 active 1건을 준비했다.
2. 실제 Chrome side panel을 닫았다.
3. 실제 Chrome toolbar의 `SKKU 공간예약` 확장 아이콘을 눌러 side panel을 다시 열었다.
4. 상단 반복 알림 카드에 `다가오는 Codex E2E 반복 알림`, `2026-07-17`, `18:00–20:00`, `Codex E2E 첨단강의실 400126`만 표시되는 것을 확인했다.
5. 지난 날짜 제목 `지난 날짜 Codex E2E 반복 알림`과 날짜 `2026-06-04`는 화면에 표시되지 않았다.

### DB Fixture

- SQL upsert via local DB client로 테스트 reminder 2건만 생성/복구했다.
- 과거 건: 2026-06-04, active 상태로 준비.
- 미래 건: 2026-07-17, active 상태로 준비.
- `/reminders` 조회 뒤 보조 DB 확인 결과 과거 건은 `dismissed`, 미래 건은 `active`였다.
- 테스트 전용 데이터이며 실제 GLS 예약은 아니다.
- 개인정보 없음.

### Verification

1. Computer Use: side panel 재오픈 후 과거 날짜 알림 미표시.
2. Computer Use: 다가오는 날짜 알림만 표시.
3. Supporting DB: 과거 테스트 reminder dismissed 처리 확인.
4. 실제 저장/예약신청: 없음.
5. 실수 신청: 없음.

### Non-counted UC-55 Attempt

- 별도 임시 Chrome profile을 띄워 first-time client 조건을 만들고 `extension/dist`를 실제 UI로 로드하려 했다.
- 임시 Chrome 프로세스는 생성됐지만 Computer Use가 기존 Chrome 창만 primary target으로 반환해, UC-55의 사용자 화면 관찰까지 진행하지 못했다.
- 이 시도는 UC 결과로 세지 않았고, BLOCKED로도 세지 않았다. 임시 프로세스는 종료했다.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-54 | PASS | `46-uc54-past-reminder-hidden-future-visible-pii-local-only.png` |

## Iteration 11 - 알림 공간 보존과 반복 guard 오탐 수정

### User Flow

1. UC-54/143에서 확인한 공간 포함 반복 알림 카드의 `네, 예약할게요`를 실제 UI로 클릭했다.
2. 수정 전 화면은 prompt에 `공간코드 400126`이 있었지만, `사용목적: E2E 테스트 반복 알림 검증`의 `반복` 단어 때문에 `반복 예약은 아직 자동으로 처리하지 않아요...`를 표시했다.
3. 반복 예약 safety guard를 수정하고 extension을 다시 build했다.
4. 실제 `chrome://extensions` 화면에서 해당 확장 카드의 reload 버튼을 클릭했고, `새로고침 완료`를 확인했다.
5. 테스트용 reminder를 active 상태로 재복구했다.
6. 실제 Chrome toolbar의 확장 아이콘으로 side panel을 열고 같은 알림의 `네, 예약할게요`를 다시 클릭했다.
7. 수정 후 화면은 `반복 예약` 차단 없이 `신청 정보를 업데이트했어요`, `빈 공간 찾는 중`, `검증 1/1`로 진행했다.
8. 최종 화면에서 추천 공간 `첨단강의실 (400126)`, 날짜 `2026-07-17`, 시간 `18:00-20:00`, 추천 이유 `최근 같은 요일·시간대 예약에서 3회 사용`, `GLS 신청 저장` 버튼을 확인했다.
9. GLS 본문도 예약날짜 `2026-07-17`과 공간 `[400126] 첨단강의실 / 40 명 ~ 120 명`을 표시했다.
10. `GLS 신청 저장`은 클릭하지 않았다.

### Failure

- UC-144: 알림이 가리키던 공간으로 진행되어야 했지만, 구조화된 사용목적의 `반복` 단어 때문에 반복 예약 guard가 발동하고 후보 조회가 중단됐다.
- Root cause:
  - `extension/src/background/chatPolicies.ts`의 반복 예약 의도 판정이 전체 latestMessage를 대상으로 했다.
  - reminder accept prompt는 신청서 필드까지 포함하므로, 행사명/사용목적의 업무 문구가 예약 반복 의도로 오인될 수 있었다.

### Fix

- File:
  - `extension/src/background/chatPolicies.ts`
- Change:
  - 반복 예약 guard가 multiline structured prompt를 검사할 때 `주관단체`, `행사명`, `행사구분`, `사용목적` 라인은 제외한다.
  - 첫 예약 지시문 자체에 `매주`, `반복 예약`, `정기 신청` 같은 문구가 있으면 기존처럼 차단한다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. Computer Use extension reload: PASS, `새로고침 완료`.
3. Computer Use UC-143: 알림 카드에 날짜, 시간, 행사 맥락, 공간 이름/번호 표시.
4. Computer Use UC-144 after fix: 추천 공간 `첨단강의실 (400126)`과 GLS `[400126]` 화면 도달.
5. 실제 저장/예약신청: 없음.
6. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-143 | PASS | `46-uc54-past-reminder-hidden-future-visible-pii-local-only.png` |
| UC-144 | PASS after fix | `47-uc144-postfix-reminder-space-priority-pii-local-only.png` |

## Iteration 12 - 제출 최소정원 guard와 GLS 실패 표시

### User Flow

1. 실제 Chrome side panel의 반복 알림 수락 후 추천된 `첨단강의실 (400126)` 신청서에서 `GLS 신청 저장`을 클릭했다.
2. 저장 버튼 클릭 직후 side panel은 `신청 저장 중...` 상태로 바뀌고 입력/전송이 disabled 상태가 되어 중복 제출을 막았다.
3. GLS 화면은 2026-07-17, 18:00-20:00, 20명, `[400126] 첨단강의실 / 40 명 ~ 120 명`, 사용목적 `E2E 테스트 반복 알림 검증`을 표시했다.
4. GLS는 `N:인원 항목 => 최소인원 (40)명 입니다. Number of people item => Minimum number of people (40)people` 팝업을 표시했다.
5. 팝업 확인 후 side panel은 수정 전 `submit result unknown (timeout)`만 표시했다.
6. fixture와 제출 guard를 수정하고 extension/server build 및 DB seed를 실행했다.
7. 실제 `chrome://extensions`에서 확장 reload 버튼을 클릭했고 `새로고침 완료`를 확인했다.
8. 실제 Chrome side panel 새 대화에서 `2026년 7월 17일 18시부터 2시간 20명 반도체관 400126호 예약해줘...`를 입력했다.
9. 행사구분 질문에 `학회 세미나`를 클릭한 뒤 `이 조건으로 빈 공간 찾아줘`를 전송했다.
10. 수정 후 화면은 `7/17(금) 18:00부터 2시간, 20명, 반도체관 400126호로 가능한 공간을 찾아볼게요.` 다음 `조건에 맞는 공간이 없어요`를 표시했다.
11. 수정 후 화면의 신청서 카드에서 `GLS 신청 저장`은 disabled 상태였고, GLS 저장/예약신청으로 진행되지 않았다.
12. 추가로 no-candidate 빠른 재시도 칩의 고정 문구 `100명으로 줄여서 다시`가 최소정원 실패에 부적절해, `인원 조정해서 다시`로 수정하고 build/reload했다.
13. reload 직후 기존 active search resume이 `GLS 세션을 확인하고 후보 공간을 불러오는 중이에요`에서 오래 머물러, 테스트 대화는 실제 UI의 `중단` 버튼으로 종료했다.

### DB Fixture

- `server/scripts/seed-e2e-spaces.ts`에서 테스트 공간 400126의 `capacityMin`을 실제 GLS 표시값과 맞춰 40으로 보정했다.
- `pnpm seed:e2e-spaces`를 실행해 현재 로컬 DB에 같은 fixture를 반영했다.
- 테스트 전용 공간 fixture이며 실제 사용자 데이터 삭제나 schema/migration 변경은 없다.
- 개인정보 없음.

### Failure

- UC-37: GLS의 실제 실패 사유가 있었지만 side panel은 `submit result unknown (timeout)`만 표시했다.
- UC-34: 수정 전 조건은 앱 추천과 제출 경로까지 갔지만 실제 GLS 최소정원에 맞지 않아 저장 완료로 이어지지 않았다.
- Safety risk: 잘못된 정원 fixture나 stale candidate가 실제 GLS 저장 버튼까지 갈 수 있었다.

### Root Cause

- E2E seed fixture가 400126을 `1-120명`으로 기록해 실제 GLS `40-120명`과 불일치했다.
- 제출 직전 flow가 공간 가용 시간은 재검증했지만, fresh DB 기준 `capacityMin <= headcount <= capacityMax`는 다시 확인하지 않았다.
- main-world bridge의 `waitForSubmitResult`가 `오류`/`실패` 제목만 찾고 본문형 GLS validation popup을 실패로 읽지 못했다.

### Fix

- Files:
  - `server/scripts/seed-e2e-spaces.ts`
  - `extension/src/shared/spaceCapacity.ts`
  - `extension/src/background/glsCoordinator.ts`
  - `extension/src/background/handlers/reservationHandlers.ts`
  - `extension/src/background/chatSlotCorrections.ts`
  - `extension/src/content/bridgeMainWorld.ts`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
- Change:
  - 공유 capacity guard를 추가하고 후보 검색/사전 주입 후보/제출 직전 stale candidate 검증에 적용했다.
  - 제출 직전 `headcount + spaceCode`로 서버 후보를 다시 조회해 fresh fixture 기준으로 저장 가능 여부를 확인한다.
  - GLS validation popup 본문을 `GLS 저장 실패: ...`로 반환하도록 탐지 패턴을 추가했다.
  - no-candidate 빠른 재시도 chip을 `인원 조정해서 다시`로 일반화했다.

### Verification

1. `pnpm build` in `server`: PASS.
2. `pnpm build` in `extension`: PASS.
3. `pnpm seed:e2e-spaces`: PASS.
4. Computer Use extension reload: PASS, `새로고침 완료`.
5. Computer Use UC-36: 제출 중 input/send disabled 확인.
6. Computer Use UC-37 after fix: 20명/400126이 `조건에 맞는 공간이 없어요`와 disabled save로 차단됨.
7. 실제 저장/예약신청 성공: 없음.
8. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-36 | PASS | `48-uc36-submit-in-progress-locked-pii-local-only.png` |
| UC-37 | PASS after fix | `49-uc34-submit-fails-min-capacity-pii-local-only.png`, `50-uc34-capacity-guard-no-candidate-pii-local-only.png` |
| UC-34 | NOT_RUN after fix | 수정 전 최소정원 실패 원인은 해결했지만, valid-capacity 실제 성공 저장 회귀는 아직 별도로 실행하지 않음. |

## Iteration 13 - GLS 성공 알림 오탐 수정과 UC-34/UC-115 실제 저장 회귀

### User Flow

1. 실제 Chrome side panel 새 대화에서 `2026년 7월 24일 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
2. side panel은 `추천 공간`, `예약 가능`, `첨단강의실 (400126)`, `날짜 2026-07-24`, `시간 18:00 – 20:00`, `행사인원 40명`, `GLS 신청 저장` 활성 상태를 표시했다.
3. `GLS 신청 저장`을 클릭하자 GLS는 `실행되었습니다.` 알림과 `사용일 전일까지 담당자가 확인 후 처리할 예정이며...` 안내 팝업을 표시했다.
4. 실제 GLS 목록을 7월로 조회하자 `2026/07/24 18:00 ~ 20:00`, 공간코드 `400126`, 상태 `신청` 행이 생성되어 실제 신청 접수는 성공했다.
5. 하지만 수정 전 side panel은 `GLS 저장 실패: 금학기졸업자신청...입력...`처럼 현재 예약 팝업과 무관한 페이지 문구를 실패 사유로 표시했다.
6. `extension/src/content/bridgeMainWorld.ts`를 수정하고 `pnpm build`를 실행했다.
7. 실제 `chrome://extensions`에서 extension reload 버튼을 클릭했고 `새로고침 완료`를 확인했다.
8. 실제 Chrome side panel 새 대화에서 `2026년 7월 31일 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
9. 수정 후 side panel은 같은 GLS `실행되었습니다.` 알림을 `신청 저장 완료`, `승인 대기`, `신청 저장 완료 · 승인 대기`로 판정했다.
10. 실제 GLS 목록을 7월로 조회하자 `2026/07/31 18:00 ~ 20:00`과 `2026/07/24 18:00 ~ 20:00` 두 테스트 신청 행이 표시됐다.
11. UC-115 기준으로 side panel 문구와 GLS 목록 상태를 함께 관찰했다. side panel은 승인 완료라고 말하지 않았고, GLS 목록도 상태 `신청`으로 표시했다.

### Failure

- UC-34: 실제 GLS 신청은 성공했지만, side panel이 성공 상태를 실패로 오탐했다.
- User-facing risk: 사용자는 실제 신청이 접수됐는데도 실패로 보고 재시도할 수 있어 중복 신청 위험이 있었다.

### Root Cause

- `visibleGlsValidationMessage()`가 현재 열린 GLS 팝업이 아니라 페이지 전체 visible text를 검사했다.
- 저장 성공 직후 GLS 메인 메뉴/다른 화면에 있던 `...입력...` 문구가 validation pattern `/입력/`에 걸려 성공 결과를 실패로 뒤집었다.

### Fix

- File:
  - `extension/src/content/bridgeMainWorld.ts`
- Commit:
  - `904c537` (`fix: GLS 저장 성공 알림의 실패 오탐을 막음`)
- Change:
  - 성공 안내 문구를 현재 active popup 내부 텍스트에서 우선 감지하는 `activePopupContainsText()`를 추가했다.
  - validation 실패 메시지도 active popup 내부의 visible text만 대상으로 제한했다.
  - 페이지 전체의 무관한 문구가 GLS 저장 실패 사유로 오염되지 않게 했다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. Computer Use extension reload: PASS, `새로고침 완료`.
3. Computer Use UC-34 after fix: 2026-07-31, 18:00-20:00, 40명, 400126 조건에서 `GLS 신청 저장` 클릭 후 side panel이 `신청 저장 완료 · 승인 대기` 표시.
4. Computer Use GLS list verification: 7월 목록에 `2026/07/31 18:00 ~ 20:00`, `2026/07/24 18:00 ~ 20:00` 두 테스트 신청 행 표시.
5. Computer Use UC-115 wording check: 같은 화면에서 `신청 저장 완료 · 승인 대기`와 GLS 목록 상태 `신청`을 확인해 신청 접수와 승인 완료가 구분됨.
6. 실제 저장/예약신청: 테스트 신청 2건 접수. 모두 현재 날짜 2026-06-05 기준 2주 이후 날짜이며 테스트 목적 문구 포함.
7. 실수 신청: 없음.

### Case Results

| UC | Result | Evidence |
| --- | --- | --- |
| UC-34 | PASS after fix | `51-uc34-presubmit-valid-capacity-pii-local-only.png`, `52-uc34-submit-result-success-alert-sidepanel-fail-pii-local-only.png`, `54-uc34-saved-reservation-list-sidepanel-fail-pii-local-only.png`, `55-uc34-postfix-presubmit-valid-pii-local-only.png`, `56-uc34-postfix-submit-success-sidepanel-complete-pii-local-only.png`, `57-uc34-postfix-saved-list-two-rows-pii-local-only.png` |
| UC-115 | PASS | `56-uc34-postfix-submit-success-sidepanel-complete-pii-local-only.png`, `57-uc34-postfix-saved-list-two-rows-pii-local-only.png` |
| UC-36 | PASS regression | 저장 클릭 후 `신청 저장 중...`, input/send disabled 유지 |

## Iteration 14 - UC-40 같은 시간대 내 예약 중복 차단

### User Flow

1. 실제 GLS 7월 목록에 테스트 신청 2건이 표시된 상태에서 side panel `새 대화`를 열었다.
2. 실제 Chrome side panel 입력창에 `2026년 7월 31일 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
3. 이 조건은 직전 UC-34 회귀에서 실제 접수된 테스트 신청과 같은 날짜·시간·공간이다.
4. side panel은 `빈 공간 찾는 중`, `검증 1/1`, `✗`, `반도체관 · 첨단강의실 18:00~20:00 예약`을 표시했다.
5. GLS 화면의 예약현황 영역도 같은 시간대에 `예약`, 기존 테스트 신청명, `18:00~20:00`을 표시했다.
6. side panel은 `조건에 맞는 공간이 없어요`, `2026-07-31 18:00–20:00, 40명 조건으로 확인했지만 지금은 맞는 공간이 없었습니다.`를 표시했다.
7. `GLS 신청 저장` 버튼은 disabled 상태였고, 실제 추가 저장/예약신청은 발생하지 않았다.

### Result

- UC-40: PASS.
- 중복 저장 방지: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `58-uc40-duplicate-own-reservation-blocked-pii-local-only.png`

## Iteration 15 - UC-38 GLS 신청서 미리보기 사용자 경로

### Initial Finding

- background/content에는 `POPUP_PREVIEW_RESERVATION`과 실제 GLS 신청 팝업을 저장 없이 채우는 preview 경로가 있었다.
- 하지만 side panel 신청서 초안 카드에는 사용자가 누를 수 있는 `GLS 미리보기` 액션이 없었다.
- 이 상태에서는 UC-38의 사용자 관점 목표인 “GLS에 채워진 모습을 보고 저장하지 않고 돌아오기”를 실제 Chrome UI에서 수행할 수 없었다.

### Fix

1. `extension/src/sidepanel/components/cards/DraftCard.tsx`
   - 신청서 초안 액션 영역에 `GLS 미리보기` 버튼을 추가했다.
   - 저장 완료 상태가 아니고 제출 가능할 때만 표시/활성화되게 했다.
2. `extension/src/sidepanel/hooks/useConversation.ts`
   - `POPUP_PREVIEW_RESERVATION` 메시지를 보내는 `previewReservation` action을 추가했다.
   - 성공 시 `GLS 신청 화면에 미리보기를 채웠어요. 저장 전 내용을 확인해 주세요.` 안내 메시지를 추가했다.
3. `extension/src/sidepanel/ChatScene.tsx`
   - `DraftCard`에 `onPreview`를 연결했다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. 실제 Chrome `chrome://extensions`에서 extension reload 버튼 클릭: PASS, `새로고침 완료` 표시.
3. 실제 Chrome GLS 탭에서 toolbar의 `SKKU 공간예약` 버튼으로 side panel을 열었다.
4. side panel `새 대화`에서 다음 요청을 입력했다: 2026-08-07 18:00-20:00, 40명, 반도체관 400126, `Codex E2E`, `GLS 미리보기 검증 회의`, `E2E 테스트 GLS 미리보기 검증`.
5. 화면에서 `추천 공간`, `예약 가능`, `첨단강의실 (400126)`, 활성 `GLS 미리보기` 버튼을 확인했다.
6. `GLS 미리보기`만 클릭했다.
7. 실제 GLS 신청 팝업에 다음 값이 채워진 것을 Computer Use 화면으로 확인했다:
   - 행사구분: `교내단체행사(세미나/스터디)`
   - 주관단체: `Codex E2E`
   - 행사명: `GLS 미리보기 검증 회의`
   - 행사인원: `40`
   - 예약날짜: `2026-08-07`
   - 예약시간: `18:00` ~ `20:00`
   - 공간: `[400126] 첨단강의실 / 40 명 ~ 120 명`
   - 사용목적: `E2E 테스트 GLS 미리보기 검증`
8. side panel은 `GLS 신청 화면에 미리보기를 채웠어요. 저장 전 내용을 확인해 주세요.`를 표시했다.
9. side panel `GLS 신청 저장`과 GLS 팝업 `저장`은 클릭하지 않았다.
10. 2026-08-07 GLS 예약 목록은 `조회된 데이터가 없습니다.` 상태였고 실제 신청 행은 생성되지 않았다.

### Result

- UC-38: PASS after fix.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Safety regression: 없음.

### Evidence

- `59-uc38-preview-button-visible-pii-local-only.png`
- `60-uc38-gls-form-filled-no-submit-pii-local-only.png`

## Iteration 16 - UC-07 상대 날짜 해석

### User Flow

1. 실제 Chrome side panel `새 대화`에서 `다음 주 월요일 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
2. 2026-06-05 금요일 기준 기대 날짜는 2026-06-08이다.
3. side panel 제목이 `SK 2026-06-08 날짜 해석 검증 회의`로 바뀌고, 실제 GLS 신청 팝업 예약날짜도 `2026-06-08`로 채워진 것을 확인했다.
4. 실제 저장/예약신청은 하지 않고 새 대화로 넘어갔다.
5. 실제 Chrome side panel `새 대화`에서 `모레 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
6. 2026-06-05 기준 기대 날짜는 2026-06-07이다.
7. side panel 제목이 `SK 2026-06-07 모레 날짜 해석 회의`로 바뀌고, 추천 카드 날짜와 실제 GLS 신청 팝업 예약날짜가 `2026-06-07`로 채워진 것을 확인했다.
8. 2026-06-07/2026-06-08은 현재 날짜 기준 2주 이내이므로 side panel `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.

### Result

- UC-07: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `61-uc07-next-monday-parsed-2026-06-08-pii-local-only.png`
- `62-uc07-day-after-tomorrow-parsed-2026-06-07-pii-local-only.png`

## Iteration 17 - UC-08 시간 표현 해석

### User Flow

1. 실제 Chrome side panel 새 대화에서 `내일 오후 2시부터 4시까지 40명 반도체관 400126호 예약...`을 입력하고 `전송` 버튼을 클릭했다.
2. 2026-06-05 기준 기대 날짜/시간은 2026-06-06 14:00-16:00이다.
3. side panel은 `SK 2026-06-06 시간 표현 검증 회의` 제목과 결과 카드 `2026-06-06 14:00-16:00, 40명 조건`을 표시했다.
4. 실제 GLS 화면도 예약일 `2026-06-06`, 공간 `[400126] 첨단강의실 / 40 명 ~ 120 명` 상태를 유지했다. 시간 드롭다운은 저장 전 선택값 표시가 비어 있었지만 side panel 결과 카드 기준으로 시간 해석은 명확했다.
5. 같은 UC의 두 번째 표현을 위해 새 대화를 열었다.
6. `내일 14시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다. macOS 한글 입력이 일부 누락된 중간 상태가 보여 전송 전 `set_value`로 실제 입력칸 값을 정확한 문장으로 교체하고 전송했다.
7. side panel은 `SK 2026-06-06 시간 길이 검증 회의` 제목과 결과 카드 `2026-06-06 14:00-16:00, 40명 조건`을 표시했다.
8. 두 요청 모두 2026-06-06으로 현재 날짜 기준 2주 이내이므로 side panel `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.

### Result

- UC-08: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `63-uc08-from-to-time-parsed-14-16-pii-local-only.png`
- `64-uc08-duration-time-parsed-14-16-pii-local-only.png`

## Iteration 18 - UC-09 건물/캠퍼스 필터

### User Flow

1. 실제 Chrome side panel 새 대화에서 `2026년 7월 8일 19시부터 2시간 15명 율전 학생회관 예약...`을 입력하고 `전송` 버튼을 클릭했다.
2. side panel은 `SK 2026-07-08 건물 필터 검증 회의` 제목으로 바뀌었다.
3. 후보 검증은 `검증 1/1`로 진행됐고, 화면에는 `학생회관 · 연습실 예약 충돌`만 표시됐다.
4. 실제 GLS 본문도 건물 `학생회관`, 공간 후보 `03B08 연습실`만 표시했다.
5. side panel은 `조건에 맞는 공간이 없어요`, `2026-07-08 19:00-21:00, 15명 조건으로 확인했지만 지금은 맞는 공간이 없었습니다.`를 표시했다.
6. `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였고 저장/예약신청은 하지 않았다.

### Result

- UC-09: PASS.
- 건물/캠퍼스 필터: PASS. `율전 학생회관` 요청이 학생회관 후보로 제한됐고, 충돌 시 다른 캠퍼스/건물로 대체 추천하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `65-uc09-yuljeon-student-center-filtered-conflict-pii-local-only.png`

## Iteration 19 - UC-22 조건 미일치 안내

### User Flow

1. 실제 Chrome side panel에서 2026-06-06 14:00-16:00, 40명, 반도체관 400126 조건을 전송했다.
2. side panel은 실제 GLS 검증 뒤 `조건에 맞는 공간이 없어요`와 `2026-06-06 14:00-16:00, 40명 조건으로 확인했지만 지금은 맞는 공간이 없었습니다.`를 표시했다.
3. 이어 실제 Chrome side panel에서 2026-07-08 19:00-21:00, 15명, 율전 학생회관 조건을 전송했다.
4. side panel은 `학생회관 · 연습실 예약 충돌`과 `조건에 맞는 공간이 없어요`를 표시했다.
5. 두 화면 모두 `인원 조정해서 다시`, `시간대 19-21시로`, `다음 주 같은 요일로` 같은 조건 변경 제안을 표시했고, `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였다.
6. 무한 로딩, 침묵, 다른 조건으로의 묵시적 대체 추천은 관찰되지 않았다.

### Result

- UC-22: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `63-uc08-from-to-time-parsed-14-16-pii-local-only.png`
- `64-uc08-duration-time-parsed-14-16-pii-local-only.png`
- `65-uc09-yuljeon-student-center-filtered-conflict-pii-local-only.png`

## Iteration 20 - UC-29 행사 정보 누락 질문

### User Flow

1. 실제 Chrome side panel 새 대화에서 행사 설명 없이 `2026년 8월 21일 18시부터 2시간 40명 반도체관 400126호 예약해줘`만 입력했다.
2. side panel은 `빈 공간 찾는 중`, `검증 1/1`, `반도체관 · 첨단강의실 가용`, `추천 공간`, `예약 가능`, `첨단강의실 (400126)`을 표시했다.
3. 동시에 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?` 질문과 `네, 같게요`, `다른 행사예요` 버튼을 표시했다.
4. `다른 행사예요`를 클릭했다.
5. 화면은 `SW학생회 운영회의`, `동아리 연습`, `학회 세미나` quick reply와 `단체와 행사명을 알려주세요` 입력 상태로 바뀌었다.
6. 행사 정보 없이 저장/예약신청으로 진행하지 않았고, 저장 버튼은 클릭하지 않았다.

### Result

- UC-29: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `66-uc29-missing-event-info-single-prompt-pii-local-only.png`

## Iteration 21 - UC-30 신청서 항목 말로 수정

### User Flow

1. 실제 Chrome side panel의 UC-29 대화에서 `다른 행사예요`를 선택한 뒤 `주관단체 Codex E2E, 행사명 신청서 수정 전 회의, 행사구분 세미나/스터디, 사용목적 E2E 테스트 신청서 수정 전 검증`을 입력했다.
2. side panel은 추천 공간 `첨단강의실 (400126)`, 날짜 `2026-08-21`, 시간 `18:00-20:00`, 인원 `40명`을 유지하며 신청서 미리보기를 표시했다.
3. 같은 대화 입력창에 `행사명은 운영위원회 회의로, 주관단체는 총학생회로, 사용목적은 E2E 테스트 신청서 수정 검증으로 바꿔줘`를 입력하고 전송했다.
4. side panel은 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`를 표시했다.
5. 갱신된 신청서 미리보기에서 주관단체 `총학생회`, 행사명 `운영위원회 회의`, 사용목적 `E2E 테스트 신청서 수정 검증`을 확인했다.
6. 행사구분 `교내단체행사 (세미나/스터디)`, 행사인원 `40명`, 추천 공간 `첨단강의실 (400126)`, 날짜 `2026-08-21`, 시간 `18:00-20:00`은 유지됐다.
7. `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.

### Result

- UC-30: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `67-uc30-verbal-draft-fields-updated-pii-local-only.png`

## Iteration 22 - UC-31 행사구분 자동 분류

### User Flow

1. 실제 Chrome side panel의 UC-30 초안에서 `행사구분은 동아리 정기모임으로 바꿔줘`를 입력했다.
2. 화면은 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`를 표시했고, 신청서 미리보기의 행사구분이 `교내단체행사 (학생회/동아리)`로 바뀌었다.
3. 같은 초안에서 `행사구분은 보충수업으로 바꿔줘`를 입력했다.
4. 수정 전 화면은 `예약 요청을 해석하는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.`를 표시하고 행사구분을 바꾸지 못했다.
5. `extension/src/sidepanel/utils/parseModification.ts`와 `extension/src/background/handlers/chatHandler.ts`를 수정한 뒤 `pnpm build`를 실행했다.
6. 실제 Chrome `chrome://extensions` 세부 화면에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료` 문구를 확인했다.
7. reload 후 GLS 로그인이 풀려 제공된 계정으로 실제 UI 재로그인을 수행했다. 비밀번호 저장은 하지 않았다.
8. 같은 side panel 대화에서 `행사구분은 보충수업으로 바꿔줘`를 다시 입력했다.
9. 수정 후 화면은 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`를 표시하고 행사구분을 `보충수업/특강/시험`으로 바꿨다.
10. 이어서 `행사구분은 학과 행사로 바꿔줘`를 입력하자 행사구분이 `학과 주관행사`로 바뀌었다.
11. 추천 공간 `첨단강의실 (400126)`, 날짜 `2026-08-21`, 시간 `18:00-20:00`, 인원 `40명`, 주관단체 `총학생회`, 행사명 `운영위원회 회의`, 사용목적 `E2E 테스트 신청서 수정 검증`은 유지됐다.
12. `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.

### Root Cause

- 초안 수정 파서가 `행사구분` label을 edit으로 추출하지 않았다.
- background의 local draft edit guard도 행사구분 edit을 막고 있어, 이미 초안이 떠 있는 상태의 말 수정이 서버 일반 파싱 실패 경로로 넘어갔다.

### Fix

- `parseModification`에 `category` edit을 추가했다.
- 알려진 행사 표현을 GLS 행사구분 코드로 매핑했다.
- background local edit guard와 confidence 갱신에 `category`를 추가했다.
- Commit: `3675651` (`fix: 행사구분 말 수정 분류를 반영`).

### Verification

- `pnpm build` in `extension`: PASS.
- 실제 Chrome UI extension reload: PASS, `새로고침 완료`.
- UC-31: PASS after fix.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `68-uc31-category-bosupparse-fails-pii-local-only.png`
- `69-uc31-postfix-category-classification-pii-local-only.png`

## Iteration 23 - UC-46/48 지난 신청 제안 거절

### User Flow

1. 실제 Chrome `chrome://extensions` 세부 화면에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료` 문구를 확인했다.
2. toolbar의 `SKKU 공간예약` 버튼으로 side panel을 다시 열었다.
3. 새 대화에서 `저번처럼 해줘`를 입력했다.
4. side panel은 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`와 `지난주(?)처럼 Codex E2E 기능 검증 반복 회의로 작성할까요?`, `네, 같게요`, `다른 행사예요` 버튼을 표시했다.
5. `다른 행사예요`를 클릭했다.
6. 화면은 지난 신청 초안을 채우지 않고 `SW학생회 운영회의`, `동아리 연습`, `학회 세미나` quick reply와 `단체와 행사명을 알려주세요` 입력 상태로 돌아왔다.

### Result

- UC-46: PASS.
- UC-48: PASS.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `73-uc48-reject-previous-like-new-event-prompt.png`

## Iteration 24 - UC-95 시설 조건 graceful decline 초안 제거

### Failure

1. 실제 Chrome side panel 새 대화에서 `2026년 8월 14일 18시부터 2시간 40명 빔프로젝터 있는 곳, 주관단체 Codex E2E, 행사명 UC95 시설 조건 검증 회의, 행사구분 세미나, 사용목적 E2E 테스트 시설 조건 검증으로 예약해줘`를 입력했다.
2. 화면은 `빔프로젝터, 화이트보드 같은 시설·장비 조건은 아직 GLS에서 자동 확인할 수 없어요. 날짜, 시간, 인원 기준으로만 찾을 수 있습니다.`를 표시해 시설 조건을 조용히 무시하지는 않았다.
3. 동시에 disabled `신청서 미리보기` 초안이 남았고, 행사인원이 `1명`으로 잘못 보였다.
4. `GLS 신청 저장`과 `GLS 미리보기`는 disabled라 실제 저장/예약신청은 발생하지 않았다.

### Root Cause

- `extension/src/background/chatPolicies.ts`의 unsupported facility 분기가 `ready_to_search`만 false로 바꾸고, 새 대화에서 방금 파싱한 `application_state`를 그대로 유지했다.
- 그래서 unsupported 조건을 거절한 화면에도 잘못 파싱된 초안 카드가 노출됐다.

### Fix

- `applyChatSafetyOverride`의 시설·장비 조건 분기에서 이전 신청 상태가 없으면 `emptyApplicationState()`로 되돌리도록 변경했다.

### Verification

1. `pnpm build` in `extension`: PASS.
2. 실제 Chrome `chrome://extensions` 세부 화면에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료`를 확인했다.
3. 새 대화에서 같은 UC-95 조건을 다시 입력했다.
4. 화면은 시설·장비 조건 미지원 안내만 표시했고, 신청서 초안/저장 버튼 없이 `SW학생회 운영회의`, `동아리 연습`, `학회 세미나` quick reply와 `단체와 행사명을 알려주세요` 입력 상태로 돌아왔다.

### Result

- UC-95: PASS after fix.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `74-uc95-postfix-facility-decline-no-draft.png`

## Iteration 25 - UC-90 새벽 시간 거절 안내

### User Flow

1. 실제 Chrome side panel 새 대화에서 `2026년 8월 18일 새벽 3시부터 5시까지 20명 기능 검증 회의 예약해줘`를 입력했다.
2. 응답을 기다렸다.

### Result

- side panel은 `새벽이나 심야 시간대는 일반 GLS 공간예약 가능 시간 밖으로 보여요. 예: 09:00부터 22:00 사이처럼 다시 알려주세요.`를 표시했다.
- 후보 탐색이나 GLS 자동화로 넘어가지 않았다.
- 저장/예약신청 버튼은 노출되지 않았고 실제 신청은 발생하지 않았다.
- 같은 화면에 지난 신청 제안 카드가 함께 표시됐다. 시간대 거절과 입력 복구는 명확했으므로 UC-90은 PASS로 기록하되, invalid-time 화면의 memory suggestion 동반은 잔여 UX 개선 후보로 남긴다.

### Evidence

- `75-uc90-early-morning-time-decline-with-memory-suggestion.png`

## Iteration 26 - UC-108/113/117 graceful decline 보강

### User Flow

1. 실제 Chrome side panel 새 대화에서 `방금 예약 취소해줘`를 입력했다.
2. side panel 화면 응답을 확인하고 스크린샷을 저장했다.
3. 새 대화에서 `다음 달부터 매주 화요일 18시부터 2시간씩 20명 Codex E2E 반복 예약 회의 예약해줘`를 입력했다.
4. side panel 화면 응답을 확인하고 스크린샷을 저장했다.
5. 새 대화에서 `2026년 8월 25일 18시부터 2시간 40명 Codex E2E 활동으로 예약해줘. 주관단체 Codex E2E, 행사명 UC117 애매한 활동 검증, 사용목적 E2E 테스트 행사구분 확인`을 입력했다.
6. side panel 화면 응답을 확인하고 스크린샷을 저장했다.
7. UC-114는 `book a room tomorrow 3pm for 10 people`로 재검증했다.

### Result

- UC-108: PASS. `이미 저장되거나 제출된 예약의 취소·변경은 이 확장에서 대신 처리하지 않아요. GLS 화면에서 직접 확인해 주세요.` 안내를 표시했다.
- UC-113: PASS. `반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.` 안내를 표시했다.
- UC-117: PASS. `학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?` 확인 질문을 표시했다.
- UC-114: PASS 재검증. `현재는 한국어 예약 요청만 안정적으로 처리할 수 있어요. 날짜, 시간, 인원을 한국어로 다시 알려주세요.` 안내를 표시했다.
- 네 케이스 모두 후보 조회, GLS 자동화, 저장/예약신청 버튼 노출 없이 멈췄다.
- UC-108/113에서는 지난 신청 제안 카드가 함께 표시됐다. 거절 문구와 자동화 중단은 명확했으므로 PASS로 기록하되, decline 화면의 memory suggestion 동반은 잔여 UX 개선 후보로 남긴다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `76-uc108-cancel-change-graceful-decline.png`
- `77-uc113-repeat-reservation-decline.png`
- `78-uc117-ambiguous-category-asks-clarification.png`
- `79-uc114-english-graceful-decline.png`

## Iteration 27 - 특정 공간 지정과 추천 후 조건 변경

### User Flow

1. 실제 Chrome side panel 새 대화에서 `2026년 8월 26일 18시부터 20시까지 400126 예약해줘. 40명, 주관단체 Codex E2E, 행사명 UC133 공간코드 검증 회의, 행사구분 세미나, 사용목적 E2E 테스트 공간코드 지정`을 입력했다.
2. 추천 카드에서 `첨단강의실 (400126)`과 `반도체관(40동)`을 확인했다.
3. 같은 대화에서 `아 시간은 19시부터로 바꿔줘`를 입력했다.
4. 추천 카드 시간이 `19:00-20:00`으로 갱신되는지 확인했다.
5. 새 대화에서 `반도체관 400126호 2026년 8월 27일 18시부터 20시까지 40명 예약해줘. 주관단체 Codex E2E, 행사명 UC84 특정 공간 검증 회의, 행사구분 세미나, 사용목적 E2E 테스트 특정 공간 지정`을 입력했다.
6. 새 대화에서 일반 조건 `2026년 8월 28일 18시부터 20시까지 40명 예약해줘...`를 입력한 뒤, 완료 상태의 `다른 공간` quick action을 클릭했다.

### Result

- UC-133: PASS. 숫자 `400126`이 인원/날짜가 아니라 특정 공간으로 해석됐고, 추천 카드에 `첨단강의실 (400126)`, `반도체관(40동)`, `2026-08-26`, `18:00-20:00`이 표시됐다.
- UC-96: PASS. 추천 뒤 시간 변경 입력에 `조건을 수정했어요. 같은 조건으로 다시 검색할게요.`가 표시됐고, 추천 카드 시간이 `19:00-20:00`으로 갱신됐다.
- UC-84: PASS. `반도체관 400126호` 요청이 `첨단강의실 (400126)` 특정 공간 추천으로 수렴했고 다른 공간을 먼저 추천하지 않았다.
- UC-13: PARTIAL. `다른 공간` 입력에 `같은 조건으로 다른 공간을 찾아볼게요.`가 표시되어 조건 유지와 의도 인식은 확인됐다. 다만 나머지 후보가 불가/timeout이어서 두 번째 추천으로 전환되지는 못했다.
- 네 케이스 모두 실제 저장/예약신청 없음.
- UC-13은 안전상 치명 실패는 아니지만 후보 전환 성공 경험은 미검증으로 남는다.

### Evidence

- `80-uc133-space-code-specific-recommendation.png`
- `81-uc96-condition-change-researches-latest-time.png`
- `82-uc84-specific-space-recommendation.png`
- `83-uc13-other-space-partial-no-second-available.png`

## 현재 전체 회귀 상태

- 오늘 Computer Use로 신규/재검증한 UC: 82개.
- 오늘 기준 PASS: 77.
- 오늘 기준 PARTIAL: 5.
- 오늘 기준 FAIL after fix: 0.
- 오늘 기준 BLOCKED: 0.
- 오늘 기준 NOT_RUN: 60.
- 2026-06-04 기존 Computer Use 기록: 71개 UC, 65 PASS, 6 PARTIAL, 0 FAIL/BLOCKED.
- 최종 목표 기준 UC-01부터 전체 142개 회귀는 아직 완료되지 않았다.

## 다음 진행 필요

- UC-01 strict onboarding reset.
- 제출 성공/실패/중복 방지 계열 UC-34~40.
- 오류 복구 전체 UC-67~78.
- 통합 여정 UC-80~83.
- 리마인드 UC-51~55, UC-81, UC-143~145.
- 개인화 UC-134~142.
- IME 조합 UC-127.
- 실제 저장이 필요한 케이스는 계속 2주 이후 날짜 guard를 적용해야 한다.

## Iteration 28 - 30분 단위와 과거 시간 guard 보강

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 `2026년 8월 31일 6시 반부터 8시까지 12명...`을 입력했다.
2. 수정 전 화면은 `오전/오후가 빠진 시간은 헷갈릴 수 있어요...` 안내를 표시했고, 동시에 신청서 초안의 `행사인원`이 `1명`으로 잘못 보였다.
3. Computer Use로 새 대화에서 `오늘 오후 2시에 10명...`을 입력했다.
4. 수정 전 화면은 과거 시간 안내 없이 `신청 정보를 업데이트했어요...`와 `행사인원 1명` 초안으로 넘어갔다.
5. `shared/reservation/slotPolicy.ts`, `server/src/routes/parse.ts`, `server/src/application/state.ts`를 수정했다.
6. `pnpm build`를 server/extension에서 실행했고 모두 PASS했다.
7. 서버를 localhost:8000에서 재시작했고, actual `chrome://extensions` UI의 reload 버튼으로 extension/dist를 반영했다.
8. Computer Use로 UC-88을 재실행했다.
9. Computer Use로 UC-91을 재실행했다.
10. Computer Use로 UC-111 회귀를 재실행했다.

### Result

- UC-88: PARTIAL after fix. 이전 오전/오후 재질문은 사라지고 후보 탐색으로 진행됐으며, 신청서 초안은 `행사인원 12명`을 표시했다. 다만 GLS 후보 검증이 timeout으로 끝나 추천 카드의 최종 시간 표시는 확보하지 못했다.
- UC-91: PASS after fix. `지난 날짜나 이미 지난 시간으로는 예약할 수 없어요. 오늘 이후의 날짜와 시간을 다시 알려주세요.` 안내만 표시하고 후보 조회/저장 단계로 가지 않았다.
- UC-111: PASS regression. `6시부터 8시까지`는 여전히 오전/오후 확인 질문으로 멈췄고, 마지막 보완 후 초안 인원은 `12명`으로 표시됐다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `84-uc88-half-hour-time-fail-asks-ampm-and-person-count.png`
- `85-uc91-past-time-fail-draft-created.png`
- `86-uc88-post-fix-half-hour-progress-headcount-12.png`
- `87-uc88-post-fix-partial-timeout-after-headcount-fix.png`
- `88-uc91-post-fix-past-time-pass-no-draft.png`
- `89-uc111-regression-bare-time-still-asks-ampm-headcount-gap.png`
- `90-uc111-regression-bare-time-asks-and-headcount-12.png`

## Iteration 29 - 너무 먼 날짜 guard 확인

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 `내년 12월 31일 18시부터 20시까지 20명 회의실 예약해줘. 주관단체 Codex E2E, 행사명 UC92 너무 먼 날짜 회의, 행사구분 세미나, 사용목적 E2E 테스트 너무 먼 날짜 안내`를 입력했다.
2. 전송 후 화면 응답이 후보 조회, GLS 자동화, 신청서 초안 또는 저장 버튼으로 넘어가는지 관찰했다.

### Result

- UC-92: PASS. 화면에 `너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.`가 표시됐다.
- 후보 조회, 신청서 초안, `GLS 신청 저장` 노출, 실제 저장/예약신청은 발생하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `91-uc92-too-far-date-guard-pass.png`

## Iteration 30 - 소인원 요청의 대형 공간 회피 확인

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 `2026년 8월 24일 18시부터 20시까지 2명 회의실 예약해줘. 주관단체 Codex E2E, 행사명 UC93 소규모 회의, 행사구분 세미나, 사용목적 E2E 테스트 최소 인원 검증`을 입력했다.
2. 추천/검증 카드가 40명 이상 최소정원 공간을 부적절하게 권하는지 관찰했다.

### Result

- UC-93: PASS. 화면은 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I` 같은 소규모 후보만 다뤘고 대형 최소정원 공간을 부적절하게 추천하지 않았다.
- 후보 검증은 timeout으로 중단됐지만 `GLS 신청 저장`은 disabled였다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `92-uc93-small-headcount-avoids-large-space-pass-timeout-safe.png`

## Iteration 31 - 건물 조건 실패 후 범위 확장 안내 보강

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 `율전 학생회관에서 2026년 8월 25일 18시부터 20시까지 80명...`을 입력했다.
2. 수정 전 화면은 `조건에 맞는 공간이 없어요`와 인원/시간/날짜 조정 버튼만 표시했고, 같은 캠퍼스 전체로 넓히는 선택지를 제공하지 않았다.
3. `extension/src/sidepanel/ChatScene.tsx`, `extension/src/background/handlers/chatHandler.ts`를 수정했다.
4. `pnpm build`를 server/extension에서 실행했고 모두 PASS했다.
5. actual `chrome://extensions` UI의 reload 버튼으로 extension/dist를 반영했다.

### Result

- Root cause: 특정 건물/공간 조건 실패 후 no-space UI와 background 명령 처리에 위치 범위 확장 회복 경로가 없었다.
- Fix: no-space 카드 문구와 hint chip에 같은 캠퍼스 전체 확장 선택지를 추가하고, 해당 문장 입력 시 `building`/`space` 슬롯을 지우고 재검색하도록 했다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `93-uc94-building-scope-fail-no-broaden-option.png`

## Iteration 32 - UC-94 after-fix 회귀

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 같은 UC-94 조건을 재입력했다.
2. no-space 화면에서 위치 확장 안내와 버튼을 확인했다.
3. `같은 캠퍼스 전체로 넓혀줘` 버튼을 실제 클릭했다.

### Result

- UC-94: PASS after fix. 화면에 `건물/공간 조건을 빼고 같은 캠퍼스 전체로 넓혀볼 수 있어요.`와 `같은 캠퍼스 전체로 넓혀줘` 버튼이 표시됐다.
- 버튼 클릭 후 `건물/공간 조건을 빼고 같은 캠퍼스 전체에서 다시 찾아볼게요.`가 표시됐고, 후보가 `반도체관 · 첨단강의실 (400126)`으로 넓어졌다.
- 저장 버튼은 노출됐지만 클릭하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `94-uc94-post-fix-building-scope-broaden-pass.png`

## Iteration 33 - UC-86/87 위치 해석 회귀

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 `학생회관에서 2026년 8월 26일 18시부터 20시까지 20명...`을 입력했다.
2. 화면이 명륜/율전 확인 질문으로 멈추는지 관찰했다.
3. 새 대화에서 `자과캠에서 2026년 8월 27일 18시부터 20시까지 20명...`을 입력했다.
4. 후보가 올바른 캠퍼스 계열로 나오는지 관찰했다.

### Result

- UC-86: FAIL before fix. 화면은 캠퍼스 확인 질문 없이 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`와 신청서 초안으로 넘어갔다. 저장 버튼은 disabled라 실제 저장 위험은 없었다.
- UC-87: PASS. `자과캠` 요청이 `의학관`, `산학협력센터`, `학생회관`, `제2공학관` 같은 율전/자연과학캠퍼스 계열 후보로 수렴했다. 후보 검증은 timeout으로 중단됐지만 저장 버튼은 disabled였다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `95-uc86-ambiguous-student-center-fail-no-campus-question.png`
- `96-uc87-jagwacam-alias-yuljeon-candidates-pass-search-pending.png`

## Iteration 34 - 학생회관 캠퍼스 모호성 guard 보강

### Root Cause

- 서버의 `학생회관` 모호성 guard는 LLM이 `building: 학생회관`으로 채운 경우에만 동작했다.
- 실제 실패 케이스에서는 LLM이 위치를 명시 슬롯으로 채우지 않았고, 확장 background 후처리도 신청서 초안 안내를 그대로 사용자에게 표시했다.

### Fix

- `server/src/routes/parse.ts`: 원문에 `학생회관`이 있고 캠퍼스 별칭이 없으면 LLM 슬롯과 무관하게 `campus` 확인 질문으로 멈추게 했다.
- `extension/src/background/handlers/chatHandler.ts`: 확장 후처리에도 동일 guard를 추가해 추천/자동화 진행보다 캠퍼스 확인 질문을 우선하게 했다.

### Verification

- `pnpm build` in `server`: PASS.
- `pnpm build` in `extension`: PASS.
- actual `chrome://extensions` UI의 reload 버튼으로 extension/dist 반영: PASS.

## Iteration 35 - UC-86 after-fix 회귀

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 같은 UC-86 조건을 재입력했다.
2. 확인 질문, 후보 탐색 여부, 저장 버튼 상태를 관찰했다.

### Result

- UC-86: PASS after fix. 화면에 `학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.`가 표시됐다.
- `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였다.
- 후보 탐색, GLS 자동화, 실제 저장/예약신청은 발생하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `97-uc86-post-fix-student-center-campus-question-pass.png`

## Iteration 36 - UC-116 장문 신청서 입력 회귀

### User Flow

1. Computer Use로 실제 Chrome side panel을 열고 `새 대화`를 클릭했다.
2. 2026-08-29 18:00-20:00, 20명 회의실 조건에 긴 `행사명`과 긴 `사용목적`을 붙여 입력했다.
3. 실제 `전송` 버튼을 클릭했다.
4. 응답 문구, 신청서 초안, 저장 버튼 노출 여부를 관찰했다.

### Result

- UC-116: FAIL before fix.
- 화면 결과: `반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.`가 표시됐다.
- 화면 결과: 신청서 초안은 행사명 `UC116 매우 긴`, 사용목적 `E2E 테스트 긴`처럼 장문 값이 조용히 잘린 상태로 보였다.
- 기대 결과와 차이: 긴 행사명/목적은 제출 전에 길이 제한 안내로 멈춰야 하며, 반복 예약으로 오탐하거나 silent truncation을 보이면 안 된다.
- 실제 저장/예약신청: 없음. 저장 버튼은 disabled였다.
- 실수 신청: 없음.

### Evidence

- `98-uc116-long-event-purpose-fail-silent-truncation.png`

## Iteration 37 - 장문 신청서 필드 추출과 반복 guard 보강

### Root Cause

- `server/src/application/state.ts`의 명시 필드 추출 regex가 현재 필드명도 종료 라벨로 취급해, 값 안의 `행사명 검증`, `목적 문구` 같은 표현에서 추출을 중단했다.
- `extension/src/background/chatPolicies.ts`의 반복 예약 정책이 신청서 명시 필드 본문 안의 `반복` 단어까지 예약 반복 의도로 판정했다.

### Fix

- `server/src/application/state.ts`: `주관단체`, `행사명`, `사용목적`별 stop label을 분리해 자기 필드명은 자기 값을 종료시키지 않게 했다.
- `extension/src/background/chatPolicies.ts`: 반복 예약 판정 전 신청서 명시 필드 구간을 제거해 행사명/목적 설명 안의 `반복`을 예약 반복 의도로 오탐하지 않게 했다.

### Verification

1. `pnpm build` in `server`: PASS.
2. `pnpm build` in `extension`: PASS.
3. 실제 Chrome `chrome://extensions` UI에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했다.
4. Chrome 화면에 `새로고침 완료`가 표시됐다.

## Iteration 38 - UC-116 after-fix 회귀

### User Flow

1. Computer Use로 실제 Chrome toolbar의 `SKKU 공간예약` 버튼을 클릭해 side panel을 열었다.
2. `새 대화`를 클릭했다.
3. 같은 UC-116 장문 입력을 composer에 넣었다.
4. 실제 `전송` 버튼을 클릭했다.
5. 응답 문구, 추천/초안/저장 버튼 노출 여부를 관찰했다.

### Result

- UC-116: PASS after fix.
- 화면 결과: `행사명이 너무 길어요. 현재 137자라서 GLS 저장 전에 실패할 수 있어요. 50자 이내로 줄여서 다시 알려주세요.`가 표시됐다.
- 반복 예약 거절 문구는 표시되지 않았다.
- 장문 값이 조용히 잘린 신청서 초안은 표시되지 않았다.
- `GLS 신청 저장`이나 GLS `저장`은 노출/클릭되지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `99-uc116-post-fix-long-event-purpose-guard-pass.png`

## Iteration 39 - UC-118 빈 기본 연락처 guard

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 2026-09-03, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
2. 추천/초안 화면에서 `GLS 미리보기`를 클릭해 실제 GLS 신청 폼을 열었다.
3. 실제 GLS 폼의 연락처 입력칸을 클릭하고 전체 선택/삭제로 빈 값 precondition을 만들었다.
4. GLS 화면의 `저장` 버튼은 누르지 않고, side panel의 `GLS 신청 저장`을 클릭했다.
5. side panel 오류 문구, 저장 버튼 상태, 실제 GLS 저장/신청 발생 여부를 관찰했다.
6. 테스트 뒤 연락처 입력칸은 원래 값으로 복구했다.

### Result

- UC-118: PASS.
- 화면 결과: `GLS 기본 연락처가 비어 있어요. GLS에서 연락처를 먼저 입력한 뒤 다시 시도해 주세요.`가 표시됐다.
- `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태로 돌아갔다.
- GLS `저장` 클릭, 신청 완료 팝업, 신청 목록 행 생성은 발생하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `100-uc118-contact-guard-precondition-draft-ready-no-save.png`
- `101-uc118-contact-cleared-before-extension-submit-pii-local-only.png`
- `102-uc118-contact-empty-guard-pass-no-save-pii-local-only.png`

## Iteration 40 - UC-121 진행 중 GLS 신청 가능 상한일 mismatch 발견

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 2026-09-04, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
2. 추천/초안 화면에서 `GLS 미리보기`를 클릭해 실제 GLS 신청 폼을 열었다.
3. 저장 직전 날짜, 시간, 공간, 인원, 테스트 목적 문구를 확인했다.
4. GLS 페이지의 실제 `저장`을 클릭했다.

### Result

- GLS가 `예약일은 (20260831) 까지만 가능 합니다.` 알림으로 저장을 거절했다.
- 수정 전 확장은 2026-09-04를 추천/저장 단계까지 보냈다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `103-uc121-stale-precondition-gls-form-ready-pii-local-only.png`
- `104-uc121-gls-max-date-alert-no-save-pii-local-only.png`

## Iteration 41 - GLS 신청 가능 상한일 guard 보강

### Root Cause

- `shared/reservation/slotPolicy.ts`의 future booking window가 180일 기준이라 실제 GLS 신청 가능 상한인 2026-08-31보다 늦은 2026-09-04를 허용했다.

### Fix

- `shared/reservation/slotPolicy.ts`: 너무 먼 날짜 판정을 현재 월 포함 두 달 뒤 말일 기준으로 변경했다.
- 2026-06-05 기준 신청 가능 상한은 2026-08-31이다.

### Verification

1. `pnpm build` in `server`: PASS.
2. `pnpm build` in `extension`: PASS.
3. 실제 Chrome `chrome://extensions` UI에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했다.
4. Chrome 화면에 `새로고침 완료`가 표시됐다.

## Iteration 42 - 상한일 guard after-fix 회귀

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 같은 2026-09-04, 18:00-20:00, 40명, 400126 조건을 다시 입력했다.
2. 응답 문구와 추천/저장 버튼 노출 여부를 관찰했다.

### Result

- 화면에 `너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.`가 표시됐다.
- 후보 조회, 추천 카드, `GLS 신청 저장`, GLS `저장` 단계로 진행하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `105-uc121-max-date-guard-postfix-no-save.png`

## Iteration 43 - UC-121 stale 추천 제출 직전 재확인

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에서 2026-08-31, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
2. 추천 카드와 신청서 초안을 확인했다.
3. `GLS 미리보기`를 클릭해 실제 GLS 폼을 채웠다.
4. 저장 직전 날짜, 시간, 공간, 인원, 테스트 목적 문구를 재확인했다.
5. GLS 페이지의 실제 `저장`을 클릭해 UC-121 stale seed 예약을 만들었다.
6. 같은 side panel 추천의 `GLS 신청 저장`을 클릭해 제출 직전 재확인 동작을 관찰했다.

### Result

- UC-121: PASS.
- GLS seed 저장: 2026-08-31 18:00-20:00, 공간코드 400126, 40명, 사용목적 `E2E 테스트 제출 직전 재확인 seed`.
- side panel 결과: `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요. (18:00~20:00 예약) 다른 공간이나 시간을 선택해 주세요.`
- `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태로 바뀌었다.
- 중복 저장: 없음.
- 실수 신청: 없음.

### Evidence

- `106-uc121-allowed-date-recommendation-ready-no-save.png`
- `107-uc121-seed-gls-form-ready-before-save-pii-local-only.png`
- `108-uc121-seed-gls-save-success-pii-local-only.png`
- `109-uc121-stale-submit-recheck-blocked-no-duplicate-pii-local-only.png`

## Iteration 44 - UC-124 특정 방 충돌 graceful decline

### User Flow

1. UC-121 seed 예약이 실제 GLS에 남아 있는 상태에서 Computer Use로 side panel `새 대화`를 클릭했다.
2. 첫 변형으로 `2026년 8월 31일 18시부터 20시까지 40명 반도체관 400126호만 쓰고 싶어. 그 방 언제 비어?...` 문장을 붙여넣고 전송했다.
3. 두 번째 변형으로 같은 날짜/시간/공간에 대해 `반도체관 400126호 예약해줘...` 문장을 붙여넣고 전송했다.
4. 실제 Chrome/GLS 화면에서 예약현황과 side panel 결과 문구, 저장/미리보기 버튼 상태를 관찰했다.

### Result

- UC-124: PASS.
- 첫 변형은 `특정 공간의 빈 시간대를 자동으로 훑어 제안하는 기능은 아직 지원하지 않아요...` 안내로 멈췄다.
- 두 번째 변형은 GLS 예약현황의 UC-121 seed 행을 기준으로 `반도체관 · 첨단강의실 18:00~20:00 예약`과 `조건에 맞는 공간이 없어요`를 표시했다.
- `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였고, 자동 빈 시간 스캔이나 조용한 다른 방 대체는 없었다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `110-uc124-specific-room-conflict-decline-no-save.png`
- `111-uc124-specific-room-conflict-pass-no-save-pii-local-only.png`

## Iteration 45 - UC-127 한글 IME Enter premature send 수정

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화 입력창을 클릭했다.
2. macOS 입력 소스를 한글로 전환하고 2벌식 키 입력 `e`, `k`로 `ㄷㅏ` 상태를 만들었다.
3. 조합 확정 의도로 `Return`을 눌렀다.
4. 수정 후 extension build/reload를 마친 뒤 같은 `ㄷㅏ` + `Return`과 완성 문장 `다음 주 화요일` + `Return`을 다시 실행했다.

### Result

- 수정 전 UC-127: FAIL. `ㄷㅏ`가 바로 사용자 메시지로 전송되고 지난 행사 제안 카드가 열렸다.
- Root cause: `ChatComposer`가 `nativeEvent.isComposing`만 확인해 실제 Chrome/macOS 한글 자모 상태를 composition 중으로 보지 못했다.
- Fix: `extension/src/sidepanel/components/ChatComposer.tsx`에서 composition ref와 Hangul Jamo suffix guard를 추가했다.
- Commit: `fb5ae90 fix: 한글 조합 Enter 조기 전송을 막음`.
- Build: `pnpm build` in `extension` PASS.
- Reload: 실제 Chrome `chrome://extensions` UI의 reload 버튼 클릭, `새로고침 완료` 확인.
- 수정 후 UC-127: PASS. `ㄷㅏ` + `Return`은 전송되지 않고 입력창에 남았고, 완성 문장 `다음 주 화요일` + `Return`은 실제 사용자 메시지로 전송됐다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `112-uc127-ime-enter-premature-send-fail-pii-local-only.png`
- `113-uc127-postfix-ime-enter-does-not-send.png`
- `114-uc127-postfix-complete-text-enter-sends.png`

## Iteration 46 - UC-128 긴 붙여넣기 화면 안정성

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화 입력창을 클릭했다.
2. 2026-08-28 18:00-20:00, 40명, 반도체관 400126 조건과 긴 여러 줄 주관단체/행사명/행사구분/사용목적 문장을 붙여넣었다.
3. 전송 전 입력창의 줄바꿈과 전송 버튼 위치를 관찰했다.
4. `전송` 버튼을 클릭한 뒤 사용자 메시지 버블, 추천 카드, 신청서 미리보기, 하단 버튼 배치를 관찰했다.
5. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-128: PASS.
- 전송 전 긴 입력은 입력창 내부에서 줄바꿈됐고, 전송 버튼은 오른쪽 하단에 유지됐다.
- 전송 후 사용자 메시지 버블과 신청서 미리보기의 긴 사용목적은 side panel 너비 안에서 줄바꿈됐다.
- 탐색 중에는 `빈 공간 찾는 중`, `검증 1/1`, disabled `GLS 신청 저장`/`GLS 미리보기`가 표시됐다.
- 탐색 완료 뒤 `추천 공간`, `예약 가능`, `첨단강의실 (400126)`, `신청서 미리보기`, `GLS 신청 저장`, `GLS 미리보기`, `수정` 버튼이 모두 화면 안에 유지됐다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `115-uc128-long-paste-before-send.png`
- `116-uc128-long-paste-card-searching-layout.png`
- `117-uc128-long-paste-final-review-layout-no-save.png`

## Iteration 47 - UC-129 좁은 사이드패널 버튼 접근성

### User Flow

1. Computer Use로 실제 Chrome side panel의 크기 조절 핸들을 오른쪽으로 끌어 최소 폭에 가까운 상태를 만들려고 시도했다.
2. Chrome side panel이 현재 폭 근처에서 최소 폭으로 유지되는 것을 확인했다.
3. 같은 좁은 패널 상태에서 UC-128 검토 화면을 위아래로 스크롤했다.
4. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-129: PASS.
- 상단에서는 사용자 메시지, 완료된 후보 검증 상태, 추천 공간 `첨단강의실 (400126)` 카드가 화면 안에 유지됐다.
- 하단에서는 신청서 미리보기의 긴 사용목적과 `GLS 신청 저장`, `GLS 미리보기`, `수정`, `제출`, `행사명만 바꾸기`, `다른 공간` 버튼이 겹치지 않고 접근 가능했다.
- 버튼이나 긴 텍스트가 서로 겹치거나 화면 밖으로 밀려 실제 클릭 대상을 가리는 현상은 보이지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `118-uc129-narrow-panel-buttons-visible-no-save.png`
- `119-uc129-narrow-panel-recommendation-accessible.png`
- `120-uc129-narrow-panel-summary-buttons-accessible-no-save.png`

## Iteration 48 - UC-130/131 대화 삭제와 기록 숨김

### User Flow

1. Computer Use로 실제 Chrome side panel의 `대화 목록`을 열었다.
2. 제출 전 검토 단계에 있던 `UC128 긴 붙여넣기 검증 회의` 대화가 최근 대화 목록 상단에 표시되는 것을 확인했다.
3. 해당 항목의 `대화 삭제` 버튼을 클릭했다.
4. 버튼이 `대화 삭제 확인`, `한 번 더 누르면 삭제` 상태로 바뀐 것을 확인했다.
5. 같은 삭제 버튼을 다시 눌러 실제 삭제를 완료했다.

### Result

- UC-130: PASS.
- UC-131: PASS.
- 삭제 전 목록에는 `UC128 긴 붙여넣기 검증 회의` 제목과 `신청 정보를 업데이트했어요...` 미리보기가 보였다.
- 삭제 확인 단계가 있어 실수 삭제를 막는다.
- 삭제 완료 후 목록 상단은 `다음 주 화요일` 대화로 바뀌었고, `UC128 긴 붙여넣기 검증 회의` 항목은 더 이상 보이지 않았다.
- 삭제 과정에서 저장/미리보기/제출 버튼은 누르지 않았고, GLS 저장/예약신청은 발생하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `121-uc130-uc131-before-delete-conversation-visible.png`
- `122-uc130-delete-confirmation-state.png`
- `123-uc130-uc131-after-delete-conversation-removed-no-save.png`

## Iteration 49 - UC-134 개인화 후보 우선순위

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 18:00-20:00, 40명, 일반 `회의실` 조건과 `UC134 개인화 추천 검증 회의` 신청 정보를 붙여넣었다.
2. `전송` 버튼을 실제 클릭했다.
3. 후보 조회 카드에서 후보 순서와 timeout 상태를 관찰했다.
4. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-134: PARTIAL.
- 후보 순서에 `반도체관 · 첨단강의실`, `경영관 · 세미나실4`, `의학관 · 강의실`이 표시되어 반복 사용 공간 400126이 첫 후보로 올라왔다.
- 최종 추천 완료 전 `반도체관 · 첨단강의실 검증 시간 초과`와 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 수렴했다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `124-uc134-uc135-personalized-search-in-progress.png`
- `125-uc134-personalized-first-candidate-but-timeout-partial.png`

## Iteration 50 - UC-135 추천 이유 표시

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 18:00-20:00, 40명, `반도체관 400126호`와 `UC135 추천 이유 검증 회의` 신청 정보를 붙여넣었다.
2. `전송` 버튼을 실제 클릭했다.
3. 추천 완료 카드의 공간명, 추천 이유, 저장/미리보기 버튼 상태를 관찰했다.
4. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-135: PASS.
- 추천 카드에 `첨단강의실 (400126)`이 표시됐다.
- 추천 이유 영역에 `최근 같은 요일·시간대 예약에서 4회 사용`이 표시됐다.
- `GLS 신청 저장`, `GLS 미리보기`, `수정` 버튼은 화면 안에 표시됐지만 클릭하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `126-uc135-recommendation-reason-visible-no-save.png`

## Iteration 51 - UC-136 이력 없는 공간 추천 이유 Safety

### User Flow

1. Computer Use로 실제 Chrome side panel에서 이력 없는 보조 후보 공간을 대상으로 세 차례 재시도했다.
2. 1차: 2026-08-28 18:00-20:00, 40명, `경영관 32425D` 조건을 붙여넣고 전송했다.
3. 2차: 2026-08-28 18:00-20:00, 40명, `의학관 50304` 조건을 Computer Use `type_text`로 시도했지만 한글이 보존되지 않아 UC 판정 증거에서 제외했다.
4. 3차: 2026-07-24 10:00-12:00, 40명, `의학관 50304` 조건을 붙여넣고 전송했다. 오전/오후 확인 질문에 `오전 10시부터 낮 12시까지로 해줘`라고 답했다.
5. 모든 시도에서 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-136: PARTIAL.
- 1차는 `경영관 · 세미나실4 예약 충돌`과 `조건에 맞는 공간이 없어요`로 끝났고, 저장/미리보기 버튼은 disabled였다.
- 3차는 `의학관 · 강의실 검증 시간 초과`와 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났고, 저장/미리보기 버튼은 disabled였다.
- 어떤 화면에서도 근거 없는 `추천 이유` 문구는 표시되지 않았다.
- 최종 추천 카드가 만들어지지 않아 strict PASS로 세지 않는다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `127-uc136-no-history-space-conflict-no-reason-no-save.png`
- `128-uc136-no-history-space-timeout-no-fabricated-reason-no-save.png`

## Iteration 52 - UC-137 차 있는 단골 공간 회피

### User Flow

1. UC-121에서 실제 저장한 2026-08-31 18:00-20:00, 400126 seed 신청이 남아 있는 상태에서 Computer Use로 실제 Chrome side panel 새 대화를 열었다.
2. 2026-08-31 18:00-20:00, 40명, 일반 `회의실` 조건과 `UC137 차 있는 단골 회피 검증 회의` 신청 정보를 붙여넣었다.
3. `전송` 버튼을 실제 클릭했다.
4. 후보 조회 화면에서 400126이 예약 가능 추천으로 살아나는지 확인했다.
5. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-137: PASS.
- 후보 목록에서 `반도체관 · 첨단강의실`은 `18:00~20:00 예약`으로 표시됐다.
- 이후 `경영관 · 세미나실4`, `의학관 · 강의실` 후보 검증은 timeout 안내로 끝났다.
- 최종 화면에서 `GLS 신청 저장`과 `GLS 미리보기`는 disabled였고, 차 있는 단골 공간을 예약 가능 카드로 추천하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `129-uc137-favorite-occupied-marked-reserved-searching.png`
- `130-uc137-occupied-favorite-not-recommended-no-save.png`

## Iteration 53 - UC-139 거절 피드백 seed 시도

### User Flow

1. Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 15:00-16:00, 2명, 일반 `회의실` 조건과 `UC139 거절 반영 seed 회의` 신청 정보를 붙여넣었다.
2. `전송` 버튼을 실제 클릭했다.
3. 후보 조회 화면에서 추천 카드가 만들어지는지 확인했다.
4. timeout 후 quick action `다른 공간`을 실제 클릭해 화면 반응을 확인했다.
5. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- Seed attempt: INCONCLUSIVE. 추천 완료 카드가 만들어지지 않아 최종 케이스 카운트에는 넣지 않는다.
- 후보 순서에 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I`이 표시됐다.
- `수선관 · 세미나실`은 `예약 충돌`, `산학협력센터 · 세미나실 I`은 `검증 시간 초과`로 끝났다.
- `다른 공간` 클릭 뒤 `같은 조건으로 다른 공간을 찾아볼게요.` 문구가 표시됐지만 새 추천으로 이어지지는 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `131-uc139-seed-candidates-searching.png`
- `132-uc139-seed-no-recommendation-timeout.png`
- `133-uc139-seed-other-space-after-timeout.png`

## Iteration 54 - UC-139/140 거절 후보 재검색과 후보 유지

### User Flow

1. 보조 DB 조회로 현재 테스트 클라이언트에 2026-06-25 19:00 기준 테스트 공간 `85529`, `26305`, `03B08`의 `rejected_candidate` fixture가 있음을 확인했다. 이는 조건 선정용이며 PASS 판정에는 사용하지 않았다.
2. Computer Use로 실제 Chrome side panel 새 대화에 2026-06-25 19:00-20:00, 2명, 일반 `회의실` 조건과 `UC139 거절 반영 재검색 회의` 신청 정보를 붙여넣었다.
3. `전송` 버튼을 실제 클릭했다.
4. 후보 조회 카드의 후보 순서, timeout 상태, 저장 버튼 상태를 관찰했다.
5. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-139: PASS.
- UC-140: PASS.
- 후보 순서가 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I`로 표시됐다.
- 같은 슬롯에서 거절 이력이 있는 `산학협력센터 · 세미나실 I`은 첫 후보로 독점되지 않고 두 번째 후보로 표시됐다.
- 동시에 거절 이력 후보가 후보군에서 제거되지 않고 계속 목록에 남았다.
- 최종 화면은 `수선관 · 세미나실 검증 시간 초과`, `산학협력센터 · 세미나실 I`, `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났으며, 저장/미리보기 버튼은 disabled였다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `134-uc139-rejected-spaces-ranked-after-unrejected.png`
- `135-uc139-final-timeout-but-rejected-still-candidate.png`

## Iteration 55 - UC-141/142 거절 강도와 단골 이력 우선

### User Flow

1. 보조 DB 조회로 2026-08-28 18:00 기준 400126 `rejected_candidate` 이벤트와 400126 완료 이력 fixture가 공존함을 확인했다. 이는 조건 선정용이며 PASS 판정에는 실제 화면 관찰만 사용했다.
2. UC-134/135에서 이미 Computer Use로 2026-08-28 18:00-20:00, 40명 조건을 실행한 화면을 UC-141 증거로 재사용했다.
3. Computer Use로 실제 Chrome side panel 새 대화에 2026-06-25 20:00-21:00, 2명, 일반 `회의실` 조건과 `UC142 거절 시간대 차이 회의` 신청 정보를 붙여넣었다.
4. `전송` 버튼을 실제 클릭하고 후보 순서, timeout 상태, 저장 버튼 상태를 관찰했다.
5. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-141: PASS.
- UC-142: PARTIAL.
- UC-141 증거: 같은 클라이언트에 400126 거절 이벤트가 있는 상태에서도 UC-134 일반 `회의실` 화면은 `반도체관 · 첨단강의실`을 첫 후보로 표시했고, UC-135 특정 공간 화면은 `최근 같은 요일·시간대 예약에서 4회 사용` 추천 이유를 표시했다.
- UC-142 화면은 다른 시작 시간 20:00에서도 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I` 순서를 표시했다.
- 다른 시간대에서도 거절 이력 후보가 후보군에서 제거되지는 않았지만, UI가 개인화 점수 강도 차이를 노출하지 않아 "약하게만 반영"을 strict하게 화면만으로 증명하지 못했다.
- 최종 화면은 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났으며, 저장/미리보기 버튼은 disabled였다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- UC-141: `124-uc134-uc135-personalized-search-in-progress.png`
- UC-141: `125-uc134-personalized-first-candidate-but-timeout-partial.png`
- UC-141: `126-uc135-recommendation-reason-visible-no-save.png`
- UC-142: `136-uc142-different-time-rejected-candidate-still-present.png`
- UC-142: `137-uc142-final-timeout-different-time.png`

### Commit

- `64fe6f9` (`docs: UC-139부터 UC-142 거절 피드백 검증을 기록`)

## Iteration 56 - UC-145 공간 정보 없는 반복 알림

### User Flow

1. 보조 DB 조작으로 현재 테스트 클라이언트에 `Codex E2E 무공간 반복 회의` active reminder 1건을 upsert했다.
2. 해당 reminder는 2026-07-24 15:00-16:00, 12명, `Codex E2E`, `UC145 공간 없는 반복 회의` 조건이며 `spaceLabel=null`, `spaceCode=null`이다.
3. Computer Use로 실제 Chrome side panel에서 `대화 목록` 버튼을 클릭해 최근 대화/알림 화면을 열었다.
4. 알림 카드의 날짜, 시간, 공간 placeholder, 버튼 상태를 관찰했다.
5. `네, 예약할게요`, `GLS 신청 저장`, GLS `저장`은 클릭하지 않았다.

### Result

- UC-145: PASS.
- 알림 카드에 `패턴 알림 · PHASE 3`, `Codex E2E 무공간 반복 회의`, `2026-07-24`, `15:00–16:00`이 표시됐다.
- 공간 칸에는 실제 공간명/번호가 아니라 `이전 추천 공간`이 표시됐다.
- 없는 공간을 `400126`이나 다른 공간명으로 지어내지 않았다.
- `네, 예약할게요`, `나중에` 버튼은 표시됐지만 클릭하지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- `138-uc145-reminder-without-space-placeholder-pass.png`

### Commit

- `10d7f32` (`docs: UC-145 무공간 반복 알림 검증을 기록`)

## Iteration 57 - 기존 Computer Use 증거로 Safety/오류 케이스 재판정

### User Flow

1. 새 자동화 도구나 API PASS 판정 없이, 오늘 이미 Computer Use로 관찰한 실제 Chrome side panel/GLS 화면 증거를 문서 기준에 다시 매핑했다.
2. UC-121, UC-40, UC-37, UC-17, UC-118, UC-124, UC-06/73 화면을 재검토했다.
3. 추가 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.

### Result

- UC-39: PASS.
- UC-63: PASS.
- UC-71: PASS.
- UC-73: PASS.
- UC-75: PASS.
- UC-78: PASS.
- UC-85: PASS.
- stale 추천/동일 시간대 중복 조건에서 `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요...`, `조건에 맞는 공간이 없어요`와 disabled 저장 버튼이 표시되어 잘못된 완료나 중복 저장으로 끝나지 않았다.
- 실제 저장은 `GLS 신청 저장`을 명시 클릭한 2주 이후 테스트 케이스에서만 발생했고, 추천/제안 단계에서는 자동 신청이 없었다.
- 부족/오류 입력에서 `몇 명이 사용하실 예정인가요?`, `오전 6시 또는 오후 6시처럼`, 조건 변경 제안 같은 다음 행동 안내가 표시됐다.
- 길이 제한, 기본 연락처, 최소인원 등 폼/제출 전 guard가 저장 전에 멈추며, 반쯤 작성된 상태로 GLS 저장을 누르지 않았다.
- 자정 넘김과 최소인원 제한이 사용자-facing 이유로 드러났고, 저장 성공으로 오인되지 않았다.
- 특정 400126이 이미 차 있는 조건에서 `18:00~20:00 예약`, `조건에 맞는 공간이 없어요`를 표시하고 다른 공간으로 조용히 바꾸지 않았다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Evidence

- UC-39/71: `112-uc121-stale-before-final-save-enabled.png`
- UC-39/71: `113-uc121-stale-recheck-blocked-no-duplicate.png`
- UC-39/71: `51-uc40-duplicate-existing-blocked-no-save.png`
- UC-63: `06-recommendation-draft-save-visible-not-clicked-pii-local-only.png`
- UC-63: `78-uc98-save-visible-no-auto-submit.png`
- UC-73: `15-uc06-missing-headcount-only.png`
- UC-73: `23-uc111-ambiguous-ampm.png`
- UC-73: `90-uc94-post-fix-building-fail-offers-broaden.png`
- UC-75: `99-uc116-post-fix-long-event-purpose-guard-pass.png`
- UC-75: `102-uc118-contact-empty-guard-pass-no-save-pii-local-only.png`
- UC-78: `19-uc17-end-before-start.png`
- UC-78: `47-uc37-postfix-min-capacity-blocked-before-submit.png`
- UC-85: `129-uc137-favorite-occupied-marked-reserved-searching.png`
- UC-85: `130-uc137-occupied-favorite-not-recommended-no-save.png`

### Commit

- `3eb597b` (`docs: 기존 화면 증거로 Safety 케이스 판정을 보강`)

## Iteration 58 - UC-67/72 서버 장애 후 입력 보존과 재개 수정

### User Flow

1. 보조 터미널로 `localhost:8000` 서버를 내렸다.
2. Computer Use로 실제 Chrome 확장 side panel에서 새 대화를 열었다.
3. 실제 입력칸에 `2026년 7월 24일 금요일 오후 1시부터 오후 2시까지 12명 회의실 예약해줘`를 붙여넣고 `전송`을 클릭했다.
4. side panel이 원문 한글 메시지를 그대로 대화에 남기고 `예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.` 안내를 표시하는지 관찰했다.
5. 서버를 다시 띄운 뒤 같은 대화에서 `주관단체 Codex E2E 행사명 UC72 서버 복구 회의 행사구분 세미나 사용목적 E2E 테스트 서버 복구 확인`만 붙여넣고 `전송`을 클릭했다.
6. 수정 전 동일 흐름은 메타-only 답변이 이전 슬롯과 병합되지 않고 `예약하실 일정과 인원`을 다시 요구했다.
7. 수정 후 side panel에서 신청서 미리보기와 `빈 공간 찾는 중` 단계로 이어지는지 확인했다.
8. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다. 확인 뒤 side panel `중단` 버튼을 눌러 탐색을 종료했다.

### Result

- UC-67: PASS after fix.
- UC-72: PASS after fix.
- 원문 한글 사용자 메시지와 서버 연결 실패 안내가 실제 화면에 남았다.
- 서버 복구 후 메타-only 답변이 이전 2026-07-24 13:00-14:00, 12명 조건과 병합됐다.
- 신청서 미리보기에는 행사구분 `교내단체행사 (세미나/스터디)`, 주관단체 `Codex E2E`, 행사명 `UC72 서버 복구 회의`, 행사인원 `12명`, 사용목적 `E2E 테스트 서버 복구 확인`이 표시됐다.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.

### Root Cause / Fix

- Root cause: 서버 다운 중 생성된 슬롯/신청 상태는 확장 메모리에 남지만, 서버 `/parse` mirror가 갱신되지 못하면 복구 후 서버가 직전 슬롯/신청 상태 없이 메타-only follow-up을 해석했다.
- Fix:
  - `server/src/schemas/parse.ts`: `/parse` 요청에 optional `client_last_filled_slots`, `client_last_application_state`를 추가.
  - `server/src/routes/parse.ts`: DB mirror가 없거나 비어 있을 때 클라이언트 fallback 상태를 사용.
  - `extension/src/background/apiClient.ts`: parse 요청 body에 fallback 상태 포함.
  - `extension/src/background/handlers/chatHandler.ts`: background context의 `lastFilledSlots`와 `applicationState`를 parse 요청에 전달.

### Evidence

- `142-uc67-after-fix-server-down-preserves-original.png`
- `143-uc72-after-fix-continues-from-server-error.png`

### Verification

- `server`: `pnpm build` PASS.
- `extension`: `pnpm build` PASS.
- Chrome extension card `새로고침` 버튼을 실제 클릭해 reload 완료.
- Computer Use spot check PASS.

### Commit

- `b49ced7` (`fix: 서버 장애 후 대화 재개 상태를 보존`)

## Iteration 59 - UC-77 전송 연타 방지

### Computer Use 행동

1. 실제 Chrome 확장 side panel에서 `새 대화`를 클릭했다.
2. 입력칸에 `2026년 7월 31일 금요일 오후 1시부터 오후 2시까지 12명 회의실 예약해줘. 주관단체 Codex E2E 행사명 UC77 연타 방지 회의 행사구분 세미나 사용목적 E2E 테스트 전송 연타 확인`을 붙여넣었다.
3. `전송` 버튼을 실제 마우스로 빠르게 두 번 클릭했다.
4. 화면 결과를 관찰한 뒤 `중단` 버튼으로 탐색을 종료했다.

### 실제 화면 결과

- 사용자 메시지는 한 번만 표시됐다.
- assistant 응답은 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.` 한 번만 표시됐다.
- 신청서 미리보기는 행사구분, 주관단체, 행사명, 행사인원 12명, 사용목적을 한 벌만 표시했다.
- 탐색 중 `빈 공간 찾는 중`, `검증 1/6`, `중단`이 보였고, 입력칸과 전송 버튼은 disabled 상태였다.
- 저장/예약신청 버튼이나 GLS 저장은 클릭하지 않았다.

### 판정

- UC-77: PASS.
- Root cause: 결함 없음. 현재 UI의 탐색 중 disabled 처리와 전송 처리 흐름이 빠른 중복 클릭을 중복 요청으로 만들지 않았다.
- Evidence: `/private/tmp/skku-reservation-e2e/2026-06-05/144-uc77-double-send-single-request-disabled.png`
- Commit: `603e310` (`docs: UC-77 전송 연타 방지 검증을 기록`)

## Iteration 60 - UC-105/106 제안 수락·거절 표현

### Computer Use 행동

1. 실제 Chrome 확장 side panel에서 `새 대화`를 클릭했다.
2. `저번처럼 해줘`를 입력칸에 붙여넣고 실제 `전송` 버튼을 클릭했다.
3. `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`, `네, 같게요`, `다른 행사예요` 제안 카드를 관찰했다.
4. 버튼을 누르지 않고 `좋아`를 입력해 전송했다.
5. 새 대화를 다시 열고 `저번처럼 해줘`로 같은 제안 카드를 만든 뒤, `아니, 2026년 8월 7일 금요일 오후 7시부터 오후 8시까지 30명으로 다시 찾아줘`를 한 번에 입력해 전송했다.

### 실제 화면 결과

- UC-105: `좋아` 입력 뒤 `지난번 신청 정보를 불러왔어요. 아래 카드에서 확인해 주세요.`가 표시되고 신청서 미리보기로 전환됐다.
- UC-105 신청서 미리보기에는 주관단체 `Codex E2E`, 행사명 `기능 검증 반복 회의`, 행사인원 `20명`, 사용목적이 표시됐고 저장 버튼은 disabled였다.
- UC-106: 거절+새 조건 입력 뒤 side panel 제목이 `2026-08-07 예약`으로 바뀌었다.
- UC-106 화면에는 `조건을 수정했어요. 같은 조건으로 다시 검색할게요.`가 표시됐고, 지난 제안 초안으로 진행하지 않고 새 조건에 필요한 행사 정보 입력 상태로 전환됐다.
- 저장/예약신청 버튼이나 GLS 저장은 클릭하지 않았다.

### 판정

- UC-105: PASS.
- UC-106: PASS.
- Root cause: 결함 없음. 자연어 수락과 거절 뒤 새 조건 입력이 각각 의도대로 처리됐다.
- Evidence:
  - `/private/tmp/skku-reservation-e2e/2026-06-05/145-uc105-natural-accept-loads-previous-draft.png`
  - `/private/tmp/skku-reservation-e2e/2026-06-05/146-uc106-reject-suggestion-new-conditions.png`
- Commit: `b191477` (`docs: UC-105와 UC-106 제안 응답 검증을 기록`)

## 최신 집계

- 오늘 기준 PASS: 111.
- 오늘 기준 PARTIAL: 9.
- 오늘 기준 FAIL: 0.
- 오늘 기준 BLOCKED: 0.
- 오늘 기준 NOT_RUN: 22.
- 오늘 실행 기준 PASS 비율: 111 / 120 = 92.50% (PARTIAL은 PASS로 세지 않음).
