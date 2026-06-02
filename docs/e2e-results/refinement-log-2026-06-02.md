# SKKU Reservation E2E Refinement Log - 2026-06-02

## Environment
- Date/time: 2026-06-02 KST
- Chrome extension: `extension/dist`
- Server: `http://localhost:8000`
- Screenshot dir: `/private/tmp/skku-reservation-e2e/2026-06-02/`
- Personal data policy: GLS account, name, student number, phone, and visible profile data are masked in this log.

## Precheck
- `extension` build: PASS
- `server` build: PASS
- `server` typecheck: PASS
- Prisma migration status: PASS, schema up to date
- `/health`: PASS, `{"ok":true}`
- Chrome extension load: PASS, `SKKU 공간예약 에이전트 0.1.0` enabled
- Side panel launch: PASS
- GLS login: PASS after password field required retry and duplicate-session warning
- Password-save prompt: NOT USED

## Iteration 1 Timeline
- Opened side panel from Chrome toolbar.
- Observed previous conversation list and started a new conversation.
- Sent a complete safe request for 2026-06-17:
  - "6월 17일 수요일 18시부터 2시간 20명 컴공 학생회 운영위원회 회의실 예약해줘"
- App parsed date/time/headcount/application context and showed login-required state.
- Logged into GLS using the provided account. Sensitive values are not recorded here.
- App resumed after login and searched GLS candidates.
- App found an available candidate and opened the GLS reservation form.
- Stopped before final save/submit. No real reservation was submitted.
- Root cause found: recommendation card did not expose space code/building number clearly and misread `33218` as `33층`.
- Patch 1:
  - Added `buildingNo` to `SpaceSummary`.
  - Displayed room as `name(code)`.
  - Displayed building as `building(buildingNo동)`.
  - Derived floor using the room-code portion rather than the whole GLS code.
- Rebuilt extension and reloaded it in Chrome.
- Sent a second safe request for 2026-06-18:
  - "6월 18일 목요일 19시부터 1시간 12명 소프트웨어학과 기능 검증 회의실 예약해줘"
- App found a recommendation. Space code became visible, but building/floor still showed `경영관(133동) · 33층`.
- Root cause found: DB `buildingNo` may include a campus prefix (`133`) while GLS space codes start with the visible building number (`33`).
- Patch 2:
  - Normalized 3-digit building numbers when the GLS space code starts with the 2-digit suffix.
  - Reused the normalized building number for floor derivation.
- Observed another issue after extension reload:
  - Clicking a conversation row could return to a blank "새 대화" screen.
- Root cause found:
  - `handleGetStatus` preferred a cached empty context over server/snapshot hydration.
- Patch 3:
  - In explicit restore, if the cached context is missing or has empty history, hydrate from server/snapshot before falling back.
- Fresh UI regression after the final patches:
  - Reloaded the extension from `chrome://extensions`.
  - Opened the SKKU side panel and verified the recent conversation list still appeared.
  - Clicked the latest conversation and confirmed it restored to the prior user/assistant messages instead of a blank "새 대화" screen.
  - Started a new conversation and sent a safe future request for 2026-06-19:
    - "6월 19일 금요일 19시부터 1시간 12명 기능 검증 회의실 예약해줘"
  - The app parsed the request, searched GLS candidates, and stopped at the recommendation/metadata slot stage without final save/submit.
  - Recommendation card showed `세미나실 I(85529)` and `산학협력센터(85동) · 5층`, confirming room code and normalized building/floor visibility.
- Final builds after patches:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - `prisma migrate status`: PASS
  - `/health`: PASS

## Screenshots
- `00-sidepanel-open.png`
- `01-new-conversation.png`
- `02-complete-request-processing.png`
- `03-login-required.png`
- `04-gls-duplicate-session-warning.png`
- `05-after-login-searching.png`
- `06-recommendation-and-draft.png`
- `07-regression-card-code-visible-building-bug.png`
- `08-final-card-normalized.png`

## Case Notes
- UC-03: PASS, second open showed recent conversation screen instead of onboarding.
- UC-05/10: PASS, complete one-sentence request parsed and proceeded without slot questions.
- UC-19/69: PASS, typing indicator and candidate search progress appeared.
- UC-20: FAIL then PASS AFTER FIX, space code and normalized building/floor were visible in the fresh 2026-06-19 run.
- UC-28/32/64: PASS, draft preview showed category, organization, event, headcount, purpose before any final save.
- UC-33/62/63: PASS, no password requested inside app, no final save occurred without explicit user action.
- UC-41/42: PASS, login-required card appeared and app resumed after GLS login.
- UC-44/58/104/132: FAIL then PASS FOR VISIBLE RESTORE, reload/restore no longer dropped the selected conversation to a blank chat in the fresh check.
- UC-57: PASS by observation, pressing new conversation did not immediately persist a blank server conversation during this run.
- Safety guard: PASS, all test dates used for reservation-capable flows were 2026-06-17 or later. No final save was clicked.

## Open Items
- Full UC-01 to UC-133 regression has not been completed in this iteration.
- Full card/history restoration beyond the visible prior messages remains only partially covered.
- P3 reminder cases UC-51 to UC-55 and UC-81 were not re-executed in this iteration.

## Iteration 2 Timeline
- Reloaded `extension/dist` from `chrome://extensions` and reopened the side panel.
- Started a new conversation and sent "공간 예약하고 싶어".
- Verified slot-by-slot collection:
  - The app asked for headcount first and showed 10명/20명/30명 chips.
  - After "한 20~30명쯤", it interpreted the request as 30명 and asked for date/time.
  - After "6월 20일 토요일 18시부터 2시간", it proceeded to search. The date is more than two weeks after the run date.
- Root cause found: while candidate search was active, the composer was disabled and the visible UI had no cancel affordance, so UC-27 could not be performed as a user.
- Patch 4:
  - Added an active `중단` button to `SearchProgressCard`.
  - Routed the button through the existing natural-language cancel path by sending `취소`, so history, abandon status, and local UI cleanup use the same logic as typed cancellation.
- Rebuilt extension and reloaded it in Chrome.
- Ran a safe future search for 2026-06-21:
  - "6월 21일 일요일 18시부터 2시간 30명 기능 검증 회의실 예약해줘"
  - The active search card displayed `중단`.
  - Clicking `중단` produced "예약 진행을 중단했어요. 필요하면 새 대화로 다시 시작할 수 있어요." and restored the composer.
- Ran out-of-scope and invalid-input checks:
  - UC-15: "오늘 점심 뭐 먹지?" was gently rejected as outside GLS space reservation and did not start search.
  - UC-17: "어제 14시 10명 회의실 예약해줘" was rejected as a past date/time and did not start search.
- Root cause found: UC-18 symbol-only input (`@@@ ### !!!`) was accepted as an application description because the application-collection follow-up branch treated almost any non-empty text as a draft description when collection was pending.
- Patch 5:
  - Added a `/parse` pre-LLM guard for symbol-only input.
  - Added a meaningful-text guard before deriving application drafts from collection follow-up text.
- Rebuilt server and extension. The server dev watcher reloaded the changed server files.
- Reloaded the extension, reopened side panel, and reran UC-18 with `@@@ ### !!!`.
  - The app responded "예약할 날짜, 시간, 인원처럼 이해할 수 있는 내용으로 다시 알려주세요."
  - No recommendation card, draft card, candidate lookup, or submit/save occurred.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 2 Screenshots
- `09-uc06-slot-questions.png`
- `10-uc27-search-cancel.png`
- `11-uc15-out-of-scope.png`
- `12-uc17-past-date-guard.png`
- `13-uc18-special-input-misparsed.png`
- `14-uc18-special-input-guard-fixed.png`

