# E2E Refinement Run - 2026-06-04

## Summary

This run used real macOS Chrome UI through Computer Use to execute the core reservation path, GLS login transition, recommendation, application draft review, application-metadata correction, conversation history, boundary/recovery, vague-input, in-progress cancellation, submitted-reservation cancel/change decline, conversation switching, past-date, impossible-capacity, delete/history-cleanup, long-input, narrow-panel, extension-refresh, date/time validation, repeat-request, unsupported-facility, ambiguous-AM/PM, English-input, half-hour, time-expression variant, overlong-duration, building-filter, room warning/notice, search-cancellation, recommendation slot-correction, alternative-room, colloquial-input, interpreted-summary, numeric-space-code, specific-room, specific-room-unavailable, ambiguous-building, campus-alias, small-headcount, candidate-failure-continuation, post-recommendation time-change, mid-flow condition-change, application-metadata-prompt, relative-date, event-classification, final-review-cancel, starter-example, and auto-title flows from `docs/E2E_TEST_CASES.md`.

Safety-relevant and product-flow issues were found and fixed. Draft mutation was fixed in `baee5f7` (`fix: 신청서 메타 수정 파싱 안정화`). Conversation placeholder filtering and impossible-capacity preflight order were fixed in `bb4fb67` (`fix: 대화 이력과 대용량 인원 가드 안정화`). Conversation restore state isolation was fixed in `73172cd` (`fix: 대화 복원 상태 격리 안정화`). Validation-guidance prompt chips were fixed in `767b312` (`fix: 검증 안내 칩 상태를 누락 필드 기준으로 정리`). Automation-message timeout handling was added after a candidate validation state remained on `검증 1/n` longer than expected. Slot-correction draft headcount synchronization was added after a terse headcount correction left the application preview at the previous count. Alternative-room search now clears the previous recommendation immediately after a text alternative request or searching/opening status update. Small-headcount general searches now avoid oversized fallback rooms unless the user explicitly specifies a building or room. Post-recommendation time-only changes now recognize `바꿔줘`/`시간은` wording and can use the side panel's restored slot snapshot after extension reload. Mid-flow date/time changes after only headcount has been collected now preserve explicit month/day input and use a correct date/time prompt. Starter example metadata now strips date/time/headcount/reservation logistics and parenthesized weekday tokens before deriving GLS draft fields. The final goal is not complete yet because the full UC-01 through UC-145 regression has not been reached; the recorded subset now exceeds 90% hard PASS, but that is not a full-suite claim.

## Environment

- Workspace: `/Users/hyeonseungkim/workspace/skku-reservation-bot`
- Branch: `fix/test`
- Server: `localhost:8000`
- Extension: `extension/dist`, loaded and reloaded in Chrome through Computer Use
- GLS account: masked as `g***5485`
- PII policy: no GLS password, raw student ID, raw name, or raw phone number is included in this report
- Screenshots: `/private/tmp/skku-reservation-e2e/2026-06-04/`

## Execution Counts

- Total UC headings detected: 142
- Recorded in this iteration: 71
- PASS: 65
- PARTIAL: 6
- FAIL: 0 after fix in the recorded subset
- BLOCKED: 0 in the recorded subset
- NOT_RUN: 71
- Full-suite PASS ratio: not claimed
- Executed-subset hard PASS ratio: 65 / 71 = 91.55%
- Executed-subset PASS including PARTIAL evidence: 71 / 71 = 100%

These numbers are intentionally conservative. The run found and verified an important fix, but it does not satisfy the requested final 90% suite target.

## P0 And Safety

- P0/Safety fatal failures after fix: none observed in the recorded subset.
- Actual reservation submission: not performed.
- Test reservation dates used: 2026-06-12, 2026-06-25, and 2026-06-26, all future dates as of 2026-06-04.
- Save/submit safety: `GLS 신청 저장` stayed disabled while required metadata was missing; after fields became complete, the button became enabled but was not clicked.
- Accidental real reservation: none.

## DB And Test Data

- Existing local migrations were applied with `pnpm prisma migrate deploy`.
- Prisma client was regenerated with `pnpm prisma:generate`.
- E2E fixtures were created/updated with `pnpm seed:e2e-spaces`.
- Fixture scope: 7 `Codex E2E` spaces for deterministic recommendation/search behavior.
- No existing user data was deleted.
- No schema or migration files were changed.
- No PII dump was committed.

## Verification

