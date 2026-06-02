# SKKU Reservation E2E Refinement Run - 2026-06-02

## Summary
- Status: PARTIAL, goal criteria not fully met yet.
- Iterations completed: 20 refinement iterations
- Executed/observed case groups: onboarding/session smoke, quick examples, complete reservation request, slot collection, relative date parsing, time-expression parsing, building filter, correction, alternative candidate, candidate-list graceful decline, colloquial input, cancellation, out-of-scope/invalid input, GLS login/resume, candidate search, recommendation/draft, partial draft guard, application metadata parsing/editing, other-tab continuation, repeat-memory precondition check, reminder precondition/no-reminder check, reload restore, recent conversation list/title/delete management, server-down error recovery, retry preservation, duplicate-send guard, cross-midnight time guard, no-capacity adjustment, specific-room code lookup, ambiguous building/campus alias, contextual half-hour time, unsupported-minute guard, early/late-hour guard, same-day/far-future date guards, small-headcount recommendation, unsupported facility disclosure, contextual bare-hour time correction, latest-space summary after alternative, GLS tab-close recovery, final-form/repeat-memory precondition audit, inline rejection with new conditions, understood-value visibility, submitted-reservation graceful decline, mid-flow direction change, ambiguous bare-hour guard, repeat/English graceful decline, retry date correction, application length guard, ambiguous event-type clarification, specific-room free-time graceful decline, long-paste layout and purpose-length guard after clarification
- Actual reservation submission: NO
- Submission accident: NO
- Tested request dates: 2026-06-02, 2026-06-03, 2026-06-09, 2026-06-17, 2026-06-18, 2026-06-19, 2026-06-20, 2026-06-21, 2026-06-23, 2026-06-24, 2026-06-25, 2026-06-26, 2026-07-01, 2026-07-02, 2026-07-03, 2026-07-09, 2026-07-10, 2026-07-13, 2026-07-14, 2026-07-15, 2026-07-16, 2026-07-17, 2026-07-18, 2026-07-20, 2026-07-21, 2026-07-22, 2026-07-23, 2026-07-24, 2026-07-25, 2026-07-28, 2026-07-29, 2026-07-30, 2026-07-31, 2026-08-03, 2026-08-04, 2026-08-05, 2026-08-06, 2027-12-31
- Personal data: masked; no GLS credentials/name/student number/phone recorded in this report.

## Current Result Counts
- PASS: 86 observed case outcomes after fixes
- FAIL: 0 unresolved in the observed refinement scope after fixes
- BLOCKED/NOT_RUN: remaining full document regression not completed; real-submit cases and repeat-memory cases blocked by explicit preconditions
- PASS ratio for the limited executed observations: 100% after the verified fixes
- PASS 90%+ for the full executable suite: NOT YET VERIFIED
- P0/Safety critical failure: none observed
- Real reservation malfunction risk: no final save/submit was clicked; no actual reservation was created
- Under-two-week request handling: 2026-06-02, 2026-06-03, and 2026-06-09 were used only for guard/parse/search/recommendation evidence; no final save/submit was clicked

## Root Causes And Fixes
| Root cause | Impact UC | Fix |
|---|---:|---|
| Recommendation card hid GLS space code and treated code prefix as floor | UC-20, UC-64, UC-107, UC-133 | Added code/building number display and improved floor derivation |
| DB building number can include campus prefix while GLS space code uses visible building number | UC-20, UC-84, UC-133 | Normalized display building number before rendering/deriveFloorLabel |
| Reload restore could prefer stale empty cached context over server/snapshot data | UC-44, UC-58, UC-104, UC-132 | Hydrate from server/snapshot when cached context has empty history |
| Active search disabled the composer but exposed no user-visible cancellation control | UC-14, UC-27, UC-70 | Added `중단` on active search cards and routed it through the existing cancel path |
| Pending application collection treated symbol-only text as a valid draft description | UC-18, UC-63, UC-64, UC-101 | Added symbol-only parse guard and meaningful-text checks before draft derivation |
| First-run and quick examples were hard-coded, so they could become past dates and fail when clicked | UC-01, UC-04, UC-16 | Generated complete examples from the current date, at least three weeks in the future |
| Alternative/list guidance can be generated in background but not remain visible after recommendation-card rendering and scroll positioning | UC-13 | Rendered the latest one-at-a-time guidance below the recommendation card when a recommendation is shown |
| Over-capacity headcount went into GLS automation before detecting that no registered room could fit it | UC-23, UC-22 | Added a capacity preflight before auto-starting GLS search so impossible headcounts stop in chat |
| Partial or edited application drafts could be hidden, overwrite explicit purpose/category, or lose active recommendation slots | UC-29, UC-30, UC-31, UC-32, UC-98 | Render partial drafts with submit locked, preserve purpose/category, locally apply safe text-field edits, and merge active slots for application-only messages |
| Delete action inside a clickable conversation row could leak activation to the parent row and fail to send DELETE | UC-59, UC-60 | Added explicit labels, pointer/keyboard event isolation, larger focused target, and confirmation-state pointerdown delete |
| Time-related invalid-input overrides dropped non-time slots, forcing users to repeat known date/headcount | UC-72, UC-78, UC-89 | Cross-midnight and unsupported-minute guards now clear only start/end time and preserve other slots |
| Numeric or code-shaped room requests were treated as room-name text, so exact GLS space-code lookup could fail or broaden candidates | UC-84, UC-85, UC-94, UC-133 | Detect valid explicit GLS space codes after parsing and exact-match them in `/spaces` |
| Contextual range ends and obviously early/late slots were not handled before search | UC-88, UC-90 | Propagate start meridiem to bare range end times and block likely out-of-hours early/late reservations before GLS search |
| Bare-hour corrections after a PM recommendation lost the previous time context and triggered ambiguous-time clarification | UC-96, UC-111 | Derive meridiem context from the previous start time for inline edits and skip the ambiguous-time override for contextual edits |
| Closing the GLS tab during candidate validation did not produce a user-visible closed-tab state and could leave a stale candidate card | UC-100, UC-99, UC-70 | Watch active GLS queue tab removal, stop the queue with a closed-tab error, and clear/ignore candidate proposals after error |
| No-candidate retry adjustments preserved previous slots but did not parse explicit absolute date edits | UC-106, UC-107, UC-110, UC-116 | Parse calendar-valid month/day and numeric date edits in retry and inline correction paths before re-search |
| Ambiguous event-type words could start search when other application fields were also missing | UC-117, UC-33, UC-64 | Added an extension-side low-confidence 행사구분 guard that asks a clarification before GLS search |
| A 행사구분 clarification answer could overwrite an existing long pasted draft instead of preserving it for length validation | UC-117, UC-128, UC-33, UC-64 | Treat explicit short 행사구분 answers as updates to the existing draft whenever `hangsaGbCode` is pending, then run the remaining draft guards |