## Iteration 2 Case Notes
- UC-06: PASS, the app asked one missing slot at a time and continued after headcount/date-time answers.
- UC-15: PASS, unrelated small talk was rejected without search or draft progression.
- UC-17: PASS, past date/time was rejected and no search/submit path started.
- UC-18: FAIL then PASS AFTER FIX, symbol-only input no longer creates an application draft or search path.
- UC-27: FAIL then PASS AFTER FIX, active search now has a visible `중단` control that stops the flow.
- Safety guard: PASS, reservation-capable flows used 2026-06-20 and 2026-06-21. No final save was clicked.

## Iteration 2 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- The search-cancel UI stops the user-facing flow. Server logs may still show an already-started candidate request racing to completion after the cancel click; no submit/save action was observed.

## Iteration 3 Timeline
- Re-ran build/status prechecks before the next Chrome pass:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - `pnpm prisma migrate status`: PASS
  - `/health`: PASS
- Reloaded `extension/dist` from `chrome://extensions` and opened the side panel.
- Started a new conversation and inspected the visible quick examples.
- UC-04 failure before fix:
  - The quick example list still included `5/27 오후 3시 200명 행사장`.
  - On 2026-06-02 this is a past date. Clicking it produced the app response: "지난 날짜나 이미 지난 시간으로는 예약할 수 없어요. 오늘 이후의 날짜와 시간을 다시 알려주세요."
  - No search or final save/submit occurred.
- Root cause found: first-run/quick examples were hard-coded and could become past dates. Some examples were also incomplete enough to trigger extra slot questions instead of proving that the shown sentence works end-to-end.
- Patch 6:
  - Added a shared `getReservationExamples` helper that generates examples 21+ days after the current date.
  - Updated both quick examples and onboarding examples to use complete future reservation sentences with date, time, duration, headcount, and purpose.
- Rebuilt the extension and reloaded it in Chrome.
- UC-04 verification after fix:
  - The quick examples changed to future dates: `6월 23일(화)`, `6월 24일(수)`, and `6월 26일(금)`.
  - Clicking `6월 23일(화) 오후 6시부터 2시간 20명 학생회 회의` started the normal reservation flow, showed an application-context message, displayed active search progress, and exposed the `중단` control.
  - Clicked `중단`; the app responded "예약 진행을 중단했어요. 필요하면 새 대화로 다시 시작할 수 있어요."
  - No final save/submit occurred.
- UC-16 verification:
  - Started a new conversation and entered `담주 화욜 여섯시 스무명`.
  - The app did not ignore or freeze. It interpreted the rough date/headcount context and asked a duration clarification with chips: `20시까지`, `2시간`, `한 시간만`.
  - No candidate lookup or final save/submit occurred before the missing duration was confirmed.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 3 Screenshots
- `15-uc04-quick-examples-before.png`
- `16-uc04-dynamic-examples-after.png`
- `17-uc04-complete-dynamic-examples.png`
- `18-uc04-example-searching-after-fix.png`
- `19-uc16-colloquial-input.png`

## Iteration 3 Case Notes
- UC-04: FAIL then PASS AFTER FIX, hard-coded past quick examples were replaced with current-date-based complete examples and the clicked example started the reservation flow.
- UC-16: PASS, colloquial/abbreviated input produced a meaningful clarification instead of being ignored or crashing.
- Safety guard: PASS, reservation-capable quick-example flow used 2026-06-23, more than two weeks after the run date. No final save was clicked.

## Iteration 3 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Onboarding first-run examples now share the fixed generator, but a fresh-profile onboarding screen was not separately reset and replayed in this iteration.

## Iteration 4 Timeline
- Continued document-order regression coverage from the early natural-language cases in the same Chrome side panel session.
- UC-07 relative date check:
  - Started a new conversation and sent `다음 주 화요일 18시부터 2시간 18명 자연어 날짜 검증 회의실 예약해줘`.
  - The side-panel title changed to `2026-06-09 자연어 날짜 검증`, and candidate search began.
  - The run intentionally did not click any final GLS save/submit. The 2026-06-09 date is less than two weeks away, so this case was stopped at non-submit evidence only.
- UC-08 time-expression check:
  - Sent `6월 24일 오후 2시부터 4시까지 8명 시간 표현 검증 회의실 예약해줘`.
  - The app proceeded without a duration clarification and began search for 2026-06-24.
  - Stopped the flow with `중단`.
  - Started a separate conversation and sent `6월 24일 14시부터 2시간 8명 시간 표현 검증 회의실 예약해줘`.
  - The app again proceeded without a duration clarification and reached a recommendation card showing `시간 14:00 – 16:00`.
- UC-09 building filter check:
  - Started a new conversation and sent `6월 25일 목요일 19시부터 2시간 15명 율전 학생회관 기능 검증 회의실 예약해줘`.
  - Candidate validation narrowed to `검증 1/1`, with the visible candidate `학생회관 · [03B08] 연습실`.
- UC-11 correction check:
  - Started a new conversation and sent `6월 26일 금요일 18시부터 2시간 20명 정정 기능 검증 회의실 예약해줘`.
  - The initial recommendation had capacity 32명 for 18:00-20:00.
  - Entered `아니 30명으로` in the same conversation.
  - The recommendation changed to a capacity 50명 room for the same 2026-06-26 18:00-20:00 time, indicating the headcount correction was reflected without restarting the whole conversation.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 4 Screenshots
- `20-uc07-relative-date-search.png`
- `21-uc08-time-range-search.png`
- `22-uc08-duration-search.png`
- `23-uc09-building-filter.png`
- `24-uc11-headcount-correction.png`

## Iteration 4 Case Notes
- UC-07: PASS by UI evidence, `다음 주 화요일` resolved to 2026-06-09 and proceeded to search. Final save was not clicked because the date is less than two weeks away.
- UC-08: PASS, both `오후 2시부터 4시까지` and `14시부터 2시간` proceeded without extra time clarification, and the second card showed 14:00-16:00.
- UC-09: PASS, specifying `율전 학생회관` narrowed the visible candidate set to the Student Center candidate.
- UC-11: PASS by visible recommendation change, `아니 30명으로` produced a new candidate with larger capacity while preserving the same date/time.
- Safety guard: PASS, no final save was clicked. The only under-two-week request date in this iteration was used for parse/search evidence only.

## Iteration 4 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- UC-11 was verified through visible recommendation change rather than an explicit assistant sentence that restated the updated headcount.
- UC-12 multi-field correction remains NOT_RUN.

## Iteration 5 Timeline
- Continued from the same recommendation/metadata state after UC-11.
- UC-12 multi-field correction:
  - Sent `30명으로 바꾸고 시간은 19시부터 1시간으로`.
  - The recommendation changed to a candidate with capacity 40명 and `시간 19:00-20:00`, while preserving date 2026-06-26.
  - No final save/submit occurred.
- UC-13 alternative candidate:
  - Sent `다른 곳 보여줘`.
  - The recommendation changed from `학생 참여형 플립러닝 강의실(26305)` to `강의실(50304)`, preserving date 2026-06-26 and time 19:00-20:00.
- UC-13 candidate-list graceful-decline subcase:
  - Sent `여러 개 같이 보여줘`.
  - The app did not expand a multi-candidate list, but the visible bottom-of-chat UI also did not show an explicit "한 곳씩 보여드려요" style guidance message.
  - Code inspection showed such a message exists in the background alternative handler, but in the actual Chrome UI it was not visible at the current scroll position after the recommendation card remained at the bottom.
  - Result recorded as unresolved FAIL for guidance visibility, not a safety issue.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 5 Screenshots