| Check | Result |
| --- | --- |
| `pnpm build` in `extension` | PASS |
| `pnpm build` in `server` | PASS |
| `curl -s http://localhost:8000/health` | PASS: `{"ok":true}` |
| `pnpm verify` in `server` | PASS |
| Computer Use extension reload | PASS |
| Computer Use post-fix draft correction regression | PASS |
| Computer Use conversation-history regression | PASS |
| Computer Use boundary/recovery/vague/past-date flows | PASS |
| Computer Use impossible-capacity regression | PASS |
| Computer Use in-progress cancellation and conversation-switch regression | PASS |
| Computer Use delete/history cleanup regression | PASS with one conservative PARTIAL memory-cleanup case |
| Computer Use long-input, narrow-panel, extension-refresh regression | PASS |
| Computer Use date/time validation and repeat-request regression | PASS |
| Computer Use unsupported-facility, ambiguous-AM/PM, English-input, and half-hour-expression regression | PASS |
| Computer Use time-expression variant regression | PASS |
| Computer Use overlong-duration guidance | PASS |
| Computer Use building-filter, room-warning, search-timeout, and review-cancel regression | PASS with one conservative PARTIAL speed-metric case |
| Computer Use slot-correction draft sync regression | PASS |
| Computer Use alternative-room and one-at-a-time decline regression | PASS |
| Computer Use numeric-space-code and colloquial-input regression | PASS |
| Computer Use application-metadata prompt and specific-room unavailable flows | PASS |
| Computer Use relative-date, event-classification, and final-review-cancel flows | PASS |
| Computer Use specific-room, ambiguous-building, campus-alias, and small-headcount regression | PASS after fix |
| Computer Use recommendation time-change regression | PASS after fix |
| Computer Use mid-flow condition-change regression | PASS after fix |
| Computer Use starter-example and auto-title regression | PASS after fix |

## Root Causes

The first failed flow was not a single-case wording issue. It came from two related gaps in the application-metadata correction path:

1. Explicit Korean edit values were cleaned for phrases like `바꿔줘`, but not for standalone `해줘`. This left command text inside user-facing draft fields.
2. A category-only clarification such as `학생회 동아리 행사야` could fall through to broader draft interpretation and overwrite other application fields.

Together, these could produce a plausible-looking but wrong draft and make final save available after the wrong data was applied.

The second refinement pass found two product-flow issues:

1. Inactive no-activity placeholder sessions could appear as `새 대화 · 대화 내용 없음` in recent conversations.
2. Impossible-capacity requests could ask for application metadata before declining that no registered room could fit the requested headcount.

The third refinement pass found one state-isolation issue:

1. Selecting a cancelled conversation and then another conversation could leave the previous conversation's prompt chips and input placeholder visible in the newly selected conversation.

The alternative-room refinement pass found one user-facing state issue:

1. A text request such as `다른 곳 보여줘` could keep showing the previously recommended room while the next-room search was already in progress.

The sixth refinement pass found one validation-guidance issue:

1. Date/time validation and graceful-decline messages could still show prompt chips inferred from the parsed slot shape, such as headcount chips after a too-far-date rejection.

The ninth refinement pass found one automation robustness issue:

1. Candidate validation could remain visible at `검증 1/n` if a content-script automation message did not resolve promptly.

The tenth refinement pass found one recommendation-edit issue:

1. A terse headcount correction such as `아니 30명으로` could update the reservation slot while leaving the application draft preview at the previous headcount.

The thirteenth refinement pass found one space-sizing issue:

1. A 2-person general room request could fall through to an oversized 120-person room after smaller candidates failed validation. General requests for 3 or fewer people now cap candidates to small rooms unless a building or room is explicitly requested.

The fourteenth refinement pass found one recommendation-stage time-edit issue:

1. A post-recommendation correction such as `아 시간은 19시부터로 바꿔줘` could miss the inline slot-edit path or keep stale recommendation state during restored conversations. The extension now recognizes `바꿔`/`시간은`, sends the side panel's current slot snapshot to the background handler, and clears stale candidates before re-searching modified slots.

The fifteenth refinement pass found one mid-flow slot-edit issue:

1. After only headcount had been collected, a correction such as `아 잠깐, 6월 26일 14시부터 2시간으로 다시 할게` could drop the explicit month/day because no previous reservation date existed as a base. The headcount-only acknowledgement also said it would reuse the same date/time even though no date/time had been collected.

The nineteenth refinement pass found one starter-example metadata issue:

1. The starter example `6월 25일(목) 오후 6시부터 2시간 20명 학생회 회의` stripped date/time/headcount words before deriving GLS draft metadata, but left the parenthesized weekday token. That produced `주관단체 (목) 학생회`, `행사명 (목) 학생회 회의`, and `사용목적 (목) 학생회 회의 진행`.

## Fix

Commit: `baee5f7` (`fix: 신청서 메타 수정 파싱 안정화`)

Files changed:

- `extension/src/sidepanel/utils/parseModification.ts`
- `extension/src/background/handlers/chatHandler.ts`

Changes:

- Added cleanup for Korean command endings including `해줘`, `해주세요`, `해 주세요`, and `해`.
- Added a background-handler clarification path for low-confidence `hangsaGbCode` collection.
- The clarification path updates only `hangsaGbCode`, marks that field high-confidence, recomputes missing application fields, syncs the draft to automation state, and mirrors the conversation.

Commit: `bb4fb67` (`fix: 대화 이력과 대용량 인원 가드 안정화`)

Files changed:

- `extension/src/shared/conversationSessions.ts`
- `extension/src/background/handlers/chatHandler.ts`

Changes:

- Conversation history now requires real activity: messages, slots, application state, a confirmed label, or a preview.
- Empty `새 대화` summaries are treated as placeholders regardless of status.
- Capacity preflight runs before application metadata collection when a request is otherwise search-ready, preventing irrelevant follow-up questions for impossible headcounts.

Commit: `73172cd` (`fix: 대화 복원 상태 격리 안정화`)

Files changed:

- `extension/src/shared/messages.ts`
- `extension/src/background/handlers/chatHandler.ts`
- `extension/src/background/conversationPersistence.ts`
- `extension/src/sidepanel/hooks/useConversation.ts`
- `extension/src/sidepanel/hooks/useChatStateMachine.ts`

Changes:

- Chat responses can carry an automation status when a preflight result should immediately affect UI state.
- Capacity preflight declines are persisted as `no_candidate`.
- Conversation restore preserves local runtime state from memory/snapshot when server history is rehydrated.
- Side-panel state now carries `conversationStatus`, and abandoned conversations are not reinterpreted as active slot-collection flows.

Commit: `767b312` (`fix: 검증 안내 칩 상태를 누락 필드 기준으로 정리`)

Files changed:

- `extension/src/sidepanel/hooks/useConversation.ts`
- `extension/src/sidepanel/hooks/useChatStateMachine.ts`

Changes:

- Side-panel conversation state now preserves the parse result's authoritative `missing_required` list.
- Phase and prompt-chip derivation uses `missing_required` before falling back to slot-shape inference.
- Cancel and out-of-scope responses clear missing-required state so stopped flows do not keep stale slot prompts.

Automation-message timeout guard added in this pass:

File changed:

- `extension/src/background/glsCoordinator.ts`

Changes:

- Wrapped GLS automation messages with bounded timeouts.
- Availability checks now fail as transient communication errors after 30 seconds instead of waiting forever.
- Form preview/snapshot helper messages use shorter bounded waits, while submit-like operations keep a longer timeout.

Slot-correction draft sync added in this pass:

Files changed:

- `extension/src/background/automationState.ts`
- `extension/src/background/handlers/chatHandler.ts`
- `extension/src/background/handlers/reservationHandlers.ts`

Changes:

- Added a shared helper that applies the current reservation-slot headcount to a complete application draft.
- Applied that helper after chat result guards, before context persistence and automation sync.
- Applied the same helper when starting a search so queued GLS `pendingFormData` cannot retain a stale headcount.

Post-recommendation time-change robustness added in this pass:

Files changed:

- `extension/src/shared/messages.ts`
- `extension/src/background/chatSlotCorrections.ts`
- `extension/src/background/handlers/chatHandler.ts`
- `extension/src/sidepanel/hooks/useConversation.ts`
- `server/src/routes/parse.ts`

Changes:

- Added `바꿔` and time-label wording such as `시간은`/`시간을` recognition to inline slot edits.
- Included the side panel's current slot snapshot in chat requests so restored conversations can still apply time-only corrections deterministically.
- Cleared stale recommendations before starting a fresh search for modified slots.
- Matched server and extension inline-edit wording guards.

Mid-flow date-change robustness added in this pass:

Files changed:

- `extension/src/background/chatSlotCorrections.ts`
- `extension/src/background/handlers/chatHandler.ts`
- `server/src/routes/parse.ts`

Changes:

- Explicit month/day slot edits now use the previous date when available, then the request reference time, then current time as a fallback anchor.
- The server parse route passes `body.now` into inline slot edits so extension and server parsing stay aligned.
- Headcount-only slot correction copy now asks for date/time when the request is not yet search-ready.
- The side panel/background request path passes the request timestamp into inline slot editing so mid-flow corrections can resolve `6월 26일` without a prior slot date.

Starter-example metadata cleanup added in this pass:

File changed:

- `server/src/application/state.ts`

Changes:

- Application draft derivation now removes parenthesized weekday tokens such as `(목)` along with date/time/headcount/reservation logistics words.
- Derived draft descriptions are sanitized inside `deriveDraftFromDescription`, so future callers cannot bypass the cleanup.
- Bare organization nouns such as `학생회` and `동아리` are accepted as `주관단체` after the date/logistics cleanup removes surrounding words.

## Computer Use Evidence