## Verified Commits
| Commit | Message | Root cause | Impact UC | Verification |
|---|---|---|---|---|
| `f064e44` | `fix: 공간 추천 식별성과 대화 복원 안정성을 보강` | Recommendation metadata was not inspectable enough and reload restore could prefer stale empty context | UC-20, UC-44, UC-58, UC-64, UC-104, UC-132, UC-133 | Extension/server builds, Prisma status, `/health`, Chrome reload/restore and recommendation spot checks |
| `7fedb41` | `fix: 탐색 중단과 무의미 입력 가드를 보강` | Active search had no visible cancel affordance, and symbol-only input could become an application draft | UC-06, UC-15, UC-17, UC-18, UC-27 | Extension/server builds, Prisma status, `/health`, Chrome side panel UC-06/15/17/18/27 spot checks |
| `d2aef86` | `fix: 빠른 예시를 현재 날짜 기준으로 보강` | Hard-coded quick/onboarding examples could become past dates and fail when clicked | UC-01, UC-04, UC-16 | Extension/server builds, Prisma status, `/health`, Chrome side panel UC-04/UC-16 spot checks |
| `ae642a4` | `fix: 대체 후보 안내를 추천 카드 아래에 표시` | Alternative/list guidance did not remain visible in the bottom UI after recommendation-card rendering | UC-13 | Extension/server builds, Prisma status, `/health`, Chrome side panel UC-13 repeat request |
| `ad0f87d` | `fix: 정원 초과 요청을 GLS 탐색 전에 차단` | Over-capacity headcount entered GLS search before no-capacity detection | UC-21, UC-22, UC-23, UC-24, UC-25, UC-26 | Extension/server builds, Prisma status, `/health`, Chrome UC-23 before/after and normal-capacity regression |
| `96c9d9f` | `fix: 신청서 초안 수정과 필수값 가드를 안정화` | Application metadata and draft edits could hide partial drafts, overwrite purpose/category, or lose recommendation context | UC-29, UC-30, UC-31, UC-32, UC-98 | Extension/server builds, Chrome extension reload, UC-29/30/31/32/98 spot checks |
| `39bb47e` | `fix: 대화 삭제 버튼 접근성을 보강` | The nested delete button could enter confirmation but fail to complete deletion from user activation | UC-59, UC-60 | Extension build, Chrome extension reload, UC-59 two-click delete, server DELETE 204 evidence |
| `ef64fb1` | `fix: 시간 오류 안내에서 기존 조건을 보존` | Time errors cleared all reservation slots instead of only the invalid time fields | UC-72, UC-78, UC-89 | Server/extension builds, Chrome extension reload, UC-78 cross-midnight regression |
| `324da3a` | `fix: 숫자 공간코드를 특정 공간으로 고정` | Numeric/code-shaped room requests were not exact-filtered as GLS space codes | UC-84, UC-85, UC-94, UC-133 | Server/extension builds, `/spaces` exact-code checks, Chrome UC-133 and UC-84 regressions |
| `4aeee2e` | `fix: 시간 문맥과 새벽 예약 가드를 보강` | Contextual half-hour range ended in meridiem clarification, and early-hour requests entered GLS search | UC-88, UC-90 | Server/extension builds, Chrome extension reload, UC-88 and UC-90 regressions |
| `1ee1747` | `fix: 시간 정정의 오후 문맥 보존을 보강` | Bare-hour time correction after a PM recommendation lost the prior PM context | UC-96, UC-111 | Server/extension builds, Chrome extension reload, UC-96 before/after regression |
| `d83fdf8` | `fix: GLS 탭 닫힘을 탐색 오류로 안내` | Closed GLS tab left search running or stale recommendation visible | UC-100, UC-99, UC-70 | Extension build, Chrome extension reload, UC-100 before/after regression |
| `2725527` | `docs: 추가 안전 케이스 e2e 결과를 기록` | UC-101 onward safety/robustness execution state and UC-106 evidence were not captured in the report | UC-101, UC-102, UC-103, UC-104, UC-105, UC-106 | Chrome + Computer Use UC-106 run, screenshot capture, `/health`, PII scan |
| `89b84c9` | `fix: 대체 날짜 재탐색에서 명시 날짜를 보존` | Explicit date retry after a no-candidate result could reuse a stale previous date | UC-106, UC-107, UC-110, UC-116 | Extension/server builds, Chrome extension reload, UC-116 stale-date before/after regression and long-event-name guard |
| `c637466` | `fix: 모호한 행사구분을 검색 전에 확인` | Low-confidence event type such as `모임` could proceed to search when other application fields were also missing | UC-117, UC-33, UC-64 | Extension build, Chrome extension reload, UC-117 before/after side-panel regression |
| `dc961d5` | `fix: 행사구분 답변에서 긴 신청서 초안을 보존` | A short 행사구분 clarification answer could replace a long pasted draft and bypass the purpose-length guard | UC-117, UC-128, UC-33, UC-64 | Server build, server restart/health, Chrome side-panel UC-128 before/after regression |