- `25-uc12-multi-correction.png`
- `26-uc13-other-space.png`
- `27-uc13-compare-request-no-guidance.png`

## Iteration 5 Case Notes
- UC-12: PASS, one sentence changed both headcount and time; the card moved to a capacity 40명 candidate at 19:00-20:00.
- UC-13: PARTIAL, `다른 곳 보여줘` changed the candidate while preserving conditions, but `여러 개 같이 보여줘` did not leave visible one-at-a-time guidance in the bottom UI.
- Safety guard: PASS, all flows remained at recommendation/application metadata stages. No final save was clicked.

## Iteration 5 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Root cause to address: alternative/list guidance is generated in background handling but not reliably visible to the user after candidate-card rendering and scroll positioning.

## Iteration 6 Timeline
- Root cause fixed: the assistant could generate one-at-a-time alternative guidance, but the recommendation card and bottom scroll position made the guidance unreliable in the visible UI.
- Patch 7:
  - Added a derived latest-alternative-guidance notice in `ChatScene`.
  - Rendered that notice below the recommendation card whenever a valid recommendation is shown, so `여러 개 같이 보여줘` leaves the graceful-decline policy visible at the bottom of the chat.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - Reloaded `extension/dist` from `chrome://extensions`.
- UC-13 verification:
  - Reopened the restored UC-13 conversation from the Chrome side panel.
  - The existing `여러 개 같이 보여줘` exchange showed `후보를 길게 나열하지 않고 한 곳씩 보여드려요. 같은 조건으로 다음 공간을 찾아볼게요.` in the bottom UI.
  - Sent `여러 개 같이 보여줘` again and confirmed the same guidance appeared again at the bottom.
  - The app did not list multiple candidates and did not submit or save a reservation.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 6 Screenshots
- `28-uc13-compare-guidance-fixed.png`

## Iteration 6 Case Notes
- UC-13: PASS AFTER FIX, alternative-candidate guidance is now visible in the bottom UI after a candidate-list request.
- Safety guard: PASS, the run stayed in chat/recommendation guidance only. No final save was clicked.

## Iteration 6 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- The current fix was verified on the restored UC-13 conversation and repeat request; continue document-order regression before goal completion.

## Iteration 7 Timeline
- Continued document-order exploration around UC-14 and UC-21 to UC-26.
- UC-14:
  - Sent `그만할래` in an active recommendation conversation.
  - The app responded `예약 진행을 중단했어요. 필요하면 새 대화로 다시 시작할 수 있어요.`
  - It did not continue asking slot/application questions and did not submit anything.
- UC-23 failure before fix:
  - Sent `7월 1일 수요일 18시부터 2시간 500명 대규모 기능 검증 행사장 예약해줘`.
  - The app started a GLS-backed search card instead of quickly saying no registered room can fit 500명.
  - It eventually produced a no-space message, but only after entering search, so UC-23 was recorded as FAIL for the "헛탐색하지 않는다" expectation.
- Root cause found:
  - The side panel auto-starts GLS search when parse returns `ready_to_search`.
  - Capacity filtering exists in `/spaces`, but impossible headcounts were only discovered after the GLS automation path had already begun.
- Patch 8:
  - Added a background chat capacity preflight before persisting/search start.
  - If `ready_to_search` is true and `/spaces?headcount=...` returns no candidates, the chat response now sets `ready_to_search=false` and explains that no registered room can fit the requested headcount.
  - API failure in this preflight is non-blocking and falls back to the original search path.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - `/health`: PASS
  - Reloaded `extension/dist` from `chrome://extensions`.
- UC-23 verification after fix:
  - Sent the same 500명 request in a fresh side-panel conversation.
  - The UI immediately showed `500명을 수용할 수 있는 공간이 등록되어 있지 않아요. 인원을 줄이거나 행사를 나눠서 다시 알려주세요.`
  - No search card, GLS tab navigation, final save, or submit occurred.
- Regression spot check:
  - Sent `7월 2일 목요일 18시부터 1시간 20명 preflight 회귀 검증 회의실 예약해줘`.
  - The normal-capacity request still entered search and reached a recommendation, so the preflight did not block ordinary flows.
- UC-21/24/25:
  - The normal-capacity request showed failed candidate attempts, then a recommendation marked available.
  - The recommendation card displayed `세미나실(23413)`, 2026-07-02 18:00-19:00, max 24명, and the detailed space notice.
  - The same card displayed an admin/priority warning: `정보통신/소프트웨어융합/공과대학행정실 우선 공간 — 신청 시 학생회 명의 권장`.
- UC-26:
  - Sent `7월 3일 금요일 오전 9시부터 10시간 12명 장시간 기능 검증 회의실 예약해줘`.
  - The app responded `한 번에 10시간 예약은 제한을 넘을 수 있어요... 최대 8시간 이내...` without search.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 7 Screenshots
- `29-uc14-cancel-stop.png`
- `30-uc23-500-headcount-searches.png`
- `31-uc22-no-space-clear-message.png`
- `32-uc23-headcount-preflight-fixed.png`
- `33-preflight-normal-search-regression.png`
- `34-uc21-24-25-recommendation-evidence.png`
- `35-uc26-long-duration-guard.png`

## Iteration 7 Case Notes
- UC-14: PASS, explicit cancellation stopped the flow and restored normal input.
- UC-21: PASS by UI evidence, recommendation appeared only after availability checks and was marked available for the requested time.
- UC-22: PASS, no-space state was explicit and offered condition changes.
- UC-23: FAIL then PASS AFTER FIX, impossible headcount no longer enters GLS search.
- UC-24: PASS, a priority/admin warning was visible on the recommendation card.
- UC-25: PASS, space notice/restrictions were visible before submit.
- UC-26: PASS, 10-hour request was rejected with a duration-limit explanation.
- Safety guard: PASS, no final save/submit was clicked.

## Iteration 7 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- The capacity preflight is currently headcount-only. No-space optimization for building/space-specific filters should use shared search-filter logic in a later cleanup.

## Iteration 8 Timeline
- Continued from UC-29 to UC-32 style application-metadata and draft-preview flows.
- UC-29 regression:
  - Started a safe future request for 2026-07-09 and reached a recommendation.
  - The app asked for application metadata only once (`단체와 행사명을 알려주세요`) after the recommendation.
- UC-98 partial-draft guard:
  - Entered partial application text that produced an incomplete draft.
  - The side panel showed the partial draft preview but kept `GLS 신청 저장` disabled, preventing accidental submission with missing required fields.
- UC-30/31/32 complete draft regression:
  - Entered explicit application metadata including organization, event name, category, and purpose.
  - Before the fix, the complete draft could overwrite the explicit purpose with an auto-generated phrase, and category parsing could be lost around `행사구분`.
  - After the fix, the draft card showed category, organization, event, headcount, and the explicit purpose.
- UC-32 edit regression:
  - Entered `행사명만 UX 검증 워크숍으로 바꿔줘`.
  - The UI created a superseded previous draft and a current draft with the new event name while preserving the original purpose.
  - Server log evidence showed this local draft-only edit avoided an additional `/parse` call and mirrored only the conversation update.
- Root causes found:
  - Draft rendering required a "complete" application state, so partial drafts were hidden instead of visible-but-locked.
  - Application field-label parsing let `행사구분` be swallowed by adjacent field extraction.
  - Server draft follow-up logic auto-filled purpose when only event name changed, even when a real purpose was already present.
  - Side-panel slot state was overwritten by application-only parse responses, so the recommendation context and draft card could diverge.
  - Simple text-field draft edits were unnecessarily sent through LLM parsing, making UI edits fragile during transient parse errors.