| Screenshot | Result |
| --- | --- |
| `00-extension-reloaded.png` | Chrome extension was reloaded in `chrome://extensions`. |
| `01-new-chat-start.png` | Side panel new chat was visible. |
| `02-gls-login-required.png` | GLS login was required before reservation automation could continue. |
| `03-gls-searching-pii-local-only.png` | GLS session/searching state observed. |
| `04-recommendation-and-disabled-save-pii-local-only.png` | Recommended space and disabled save while missing metadata. |
| `05-organization-correction-parsing-issue-pii-local-only.png` | Pre-fix organization tail bug captured. |
| `06-hangsa-answer-overwrites-draft-before-reload-pii-local-only.png` | Pre-fix category clarification overwrite captured. |
| `07-regression-draft-correction-fixed-pii-local-only.png` | Post-fix regression captured: corrected organization, category-only update, no unintended overwrite. |
| `08-conversation-list-empty-thread-pii-local-only.png` | Pre-fix empty conversation row captured. |
| `09-conversation-list-empty-thread-filtered-pii-local-only.png` | Post-fix conversation list captured: placeholder removed, real rows retained. |
| `10-out-of-scope-boundary-pii-local-only.png` | Out-of-scope boundary response captured. |
| `11-weird-input-recovery-pii-local-only.png` | Invalid-input recovery prompt captured. |
| `12-vague-request-asks-headcount-pii-local-only.png` | Vague request collected headcount first. |
| `13-approx-headcount-next-slot-pii-local-only.png` | Approximate headcount accepted and flow advanced. |
| `14-past-date-rejected-pii-local-only.png` | Past-date rejection captured before search/GLS. |
| `15-impossible-headcount-capacity-preflight-fixed-pii-local-only.png` | Post-fix impossible-capacity decline captured. |
| `16-submitted-reservation-cancel-change-decline-pii-local-only.png` | Submitted-reservation cancel/change graceful decline captured. |
| `17-in-progress-cancel-stops-flow-pii-local-only.png` | In-progress cancellation captured. |
| `18-conversation-switch-stale-prompt-mixed-state-pii-local-only.png` | Pre-fix stale prompt controls after conversation switch captured. |
| `19-conversation-switch-and-capacity-state-fixed-pii-local-only.png` | Post-fix conversation-switch and capacity no-space retry state captured. |
| `20-delete-test-conversation-in-progress-pii-local-only.png` | Temporary future reservation conversation captured in active progress state. |
| `21-delete-test-conversation-visible-in-list-pii-local-only.png` | Temporary conversation captured in recent-conversation list before deletion. |
| `22-delete-test-conversation-removed-pii-local-only.png` | Temporary conversation captured as removed from the list after delete confirmation. |
| `23-long-paste-input-layout-pii-local-only.png` | Long pasted text captured in input with send button visible. |
| `24-long-paste-response-layout-pii-local-only.png` | Long pasted text captured after send/response without layout breakage. |
| `25-narrow-sidepanel-controls-visible-pii-local-only.png` | Narrow side-panel controls captured as visible and usable. |
| `26-extension-refresh-input-button-alive-pii-local-only.png` | Post-refresh new-chat input and send controls captured as active. |
| `27-extension-refresh-response-controls-alive-pii-local-only.png` | Post-refresh message/response flow captured with controls still alive. |
| `28-extension-refresh-cancel-still-usable-pii-local-only.png` | Post-refresh interpreted flow captured as cancelled and still usable. |
| `29-unsupported-minute-guidance-pii-local-only.png` | Unsupported 17-minute start produced 30-minute-unit guidance before fix. |
| `30-unsupported-early-time-guidance-pii-local-only.png` | Early 03:00 request was rejected as outside general GLS reservation hours. |
| `31-too-far-date-guidance-pii-local-only.png` | Too-far date was rejected before fix, while irrelevant headcount chips were observed. |
| `32-repeat-reservation-graceful-decline-pii-local-only.png` | Repeat weekly reservation request was gracefully declined. |
| `33-unsupported-minute-hints-fixed-pii-local-only.png` | Post-fix unsupported-minute guidance no longer showed headcount chips. |
| `34-too-far-date-hints-fixed-pii-local-only.png` | Post-fix too-far-date guidance no longer showed headcount chips. |
| `35-cancel-placeholder-reset-fixed-pii-local-only.png` | Post-fix cancel flow visually returned to the starter input state and removed headcount chips. |
| `36-unsupported-facility-condition-decline-pii-local-only.png` | Unsupported facility/equipment condition was gracefully declined without search/GLS automation. |
| `37-english-input-korean-guidance-pii-local-only.png` | English reservation request received Korean-language guidance without automation. |
| `38-ambiguous-ampm-asks-confirmation-pii-local-only.png` | Missing AM/PM time was not silently interpreted as 03:00; the app asked for clarification. |
| `39-half-hour-expression-understood-search-started-pii-local-only.png` | `6시 반` was interpreted as `18:30-20:00` and search started. |
| `40-half-hour-expression-recommendation-pii-local-only.png` | Recommendation card showed `18:30-20:00` and `2026-06-25`. |
| `41-half-hour-flow-cancelled-before-submit-pii-local-only.png` | Half-hour flow was cancelled before any final save/submit action. |
| `42-time-range-expression-understood-pii-local-only.png` | `오후 2시부터 4시까지` was interpreted as `14:00` for 2 hours and search started. |
| `43-explicit-14-duration-expression-understood-pii-local-only.png` | `14시부터 2시간` was interpreted as the same `14:00` for 2 hours window. |
| `44-time-expression-flow-cancelled-pii-local-only.png` | Time-expression variant flow was stopped before any final save/submit action. |
| `45-building-filter-search-constrained-pii-local-only.png` | Pre-fix building-filter search was constrained to `학생회관 · 연습실` but remained in validation longer than expected. |
| `46-building-filter-search-cancelled-pii-local-only.png` | The constrained search could still be cancelled without final save/submit. |
| `47-broad-search-stuck-validation-pii-local-only.png` | Broad search also remained on an active validation item long enough to motivate a timeout guard. |
| `48-building-filter-recommendation-after-timeout-guard-pii-local-only.png` | Post-fix/reload building-filter run reached a concrete `학생회관(03동)` recommendation with warning and notice. |
| `49-building-filter-review-cancelled-pii-local-only.png` | Review-stage building-filter flow was cancelled by text input before clicking `GLS 신청 저장`. |
| `50-headcount-correction-draft-still-15-before-fix-pii-local-only.png` | Pre-fix slot correction captured: recommendation revalidated, but application draft still showed the previous 15-person headcount. |
| `51-headcount-correction-draft-30-after-fix-pii-local-only.png` | Post-fix slot correction captured: `아니 30명으로` preserved date/time/building and changed the draft to 30 people. |
| `52-multi-slot-correction-time-headcount-after-fix-pii-local-only.png` | Post-fix multi-slot correction captured: headcount changed to 20 people and time changed to 20:00-21:00. |
| `53-slot-correction-flow-cancelled-pii-local-only.png` | Slot-correction flow was cancelled by text input before clicking `GLS 신청 저장`. |
| `54-alternative-initial-recommendation-pii-local-only.png` | Alternative-room setup captured: initial broad-search recommendation was visible. |
| `55-alternative-request-stuck-on-first-candidate-before-fix-pii-local-only.png` | Pre-fix alternative request captured: previous recommendation stayed visible while next search had already started. |
| `56-alternative-second-recommendation-after-request-pii-local-only.png` | Pre-fix alternative request eventually produced a different valid recommendation with the same date/time/headcount. |
| `57-postfix-initial-search-progress-no-candidate-pii-local-only.png` | Post-fix search progress captured without a stale recommendation card. |
| `58-postfix-verification-still-no-proposed-candidate-pii-local-only.png` | Post-fix slower GLS validation still kept the recommendation area clear while searching. |
| `59-postfix-initial-recommendation-before-alternative-pii-local-only.png` | Post-fix initial recommendation captured before sending the text alternative request. |
| `60-postfix-alternative-search-clears-stale-card-pii-local-only.png` | Post-fix `다른 곳 보여줘` captured: previous recommendation card was cleared immediately during next search. |
| `61-postfix-alternative-second-candidate-pii-local-only.png` | Post-fix alternative request produced a different candidate while preserving the date/time/headcount. |
| `62-postfix-list-request-one-at-a-time-pii-local-only.png` | `여러 개 같이 보여줘` was gracefully limited to one-at-a-time candidate search instead of a long candidate list. |
| `63-postfix-alternative-flow-cancelled-pii-local-only.png` | Alternative-room flow was cancelled before any final save/submit action. |
| `64-space-code-request-sent-pii-local-only.png` | Numeric space-code request was sent from the real Chrome side panel. |
| `65-space-code-interpreted-as-room-pii-local-only.png` | `400126` was interpreted as `400126호`, not as a date or headcount. |
| `66-space-code-single-candidate-filter-pii-local-only.png` | Space-code search produced a single candidate validation queue for `반도체관 · 첨단강의실`. |
| `67-space-code-specific-room-recommendation-pii-local-only.png` | Recommendation showed `첨단강의실 (400126)`, `반도체관(40동)`, and the requested time/date. |
| `68-space-code-flow-cancelled-pii-local-only.png` | Numeric space-code flow was cancelled before any final save/submit action. |
| `69-colloquial-request-sent-pii-local-only.png` | Colloquial request using `저녁 여섯시` and `스무명` was sent from real Chrome. |
| `70-colloquial-understood-asks-duration-only-pii-local-only.png` | The app understood date/time/headcount and asked only for the missing duration. |
| `71-colloquial-continued-to-search-pii-local-only.png` | After `2시간`, the app showed `6/25(목) 18:00부터 2시간, 20명` and started search. |
| `72-colloquial-search-in-progress-pii-local-only.png` | Colloquial-input search continued with visible progress. |
| `73-colloquial-flow-cancelled-pii-local-only.png` | Colloquial-input flow was cancelled before any final save/submit action. |
| `74-specific-room-name-code-request-sent-pii-local-only.png` | Specific room request with `반도체관 400126호` was sent from the real Chrome side panel. |
| `75-specific-room-name-code-single-recommendation-pii-local-only.png` | Specific room request validated exactly one candidate and recommended `첨단강의실 (400126)`. |
| `76-ambiguous-student-center-request-sent-pii-local-only.png` | Ambiguous `학생회관` request was sent without a campus qualifier. |
| `77-ambiguous-student-center-campus-clarification-pii-local-only.png` | The app asked whether the user meant 명륜 or 율전/자과캠 student center instead of guessing. |
| `78-campus-alias-yuljeon-answer-sent-pii-local-only.png` | The campus alias answer `율전` was sent as a follow-up clarification. |
| `79-campus-alias-yuljeon-student-center-recommendation-pii-local-only.png` | `율전` narrowed the search to `학생회관(03동)` and recommended `연습실 (03B08)`. |
| `80-small-headcount-request-sent-pii-local-only.png` | Pre-fix 2-person general room request was sent. |
| `81-small-headcount-oversized-room-recommended-before-fix-pii-local-only.png` | Pre-fix 2-person request fell through to an oversized `첨단강의실 (400126)` recommendation. |
| `82-small-headcount-post-fix-request-sent-pii-local-only.png` | Post-fix 2-person general room request was sent. |
| `83-small-headcount-post-fix-two-small-candidates-only-pii-local-only.png` | Post-fix candidate queue was limited to two small rooms: `수선관 · 세미나실` and `산학협력센터 · 세미나실 I`. |
| `84-small-headcount-post-fix-small-room-recommended-pii-local-only.png` | Post-fix flow recommended `세미나실 I (85529)`, a 20-person room, after the first small candidate had a communication error. |
| `85-time-change-after-recommendation-still-old-time-before-fix-pii-local-only.png` | Pre-fix recommendation-stage time correction kept the old `18:00-20:00` recommendation after `아 시간은 19시부터로 바꿔줘`. |
| `86-time-change-postfix-initial-recommendation-pii-local-only.png` | Post-fix setup captured the initial `첨단강의실 (400126)` recommendation at `18:00-20:00`. |
| `87-time-change-postfix-edit-sent-pii-local-only.png` | Post-fix time-change sentence was entered from the real Chrome side panel. |
| `88-time-change-postfix-revalidated-new-time-pii-local-only.png` | Post-fix recommendation was revalidated and showed `19:00-21:00` for the same room/date. |
| `89-time-change-postfix-reload-research-started-pii-local-only.png` | After extension reload, the restored conversation cleared the stale recommendation and started a new search for the modified time. |
| `90-uc110-midflow-after-headcount-before-change-pii-local-only.png` | Pre-fix mid-flow setup captured after selecting `20명`; wording implied reuse of a missing date/time. |
| `91-uc110-midflow-change-message-entered-pii-local-only.png` | Pre-fix mid-flow change message with `6월 26일 14시부터 2시간` was entered. |
| `92-uc110-change-loses-date-before-fix-pii-local-only.png` | Pre-fix mid-flow change dropped the explicit date and stayed in an incomplete prompt state. |
| `93-uc110-postfix-headcount-only-asks-date-time-pii-local-only.png` | Post-fix headcount-only response recorded 20 people and correctly asked for date/time. |
| `94-uc110-postfix-change-message-entered-pii-local-only.png` | Post-fix mid-flow change message was entered from the real Chrome side panel. |
| `95-uc110-postfix-new-date-search-started-pii-local-only.png` | Post-fix correction preserved `2026-06-26` and started search instead of asking for duration again. |
| `96-uc110-postfix-flow-cancelled-pii-local-only.png` | Post-fix UC-110 flow was stopped before any final save/submit action. |
| `97-uc26-overlong-duration-request-entered-pii-local-only.png` | UC-26 overlong 10-hour request was entered from the real Chrome side panel. |
| `98-uc26-overlong-duration-guidance-pii-local-only.png` | UC-26 passed: the app declined before search and asked the user to split or shorten to 8 hours or less. |
| `99-uc29-logistics-only-request-entered-pii-local-only.png` | Logistics-only request for a specific room was entered, but the selected time was unavailable. |
| `100-uc85-specific-room-unavailable-no-silent-substitute-pii-local-only.png` | UC-85/UC-124 passed: the requested room was unavailable and the app did not silently substitute another room. |
| `101-uc29-logistics-only-available-time-request-entered-pii-local-only.png` | UC-29 logistics-only request was retried for the same room after the visible conflict interval. |
| `102-uc29-single-application-info-prompt-pii-local-only.png` | UC-29 passed: after a valid recommendation, the app asked once for organization/event information with quick-fill examples. |
| `103-uc29-metadata-flow-cancelled-pii-local-only.png` | UC-29 metadata-stage flow was cancelled before any final save/submit action. |
| `104-uc31-seminar-request-entered-pii-local-only.png` | UC-31 event-classification request with `학회 세미나` was entered in the real Chrome side panel. |
| `105-uc31-seminar-request-sent-processing-pii-local-only.png` | The seminar request was sent and the side panel remained responsive while processing. |
| `106-uc31-seminar-classification-draft-preview-pii-local-only.png` | UC-31 passed: `학회 세미나` was classified as `교내단체행사 (세미나/스터디)` in the draft preview. |
| `107-uc120-cancel-before-submit-entered-pii-local-only.png` | UC-120 setup: cancellation text was entered at the final review/draft preview stage before any save click. |
| `108-uc120-cancel-before-submit-stopped-pii-local-only.png` | UC-120 passed: the flow stopped before any final save/submit action. |
| `109-uc07-relative-next-friday-request-entered-pii-local-only.png` | UC-07 relative-date request using `다음 주 금요일` was entered in the real Chrome side panel. |
| `110-uc07-relative-next-friday-resolved-2026-06-12-pii-local-only.png` | UC-07 passed: as of 2026-06-04, `다음 주 금요일` resolved to `6/12(금)` / `2026-06-12`. |
| `111-uc07-relative-next-friday-recommendation-metadata-prompt-pii-local-only.png` | The relative-date flow reached recommendation/application-metadata prompt with date `2026-06-12`. |
| `112-uc07-relative-next-friday-flow-cancelled-pii-local-only.png` | The relative-date flow was cancelled before any final save/submit action. |
| `113-uc04-starter-examples-visible-pii-local-only.png` | Starter screen showed example buttons including `6월 25일(목) 오후 6시부터 2시간 20명 학생회 회의`. |
| `114-uc04-example-clicked-sent-processing-pii-local-only.png` | The first starter example was clicked in the real Chrome side panel and sent as a user message. |
| `115-uc04-example-started-uc60-title-auto-pii-local-only.png` | UC-04/UC-60 pre-fix flow started search and auto-generated a conversation title from the request. |
| `116-uc04-example-recommendation-weekday-draft-noise-before-fix-pii-local-only.png` | Pre-fix bug: application draft fields contained `(목)` weekday noise in organization/event/purpose metadata. |
| `117-uc04-example-flow-cancelled-before-fix-pii-local-only.png` | Pre-fix starter-example flow was cancelled before any final save/submit action. |
| `118-uc04-starter-examples-post-fix-pii-local-only.png` | Post-fix starter screen was captured before rerunning the same first example. |
| `119-uc04-example-clicked-post-fix-processing-pii-local-only.png` | Post-fix first starter example was clicked and sent from the real Chrome side panel. |
| `120-uc04-uc60-post-fix-title-search-clean-pii-local-only.png` | UC-60 passed after fix: auto title showed `2026-06-25 학생회 회의` and search began without weekday noise. |
| `121-uc04-example-recommendation-draft-clean-post-fix-pii-local-only.png` | UC-04 passed after fix: draft showed `주관단체 학생회`, `행사명 학생회 회의`, `사용목적 학생회 회의 진행`. |
| `122-uc04-example-cancelled-post-fix-no-save-pii-local-only.png` | Post-fix starter-example flow was cancelled through chat; `GLS 신청 저장` was not clicked. |

