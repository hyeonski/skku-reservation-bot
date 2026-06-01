# SKKU Reservation E2E Refinement Report - 2026-06-01

## Execution Summary
- Execution date: 2026-06-01
- Test environment: Chrome with `extension/dist`, server on `localhost:8000` using `server/.env`
- Refinement iterations: 12 completed, broader suite still in progress
- Total PASS / FAIL / BLOCKED / NOT_RUN: 72 PASS-final / 0 current FAIL among executed cases / 0 BLOCKED / remaining cases NOT_RUN
- Executable-case PASS ratio: 100% among 72 executed cases; full 129-case target is not yet complete
- P0 PASS ratio: 25/25 executed P0 final PASS
- Safety PASS ratio: 13/13 executed Safety final PASS
- Actual GLS reservation submitted: yes, one guarded E2E test application for 2026-06-16 18:00-20:00
- Mistaken submission: none so far

## Iteration Summary
Detailed running notes are in `docs/e2e-results/refinement-log-2026-06-01.md`.

### Iteration 1
- Result: UC-42 failed because login completion did not resume the reservation flow.
- Root cause: service worker only resumed login prompts tied to a specific tab; app-opened GLS login-required states did not store a prompt.
- Fix: stored wildcard login prompts and resumed on matching SKKU login-complete URLs.
- Files: `extension/src/background/serviceWorker.ts`.
- Verification: `pnpm -C extension build`, `pnpm -C server build`, Chrome extension reload, login/search rerun.

### Iteration 2
- Result: UC-115 safety wording risk. Completion copy could imply final reservation approval.
- Root cause: UI/notification used `예약 완료` language after GLS save.
- Fix: changed completion copy to `신청 저장 완료 · 승인 대기` and told users to confirm final approval in GLS.
- Files: `extension/src/background/glsCoordinator.ts`, `extension/src/sidepanel/App.tsx`, `extension/src/sidepanel/components/cards/DraftCard.tsx`, `extension/src/sidepanel/components/cards/SubmitProgressCard.tsx`, `extension/src/sidepanel/hooks/useChatStateMachine.ts`.
- Verification: build passed, extension reloaded, actual guarded GLS save showed approval-pending copy.

### Iteration 3
- Result: UC-71 duplicate-submit risk. After saved state, the draft card still exposed a save button.
- Root cause: draft submit action was disabled only during `filling`/`saving`, not after `saved`/`done`.
- Fix: added saved/done submit lock and clearer save-progress wording.
- Files: `extension/src/sidepanel/ChatScene.tsx`, `extension/src/sidepanel/components/cards/DraftCard.tsx`, `extension/src/sidepanel/components/cards/SubmitProgressCard.tsx`, `extension/src/sidepanel/hooks/useChatStateMachine.ts`.
- Verification: build passed, extension reloaded; completed saved-state restore does not expose a submit action.

### Iteration 4
- Result: UC-44 restore regression. A completed conversation row remained in the recent list, but selecting it could open a blank starter chat after extension reload.
- Root cause: completed summaries could outlive full in-memory/server context; restore preferred an empty active hydrate over local completed summary, and completed draft/progress state was not rebuilt in the side panel.
- Fix: added local full conversation snapshots, completed-summary fallback restoration, restored `saved` submit state, and allowed completed draft snapshots to render locked when full data exists.
- Files: `extension/src/background/serviceWorker.ts`, `extension/src/sidepanel/hooks/useConversation.ts`, `extension/src/sidepanel/ChatScene.tsx`.
- Verification: `pnpm -C extension build`, `pnpm -C server build`, Chrome extension reload, completed row selection now opens `신청 저장 완료` with `신청서 저장 진행 · 승인 대기` and disabled input.

### Iteration 5
- Result: UC-122 initially failed. Starting a reservation while viewing a non-GLS tab silently navigated that active tab to GLS even though an existing GLS tab was available.
- Root cause: GLS tab acquisition updated the active non-GLS tab to `https://kingoinfo.skku.edu/` before checking for reusable GLS tabs.
- Fix: changed GLS tab acquisition to use the active tab only when it is already GLS, otherwise reuse an existing GLS tab without activating it, or create a new inactive GLS tab.
- Files: `extension/src/background/glsCoordinator.ts`.
- Verification: `pnpm -C extension build`, `pnpm -C server build`, Chrome extension reload, UC-122 rerun from a non-GLS active tab; the active tab stayed unchanged while GLS automation ran on the existing background tab.

### Iteration 6
- Result: UC-78 initially failed. A cross-midnight request (`오늘 22시부터 다음날 1시까지`) entered GLS candidate lookup instead of being rejected before search.
- Root cause: parsed end times before the start time, and duration-derived next-day end times, were treated as valid same-day slots by modulo end-time handling.
- Fix: added same-day time validation in the server parser and repeated the guard in the extension background after slot correction/normalization.
- Files: `server/src/routes/parse.ts`, `server/src/routes/parse.test.ts`, `extension/src/background/serviceWorker.ts`.
- Verification: `pnpm -C server exec tsx --test src/routes/parse.test.ts`, `pnpm -C server build`, `pnpm -C extension build`, server restart, Chrome extension reload, UC-78 rerun from side panel. The same input was rejected with `자정을 넘기는 예약은 지원하지 않아요` and did not start GLS lookup.