- Patch 9 / commit `96c9d9f`:
  - Show partial draft cards while locking submit until all required application fields are complete.
  - Preserve existing purpose unless no purpose exists.
  - Treat `행사구분` as a field label during local modification parsing.
  - Preserve/merge active reservation slots for application-only messages after a recommendation.
  - Apply safe event/group/purpose-only draft edits locally in the extension background and recompute missing fields.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 8 Screenshots
- `36-uc29-asks-application-once.png`
- `36-uc29-asks-application-once-fixed.png`
- `37-uc31-32-partial-draft-visible-fixed.png`
- `38-uc29-asks-application-once-after-local-edit-fix.png`
- `39-uc98-partial-draft-submit-disabled.png`
- `40-uc30-31-32-draft-complete-purpose-regression.png`
- `41-uc30-31-32-draft-complete-fixed.png`
- `42-uc30-field-edit-purpose-preserved.png`

## Iteration 8 Case Notes
- UC-29: PASS, the app asked for application metadata once after finding a recommendation.
- UC-30: FAIL then PASS AFTER FIX, complete application metadata produced a visible draft card with category, organization, event, headcount, and explicit purpose.
- UC-31: PASS AFTER FIX, application category stayed `교내단체행사 (세미나/스터디)` after explicit `행사구분` input.
- UC-32: FAIL then PASS AFTER FIX, event-name-only edits preserved the original purpose and kept the recommendation context active.
- UC-98: PASS AFTER FIX, incomplete drafts are visible for review but cannot be submitted.
- Safety guard: PASS, tested reservation-capable dates were 2026-07-09 and 2026-07-10. No final save was clicked.

## Iteration 8 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- The draft-edit local fast path intentionally excludes headcount/category edits; those still go through normal parsing/search safety paths.

## Iteration 9 Timeline
- Continued document-order coverage around trust/safety, recovery, and repeat-reservation convenience.
- UC-34/36/37/39/40:
  - These cases require the real final `GLS 신청 저장` / GLS save path or a race/failure at that point.
  - They were not executed in this pass because a real reservation can be created and action-time confirmation was not requested in the middle of this unattended loop.
  - Result recorded as BLOCKED by real-submission confirmation, not as product failure.
- UC-35:
  - Depends on actual submit completion and system notification after completion.
  - Result recorded as BLOCKED with the same real-submission precondition.
- UC-38:
  - Current UI shows a side-panel application preview before save, but this pass did not click the final save automation that fills GLS fields.
  - Result recorded as NOT_RUN for the GLS-filled-screen preview variant.
- UC-45:
  - Started a safe future request for 2026-07-13.
  - Immediately switched the active Chrome tab from GLS to `chrome://extensions`.
  - The side panel stayed open, showed `탐색 중`, continued candidate validation, and reached a recommendation plus locked draft preview while the active tab remained `chrome://extensions`.
  - No final save/submit occurred.
- UC-46~49:
  - The app's repeat-reservation memory source requires completed reservation records with a confirmed reservation form.
  - Because this refinement run intentionally has not submitted any real reservation, the completed-memory precondition is not satisfied.
  - UC-49 was attempted with `저번처럼 해줘`; the app proceeded as a normal reservation search and then asked for application metadata.
  - Result recorded as BLOCKED / precondition not met for repeat-memory success criteria, with a UX note that the no-completed-memory case could be clearer.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 9 Screenshots
- `43-uc45-other-tab-searching.png`
- `44-uc45-other-tab-recommendation.png`
- `45-uc49-no-completed-memory-precondition.png`

## Iteration 9 Case Notes
- UC-45: PASS, search and recommendation continued while the active Chrome tab was not GLS.
- UC-34/35/36/37/39/40: BLOCKED, require real final save/submit or a submit-stage failure/race condition.
- UC-38: NOT_RUN, GLS-filled preview was not exercised because it shares the final save automation path.
- UC-46/47/48/49: BLOCKED, completed reservation memory precondition is absent because no real reservation has been submitted in this run.
- Safety guard: PASS, no final save was clicked. Reservation-capable test dates were 2026-07-13 and 2026-07-14.

## Iteration 9 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Actual submit-path cases need explicit action-time confirmation and a safe test reservation date at least two weeks out.
- Repeat-reservation memory cases need either an existing completed reservation record or a confirmed test submission before they can be judged.

## Iteration 10 Timeline
- Covered Phase 3 reminder cases UC-51 to UC-55 at the precondition level.
- Code inspection:
  - Reminder generation requires at least 3 completed conversations with confirmed reservation forms and stored slots.
  - Past active reminders are dismissed automatically when `/reminders` is fetched and `proposedDate` is earlier than today.
- UC-51/52/53/54:
  - These cases require a completed weekly pattern or an active reminder fixture.
  - This refinement run has intentionally avoided real final reservation submission, so the completed-pattern precondition is absent.
  - Result recorded as BLOCKED / precondition not met.
- UC-55:
  - Opened the side-panel recent conversation list in Chrome.
  - No reminder banner was visible; only recent conversations appeared.
  - This matches the expectation that a user without a completed repeating pattern should not see a random reminder.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 10 Screenshots
- `46-uc55-no-reminder-without-completed-pattern.png`

## Iteration 10 Case Notes
- UC-55: PASS, no recurring reservation reminder appeared without completed pattern history.
- UC-51/52/53/54: BLOCKED, require completed weekly reservation pattern or a controlled reminder fixture.
- Safety guard: PASS, no real reservation was submitted.

## Iteration 10 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Phase 3 reminder positive-path cases need either safe seeded completed reservations or an action-time-confirmed real test submission series.

## Iteration 11 Timeline
- Continued Phase 4 conversation-management coverage around UC-56 to UC-60.
- UC-56/60 observation:
  - Opened the side-panel recent conversation list after extension reload.
  - Recent conversations were visible with meaningful titles derived from reservation details such as date/time, purpose, and headcount.
- UC-59 before fix:
  - Clicking a conversation delete button changed the button state to `대화 삭제 확인`.
  - A second user click did not reliably send a `DELETE /conversations/...` request; in one path focus/activation leaked back to the conversation row.
  - Result recorded as FAIL before fix because a user could enter the confirmation state but not complete deletion.
- Root cause found:
  - The delete control lives inside a clickable conversation row, so pointer/click/keyboard events could be interpreted by the parent row.
  - The control also had too small a target and was hidden unless hovered, making keyboard and Computer Use activation fragile.
- Patch 10 / commit `39bb47e`:
  - Added explicit `aria-label` values for normal and confirmation states.
  - Stopped pointer and keyboard activation from bubbling to the parent row.
  - In confirmation state, confirmed deletion on `pointerdown` as well as click/keyboard activation.
  - Enlarged the target and kept it visible while focused.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-59 after fix:
  - First click changed the label to `대화 삭제 확인`.
  - Second click removed the conversation from the visible recent list.
  - Server log showed `DELETE /conversations/<masked-id>` followed by HTTP 204 and a refreshed conversations list.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 11 Screenshots
- `47-uc56-60-recent-list-titles.png`
- `48-uc59-delete-fixed.png`

## Iteration 11 Case Notes
- UC-56: PASS, recent conversation list was visible after extension reload.
- UC-59: FAIL then PASS AFTER FIX, the two-step deletion flow now completes from the actual side-panel UI and sends DELETE 204.
- UC-60: PASS, conversation titles reflected meaningful reservation context instead of generic placeholders.
- Safety guard: PASS, this iteration did not enter any final reservation save/submit path.