## Recorded UC Results

| UC | Result | Notes |
| --- | --- | --- |
| UC-01 | PARTIAL | New chat/onboarding surface visible; not a strict fresh-install reset. |
| UC-03 | PARTIAL | Returning-conversation state visible. |
| UC-04 | PASS after fix | Clicking the visible starter example sent the exact example request, produced a recommendation/draft, and the flow was cancelled before final save; weekday text no longer polluted application metadata after fix. |
| UC-05 | PASS | Complete natural-language request triggered the expected flow. |
| UC-06 | PASS | Vague request asked one missing slot, then accepted approximate Korean headcount. |
| UC-07 | PASS | As of 2026-06-04, `다음 주 금요일` resolved to `6/12(금)` / `2026-06-12`, and the flow was cancelled before final save. |
| UC-08 | PASS | Time-range and duration expressions both resolved to the same 14:00-16:00 reservation window. |
| UC-09 | PASS | `율전 학생회관` constrained the search and produced a `학생회관(03동)` recommendation. |
| UC-10 | PARTIAL | A one-line complete request proceeded directly to search/review, but manual GLS speed comparison was not formally timed. |
| UC-11 | PASS | Single-field headcount correction preserved date/time/building and updated the application draft after fix. |
| UC-12 | PASS | Multi-slot correction updated headcount and time/duration together after fix. |
| UC-13 | PASS | `다른 곳 보여줘` preserved conditions and produced another room; `여러 개 같이 보여줘` was limited to one-at-a-time search after fix. |
| UC-14 | PASS | In-progress `취소`/active `중단` stopped the flow and did not start final GLS save automation. |
| UC-15 | PASS | Out-of-scope request received a reservation-domain boundary response. |
| UC-16 | PASS | `저녁 여섯시` and `스무명` were understood, with only the missing duration asked before search. |
| UC-17 | PASS | Past-date request was rejected before search/GLS automation. |
| UC-18 | PASS | Punctuation-only input received a recovery prompt and the app stayed usable. |
| UC-19 | PASS | Search progress and validation status were visible. |
| UC-20 | PASS | A single recommended available room was shown. |
| UC-21 | PASS | Recommendation followed availability validation. |
| UC-22 | PASS | When the requested room/time had no availability, the app clearly displayed no matching space instead of silent loading or an unrelated recommendation. |
| UC-23 | PASS | Impossible 500-person request declined by capacity after fix. |
| UC-24 | PASS | Recommendation included a student-support-team priority warning for the selected space. |
| UC-25 | PASS | Recommendation included the fixture notice/constraint text before save. |
| UC-26 | PASS | A 10-hour request was declined before search with guidance to split or shorten to 8 hours or less. |
| UC-27 | PASS | Active search and review flows could be stopped/cancelled before final save. |
| UC-28 | PASS | Draft fields were filled from the request. |
| UC-29 | PASS | With logistics only and no event description, the app asked once for organization/event information after recommendation instead of field-by-field interrogation. |
| UC-30 | PASS | Organization correction worked after fix. |
| UC-31 | PASS | A `학회 세미나` request was classified as `교내단체행사 (세미나/스터디)` in the draft preview without requiring the user to know the category code. |
| UC-32 | PASS | Draft preview exposed the values for user review. |
| UC-33 | PASS | No submission happened without explicit final action. |
| UC-41 | PARTIAL | Login-required flow worked; duplicate login/session messages remain. |
| UC-42 | PARTIAL | Flow continued after GLS login; duplicate messages remain. |
| UC-56 | PASS | Recent conversation list showed real conversations with meaningful titles/previews after fix. |
| UC-57 | PASS | Empty `새 대화` placeholder was filtered from the conversation list after fix. |
| UC-58 | PASS | Prior conversation selection restored that conversation without stale prompt controls after fix. |
| UC-59 | PASS | Recent conversation deletion used two-step confirmation and removed the row from the list. |
| UC-60 | PASS after fix | A fresh starter-example request auto-generated a meaningful title, `2026-06-25 학생회 회의`, and stayed clean of parenthesized weekday noise. |
| UC-61 | PASS | Conversation content/progress stayed isolated when switching between conversations after fix. |
| UC-62 | PASS | GLS password was typed only into GLS, not into the side panel. |
| UC-64 | PASS | Missing required metadata blocked save until completion. |
| UC-84 | PASS | `반도체관 400126호` constrained validation to one candidate and recommended `첨단강의실 (400126)`. |
| UC-85 | PASS | When the requested `400126호` was unavailable at 14:00-16:00, the app reported no matching space instead of silently choosing another room. |
| UC-86 | PASS | Ambiguous `학생회관` prompted for 명륜 vs 율전/자과캠 instead of guessing. |
| UC-87 | PASS | The follow-up `율전` alias narrowed the search to `학생회관(03동)` and produced a matching recommendation. |
| UC-88 | PASS | `6시 반` was interpreted as `18:30-20:00`, produced a recommendation, and was cancelled before submit. |
| UC-89 | PASS | Non-30-minute start was rejected with 30-minute-unit guidance; post-fix prompt chips no longer implied missing headcount. |
| UC-90 | PASS | Early 03:00 request was rejected as outside general GLS reservation hours before search/GLS automation. |
| UC-91 | PASS | Date validation rejected a past date before executing search/GLS automation. |
| UC-92 | PASS | Too-far future date was rejected; post-fix UI no longer showed irrelevant headcount chips. |
| UC-93 | PASS after fix | A 2-person general room request no longer fell through to a 120-person space; post-fix candidates were limited to 20/24-person rooms and a 20-person room was recommended. |
| UC-95 | PASS | Unsupported facility/equipment conditions were explicitly declined instead of being silently ignored. |
| UC-96 | PASS after fix | Recommendation-stage `아 시간은 19시부터로 바꿔줘` revalidated the same `400126` room as `19:00-21:00` instead of retaining `18:00-20:00`; restored/reloaded state cleared stale candidate UI before re-searching. |
| UC-98 | PASS | No automatic final save/submit occurred. |
| UC-102 | PASS | A communication error on the first small candidate did not fail the whole search; the flow continued to the next small candidate and recommended it. |
| UC-107 | PASS | Before search, the app showed its interpretation as `6/25(목) 18:00부터 2시간, 20명`. |
| UC-108 | PASS | Submitted-reservation cancel/change request was gracefully declined and did not automate GLS. |
| UC-110 | PASS after fix | After only headcount was collected, `6월 26일 14시부터 2시간` was preserved as a new date/time search and the flow was safely cancelled. |
| UC-111 | PASS | Missing AM/PM time asked for clarification instead of silently using early morning. |
| UC-113 | PASS | Repeat weekly reservation request was declined and asked for a single date/time. |
| UC-114 | PASS | English reservation request received a clear Korean-language guidance response and no automation. |
| UC-117 | PASS | Category clarification changed only the intended field after fix. |
| UC-120 | PASS | At the final review/draft preview stage, `아니, 취소할게` stopped the flow before any `GLS 신청 저장` click or final submission. |
| UC-124 | PASS | A requested specific room that was occupied was clearly reported unavailable, and the app did not auto-scan or switch to another room. |
| UC-128 | PASS | Long pasted Korean text did not break input, message, or response layout. |
| UC-129 | PASS | Narrow side-panel view kept core chat, list, input, and send controls visible. |
| UC-130 | PASS | In-progress temporary conversation was deleted from history without clicking `GLS 신청 저장`. |
| UC-131 | PARTIAL | Deleted conversation disappeared from visible history; deeper recommendation/memory cleanup was not fully exercised. |
| UC-132 | PASS | After extension refresh, the side panel reopened and chat buttons remained functional. |
| UC-133 | PASS | Numeric space code `400126` was treated as a specific room and recommended only `첨단강의실 (400126)` when available. |