### Iteration 7
- Result: UC-120 initially exposed a cancellation recovery gap. In draft/review state, the natural phrase `아니, 취소할게` did not immediately cancel the flow and required an extra confirmation path.
- Root cause: the draft command parser recognized bare cancellation commands but missed common Korean negative-prefix forms such as `아니, 취소할게`.
- Fix: broadened draft cancellation parsing to accept prefixed and polite variants of cancel/stop commands.
- Files: `extension/src/sidepanel/utils/parseModification.ts`.
- Verification: `pnpm -C extension build`, Chrome extension reload, UC-120 rerun through the real side panel and GLS review state. The same phrase now returned `예약 진행을 중단했어요` without clicking `GLS 신청 저장`; no GLS save was performed.

### Iteration 8
- Result: UC-121 review found a stale-recommendation safety gap in the final submit path. A candidate was checked during recommendation, but the final `GLS 신청 저장` path trusted that stale candidate.
- Root cause: `submitConfirmedReservation()` went from side-panel confirmation to GLS form fill/save without an immediate final availability check.
- Fix: added a submit-time `BG_CHECK_AVAILABILITY` recheck immediately before `BG_SUBMIT_RESERVATION`; if the room is no longer available, the app stops with `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요...`.
- Files: `extension/src/background/glsCoordinator.ts`.
- Verification: `pnpm -C extension build`, `pnpm -C server build`, Chrome extension reload, UC-121 safe-date flow to final review state. The side panel reached `GLS 신청 저장` for 2026-06-19 18:00-19:00 with test-purpose wording and no automatic save. The final actual save click is not counted as PASS yet because Computer Use requires user confirmation for creating a real reservation.
- Additional regression: UC-128, UC-129, and UC-132 passed in Chrome UI after reload. A UC-01-style new conversation smoke rerun reached recommendation plus draft preview for 2026-06-22 18:00-19:00 with `GLS 신청 저장` visible; no additional GLS save was performed. Continued regression smoke verified UC-31 draft classification and UC-96 modification relookup behavior.

### Iteration 9
- Result: UC-92 initially failed. A far-future request (`내년 12월 31일`) entered GLS automation instead of being gracefully declined before lookup.
- Root cause: parser/date guards rejected past and cross-midnight requests, but did not bound future dates; the extension also lacked a second client-side future-window guard.
- Fix: added a 180-day future booking guard in both `server/src/routes/parse.ts` and `extension/src/background/serviceWorker.ts`, plus a parser unit test.
- Files: `server/src/routes/parse.ts`, `server/src/routes/parse.test.ts`, `extension/src/background/serviceWorker.ts`.
- Verification: `pnpm -C server exec tsx --test src/routes/parse.test.ts`, `pnpm -C server build`, `pnpm -C extension build`, server restart, Chrome extension reload, UC-92 rerun. The same far-future request now stays in chat and says the date is too far to verify in GLS. UC-95, UC-113, and UC-114 also passed as graceful-decline cases. A UC-01-style regression then reached recommendation state for 2026-06-22 18:00-20:00 without clicking save.

### Iteration 10
- Result: The post-Iteration-9 UC-01-style regression surfaced an organization-vs-building ambiguity: `학생회 E2E 회귀 테스트 회의` could be interpreted as the `학생회관` building even when the user meant a student-council organizer.
- Root cause: LLM slot extraction had no disambiguation guard for `학생회` as an organization phrase versus explicit `학생회관` as a building phrase.
- Fix: added parser-level disambiguation that clears `building=학생회관` when the user text contains `학생회` but not explicit `학생회관`, while preserving explicit student-center building requests.
- Files: `server/src/routes/parse.ts`, `server/src/routes/parse.test.ts`.
- Verification: `pnpm -C server exec tsx --test src/routes/parse.test.ts`, `pnpm -C server build`, server restart, and Chrome side-panel regression with `6월 22일 18시부터 2시간 12명 학생회 E2E 회귀 테스트 회의`. Server logs showed `/spaces?headcount=12` with no building filter, and the visible recommendation came from `제2공학관26동` rather than being forced to `학생회관`. No save was clicked.

### Iteration 11
- Result: UC-89 initially failed. A request with unsupported minute units (`18시 10분부터 19시 40분까지`) entered GLS lookup and filled a form instead of asking for a supported reservation unit.
- Root cause: time validation covered impossible clocks, past dates, cross-midnight requests, and far-future dates, but did not enforce the GLS-supported 30-minute reservation granularity before search.
- Fix: added raw-text and parsed-slot minute granularity guards in the server parser, and duplicated the parsed-slot guard in the extension background before candidate lookup.
- Files: `server/src/routes/parse.ts`, `server/src/routes/parse.test.ts`, `extension/src/background/serviceWorker.ts`.
- Verification: `pnpm -C server exec tsx --test src/routes/parse.test.ts`, `pnpm -C server build`, `pnpm -C extension build`, server restart, Chrome extension reload, and UC-89 rerun. The same input now stays in chat with 30-minute-unit guidance and server logs show no `/spaces` call. A UC-01-style regression then reached a normal recommendation for `6월 22일 18시부터 2시간 12명 학생회 E2E 회귀 테스트 회의`; server logs showed `/spaces?headcount=12` without `building=학생회관`, and no GLS save was clicked.