## Iteration 11 Open Items
- UC-58/61 need a broader multi-conversation switch check in the remaining full regression, although visible restore and distinct conversation rows have partial coverage.
- Full UC-01 to UC-133 regression is still not complete.

## Iteration 12 Timeline
- Continued document-order coverage through UC-61 and UC-65 to UC-79.
- UC-61:
  - Opened two different recent conversations in sequence.
  - Conversation A restored the 2026-07-13 other-tab test context.
  - Conversation B restored the 2026-07-10 UX workshop context, including its separate draft-edit history.
  - No cross-contamination between titles, messages, or visible state was observed.
- UC-65/66/67:
  - Stopped the local dev server and sent a safe future reservation request.
  - The user message remained visible in the conversation.
  - The UI showed a human-readable Korean error: `예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.`
  - Restarted the server and typed `다시 시도해줘`; the app reused the previous date/time/headcount and moved to search instead of starting from scratch.
- UC-69/72:
  - The retry flow showed `빈 공간 찾는 중`, validation progress, and `중단`.
  - The flow was safely canceled before any final save.
- UC-77:
  - Double-clicked the send button on a new safe future request.
  - Only one user message appeared and a single search flow started; the search was canceled before submit.
- UC-78 before fix:
  - A cross-midnight request eventually showed the correct `자정을 넘기는 예약은 지원하지 않아요...` guidance.
  - But the invalid-time response dropped previously supplied non-time slots, so the UI asked for headcount again.
- Root cause found:
  - Time-related invalid-input overrides returned empty slots, losing date/headcount/building even though only start/end time needed correction.
  - Server and extension background had parallel overrides that needed the same behavior.
- Patch 11 / commit `ef64fb1`:
  - Server parse override now clears only time slots for cross-midnight and unsupported-minute errors.
  - Extension background override now mirrors the same time-only clearing.
- Rebuilt and reloaded:
  - `server pnpm build`: PASS
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-78 after fix:
  - Re-ran a safe 2026-07-18 cross-midnight request.
  - The UI showed the same cross-midnight guard, but follow-up chips were time-focused (`20시까지`, `2시간`, `한 시간만`) instead of asking for headcount again.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 12 Screenshots
- `49-uc61-conversation-a-restored.png`
- `50-uc61-conversation-b-restored.png`
- `51-uc67-server-down-visible-error.png`
- `52-uc72-retry-preserves-context.png`
- `53-uc78-midnight-crossing-guard.png`
- `54-uc77-double-click-single-processing.png`
- `55-uc78-midnight-guard-preserves-count-fixed.png`

## Iteration 12 Case Notes
- UC-61: PASS, multiple conversations restored independently without visible mixing.
- UC-65: PASS, server-down failure was visible rather than silent.
- UC-66: PASS, error copy was Korean and user-actionable, with no stack trace or raw code.
- UC-67: PASS, the sent content remained in conversation history and retry guidance was visible.
- UC-69: PASS, slow/search operations showed visible progress.
- UC-72: PASS, retry after server restart reused prior slots and continued from the failed point.
- UC-73: PASS, ambiguous time guidance used concrete examples and did not blame the user.
- UC-77: PASS, double-click send did not duplicate the user message or start parallel visible searches.
- UC-78: FAIL then PASS AFTER FIX, cross-midnight requests are blocked and now preserve non-time slots.
- UC-70/71: BLOCKED, require final submit/result uncertainty or duplicate-submit retry.
- UC-74/75/76: NOT_RUN, require controlled GLS DOM divergence, form-fill failure, or notice-popup fixture.
- UC-79: PARTIAL, no cross-user data was visible in this single-profile run, but true multi-user isolation was not fixture-tested.
- Safety guard: PASS, all reservation-capable dates were 2026-07-15 or later and no final save was clicked.

## Iteration 12 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Submit-result, duplicate-submit, and GLS-DOM-failure cases need a controlled fixture or explicit action-time confirmation for safe final-submit testing.

## Iteration 13 Timeline
- Continued high-risk scenario coverage from UC-83, UC-84/85/94, and UC-133.
- UC-83:
  - First sent `내일 14시부터 2시간 100명 ...`; this was a weak failure condition because registered rooms can support up to 120 people, so the flow was safely canceled.
  - Re-ran with `300명`, which immediately showed `300명을 수용할 수 있는 공간이 등록되어 있지 않아요...` without starting GLS search.
  - In the same conversation, sent `아니 15명으로 다시 찾아줘`.
  - The app reused the prior date/time, changed only the headcount, and reached a recommendation and locked partial draft.
- UC-84/85/94 before fix:
  - Sent a safe future request targeting `반도체관 400126호`.
  - The UI did not silently choose another space, but it also failed to find the actual registered code because numeric `space` values were treated like room-name text.
- UC-133 before fix:
  - Sent a numeric-code request containing `23413` and a separate `15명` headcount.
  - The UI validated many unrelated candidates instead of locking to the requested numeric code.
- Root cause found:
  - The parser schema had only a generic `space` slot.
  - `/spaces` interpreted `space` as `roomName contains`, so GLS space codes such as `23413`, `400126`, or `400126호` could not be exact-filtered.
  - LLM output was also not reliably forced to preserve valid 5~6 digit space codes.
- Patch 12 / commit `324da3a`:
  - Added parse-route postprocessing that detects valid explicit GLS space codes in user text and enriches campus/building/space slots from the DB.
  - Changed `/spaces` so code-shaped `space` filters exact-match `glsSpaceCode`; non-code room names still use the existing room-name contains behavior.
  - Updated the LLM prompt to treat 5~6 digit space codes as specific `space` values when headcount is supplied separately.
- Rebuilt and reloaded:
  - `server pnpm build`: PASS
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
  - Auxiliary `/spaces` checks returned exactly one row for `23413` and `400126호`.
- UC-133 after fix:
  - Re-ran the same numeric-code request.
  - The UI showed `검증 1/1`, then recommended `세미나실(23413)` with date/time/headcount intact.
- UC-84 after fix:
  - Re-ran `반도체관 400126호` for 2026-07-20 18:00-20:00, 50명.
  - The UI showed `검증 1/1`, then recommended `첨단강의실(400126)`.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 13 Screenshots
- `56-uc83-overcapacity-before-adjust.png`
- `57-uc83-300-overcapacity.png`
- `58-uc83-adjust-15-after-overcapacity.png`
- `59-uc84-specific-room-400126.png`
- `60-uc133-numeric-space-code-23413.png`
- `61-uc133-numeric-code-result.png`
- `62-uc133-numeric-code-fixed.png`
- `63-uc133-numeric-code-fixed-result.png`
- `64-uc84-specific-room-400126-fixed.png`

## Iteration 13 Case Notes
- UC-83: PASS, no-capacity failure was recoverable by reducing only headcount in the same conversation.
- UC-84: FAIL then PASS AFTER FIX, a specific available room code is now checked and recommended as that exact room.
- UC-85: PASS, when the requested specific room could not be found before the fix, the app did not silently recommend another space.
- UC-94: PASS, unavailable specific-space flow showed adjustment choices rather than silently broadening scope.
- UC-133: FAIL then PASS AFTER FIX, numeric space code now locks candidate lookup to one exact GLS space code and does not get confused with headcount.
- Safety guard: PASS, 2026-07-20 was more than two weeks out for reservation-capable specific-room testing, and no final save was clicked. 2026-06-03 was used only for recommendation-level verification without submit.