## Verification
- `pnpm build` in `extension`: PASS
- `pnpm build` in `server`: PASS
- `pnpm prisma migrate status`: PASS
- `curl http://localhost:8000/health`: PASS
- Chrome extension reload: PASS
- Chrome + Computer Use side panel smoke: PASS
- GLS login and resume: PASS
- Final fresh UI regression after the last patch: PASS
  - Recommendation card showed `세미나실 I(85529)` and `산학협력센터(85동) · 5층`
  - Existing conversation row restored to its prior messages instead of a blank new conversation
- Iteration 2 fresh UI regression after cancel/input guards: PASS
  - Active search showed `중단` and stopped with a cancellation message
  - Symbol-only input produced a retry prompt and did not create a draft/search path
- Iteration 3 fresh UI regression after dynamic examples: PASS
  - Quick examples showed future dates `6월 23일(화)`, `6월 24일(수)`, and `6월 26일(금)`
  - Clicking the first example started reservation search and exposed `중단`
  - `담주 화욜 여섯시 스무명` produced duration clarification chips instead of being ignored
- Iteration 4 early natural-language regression: PASS
  - `다음 주 화요일` resolved to `2026-06-09` and proceeded to search without submit
  - `오후 2시부터 4시까지` and `14시부터 2시간` both proceeded for 2026-06-24; the second card showed 14:00-16:00
  - `율전 학생회관` narrowed visible candidates to `학생회관 · [03B08] 연습실`
  - `아니 30명으로` changed the recommendation to a larger-capacity candidate while preserving date/time
- Iteration 5 correction/alternative regression: PARTIAL
  - `30명으로 바꾸고 시간은 19시부터 1시간으로` updated the card to 19:00-20:00 and a capacity 40명 room
  - `다른 곳 보여줘` changed the candidate while preserving date/time
  - `여러 개 같이 보여줘` did not expose visible one-at-a-time guidance at the bottom of the actual UI
- Iteration 6 UC-13 guidance regression after visible-guidance patch: PASS
  - Reloaded `extension/dist` from `chrome://extensions` and reopened the restored UC-13 conversation
  - The prior `여러 개 같이 보여줘` response was visible at the bottom with `후보를 길게 나열하지 않고 한 곳씩 보여드려요. 같은 조건으로 다음 공간을 찾아볼게요.`
  - Sent `여러 개 같이 보여줘` again through the side-panel composer and verified the same one-at-a-time guidance appeared in the bottom UI
  - Evidence screenshot: `/private/tmp/skku-reservation-e2e/2026-06-02/28-uc13-compare-guidance-fixed.png`