### Iteration 12
- Result: UC-111 initially failed. `6월 22일 6시부터 2시간...` was interpreted as 18:00-20:00 and entered GLS lookup instead of asking the user to clarify 오전/오후.
- Root cause: parser and extension safety layers trusted LLM 24-hour normalization for bare 1-12 Korean clock expressions, while starter/onboarding examples also encouraged ambiguous `6시` wording.
- Fix: added a raw-text ambiguous-meridiem guard to the server parser and duplicated it in the extension background before candidate lookup. Updated starter/onboarding/example text to use explicit `오후 6시`.
- Files: `server/src/routes/parse.ts`, `server/src/routes/parse.test.ts`, `extension/src/background/serviceWorker.ts`, `extension/src/sidepanel/components/ChatStarter.tsx`, `extension/src/sidepanel/components/Onboarding.tsx`, `extension/src/sidepanel/hooks/useChatStateMachine.ts`, `extension/src/sidepanel/DEV_NAVIGATION.md`.
- Verification: parser tests passed with 18 tests, `pnpm -C server build` passed, `pnpm -C extension build` passed, server restarted, Chrome extension reloaded, and UC-111 rerun now stays in chat with `오전/오후가 빠진 시간은 헷갈릴 수 있어요...`. Server logs for the rerun showed `/parse` and `/conversations` only, with no `/spaces` lookup.
- Additional coverage before/around the fix: UC-88 passed with 18:30-20:00 half-hour handling; UC-90 passed by checking a 03:00-05:00 slot and recommending a real available GLS space instead of assuming normal hours; UC-91 passed by rejecting an already-past same-day time before lookup.

## Final Case Results
Executed and final-PASS cases: UC-01, UC-02, UC-03, UC-04, UC-05, UC-06, UC-07, UC-08, UC-09, UC-10, UC-11, UC-12, UC-13, UC-14, UC-15, UC-16, UC-17, UC-18, UC-19, UC-20, UC-21, UC-22, UC-23, UC-24, UC-25, UC-26, UC-27, UC-28, UC-29, UC-30, UC-31, UC-32, UC-33, UC-34, UC-36, UC-38, UC-41, UC-42, UC-44, UC-45, UC-56, UC-57, UC-58, UC-60, UC-61, UC-62, UC-63, UC-64, UC-71, UC-78, UC-79, UC-88, UC-89, UC-90, UC-91, UC-92, UC-95, UC-96, UC-97, UC-98, UC-101, UC-107, UC-108, UC-111, UC-113, UC-114, UC-115, UC-120, UC-122, UC-128, UC-129, UC-132.

## Remaining FAIL/BLOCKED
- No current FAIL among executed cases.
- UC-121 has a code-level safety fix and was driven to the guarded final review screen, but the final actual GLS save click remains NOT_RUN until explicit user confirmation because it can create a real reservation.
- Most of the full 129-case inventory remains NOT_RUN; this report is not a completion report yet.
- Screenshot persistence remains blocked by local `screencapture` failure (`could not create image from display`), although Computer Use screenshots were available during execution.

## Remaining Risks
- Full UC-01-to-end regression has not yet reached 90% of the entire executable suite.
- Organization-vs-building ambiguity for `학생회`/`학생회관` has a parser guard and Chrome regression coverage, but broader Korean organization/building ambiguity patterns may still need more examples.
- Unsupported reservation-minute input now has server and extension guards, and UC-88 half-hour natural-language coverage passed in Chrome.
- UC-90 passed because GLS returned an available 03:00-05:00 space for the tested date. If the product should discourage unusual hours even when GLS allows them, that should become a separate UX/safety requirement.
- Bare 1-12 hour inputs now trigger an 오전/오후 clarification guard, but broader time-ambiguity examples such as `점심 12시`, `저녁 7시`, or mixed English/Korean time wording still need more Chrome coverage.
- Reminders/reuse, privacy cleanup, and some stale-recommendation conflict branches still need actual Chrome execution.
- UC-121 conflict branch still needs a way to create or observe a just-filled slot before final save; current verification covers code-level recheck and safe-date final-review reachability, not a live concurrent conflict.
- One real GLS test application was intentionally saved for 2026-06-16; final approval/cancellation state belongs to GLS policy/workflow.

## Recommended Next Work
- Continue from the unexecuted document-order cases, while prioritizing unexecuted P0/Safety cases first.
- Exercise a post-Iteration-4 completed flow created after the snapshot change to confirm full draft-card restoration, not just summary fallback.
- Resolve screenshot capture or document Computer Use state evidence as the fallback if macOS display capture remains unavailable.