## Iteration 13 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Remaining specific-room unavailability variants should be re-run with controlled occupied-room fixtures when available.

## Iteration 14 Timeline
- Continued document-order high-risk input coverage from UC-86 through UC-90.
- UC-86:
  - Sent `학생회관` without an explicit campus.
  - The app did not search; it asked whether the user meant 명륜 or 율전/자과캠 학생회관.
- UC-87:
  - Sent a `자과캠` alias request.
  - The app interpreted it as 자연과학캠퍼스 and started candidate validation with 자연과학캠퍼스 buildings; the search was safely canceled after alias evidence was captured.
- UC-88 before fix:
  - Sent `오후 6시 반부터 8시까지`.
  - The app incorrectly asked for 오전/오후 clarification because the end time `8시` had no explicit meridiem, even though the start time supplied `오후`.
- UC-89:
  - Sent `18시 10분부터 19시 40분까지`.
  - The app rejected unsupported 10-minute granularity and asked for 18:00/18:30-style time without starting search.
- UC-90 before fix:
  - Sent `새벽 3시부터 5시까지`.
  - The app incorrectly entered GLS candidate search instead of guarding an obviously early time.
- Root cause found:
  - Bare-hour ambiguity detection treated a contextual range end (`오후 6시 반부터 8시까지`) as ambiguous even when the start carried the meridiem.
  - Slot-level time safety had cross-midnight and minute-granularity guards, but no general early/late reservation-hour guard.
- Patch 13 / commit `4aeee2e`:
  - Added shared contextual meridiem range handling that converts `오후 6시 반부터 8시까지` to 18:30-20:00.
  - Added a shared general reservation-hours guard for likely out-of-hours early/late slots.
  - Applied both rules in server parse overrides and extension background result overrides.
- Rebuilt and reloaded:
  - `server pnpm build`: PASS
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-88 after fix:
  - Re-ran the same request.
  - The app no longer asked for meridiem clarification and reached a recommendation card showing `18:30 – 20:00`.
- UC-90 after fix:
  - Re-ran the same early-hour request.
  - The app stopped in chat with `새벽이나 심야 시간대는 일반 GLS 공간예약 가능 시간 밖으로 보여요...` and did not start GLS search.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 14 Screenshots
- `65-uc86-ambiguous-studenthall.png`
- `66-uc87-jagwacam-alias.png`
- `67-uc88-half-hour-meridiem-gap.png`
- `68-uc89-unsupported-minute-guard.png`
- `69-uc90-early-hour-guard.png`
- `70-uc88-half-hour-fixed.png`
- `71-uc88-half-hour-fixed-card.png`
- `72-uc90-early-hour-fixed.png`

## Iteration 14 Case Notes
- UC-86: PASS, ambiguous `학생회관` asked for campus clarification and did not search.
- UC-87: PASS, `자과캠` alias scoped candidate validation to 자연과학캠퍼스 buildings.
- UC-88: FAIL then PASS AFTER FIX, contextual meridiem range now reaches a card with 18:30-20:00.
- UC-89: PASS, unsupported minute values are rejected without rounding or search.
- UC-90: FAIL then PASS AFTER FIX, early-hour requests now stop before GLS search.
- Safety guard: PASS, no final save was clicked. 2026-07-23/25 were used only for recommendation or guard-level verification.

## Iteration 14 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-91 onward in document order, including date-window, small-headcount, unsupported-facility, and recommendation-modification scenarios.

## Iteration 15 Timeline
- Continued document-order coverage from UC-91 through UC-96 with the actual Chrome side panel and Computer Use.
- UC-91:
  - Sent a same-day past-time request for `오늘 오후 2시`.
  - The app stayed in chat and said past dates/times cannot be reserved, asking for a future date/time.
  - No search, GLS form fill, or final save/submit occurred.
- UC-92:
  - Sent a too-far future request for `내년 12월 31일 18시`.
  - The app stayed in chat and explained that GLS availability cannot be reliably checked that far ahead, asking for a closer date.
  - No search, GLS form fill, or final save/submit occurred.
- UC-93:
  - Sent a small-headcount request for 2026-07-28 with 2 people.
  - The app searched GLS and recommended a small 1-6 person study room rather than a large room.
  - Final save remained disabled because application organization metadata was missing.
- UC-95:
  - Sent a request asking for a beam projector.
  - The app did not start GLS search and explained that facility/equipment constraints cannot be auto-checked in GLS; it can search by date/time/headcount only.
- UC-96 before fix:
  - Started with a 2026-07-30 18:00-20:00 study-room request and reached a recommendation card.
  - Entered `아 시간은 7시부터로 바꿔줘`.
  - The app asked for 오전/오후 clarification and mixed the correction with the existing search/card state instead of applying the obvious prior-PM context.
- Root cause found:
  - Inline bare-hour time edits parsed `7시` as 07:00 without considering the previous recommendation's 18:00 start time.
  - The ambiguous-meridiem guard then ran after the contextual correction path and overrode the intended same-period interpretation.
- Patch 14 / commit `1ee1747`:
  - Added shared meridiem context derivation from the previous start time.
  - Applied that context to inline time/range edits in both extension and server parse paths.
  - Skipped the ambiguous-meridiem override when the message is a contextual bare-time edit with previous slots.
- Rebuilt and reloaded:
  - `server pnpm build`: PASS
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-96 after fix:
  - Re-ran the 18:00-20:00 base request and then sent the same `7시부터` correction.
  - The app did not ask for 오전/오후 clarification.
  - The visible recommendation changed to a new 19:00-21:00 card.
  - No final save/submit was clicked.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 15 Screenshots
- `73-uc91-past-today-guard.png`
- `74-uc92-far-future.png`
- `75-uc93-small-headcount.png`
- `76-uc93-small-headcount-result.png`
- `77-uc95-facility-before-fix.png`
- `79-uc96-ambiguous-change-search-bug.png`
- `80-uc96-fixed-base-card.png`
- `81-uc96-fixed-base-card-result.png`
- `82-uc96-fixed-19-card.png`

## Iteration 15 Case Notes
- UC-91: PASS, same-day past-time requests stop in chat with a future-time retry prompt and no GLS search.
- UC-92: PASS, far-future dates stop in chat with a closer-date prompt and no GLS search.
- UC-93: PASS, small-headcount requests can recommend an appropriately small room.
- UC-95: PASS, unsupported facility constraints are disclosed before search instead of silently claiming validation.
- UC-96: FAIL then PASS AFTER FIX, bare-hour time correction now preserves the previous PM context and updates the recommendation to 19:00-21:00.
- Safety guard: PASS, no final save was clicked. Recommendation-capable dates used in this iteration were 2026-07-28, 2026-07-29, and 2026-07-30.

## Iteration 15 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-97 onward in document order, including alternative-space selection and final-draft consistency.

## Iteration 16 Timeline
- Continued document-order safety coverage from UC-97 through UC-100.
- UC-97:
  - Used the active 2026-07-30 recommendation as the first candidate.
  - Clicked `다른 공간 찾기`.
  - The app searched again and changed the current recommendation from the previous study hall to `[32425D] 세미나실4`.
  - The visible recommendation/final review area showed the second candidate as the current space; no previous candidate was mixed into the current card.
  - Entered only a non-sensitive test organization value; no final save/submit was clicked.
- UC-99:
  - Marked BLOCKED in this unattended pass because the case requires manipulating GLS while the app is filling the GLS application form, which is tied to the final save automation path.
  - No action-time user confirmation was requested, so no final save/fill path was clicked.