- Iteration 7 exploration/preflight regression: PASS after fix
  - UC-14: `그만할래` stopped the active recommendation flow with `예약 진행을 중단했어요...`
  - UC-23 before fix: `500명` request entered GLS search and stayed on the search card; recorded as FAIL
  - Capacity preflight patch: when `/spaces?headcount=500` returns no candidates, chat returns a no-capacity message and does not start GLS automation
  - UC-23 after fix: same 500명 request immediately showed `500명을 수용할 수 있는 공간이 등록되어 있지 않아요...` with no search card
  - Normal-regression spot check: a 20명 request still entered search and reached a recommendation
  - UC-21/24/25: recommendation evidence showed tried conflicts, a validated available recommendation, a department/admin warning, and the space notice
  - UC-26: 10-hour request produced the existing maximum-duration guidance without search
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/29-uc14-cancel-stop.png`, `30-uc23-500-headcount-searches.png`, `32-uc23-headcount-preflight-fixed.png`, `34-uc21-24-25-recommendation-evidence.png`, `35-uc26-long-duration-guard.png`
- Iteration 8 application metadata/draft regression: PASS after fix
  - UC-29: recommendation flow asked for application metadata once after candidate discovery
  - UC-30/31/32: complete metadata produced a draft card with explicit category and purpose preserved
  - UC-98: incomplete drafts were visible but `GLS 신청 저장` stayed locked
  - Event-name-only edit produced a superseded previous draft and a current draft with the original purpose preserved
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/39-uc98-partial-draft-submit-disabled.png`, `41-uc30-31-32-draft-complete-fixed.png`, `42-uc30-field-edit-purpose-preserved.png`
- Iteration 9 trust/recovery/repeat-memory continuation: PARTIAL
  - UC-45: search continued and reached a recommendation while the active Chrome tab was `chrome://extensions`
  - UC-34/35/36/37/39/40: blocked because they require a real final save/submit or submit-stage failure/race
  - UC-38: not run because GLS-filled preview shares the final save automation path in this build
  - UC-46/47/48/49: blocked because the repeat-memory feature currently requires completed reservation records, and this run intentionally has no real submitted reservation
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/43-uc45-other-tab-searching.png`, `44-uc45-other-tab-recommendation.png`, `45-uc49-no-completed-memory-precondition.png`
- Iteration 10 Phase 3 reminder precondition check: PARTIAL
  - Reminder generation requires at least 3 completed conversations with confirmed reservation forms and stored slots
  - UC-55: no reminder banner appeared in the recent conversation list without completed repeating history
  - UC-51/52/53/54: blocked until a completed weekly pattern or controlled reminder fixture exists
  - Evidence screenshot: `/private/tmp/skku-reservation-e2e/2026-06-02/46-uc55-no-reminder-without-completed-pattern.png`
- Iteration 11 conversation management regression: PASS after fix
  - UC-56/60: recent conversation list remained visible after extension reload, with meaningful reservation-derived titles
  - UC-59 before fix: delete entered confirmation state but did not reliably send a DELETE request
  - UC-59 after fix: two-step delete removed the row and server log showed `DELETE /conversations/<masked-id>` with HTTP 204
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/47-uc56-60-recent-list-titles.png`, `48-uc59-delete-fixed.png`
- Iteration 12 error/retry/time-guard regression: PASS after fix
  - UC-61: two recent conversations restored separate histories without visible mixing
  - UC-65/66/67: server-down send showed a visible Korean recovery message and preserved the user request in history
  - UC-72: after server restart, `다시 시도해줘` reused the previous slots and moved back to search
  - UC-77: double-click send produced one user message and one visible search flow
  - UC-78 before fix: cross-midnight guard worked but dropped non-time slots; after fix it preserved date/headcount and asked only for time correction
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/51-uc67-server-down-visible-error.png`, `52-uc72-retry-preserves-context.png`, `54-uc77-double-click-single-processing.png`, `55-uc78-midnight-guard-preserves-count-fixed.png`
- Iteration 13 specific-room/code regression: PASS after fix
  - UC-83: `300명` no-capacity error stayed in chat and `아니 15명으로` reused the same date/time for a successful recommendation
  - UC-133 before fix: numeric `23413` request validated many unrelated candidates; after fix it showed `검증 1/1` and recommended `세미나실(23413)`
  - UC-84 before fix: `400126호` exact room request did not find the code-shaped room; after fix it showed `검증 1/1` and recommended `첨단강의실(400126)`
  - UC-85/94: unavailable specific-room flow did not silently recommend a different room and surfaced adjustment choices
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/57-uc83-300-overcapacity.png`, `58-uc83-adjust-15-after-overcapacity.png`, `61-uc133-numeric-code-result.png`, `63-uc133-numeric-code-fixed-result.png`, `64-uc84-specific-room-400126-fixed.png`
- Iteration 14 time/context regression: PASS after fix
  - UC-86: ambiguous `학생회관` asked for 명륜 vs 율전/자과캠 and did not start search
  - UC-87: `자과캠` alias produced 자연과학캠퍼스 candidate validation and was safely canceled after evidence capture
  - UC-88 before fix: `오후 6시 반부터 8시까지` asked for meridiem clarification; after fix it reached a card showing `18:30 – 20:00`
  - UC-89: unsupported `18시 10분부터 19시 40분까지` stopped with 30-minute-unit guidance and no search
  - UC-90 before fix: `새벽 3시부터 5시까지` entered GLS search; after fix it stopped with early/late-hour guidance before search
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/65-uc86-ambiguous-studenthall.png`, `66-uc87-jagwacam-alias.png`, `67-uc88-half-hour-meridiem-gap.png`, `68-uc89-unsupported-minute-guard.png`, `69-uc90-early-hour-guard.png`, `71-uc88-half-hour-fixed-card.png`, `72-uc90-early-hour-fixed.png`
- Iteration 15 date/facility/correction regression: PASS after fix
  - UC-91: same-day past-time request stopped in chat with future-time guidance and no GLS search
  - UC-92: too-far future request stopped in chat with closer-date guidance and no GLS search
  - UC-93: 2-person request reached an appropriately small-capacity study-room recommendation
  - UC-95: unsupported beam-projector constraint was disclosed before search instead of being silently treated as validated
  - UC-96 before fix: `7시부터` after an 18:00-20:00 recommendation asked for 오전/오후 clarification; after fix it updated the recommendation to 19:00-21:00
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/73-uc91-past-today-guard.png`, `74-uc92-far-future.png`, `76-uc93-small-headcount-result.png`, `77-uc95-facility-before-fix.png`, `79-uc96-ambiguous-change-search-bug.png`, `82-uc96-fixed-19-card.png`
- Iteration 16 alternative/latest-summary and GLS-tab-close regression: PASS after fix
  - UC-97: after `다른 공간 찾기`, the active recommendation changed to `[32425D] 세미나실4`; the current recommendation/final review area showed the latest candidate, not the first candidate
  - UC-99: blocked because direct interference during GLS form filling requires the final save automation path and action-time confirmation
  - UC-100 before fix: closing the GLS tab left the side panel searching or could leave a stale recommendation card; after fix, the UI showed `GLS 창이 닫혔어요...` and no stale recommendation card remained
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/83-uc97-alternative-latest-summary.png`, `84-uc100-gls-tab-closed-still-searching.png`, `85-uc100-fixed-error-with-stale-card.png`, `86-uc100-fixed-tab-closed-no-stale-card.png`
- Iteration 17 guarded-precondition and inline-rejection regression: PASS for executable case
  - UC-101: blocked because a live existing GLS application form plus app-driven final form-fill path needs a controlled fixture or action-time confirmation
  - UC-102: not run because the vanished-space GLS list mutation fixture was unavailable in the live UI
  - UC-103: blocked because notification-off result recovery requires a submitted reservation result
  - UC-104: prior restore regression remains PASS AFTER FIX evidence for this case
  - UC-105: not run because no controlled repeat-memory or alternative-search acceptance suggestion was available
  - UC-106: `아니, 30명으로 7시에 다시 찾아줘` updated the visible result from `2026-08-06 18:00-20:00, 12명` to `2026-08-06 19:00-21:00, 30명` without an 오전/오후 clarification or stale prior condition
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/87-uc106-base-no-space.png`, `88-uc106-reject-new-conditions.png`
- Iteration 18 trust/graceful-decline and retry-date regression: PASS after fix for executable cases
  - UC-107: understood values were visible as `2026-06-09 18:00-20:00, 20명`, but this remains PARTIAL because there is no distinct pre-search confirmation gate
  - UC-108: submitted-reservation cancellation/change was honestly declined with GLS-direct guidance
  - UC-109/112/115: blocked because they require completed/submitted reservation context
  - UC-110: mid-flow direction change preserved 20명 and used `2026-06-09 18:00-20:00`
  - UC-111: ambiguous `3시` asked for 오전/오후 clarification and did not search at 03:00
  - UC-113/114: repeat reservation and English request were gracefully declined without hanging or silent narrowing
  - UC-116 before fix: retrying from a no-space result with `7월 30일...다시 찾아줘` still showed stale `2026-07-29`
  - UC-116 after fix: the same retry displayed `2026-07-30 18:00-20:00, 2명`, and a 60-character event name was blocked before search/save with a 50-character limit message
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/89-uc107-understood-values.png`, `90-uc108-cancel-change-decline.png`, `91-uc110-mid-flow-direction-change.png`, `92-uc111-ambiguous-3-confirmation.png`, `93-uc113-repeat-decline.png`, `94-uc114-english-guidance.png`, `95-date-change-after-no-space-stale-date.png`, `96-date-change-after-no-space-fixed.png`, `97-uc116-long-event-name-guard.png`
- Iteration 19 ambiguous event-type regression: PASS after fix
  - UC-117 before fix: `7월 31일 오후 6시부터 2시간 12명 UC117 기능 검증 모임 예약해줘` entered GLS search after a generic draft-update message
  - UC-117 after fix: the same request produced `이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?`
  - No search progress card appeared after the fix and no final save/submit was clicked
  - Evidence screenshot: `/private/tmp/skku-reservation-e2e/2026-06-02/100-uc117-ambiguous-hangsa-fixed.png`
- Iteration 20 long-paste and unsupported availability regression: PASS after fix
  - UC-124: `그럼 그 방 언제 비어?` produced a graceful unsupported-feature answer for automatic specific-room free-time scanning and did not start GLS search
  - UC-128 before fix: a 650+ character pasted request asked 행사구분 first, then answering `학생회/동아리 행사` incorrectly replaced the long draft and entered GLS search/no-space
  - UC-128 after fix: the same flow preserved the long draft and replied `사용목적이 너무 길어요. 현재 654자라서 GLS 저장 전에 실패할 수 있어요. 500자 이내로 줄여서 다시 알려주세요.`
  - No search progress card appeared after the fixed clarification answer and no final save/submit was clicked
  - Evidence screenshots: `/private/tmp/skku-reservation-e2e/2026-06-02/101-uc124-specific-room-availability-window.png`, `102-uc128-long-paste-search-before-fix.png`, `103-uc128-long-purpose-guard-fixed.png`

## Detailed Case Results
| ID | Priority/Tag | Result | Evidence |
|---|---:|---|---|
| UC-03 | P2 Core | PASS | Side panel opened to recent conversations on second use |
| UC-04 | P2 Core | FAIL -> PASS AFTER FIX | Hard-coded `5/27` quick example was rejected as a past date; after fix future examples appeared and clicking one started the flow |
| UC-06 | P1 Core | PASS | Multi-turn request asked headcount first, then date/time, then proceeded after safe future answers |
| UC-07 | P1 Core | PASS | `다음 주 화요일` resolved to `2026-06-09` in the side-panel title and proceeded to search; no submit clicked |
| UC-08 | P1 Core | PASS | Both range and duration expressions proceeded without extra time questions; second card showed 14:00-16:00 |
| UC-09 | P1 Core | PASS | `율전 학생회관` request narrowed validation to `1/1`, with `학생회관 · [03B08] 연습실` visible |
| UC-05 | P1 Core | PASS | Complete 2026-06-17 request parsed and moved to search/login |
| UC-10 | P1 Core | PASS | One-line request did not ask extra slot questions |
| UC-11 | P1 Core | PASS | `아니 30명으로` changed the visible recommendation from a 32명 room to a 50명 room while preserving 2026-06-26 18:00-20:00 |
| UC-12 | P2 Core | PASS | `30명으로 바꾸고 시간은 19시부터 1시간으로` changed the card to a capacity 40명 room at 19:00-20:00 |
| UC-13 | P2 Core / Graceful Decline | PARTIAL FAIL -> PASS AFTER FIX | `다른 곳 보여줘` changed the candidate; after the visible-guidance patch, `여러 개 같이 보여줘` displayed one-at-a-time guidance in the bottom UI |
| UC-14 | P2 Core | PASS | `그만할래` stopped the recommendation flow and did not continue asking for slots |
| UC-15 | P1 Core | PASS | "오늘 점심 뭐 먹지?" was rejected as outside GLS space reservation and did not start search |
| UC-16 | P1 Robustness | PASS | `담주 화욜 여섯시 스무명` produced duration clarification chips and did not freeze or get ignored |
| UC-17 | P1 Robustness | PASS | Past date/time was rejected with a retry prompt and no candidate lookup |
| UC-18 | P1 Robustness | FAIL -> PASS AFTER FIX | Symbol-only input first created a draft; after guard it produced a retry prompt without draft/search |
| UC-19 | P1 Core | PASS | Typing indicator and search progress appeared |
| UC-20 | P1 Core | FAIL -> PASS AFTER FIX | Initial card hid/garbled code/floor; fresh 2026-06-19 run showed room code and normalized building/floor |
| UC-21 | P1 Safety | PASS | Normal regression reached a recommendation only after candidate validation and showed an available room for the requested time |
| UC-22 | P1 Core | PASS | 500명 no-capacity run clearly showed `조건에 맞는 공간이 없어요` instead of silent failure |
| UC-23 | P2 Core | FAIL -> PASS AFTER FIX | 500명 initially entered GLS search; after preflight it stopped immediately with a no-capacity message and no search card |
| UC-24 | P2 Core | PASS | Recommendation card displayed a warning that priority/department-admin naming may matter for the selected space |
| UC-25 | P3 Core | PASS | Recommendation card displayed the space notice text before any final save |
| UC-26 | P2 Core | PASS | 10-hour request was rejected with a maximum-duration guidance message and no search |
| UC-27 | P2 Core | FAIL -> PASS AFTER FIX | Active search had no visible cancel control; after fix `중단` stopped the search flow |
| UC-28 | P1 Core | PASS | Draft used user-provided organization/event context |
| UC-29 | P1 Core | PASS | After a recommendation, the app asked for application metadata once and did not loop duplicate prompts |
| UC-30 | P1 Core | FAIL -> PASS AFTER FIX | Complete application metadata produced a visible draft card with explicit category and purpose preserved |
| UC-31 | P1 Core | PASS AFTER FIX | Explicit `행사구분` was preserved as `교내단체행사 (세미나/스터디)` in the draft |
| UC-32 | P1 Trust | FAIL -> PASS AFTER FIX | Draft preview showed category/group/event/headcount/purpose; event-only edit preserved the existing purpose |
| UC-33 | P1 Safety | PASS | No submission occurred without clicking final save |
| UC-34 | P1 Core | BLOCKED | Requires real final save/submit; action-time confirmation not requested during this unattended pass |
| UC-35 | P3 Core | BLOCKED | Completion notification requires a real submitted reservation |
| UC-36 | P2 Core | BLOCKED | Duplicate-click prevention must be observed during the final submit path |
| UC-37 | P1 Safety | BLOCKED | Submit failure handling requires a controlled submit-stage failure |
| UC-38 | P3 Core | NOT_RUN | GLS-filled preview variant was not exercised because this build fills GLS during final save automation |
| UC-39 | P2 Safety | BLOCKED | Race with another reservation must be validated at submit/recheck stage |
| UC-40 | P2 Safety | BLOCKED | Duplicate existing reservation guard requires submit-stage or existing-reservation setup |
| UC-41 | P1 Core | PASS | Login-required card appeared |
| UC-42 | P1 Core | PASS | Flow resumed after GLS login |
| UC-45 | P3 Core | PASS | Search continued and reached a recommendation while the active Chrome tab was `chrome://extensions` |
| UC-46 | P2 Core | BLOCKED | Requires completed reservation memory; no real reservation has been submitted in this run |
| UC-47 | P2 Core | BLOCKED | Requires a visible repeat-memory suggestion first |
| UC-48 | P2 Core | BLOCKED | Requires a visible repeat-memory suggestion first |
| UC-49 | P2 Core | BLOCKED | `저번처럼` was attempted, but completed-memory precondition was absent; app proceeded with normal search |
| UC-51 | P1 Core / Phase 3 | BLOCKED | Requires completed weekly reservation pattern or seeded active reminder |
| UC-52 | P1 Core / Phase 3 | BLOCKED | Requires a visible active reminder first |
| UC-53 | P1 Core / Phase 3 | BLOCKED | Requires a visible active reminder first |
| UC-54 | P1 Core / Phase 3 | BLOCKED | Requires active past reminder fixture; code inspection shows past active reminders are dismissed on fetch |
| UC-55 | P1 Core / Phase 3 | PASS | No reminder banner appeared in the recent conversation list without completed repeating history |
| UC-44 | P1 Core | FAIL -> PASS AFTER FIX | Reload restore could fall to blank chat; fresh reload restored prior messages instead |
| UC-56 | P2 Core | PASS | Recent conversation list visible |
| UC-57 | P2 Core | PASS | Blank new conversation was not persisted by merely opening it |
| UC-58 | P2 Core | PASS FOR VISIBLE RESTORE | Previously selected conversation restored visible prior messages after extension reload |
| UC-59 | P2 Core | FAIL -> PASS AFTER FIX | Delete initially stuck after confirmation; after fix the second click removed the row and server returned DELETE 204 |
| UC-60 | P2 Core | PASS | Recent conversation titles reflected reservation context such as date/time/purpose/headcount |
| UC-61 | P2 Core | PASS | Two distinct recent conversations restored separate titles and histories without visible state mixing |
| UC-62 | P1 Safety | PASS | App did not ask for password inside side panel |
| UC-63 | P1 Safety | PASS | No hidden reservation submission occurred |
| UC-64 | P1 Safety | PASS | Draft/card visible before save |
| UC-65 | P1 Robustness | PASS | Server-down send showed a visible error instead of silent failure |
| UC-66 | P1 Robustness | PASS | Server-down error used Korean user-actionable copy, no stack trace/raw error shown |
| UC-67 | P1 Robustness | PASS | Failed user request remained in history and retry guidance was visible |
| UC-68 | P1 Robustness | NOT_RUN | Long no-response timeout was not separately simulated beyond server-down immediate failure |
| UC-69 | P1 Robustness | PASS | Processing/search state visible during slow operations |
| UC-70 | P1 Safety | BLOCKED | Requires final submit result uncertainty; no final save/submit was clicked |
| UC-71 | P1 Safety | BLOCKED | Requires final submit retry/duplicate-submit setup |
| UC-72 | P1 Robustness | PASS | After server restart, `다시 시도해줘` reused prior date/time/headcount and continued from search |
| UC-73 | P1 Robustness | PASS | Ambiguous time guidance gave concrete examples without blaming the user |
| UC-74 | P1 Robustness | NOT_RUN | Requires controlled GLS DOM divergence fixture |
| UC-75 | P1 Robustness | NOT_RUN | Requires controlled form-fill failure fixture |
| UC-76 | P3 Robustness | NOT_RUN | Requires controlled GLS notice-popup fixture |
| UC-77 | P1 Robustness | PASS | Double-click send produced one user message and one visible search flow |
| UC-78 | P1 Robustness | FAIL -> PASS AFTER FIX | Cross-midnight requests are blocked; after fix, non-time slots remain preserved for correction |
| UC-79 | P1 Safety | PARTIAL | Single-profile run showed no foreign data in lists, but true multi-user isolation was not fixture-tested |
| UC-83 | P1 Core | PASS | No-capacity `300명` request stayed in chat; `아니 15명으로` reused date/time and reached a recommendation |
| UC-84 | P1 Core | FAIL -> PASS AFTER FIX | `400126호` initially was not exact-filtered; after fix the recommendation was `첨단강의실(400126)` with `검증 1/1` |
| UC-85 | P1 Safety | PASS | When a specific space could not be found before the fix, the app did not silently choose a different room |
| UC-86 | P1 Core | PASS | Ambiguous `학생회관` asked for campus clarification and did not search |
| UC-87 | P1 Core | PASS | `자과캠` alias scoped validation to 자연과학캠퍼스 buildings |
| UC-88 | P1 Core | FAIL -> PASS AFTER FIX | `오후 6시 반부터 8시까지` initially asked for meridiem clarification; after fix the card showed 18:30-20:00 |
| UC-89 | P1 Robustness | PASS | Unsupported 10-minute values showed 30-minute-unit guidance and did not round or search |
| UC-90 | P1 Robustness | FAIL -> PASS AFTER FIX | `새벽 3시부터 5시까지` initially searched; after fix it stopped before search with early/late-hour guidance |
| UC-91 | P1 Robustness | PASS | Same-day past-time request stopped in chat with future-time guidance and no GLS search |
| UC-92 | P1 Robustness | PASS | Too-far future request stopped in chat with closer-date guidance and no GLS search |
| UC-93 | P1 Core | PASS | 2-person request recommended a small-capacity study room rather than a large room |
| UC-94 | P1 Core | PASS | Unavailable specific-space path exposed adjustment choices instead of broadening scope silently |
| UC-95 | P1 Trust | PASS | Unsupported beam-projector constraint was disclosed before search instead of silently claiming equipment validation |
| UC-96 | P1 Core | FAIL -> PASS AFTER FIX | Bare `7시부터` correction after an 18:00 recommendation now updates the visible card to 19:00-21:00 without an 오전/오후 clarification |
| UC-97 | P1 Safety | PASS | After `다른 공간 찾기`, the current recommendation/final review area showed only the latest candidate as the active space |
| UC-98 | P1 Safety | PASS AFTER FIX | Partial draft was visible for review, but the final save button stayed disabled until required fields were complete |
| UC-99 | P1 Safety | BLOCKED | Requires manipulating GLS while final form filling is in progress; not executed without action-time confirmation for the final save automation path |
| UC-100 | P1 Robustness | FAIL -> PASS AFTER FIX | Closing the GLS tab during validation now shows a closed-tab guidance message and clears stale recommendation UI |
| UC-101 | P1 Safety | BLOCKED | Requires an existing GLS application form with live user-entered content plus app-driven final form filling; not executed without controlled fixture/action-time confirmation |
| UC-102 | P1 Robustness | NOT_RUN | Requires controlled GLS list mutation where a candidate disappears or is renamed |
| UC-103 | P3 Robustness | BLOCKED | Requires a submitted reservation result while browser notifications are disabled |
| UC-104 | P1 Robustness | FAIL -> PASS AFTER FIX | Extension reload no longer dropped the selected conversation to blank chat in the visible restore check |
| UC-105 | P1 Core | NOT_RUN | Requires a visible suggestion prompt such as repeat-memory or alternative-search acceptance; no controlled prompt was available |
| UC-106 | P1 Core | PASS | Inline `아니, 30명으로 7시에 다시 찾아줘` reused context and updated the visible active condition to 2026-08-06 19:00-21:00, 30명 |
| UC-107 | P1 Trust / Safety | PARTIAL | The card exposed understood values `2026-06-09 18:00-20:00, 20명` before final save, but there is no distinct pre-search confirmation gate |
| UC-108 | P1 Graceful Decline | PASS | `방금 예약 취소해줘` produced honest guidance that submitted reservations must be canceled/changed directly in GLS |
| UC-109 | P2 Core | BLOCKED | Requires a completed prior reservation; no real reservation was submitted in this run |
| UC-110 | P2 Core | PASS | Mid-flow direction change preserved prior `20명` and used the new `2026-06-09 18:00-20:00` condition |
| UC-111 | P1 Core | PASS | Ambiguous `내일 3시에` asked for 오전/오후 clarification and did not search at 03:00 |
| UC-112 | P3 Core | BLOCKED | Requires completed reservation context to verify post-booking GLS confirmation guidance |
| UC-113 | P3 Graceful Decline | PASS | Repeat reservation request was clearly declined and scoped to one date/time at a time |
| UC-114 | P3 Graceful Decline | PASS | English request produced Korean-language retry guidance instead of hanging |
| UC-115 | P1 Trust | BLOCKED | Requires a successful GLS submission result to verify application-complete vs approval-complete wording |
| UC-116 | P2 Core | FAIL -> PASS AFTER FIX | Retry date after no-space now updates from stale 2026-07-29 to 2026-07-30; long event name is blocked before GLS search/save |
| UC-117 | P1 Safety | FAIL -> PASS AFTER FIX | Ambiguous `모임` wording now asks whether the event is closer to 학생회/동아리 or 학과 주관 before GLS search |
| UC-124 | P2 Graceful Decline | PASS | Specific-room free-time query was scoped honestly as unsupported automatic scanning and did not invent availability or start GLS search |
| UC-128 | P1 Robustness / Safety | FAIL -> PASS AFTER FIX | Long pasted text did not break the composer; after 행사구분 clarification, the original 654-character purpose was preserved and blocked before GLS search/save |
| UC-132 | P1 Robustness | FAIL -> FIX BUILT | Extension reload did not kill side panel permanently, but restore needed patch |
| UC-133 | P1 Safety | FAIL -> PASS AFTER FIX | Numeric `23413` initially broadened to many candidates; after fix the recommendation was `세미나실(23413)` with `검증 1/1` |