## Remaining FAIL/BLOCKED/NOT_RUN

- FAIL after fix in recorded subset: none.
- BLOCKED in recorded subset: none.
- NOT_RUN: 71 UCs still need Computer Use execution before the goal can be completed.
- Remaining suite groups include deeper no-space/candidate-exhaustion paths, cancellation, invalid input, submission error handling, reminders, personalization/feedback ranking, deeper history/privacy cleanup, and IME composition input.

## Remaining Risks

- Full regression has not been completed from UC-01 through UC-145.
- The requested 90% executable-case PASS threshold has not been proven for the full suite because 71 UCs remain `NOT_RUN`.
- Duplicate login/session messages should be refined before final signoff.
- The old Chrome extension error badge from earlier GLS probing should be inspected if it recurs during later runs.
- Actual GLS final save was intentionally not clicked; future submit-path tests must re-check the two-week date guard immediately before saving.

## Next Recommended Work

1. Resume at UC-01 with a strict Computer Use matrix and continue through the unrun cases.
2. Prioritize safety, final-submit guards, cancellation, recovery, and no-space paths.
3. Add product fixes in structural batches, then reload the extension through Chrome UI and re-run affected UCs.
4. Only mark the goal complete after full-suite regression reaches the requested threshold with no P0/Safety failures.