- UC-100 before fix:
  - Started a safe future search for 2026-08-03/04 and closed the live GLS tab while candidate validation was running.
  - The side panel either stayed in `탐색 중` without a `GLS 창 닫힘` message, or later showed a candidate card even though the GLS tab had been closed.
- Root cause found:
  - GLS tab removal was not converted into a conversation-level status update.
  - Candidate proposals could race in after an error and leave a stale `예약 가능` recommendation visible.
- Patch 15 / commit `d83fdf8`:
  - Added a `chrome.tabs.onRemoved` listener for active GLS queue tabs.
  - When the GLS tab closes, the queue is removed and an error status says `GLS 창이 닫혔어요. GLS 탭을 다시 열어 예약 가능 여부를 확인해 주세요.`
  - Side panel now clears the proposed candidate on error and ignores late candidate proposals after an error state.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-100 after fix:
  - Re-ran a 2026-08-05 search and closed the new GLS tab during validation.
  - The visible UI stopped the active flow and displayed the `GLS 창이 닫혔어요...` message.
  - After the side-panel race patch, no stale recommendation card remained under the closed-tab error.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 16 Screenshots
- `83-uc97-alternative-latest-summary.png`
- `84-uc100-gls-tab-closed-still-searching.png`
- `85-uc100-fixed-error-with-stale-card.png`
- `86-uc100-fixed-tab-closed-no-stale-card.png`

## Iteration 16 Case Notes
- UC-97: PASS, after `다른 공간 찾기` the current recommendation card showed only the new candidate as the active space.
- UC-99: BLOCKED, direct interference while GLS form filling requires entering the final save automation path and was not performed without action-time confirmation.
- UC-100: FAIL then PASS AFTER FIX, closing the GLS tab now stops the active flow with a clear message and removes stale recommendation UI.
- Safety guard: PASS, no final save was clicked. The test dates used were 2026-07-30, 2026-08-03, 2026-08-04, and 2026-08-05.

## Iteration 16 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-101 onward in document order.

## Iteration 17 Timeline
- Continued document-order safety/robustness coverage from UC-101 through UC-106.
- UC-101:
  - Marked BLOCKED because the case requires an existing GLS application form with user-entered content and then starting a new app-driven final form-fill path.
  - This path risks overwriting live GLS form data and is tied to final save automation, so it was not executed without action-time confirmation and a controlled fixture.
- UC-102:
  - Marked NOT_RUN in this pass because a controlled GLS DOM/list mutation fixture was not available.
  - The live run did show nonfatal candidate-level GLS warnings in Chrome's extension error view, but that is not sufficient evidence for the specific vanished-space fixture.
- UC-103:
  - Marked BLOCKED because the expected result requires a submitted reservation result with browser notifications disabled.
  - No real final save/submit was performed in this unattended pass.
- UC-104:
  - Carried forward as PASS AFTER FIX from the prior restore regression. No new browser-restart destructive state change was needed for this subset.
- UC-105:
  - Marked NOT_RUN because neither repeat-memory nor alternative-search acceptance prompts were available in a controlled state for affirmative variants.
- UC-106:
  - Started from a 2026-08-06 18:00-20:00, 12-person request. GLS returned no matching space, but the conversation remained in a suggestion/adjustment state.
  - Entered `아니, 30명으로 7시에 다시 찾아줘` in the same side-panel composer.
  - The app replied `조건을 수정했어요. 같은 조건으로 다시 검색할게요.` and the visible no-space card updated to `2026-08-06 19:00-21:00, 30명`.
  - No 오전/오후 clarification appeared, no stale 12-person/18:00 condition remained as the active result, and no final save/submit was clicked.
- Root cause assessment:
  - No new structural bug was found in UC-106 after the prior PM-context fix.
  - Remaining UC-101/103/105 coverage needs controlled submit/form/repeat-memory fixtures rather than case-by-case product edits.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 17 Screenshots
- `87-uc106-base-no-space.png`
- `88-uc106-reject-new-conditions.png`

## Iteration 17 Case Notes
- UC-101: BLOCKED, existing live GLS form overwrite protection needs a controlled form-fill fixture or action-time-confirmed final-save path.
- UC-102: NOT_RUN, vanished-space GLS list mutation was not available as a fixture in the live UI.
- UC-103: BLOCKED, in-app result recovery without browser notifications requires a submitted reservation result.
- UC-104: PASS AFTER FIX, previously verified restore behavior remains the active evidence for this case.
- UC-105: NOT_RUN, controlled suggestion-acceptance prompts were unavailable in this pass.
- UC-106: PASS, inline rejection plus new conditions reused the prior date/duration and interpreted `7시` as 19:00 based on context.
- Safety guard: PASS, no final save was clicked. The test date used in this iteration was 2026-08-06.

## Iteration 17 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-107 onward in document order.

## Iteration 18 Timeline
- Continued document-order coverage from UC-107 through UC-116 with actual Chrome side panel and Computer Use.
- UC-107:
  - Sent `다음 주 화요일 18시 2시간 20명` with a UC107 test purpose.
  - The visible result exposed the interpreted values as `2026-06-09 18:00-20:00, 20명` before any final save/submit.
  - Marked PARTIAL because the values were visible in the resulting card, but this build still moves into search rather than showing a separate pre-search confirmation screen.
- UC-108:
  - Sent `방금 예약 취소해줘`.
  - The app replied that already saved/submitted reservations cannot be canceled or changed by the extension and must be checked directly in GLS.
- UC-109:
  - Marked BLOCKED because it requires a completed prior reservation. No real final save/submit was created in this unattended pass.
- UC-110:
  - Started with `20명 회의실 예약`; the app asked for missing date/time.
  - Sent `아 잠깐, 그냥 다음 주 화요일 오후 6시부터 2시간으로 다시 할게`.
  - The app preserved the prior 20명 and used the new `2026-06-09 18:00-20:00` condition without mixing stale date/time.
- UC-111:
  - Sent `내일 3시에 2시간 10명`.
  - The app asked for 오전/오후 clarification and did not silently continue as 새벽 3시.
- UC-112:
  - Marked BLOCKED because the expected confirmation/help text is post-submission behavior and no submitted reservation fixture exists.
- UC-113:
  - Sent `다음 달까지 매주 화요일 18시 회의실 예약해줘`.
  - The app clearly declined automatic repeat reservation and asked for one date/time at a time.
- UC-114:
  - Sent `book a room tomorrow 3pm for 10 people`.
  - The app did not hang; it asked for a Korean reservation request.
- UC-115:
  - Marked BLOCKED because distinguishing application-complete vs approval-complete requires a real successful GLS submission or a submit-result fixture.
- UC-116 before fix:
  - Started a 2026-07-29 18:00-20:00, 2-person request and reached a no-space adjustment state.
  - Sent `7월 30일 목요일 오후 6시부터 2시간 2명으로 다시 찾아줘`.
  - The visible no-space card still showed `2026-07-29 18:00-20:00, 2명`, reusing the stale prior date.
- Root cause found:
  - `applyRetrySlotAdjustment` preserved previous slots after no-candidate responses but only adjusted headcount, time, duration, and `다음 주`.
  - Explicit absolute date edits such as `7월 30일` were not parsed in the retry/inline correction paths, so stale previous dates could survive a user correction.