## Remaining Failures / Blocked
- No unresolved FAIL remains in the limited observed refinement scope after the UC-128 long-paste clarification pass.
- Full UC-01 to UC-133 regression remains NOT_RUN after this partial iteration.
- Continue document-order execution from UC-118/UC-119 and the later not-yet-run UC set, preserving the already observed UC-124/UC-128 evidence.
- Reminder positive paths UC-51 to UC-54 and UC-81 remain BLOCKED/NOT_RUN until a completed weekly pattern or controlled reminder fixture exists.
- Real-submit trust cases UC-34 to UC-40 are BLOCKED until an action-time-confirmed safe test reservation can be created or a controlled submit-stage fixture exists.
- Submit-result and duplicate-submit cases UC-70/71 remain BLOCKED until a safe final-submit or submit-stage fixture exists.
- UC-99 remains BLOCKED until a controlled final form-fill fixture or action-time-confirmed final-save path is used.
- GLS DOM divergence/form-fill/notice fixture cases UC-74/75/76 remain NOT_RUN.
- Repeat-memory cases UC-46 to UC-49 are BLOCKED until a completed reservation memory exists. The observed no-memory behavior could give clearer guidance instead of silently falling back to normal search.
- Actual final save/submit cases were intentionally not executed; Computer Use policy requires action-time confirmation for real reservation creation, and draft-level verification was sufficient for this iteration.
- Full card/history restoration beyond the visible prior messages remains only partially covered.
- Cancel during search stops the UI flow, but an already-started candidate request can still finish server-side after the click. No submit/save was observed.
- UC-130/UC-131 delete-history verification still needs action-time approval before clicking a real delete confirmation in Chrome UI.

## Next Recommended Work
1. Continue the full document-order pass from UC-01 and compute the full executable-suite PASS ratio.
2. Add automated component tests for `normalizeBuildingNo` and `deriveFloorLabel`.
3. Exercise reminder and final-save guarded flows with action-time confirmation where necessary before marking the goal complete.