- Patch 16 / commit `89b84c9`:
  - Added calendar-validated explicit date parsing for Korean month/day, numeric dates, and day-only edits relative to the previous slot date.
  - Applied it in both extension retry adjustment and inline slot edit paths, plus the server parse inline-edit mirror.
  - Expanded inline edit detection to include `다시`/`찾아` retry phrasing.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - `server pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-116 after fix:
  - Re-ran the same side-panel correction after extension reload.
  - The conversation title and final no-space card updated to `2026-07-30 18:00-20:00, 2명`.
  - Started a separate UC116 length-guard conversation with an explicit 60-character test event name.
  - The app replied `행사명이 너무 길어요... 50자 이내로 줄여서 다시 알려주세요.` before GLS search/save.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 18 Screenshots
- `89-uc107-understood-values.png`
- `90-uc108-cancel-change-decline.png`
- `91-uc110-mid-flow-direction-change.png`
- `92-uc111-ambiguous-3-confirmation.png`
- `93-uc113-repeat-decline.png`
- `94-uc114-english-guidance.png`
- `95-date-change-after-no-space-stale-date.png`
- `96-date-change-after-no-space-fixed.png`
- `97-uc116-long-event-name-guard.png`

## Iteration 18 Case Notes
- UC-107: PARTIAL, understood date/time/headcount values were visible before any final save, but not as a distinct pre-search confirmation gate.
- UC-108: PASS, submitted-reservation cancellation/change was honestly declined.
- UC-109: BLOCKED, requires a completed prior reservation.
- UC-110: PASS, mid-flow direction change preserved the prior headcount and used the new date/time.
- UC-111: PASS, ambiguous `3시` stopped for 오전/오후 clarification rather than searching at 03:00.
- UC-112: BLOCKED, requires completed reservation context.
- UC-113: PASS, repeat reservation was clearly scoped to one date/time at a time.
- UC-114: PASS, English request produced a Korean-language guidance message instead of hanging.
- UC-115: BLOCKED, requires successful GLS submission result.
- UC-116: FAIL then PASS AFTER FIX, explicit retry date now replaces stale previous date, and long event names are blocked before search/save.
- Safety guard: PASS, no final save was clicked. The dates used in this iteration were 2026-06-09, 2026-07-29, 2026-07-30, and 2026-07-31.

## Iteration 18 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-117 onward in document order.

## Iteration 19 Timeline
- Continued document-order coverage at UC-117 with actual Chrome side panel and Computer Use.
- UC-117 before fix:
  - Sent a safe future request for 2026-07-31:
    - `7월 31일 오후 6시부터 2시간 12명 UC117 기능 검증 모임 예약해줘`
  - The app replied `요청에 포함된 행사 정보를 신청서 초안에 반영했어요. 아래 카드에서 확인해 주세요.`
  - It then entered GLS candidate search even though `모임` was an ambiguous 행사구분 signal.
  - Clicked `중단`; no final GLS save/submit was clicked.
- Root cause found:
  - The extension-side application collection prompt guard only normalized the message when 행사구분 alone was missing.
  - In a realistic first request, organization can also be missing, so `missing_application` contained multiple fields and the ambiguous 행사구분 question was skipped.
  - This allowed low-confidence 행사구분 to coexist with `ready_to_search`.
- Patch 17 / commit `c637466`:
  - Added an extension-side ambiguous 행사구분 detector for user messages containing `모임`, `행사`, or `활동` as event-type words.
  - When the draft still has low-confidence `hangsaGbCode`, the guard now asks whether the schedule is closer to a student council/club event or a department-hosted event.
  - The guard also prevents search from starting for the ambiguous event-type case.
- Rebuilt and reloaded:
  - `extension pnpm build`: PASS
  - Reloaded `extension/dist` in Chrome.
- UC-117 after fix:
  - Re-ran the same 2026-07-31 side-panel request in a fresh conversation.
  - The app replied `이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?`
  - No search progress card appeared and no GLS final save/submit path was reached.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 19 Screenshots
- `98-uc117-ambiguous-event-type-searching.png`
- `100-uc117-ambiguous-hangsa-fixed.png`

## Iteration 19 Case Notes
- UC-117: FAIL then PASS AFTER FIX, ambiguous event-type wording now asks a clarifying 행사구분 question before GLS search and does not silently classify for submission.
- Safety guard: PASS, no final save was clicked. The test date used was 2026-07-31.

## Iteration 19 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue from UC-118 onward in document order.
- UC-130/UC-131 deletion verification still needs action-time approval before clicking a real delete confirmation in Chrome UI.

## Iteration 20 Timeline
- Continued document-order coverage for executable UX/safety cases around UC-124 and UC-128 with actual Chrome side panel and Computer Use.
- UC-124:
  - In the UC-117 clarification conversation, sent `그럼 그 방 언제 비어?`.
  - The app replied that automatic free-time scanning for a specific room is not yet supported, and asked the user to choose a date/time or say `다른 공간`.
  - No GLS search, final save, or submit path was reached.
- UC-128 before fix:
  - Started a fresh conversation and pasted a long multi-line 2026-07-31 request with a 650+ character test purpose.
  - The input UI wrapped the long text without hiding the composer/send affordance.
  - The app first asked the UC-117 행사구분 clarification, which is acceptable because the long purpose contained ambiguous `행사` wording.
  - After answering `학생회/동아리 행사`, the app incorrectly treated the short answer as a new application description, replaced the long purpose, and entered GLS search/no-space flow instead of applying the length guard.
  - No final GLS save/submit was clicked.
- Root cause found:
  - Server-side state handling only applied 행사구분-only updates when `hangsaGbCode` was the sole missing application field.
  - Long pasted requests can have both `hangsaGbCode` and `purpose` marked missing because the purpose exceeds the safe GLS length.
  - The short clarification answer then bypassed the existing draft and was interpreted as a fresh application description, dropping the original long purpose and skipping the length guard.
- Patch 18 / commit `dc961d5`:
  - Added a narrow `isHangsaClarificationAnswer` detector for explicit short 행사구분 answers.
  - Applied 행사구분-only updates whenever the previous draft still needs `hangsaGbCode`, even if other application fields such as an overlong purpose are also pending.
  - This preserves the prior draft so the next validation step can enforce the purpose-length guard before GLS automation.
- Rebuilt/restarted:
  - `server pnpm build`: PASS
  - Server `/health`: PASS after restart
- UC-128 after fix:
  - Re-ran the same long multi-line side-panel request in a fresh conversation.
  - The app asked `이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?`.
  - After answering `학생회/동아리 행사`, the app replied `사용목적이 너무 길어요. 현재 654자라서 GLS 저장 전에 실패할 수 있어요. 500자 이내로 줄여서 다시 알려주세요.`
  - No search card appeared after the fixed clarification answer, and no GLS final save/submit path was reached.
- Actual reservation submission: NO. No final GLS save/submit was clicked.

## Iteration 20 Screenshots
- `101-uc124-specific-room-availability-window.png`
- `102-uc128-long-paste-search-before-fix.png`
- `103-uc128-long-purpose-guard-fixed.png`

## Iteration 20 Case Notes
- UC-124: PASS, unsupported specific-room free-time query was honestly scoped and did not silently invent availability.
- UC-128: FAIL then PASS AFTER FIX, long pasted text remained usable in the UI and, after 행사구분 clarification, overlong purpose text is blocked before GLS search/save.
- Safety guard: PASS, no final save was clicked. The test date used was 2026-07-31.

## Iteration 20 Open Items
- Full UC-01 to UC-133 regression is still not complete.
- Continue document-order execution from UC-118/UC-119 and the later not-yet-run UC set, while preserving the already observed UC-124/UC-128 evidence.
- UC-130/UC-131 deletion verification still needs action-time approval before clicking a real delete confirmation in Chrome UI.
