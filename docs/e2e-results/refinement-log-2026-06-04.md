# E2E Refinement Log - 2026-06-04

## Scope

- Test basis: `docs/E2E_TEST_CASES.md` (142 UC headings detected).
- Primary execution channel: macOS Chrome UI through Computer Use.
- Auxiliary checks: build commands, server `/health`, Prisma migration/seed command results, server verification scripts.
- Privacy: GLS account, user name, student ID, phone, and password are not recorded here. Account reference is masked as `g***5485` when needed.

## Environment

- Workspace: `/Users/hyeonseungkim/workspace/skku-reservation-bot`
- Branch: `fix/test`
- Date/timezone: 2026-06-04, Asia/Seoul
- Extension path: `extension/dist`
- Server: `localhost:8000`
- Screenshot directory: `/private/tmp/skku-reservation-e2e/2026-06-04/`

## Preflight

- `git status --short`: clean before source changes.
- `pnpm prisma migrate deploy`: applied existing server migrations to local DB.
- `pnpm prisma:generate`: regenerated Prisma client.
- `pnpm seed:e2e-spaces`: created/updated 7 `Codex E2E` test spaces.
- `pnpm build` in `server`: pass.
- `pnpm build` in `extension`: pass.
- `curl -s http://localhost:8000/health`: `{"ok":true}`.
- `pnpm verify` in `server`: pass for space personalization, reminder space code, and space feedback route.
- Chrome extension reload was performed from `chrome://extensions` using Computer Use.

## Computer Use Evidence

| File | Notes |
| --- | --- |
| `00-extension-reloaded.png` | Extension reload success in Chrome extension UI. |
| `01-new-chat-start.png` | Side panel first/new chat screen. |
| `02-gls-login-required.png` | Login-required card after a complete natural-language request. |
| `03-gls-searching-pii-local-only.png` | GLS logged-in/searching state; local-only because GLS page may contain PII. |
| `04-recommendation-and-disabled-save-pii-local-only.png` | Recommendation and draft preview; save disabled while required metadata is missing. |
| `05-organization-correction-parsing-issue-pii-local-only.png` | Pre-fix issue: organization correction retained command tail. |
| `06-hangsa-answer-overwrites-draft-before-reload-pii-local-only.png` | Pre-fix issue: event-category answer overwrote other draft fields. |
| `07-regression-draft-correction-fixed-pii-local-only.png` | Post-fix regression: organization cleaned, event category updated only, save enabled after required fields are stable. |
| `08-conversation-list-empty-thread-pii-local-only.png` | Pre-fix issue: recent conversations included an empty `새 대화` row. |
| `09-conversation-list-empty-thread-filtered-pii-local-only.png` | Post-fix regression: empty conversation was filtered while real conversations remained visible. |
| `10-out-of-scope-boundary-pii-local-only.png` | Out-of-scope request received reservation-domain boundary response. |
| `11-weird-input-recovery-pii-local-only.png` | Invalid punctuation input received recovery prompt and did not break the chat. |
| `12-vague-request-asks-headcount-pii-local-only.png` | Vague reservation request asked for one missing slot: headcount. |
| `13-approx-headcount-next-slot-pii-local-only.png` | Approximate Korean headcount was accepted and the flow moved to the next missing slot. |
| `14-past-date-rejected-pii-local-only.png` | Past-date request was rejected before search/GLS automation. |
| `15-impossible-headcount-capacity-preflight-fixed-pii-local-only.png` | Post-fix regression: impossible 500-person request declined by capacity before application metadata questions. |
| `16-submitted-reservation-cancel-change-decline-pii-local-only.png` | Submitted-reservation cancel/change request was gracefully declined without GLS automation. |
| `17-in-progress-cancel-stops-flow-pii-local-only.png` | In-progress vague reservation was cancelled and stopped without search/GLS automation. |
| `18-conversation-switch-stale-prompt-mixed-state-pii-local-only.png` | Pre-fix issue: selecting another conversation retained stale prompt chips from the previous conversation. |
| `19-conversation-switch-and-capacity-state-fixed-pii-local-only.png` | Post-fix regression: conversation switch no longer leaked prompt chips, and fresh 500-person request restored as no-space retry state. |
| `20-delete-test-conversation-in-progress-pii-local-only.png` | Temporary future reservation conversation was created and observed in active search/progress state. |
| `21-delete-test-conversation-visible-in-list-pii-local-only.png` | The temporary conversation was visible in the recent-conversation list with a delete control. |
| `22-delete-test-conversation-removed-pii-local-only.png` | After delete confirmation, the temporary conversation disappeared from the list and did not immediately reappear. |
| `23-long-paste-input-layout-pii-local-only.png` | Long pasted Korean text wrapped inside the input area with the send button still visible and enabled. |
| `24-long-paste-response-layout-pii-local-only.png` | Long pasted text was sent and the assistant response rendered without layout breakage. |
| `25-narrow-sidepanel-controls-visible-pii-local-only.png` | Narrow side-panel view kept core conversation controls and input visible. |
| `26-extension-refresh-input-button-alive-pii-local-only.png` | After extension refresh, a new chat opened and the input/send button became active. |
| `27-extension-refresh-response-controls-alive-pii-local-only.png` | After extension refresh, sent message received a response and controls remained usable. |
| `28-extension-refresh-cancel-still-usable-pii-local-only.png` | The post-refresh test flow was cancelled and the side panel stayed usable. |
| `29-unsupported-minute-guidance-pii-local-only.png` | Unsupported 17-minute start was rejected with 30-minute-unit guidance before the chip fix. |
| `30-unsupported-early-time-guidance-pii-local-only.png` | Early 03:00 request was rejected as outside the general GLS reservation-hour window. |
| `31-too-far-date-guidance-pii-local-only.png` | Too-far date was rejected before the chip fix; irrelevant headcount chips were observed. |
| `32-repeat-reservation-graceful-decline-pii-local-only.png` | Weekly repeat reservation request was gracefully declined. |
| `33-unsupported-minute-hints-fixed-pii-local-only.png` | Post-fix unsupported-minute guidance no longer displayed headcount chips. |
| `34-too-far-date-hints-fixed-pii-local-only.png` | Post-fix too-far-date guidance no longer displayed headcount chips. |
| `35-cancel-placeholder-reset-fixed-pii-local-only.png` | Post-fix cancellation visually returned to the starter input state and removed headcount chips. |
| `36-unsupported-facility-condition-decline-pii-local-only.png` | Unsupported facility/equipment condition was gracefully declined without search/GLS automation. |
| `37-english-input-korean-guidance-pii-local-only.png` | English reservation request received Korean-language guidance without automation. |
| `38-ambiguous-ampm-asks-confirmation-pii-local-only.png` | Missing AM/PM time asked for clarification instead of silently using early morning. |
| `39-half-hour-expression-understood-search-started-pii-local-only.png` | `6시 반` was interpreted as `18:30-20:00` and search started. |
| `40-half-hour-expression-recommendation-pii-local-only.png` | Recommendation card showed `18:30-20:00` and `2026-06-25`. |
| `41-half-hour-flow-cancelled-before-submit-pii-local-only.png` | Half-hour flow was cancelled before final save/submit. |
| `90-uc110-midflow-after-headcount-before-change-pii-local-only.png` | Pre-fix UC-110 setup after selecting `20명`; the assistant implied it would reuse a date/time that was not collected yet. |
| `91-uc110-midflow-change-message-entered-pii-local-only.png` | Pre-fix UC-110 change message with `6월 26일 14시부터 2시간` entered in the real Chrome side panel. |
| `92-uc110-change-loses-date-before-fix-pii-local-only.png` | Pre-fix UC-110 failure: explicit date was dropped and the flow stayed in an incomplete prompt state. |
| `93-uc110-postfix-headcount-only-asks-date-time-pii-local-only.png` | Post-fix headcount-only response correctly recorded 20 people and asked for date/time. |
| `94-uc110-postfix-change-message-entered-pii-local-only.png` | Post-fix UC-110 change message entered in the real Chrome side panel. |
| `95-uc110-postfix-new-date-search-started-pii-local-only.png` | Post-fix UC-110 preserved `2026-06-26` and moved into search. |
| `96-uc110-postfix-flow-cancelled-pii-local-only.png` | Post-fix UC-110 was cancelled/stopped before any final save/submit action. |
| `97-uc26-overlong-duration-request-entered-pii-local-only.png` | UC-26 overlong 10-hour request was entered in the real Chrome side panel. |
| `98-uc26-overlong-duration-guidance-pii-local-only.png` | UC-26 passed: the app declined before search and guided the user to split or shorten the request. |
| `99-uc29-logistics-only-request-entered-pii-local-only.png` | Logistics-only request for a specific room was entered at an unavailable time. |
| `100-uc85-specific-room-unavailable-no-silent-substitute-pii-local-only.png` | Specific room unavailable result: no silent substitute room was selected. |
| `101-uc29-logistics-only-available-time-request-entered-pii-local-only.png` | UC-29 logistics-only request was re-entered at an available time. |
| `102-uc29-single-application-info-prompt-pii-local-only.png` | UC-29 single combined application-info prompt after a valid recommendation. |
| `103-uc29-metadata-flow-cancelled-pii-local-only.png` | Metadata-stage flow was cancelled before any save/submit action. |
| `104-uc31-seminar-request-entered-pii-local-only.png` | UC-31 seminar request was entered in the real Chrome side panel. |
| `105-uc31-seminar-request-sent-processing-pii-local-only.png` | Seminar request was sent and processing state was visible. |
| `106-uc31-seminar-classification-draft-preview-pii-local-only.png` | UC-31 draft preview classified `학회 세미나` as `교내단체행사 (세미나/스터디)`. |
| `107-uc120-cancel-before-submit-entered-pii-local-only.png` | UC-120 cancellation text was entered at the final review/draft preview stage. |
| `108-uc120-cancel-before-submit-stopped-pii-local-only.png` | UC-120 flow stopped before any save/submit action. |
| `109-uc07-relative-next-friday-request-entered-pii-local-only.png` | UC-07 `다음 주 금요일` request was entered in the real Chrome side panel. |
| `110-uc07-relative-next-friday-resolved-2026-06-12-pii-local-only.png` | UC-07 resolved `다음 주 금요일` to `6/12(금)` / `2026-06-12`. |
| `111-uc07-relative-next-friday-recommendation-metadata-prompt-pii-local-only.png` | Relative-date flow reached recommendation/application-metadata prompt with date `2026-06-12`. |
| `112-uc07-relative-next-friday-flow-cancelled-pii-local-only.png` | Relative-date flow was cancelled before any save/submit action. |

## Iteration 1

### User Flow

1. Opened Chrome `chrome://extensions` with Computer Use.
2. Confirmed the `SKKU 공간예약 에이전트` unpacked extension was enabled and reloaded it.
3. Opened the side panel and started a new chat.
4. Entered: `6월 25일 목요일 오후 6시부터 2시간 20명 Codex E2E 테스트 회의 예약해줘`.
5. Observed GLS login-required card and opened GLS login through the side panel.
6. Logged into GLS with the provided account through Chrome UI. Password save prompt was not saved.
7. Observed search progress and a recommended available space.
8. Observed draft preview and disabled `GLS 신청 저장` button while required application metadata was missing.
9. Entered: `주관단체는 Codex E2E 기능검증팀으로 해줘`.
10. Observed pre-fix draft value incorrectly included the command tail.
11. Entered: `학생회 동아리 행사야`.
12. Observed pre-fix draft fields were overwritten by the category clarification answer.

### Root Cause

- `cleanEditValue()` did not remove standalone Korean command endings such as `해줘`.
- The extension allowed a low-confidence event-category clarification to continue into the broader server/LLM draft update path, which could mutate organization, event name, and purpose.

### Fix

- Commit: `baee5f7` (`fix: 신청서 메타 수정 파싱 안정화`)
- Files:
  - `extension/src/sidepanel/utils/parseModification.ts`
  - `extension/src/background/handlers/chatHandler.ts`
- Change:
  - Strip Korean command endings from explicit draft edit values.
  - Resolve event-category clarification in the extension background handler before broad draft modification, updating only `hangsaGbCode` and confidence.

### Regression

1. Built server and extension successfully.
2. Reloaded the extension in Chrome using Computer Use.
3. Started a fresh side-panel conversation.
4. Entered: `6월 25일 목요일 오후 6시부터 2시간 20명 Codex E2E 회귀 테스트 회의 예약해줘`.
5. Observed available recommendation for `세미나실 I (85529)` on `2026-06-25`, `18:00-20:00`.
6. Entered: `주관단체는 Codex E2E 기능검증팀으로 해줘`.
7. Observed draft organization became exactly `Codex E2E 기능검증팀`.
8. Entered: `학생회 동아리 행사야`.
9. Observed event category became `교내단체행사 (학생회/동아리)`.
10. Confirmed organization, event name, headcount, and purpose stayed unchanged.
11. Confirmed `GLS 신청 저장` was enabled only after required draft metadata was present.
12. Did not click final `GLS 신청 저장`.

## Case Results Recorded In This Iteration

| UC | Result | Evidence |
| --- | --- | --- |
| UC-01 | PARTIAL | New chat screen was visible. Strict fresh-install condition was not fully reset. |
| UC-03 | PARTIAL | Existing conversation list/title was visible in side panel. |
| UC-05 | PASS | One complete Korean request progressed into draft/search flow. |
| UC-19 | PASS | Search progress text and per-space validation were visible. |
| UC-20 | PASS | One recommended available space was shown. |
| UC-21 | PASS | Recommendation was marked available after validation. |
| UC-28 | PASS | Event name/purpose/headcount were reflected in the application draft. |
| UC-30 | PASS after fix | Spoken organization edit produced the expected organization value. |
| UC-32 | PASS | Draft preview displayed the fields to review. |
| UC-33 | PASS | No final submission occurred without user action; save stayed disabled while metadata was missing. |
| UC-41 | PARTIAL | Login-required card and GLS login flow were observed. Duplicate login messaging remains a UX issue. |
| UC-42 | PARTIAL | Flow continued after GLS login. Duplicate session/login messages observed. |
| UC-62 | PASS | Password was entered only in the GLS page, not inside the side panel. |
| UC-64 | PASS after fix | Required metadata gate prevented save until metadata was complete and stable. |
| UC-98 | PASS after fix | No automatic save/submit happened during correction flow. |
| UC-117 | PASS after fix | Clarification answer changed only the intended application field. |

## Iteration 2

### User Flow

1. Opened the side-panel conversation list through real Chrome UI.
2. Observed a stale empty `새 대화 · 대화 내용 없음` row mixed into recent conversations.
3. Fixed conversation history filtering so no-activity placeholders are not shown.
4. Rebuilt the extension, reloaded it from `chrome://extensions`, and re-opened the list.
5. Verified the empty row was gone while real conversations with titles/previews remained.
6. Started new chats for boundary and recovery cases.
7. Entered: `오늘 점심 뭐 먹지?`
8. Observed a reservation-domain boundary response and no GLS/search side effect.
9. Entered invalid punctuation: `!!!!!!`
10. Observed a recovery prompt and stable disabled empty-input send state.
11. Entered: `공간 예약하고 싶어`
12. Observed one missing-slot question for headcount with suggested chips.
13. Entered: `스무 명 안팎`
14. Observed approximate headcount was accepted and the assistant moved to the next missing slot.
15. Entered: `어제 14시 10명 회의실 잡아줘`
16. Observed past-date rejection before search/GLS automation.
17. Entered: `6월 25일 오후 6시부터 2시간 500명 기능 검증 행사 예약해줘`
18. Observed pre-fix behavior during exploration: the assistant asked for event category before declining impossible capacity.
19. Fixed guard order so capacity preflight runs before application metadata collection when the search request is already otherwise ready.
20. Rebuilt server and extension, reloaded the extension in Chrome, and repeated the 500-person request.
21. Observed final fixed response: no registered space can accommodate 500 people; reduce headcount or split the event.
22. Did not click final `GLS 신청 저장`.

### Root Cause

- Conversation summaries treated inactive no-activity placeholders as history-worthy, so a stale empty `새 대화` row could appear in the list.
- The impossible-headcount path applied application metadata collection before capacity preflight. This could ask for `hangsaGbCode` even though no registered room could satisfy the requested headcount.

### Fix

- Commit: `bb4fb67` (`fix: 대화 이력과 대용량 인원 가드 안정화`)
- Files:
  - `extension/src/shared/conversationSessions.ts`
  - `extension/src/background/handlers/chatHandler.ts`
- Change:
  - Show a conversation in history only when it has messages, slots, application state, a confirmed label, or a preview.
  - Treat any empty `새 대화` summary as a placeholder, regardless of status.
  - Run capacity preflight before application metadata collection for otherwise search-ready requests, while preserving the missing-slot prompt guard for incomplete requests.

### Regression

1. Built server and extension successfully.
2. Reloaded the extension in Chrome using Computer Use.
3. Verified the recent conversation list no longer displayed an empty `새 대화` row.
4. Verified real conversations remained visible.
5. Verified out-of-scope and invalid-input messages stayed inside chat recovery/boundary behavior.
6. Verified vague reservation request collected headcount before later missing fields.
7. Verified past-date request was rejected without search/GLS automation.
8. Verified 500-person request produced the capacity decline directly, with no event-category question first.

## Additional Case Results Recorded In Iteration 2

| UC | Result | Evidence |
| --- | --- | --- |
| UC-06 | PASS | Vague request asked for headcount only, then accepted approximate Korean headcount and moved to the next slot. |
| UC-15 | PASS | Out-of-scope food request received a reservation-domain boundary response and no search/GLS side effect. |
| UC-17 | PASS | Past-date request was rejected before search/GLS automation. |
| UC-18 | PASS | Punctuation-only input received a recovery prompt and the app remained usable. |
| UC-23 | PASS after fix | Impossible 500-person request declined by capacity before application metadata questions. |
| UC-56 | PASS after fix | Recent conversation list showed real conversations with meaningful titles/previews. |
| UC-57 | PASS after fix | Stale empty `새 대화` placeholder was filtered from the list. |
| UC-91 | PASS | Date validation rejected a past date before executing search/GLS automation. |

## Iteration 3

### User Flow

1. Entered `방금 예약 취소해줘` in the side panel.
2. Observed a graceful decline: submitted/stored reservation cancellation or modification is not handled by this extension and should be done directly in GLS.
3. Started a new vague reservation with `공간 예약하고 싶어`.
4. Observed the app asked for headcount.
5. Entered `취소`.
6. Observed the app stopped the reservation flow and did not start search/GLS automation.
7. Opened the recent conversation list and selected the cancelled conversation.
8. Selected a different 500-person no-space conversation.
9. Observed pre-fix issue: prompt chips and input placeholder from the cancelled conversation appeared in the other conversation.
10. Fixed conversation restore state isolation and capacity-decline status preservation.
11. Rebuilt server and extension, reloaded the extension in Chrome, and repeated the conversation-switch sequence.
12. Verified the cancelled conversation restored without stale headcount chips.
13. Verified switching to the 500-person conversation did not retain stale chips/placeholder.
14. Sent a fresh 500-person request after the fix.
15. Verified it rendered as a no-space retry state with retry chips, not as an application metadata or stale headcount prompt.
16. Did not click final `GLS 신청 저장`.

### Root Cause

- The side panel restored messages, slots, and automation state but did not carry `conversationStatus` into local UI state. Abandoned conversations could therefore be reinterpreted as active missing-slot conversations.
- The capacity preflight decline returned a user-facing no-space message but did not persist a `no_candidate` runtime status, so restored no-space conversations could fall back to generic phase derivation.
- Server hydration reset `lastStatus` and `lastProposed` to idle/null even when the local snapshot had more precise runtime state.

### Fix

- Commit: `73172cd` (`fix: 대화 복원 상태 격리 안정화`)
- Files:
  - `extension/src/shared/messages.ts`
  - `extension/src/background/handlers/chatHandler.ts`
  - `extension/src/background/conversationPersistence.ts`
  - `extension/src/sidepanel/hooks/useConversation.ts`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
- Change:
  - Added optional status to chat responses so capacity preflight can set UI automation state immediately.
  - Persisted capacity-decline results as `no_candidate`.
  - Preserved local runtime status/proposed candidate when hydrating from the server.
  - Added `conversationStatus` to side-panel conversation state and prevented abandoned conversations from being reinterpreted as active slot collection.

### Regression

1. Built server and extension successfully.
2. Reloaded the extension in Chrome using Computer Use.
3. Verified in-progress cancel stops the flow and leaves no stale headcount chips after restore.
4. Verified selecting another conversation after a cancelled conversation does not leak prompt chips or placeholder.
5. Verified a fresh 500-person request renders as a no-space retry state.

## Additional Case Results Recorded In Iteration 3

| UC | Result | Evidence |
| --- | --- | --- |
| UC-14 | PASS | `취소` stopped an in-progress vague reservation and did not start GLS automation. |
| UC-58 | PASS after fix | Selecting a prior conversation restored its messages without stale prompt controls from another conversation. |
| UC-61 | PASS after fix | Conversation content/progress stayed isolated when switching between conversations. |
| UC-108 | PASS | Submitted-reservation cancel/change request was gracefully declined and directed the user to GLS. |

## Iteration 4

### User Flow

1. Started a new future reservation conversation with `6월 25일 오후 7시부터 1시간 12명 Codex 삭제검증 임시행사 예약해줘`.
2. Observed the conversation enter active GLS/session/search progress state.
3. Opened the recent-conversation list through the real Chrome side panel.
4. Verified the temporary `Codex 삭제검증 임시행사` row was visible with a meaningful title/preview and delete control.
5. Clicked the delete control once and observed the confirmation state: the control changed to `대화 삭제 확인` with `한 번 더 누르면 삭제`.
6. Confirmed deletion through the same Chrome UI.
7. Verified the temporary row disappeared from the recent-conversation list.
8. Waited and observed that the deleted row did not immediately reappear.
9. Did not click final `GLS 신청 저장`.

### Observation

- No product code change was required in this pass. The two-step delete confirmation worked through the accessible Chrome UI.
- Deleting the active temporary conversation removed it from the user's visible history while the flow was still in progress.
- This pass verifies list/history cleanup for the deleted conversation. It does not fully prove downstream recommendation-memory deletion, so the related privacy cleanup case remains conservative.

## Additional Case Results Recorded In Iteration 4

| UC | Result | Evidence |
| --- | --- | --- |
| UC-59 | PASS | A visible recent conversation was deleted after the two-step confirmation and disappeared from the list. |
| UC-130 | PASS | An in-progress temporary conversation was deleted from history, and no `GLS 신청 저장` action was triggered. |
| UC-131 | PARTIAL | Deleted conversation was hidden from the list; recommendation/memory cleanup beyond visible history was not fully exercised. |

## Iteration 5

### User Flow

1. Started a new chat through the real Chrome side panel.
2. Pasted a long Korean paragraph into the input area.
3. Observed the input area wrap the text, keep the send button visible, and avoid overlap with surrounding controls.
4. Sent the long paragraph.
5. Observed the user bubble and assistant response render inside the side panel without layout breakage or GLS automation.
6. Verified the narrow/default side-panel width kept the conversation list, new-chat, input, and send controls visible.
7. Refreshed the unpacked extension from `chrome://extensions` using the Chrome extension reload button.
8. Reopened the SKKU side panel from the Chrome toolbar.
9. Verified the recent conversation list and `새 대화` control rendered after refresh.
10. Started a new chat, entered `새로고침 뒤 버튼 검증`, and observed the send button become active.
11. Sent the message and observed a response, confirming the post-refresh buttons were not dead.
12. Entered `취소` to stop the interpreted reservation flow and avoid search/GLS automation.
13. Did not click final `GLS 신청 저장`.

### Observation

- No product code change was required in this pass.
- The long input and message bubbles stayed within the side-panel layout.
- The default narrow side-panel view preserved core controls.
- Extension refresh closed and reopened the side panel cleanly, and chat controls still accepted input afterward.
- UC-127 remains unrun because accessible `set_value` does not prove actual Korean IME composition behavior.

## Additional Case Results Recorded In Iteration 5

| UC | Result | Evidence |
| --- | --- | --- |
| UC-128 | PASS | Long pasted Korean text did not break the input, message, or response layout. |
| UC-129 | PASS | Narrow side-panel view kept core chat, list, input, and send controls visible. |
| UC-132 | PASS | After extension refresh, the side panel reopened, buttons worked, and a post-refresh flow could be cancelled. |

## Iteration 6

### User Flow

1. Rebuilt the extension and reloaded the unpacked extension from `chrome://extensions` using real Chrome UI.
2. Entered `6월 25일 오후 6시 17분부터 1시간 10명 회의실 예약해줘`.
3. Observed the assistant reject unsupported minute precision with 30-minute-unit guidance.
4. Entered `6월 25일 새벽 3시부터 1시간 10명 회의실 예약해줘`.
5. Observed the assistant reject the early 03:00 time as outside the general GLS reservation-hour window.
6. Entered `2099년 1월 15일 오후 6시부터 1시간 10명 회의실 예약해줘`.
7. Observed the assistant reject the too-far date before search/GLS automation.
8. Entered `6월 25일부터 매주 목요일 오후 6시 4주 연속 10명 회의실 예약해줘`.
9. Observed the assistant gracefully decline repeat reservations and ask for a single date/time.
10. Found a product issue: unsupported-minute and too-far-date guidance could show irrelevant headcount prompt chips because the side panel inferred phase from slot shape after validation responses.
11. Fixed phase/hint derivation to preserve and prioritize the parser's `missing_required` list.
12. Rebuilt the extension and reloaded it from Chrome UI.
13. Re-ran the unsupported-minute case and verified headcount chips were gone.
14. Re-ran the too-far-date case and verified headcount chips were gone.
15. Started a vague reservation, cancelled it, and visually verified the starter placeholder returned and headcount chips disappeared.
16. Did not click final `GLS 신청 저장`.

### Root Cause

- Side-panel phase derivation used slot shape as the first durable signal after a message. Validation and graceful-decline responses can still contain partially filled slots, so the UI could infer a missing headcount prompt even though the correct response was a rejection or boundary prompt.

### Fix

- Commit: `767b312` (`fix: 검증 안내 칩 상태를 누락 필드 기준으로 정리`)
- Files:
  - `extension/src/sidepanel/hooks/useConversation.ts`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
- Change:
  - Store the latest parse result's `missing_required` list in side-panel conversation state.
  - Use `missing_required` before slot-shape fallback when deriving prompt phase and chips.
  - Clear missing-required state for cancel and out-of-scope responses.

### Regression

1. `pnpm build` in `extension`: pass.
2. `git diff --check` for the touched side-panel hook files: pass.
3. Chrome extension reload through Computer Use: pass.
4. UC-89 post-fix: unsupported-minute guidance showed no irrelevant headcount chips.
5. UC-92 post-fix: too-far-date guidance showed no irrelevant headcount chips.
6. Cancel placeholder check: the visual input returned to the starter example and headcount chips disappeared.

## Additional Case Results Recorded In Iteration 6

| UC | Result | Evidence |
| --- | --- | --- |
| UC-89 | PASS after fix | Non-30-minute start was rejected with 30-minute guidance, and post-fix prompt chips no longer implied missing headcount. |
| UC-90 | PASS | Early 03:00 request was rejected as outside general GLS reservation hours before search/GLS automation. |
| UC-92 | PASS after fix | Too-far future date was rejected, and post-fix UI no longer displayed irrelevant headcount chips. |
| UC-113 | PASS | Weekly repeat reservation request was gracefully declined and directed the user to provide one date/time. |

## Iteration 7

### User Flow

1. Continued in the real Chrome side panel after the date/time validation pass.
2. Started a new chat and entered `6월 25일 오후 6시부터 1시간 10명 빔프로젝터 있는 곳 예약해줘`.
3. Observed the assistant explicitly state that projector/whiteboard-style facility conditions cannot yet be checked automatically in GLS; no search/GLS automation started.
4. Started a new chat and entered `book a room tomorrow 3pm for 10 people`.
5. Observed the assistant ask for Korean reservation details; no search/GLS automation started.
6. Started a new chat and entered `6월 25일 3시에 10명 회의실 예약해줘`.
7. Observed the assistant ask for AM/PM clarification instead of silently treating `3시` as early morning.
8. Started a new chat and entered `6월 25일 오후 6시 반부터 8시까지 12명 회의실 예약해줘`.
9. Observed the assistant interpret the request as `6/25(목) 18:30부터 20:00까지, 12명`.
10. Observed the recommendation card show `시간 18:30 - 20:00` and `날짜 2026-06-25`.
11. Entered `취소` at the application-metadata stage to stop before any final save/submit action.
12. Did not click final `GLS 신청 저장`.

### Observation

- No product code change was required in this pass.
- Facility/equipment filters, English input, and AM/PM omission were handled as explicit guidance/clarification instead of silent automation.
- The half-hour natural-language expression was correctly normalized into a 30-minute boundary reservation window.

## Additional Case Results Recorded In Iteration 7

| UC | Result | Evidence |
| --- | --- | --- |
| UC-88 | PASS | `6시 반` was interpreted as `18:30-20:00`, produced a recommendation, and was cancelled before submit. |
| UC-95 | PASS | Unsupported facility/equipment conditions were explicitly declined instead of silently ignored. |
| UC-111 | PASS | Missing AM/PM time asked for clarification instead of silently using early morning. |
| UC-114 | PASS | English reservation request received clear Korean-language guidance and no automation. |

## Iteration 8

### User Flow

1. Continued in the real Chrome side panel after the half-hour expression pass.
2. Started a new chat and entered `6월 25일 오후 2시부터 4시까지 8명 회의실 예약해줘`.
3. Observed the assistant interpret the request as `6/25(목) 14:00부터 2시간, 8명`.
4. Clicked `중단` while search was active and observed the flow return to the stopped state.
5. Started another new chat and entered `6월 25일 14시부터 2시간 8명 회의실 예약해줘`.
6. Observed the assistant again interpret the request as `6/25(목) 14:00부터 2시간, 8명`.
7. Clicked `중단` while search was active and observed the cancellation message.
8. Did not click final `GLS 신청 저장`.

### Observation

- No product code change was required in this pass.
- Current `docs/E2E_TEST_CASES.md` numbering maps time-expression variants to UC-08 and in-progress cancellation to UC-14, so the earlier cancellation result was relabeled from UC-08 to UC-14 in the summary report.
- Both natural-language time phrasings normalized to the same 14:00-16:00 request window.

## Additional Case Results Recorded In Iteration 8

| UC | Result | Evidence |
| --- | --- | --- |
| UC-08 | PASS | `오후 2시부터 4시까지` and `14시부터 2시간` both resolved to the same 14:00-16:00 window. |

## Iteration 9

### User Flow

1. Started a new real Chrome side-panel chat and entered `6월 25일 19시부터 2시간 15명 율전 학생회관 예약해줘`.
2. Observed the request proceed without additional slot questions and constrain validation to `학생회관 · 연습실` (`검증 1/1`).
3. Observed the validation state remain visible longer than expected, then clicked `중단`; no save/submit action was clicked.
4. Started another broad search with `6월 25일 오후 6시부터 2시간 12명 회의실 예약해줘`.
5. Observed the broad search also remain on an active validation item long enough to treat the automation wait as a robustness issue, then cancelled it.
6. Added a bounded timeout around GLS automation messages in `extension/src/background/glsCoordinator.ts`.
7. Rebuilt the extension with `pnpm build`, reloaded the unpacked Chrome extension, and reopened the side panel.
8. Re-ran `6월 25일 19시부터 2시간 15명 율전 학생회관 예약해줘`.
9. Observed the post-fix/reload run reach a `학생회관(03동)` recommendation for `연습실 (03B08)`.
10. Observed the recommendation include the student-support-team priority warning and fixture notice.
11. Entered `취소` in the review-stage input and observed the flow stop before any final save/submit action.
12. Did not click `GLS 신청 저장`.

### Observation

- The building filter worked: the search narrowed to the requested `율전 학생회관` target and later recommended a `학생회관(03동)` room.
- The recommendation card exposed warning/notice text before final save.
- The timeout guard prevents unresolved content-script automation messages from leaving the UI waiting indefinitely.
- The one-line request path proceeded directly into search/review, but the manual GLS speed comparison portion of UC-10 was not formally timed.

## Additional Case Results Recorded In Iteration 9

| UC | Result | Evidence |
| --- | --- | --- |
| UC-09 | PASS after fix | `율전 학생회관` constrained the search and produced a `학생회관(03동)` recommendation. |
| UC-10 | PARTIAL | Complete one-line input went directly to search/review, but no stopwatch comparison against manual GLS was recorded. |
| UC-24 | PASS | Recommendation displayed a priority/warning note for the selected student-support-team space. |
| UC-25 | PASS | Recommendation displayed the fixture notice/constraint text before final save. |
| UC-27 | PASS | Active search/review could be stopped or cancelled before final save. |

## Iteration 10

### User Flow

1. Continued in the real Chrome side panel at the review stage after the building-filter recommendation pass.
2. Entered `아니 30명으로` after the `6월 25일 19시부터 2시간 15명 율전 학생회관 예약해줘` recommendation.
3. Captured the pre-fix failure: the assistant accepted the 30-person correction and revalidated the same room, but the application draft still showed `행사인원 15명`.
4. Added draft-headcount synchronization from the current reservation slots in the background chat handler and search-start handler.
5. Rebuilt the extension with `pnpm build` and verified the already-open real Chrome side panel reflected the corrected draft state.
6. Observed the post-fix recommendation preserve the same date/time/building and show `행사인원 30명`.
7. Entered `20명으로 바꾸고 시간은 20시부터 1시간으로`.
8. Observed the post-fix multi-slot correction revalidate the same fixture candidate and show `시간 20:00 – 21:00`, `날짜 2026-06-25`, and `행사인원 20명`.
9. Entered `취소` and observed the flow stop before any final save/submit action.
10. Did not click `GLS 신청 저장`.

### Observation

- The root cause was a stale application draft headcount after recommendation-stage slot corrections. The slot data changed, but a complete draft could retain the previous headcount in the preview and queued GLS form data.
- The fix adds a shared draft/headcount synchronization helper and applies it both before chat result persistence and before search-start queue creation.
- UC-13-style alternative-room behavior was not counted in this iteration; only UC-11 and UC-12 were exercised and recorded.

## Additional Case Results Recorded In Iteration 10

| UC | Result | Evidence |
| --- | --- | --- |
| UC-11 | PASS after fix | `아니 30명으로` preserved the recommendation context and updated the application draft to 30 people. |
| UC-12 | PASS after fix | `20명으로 바꾸고 시간은 20시부터 1시간으로` updated both headcount and the 20:00-21:00 window. |

## Iteration 11

### User Flow

1. Rebuilt the extension with `pnpm build` and reloaded it through the real Chrome extensions UI.
2. Started a real Chrome side-panel chat and entered `6월 25일 19시부터 2시간 20명 회의실 예약해줘`.
3. Observed a broad-search recommendation, then entered `다른 곳 보여줘`.
4. Captured the pre-fix issue: the old recommendation card remained visible while the next-room search had already started.
5. Cleared `proposedCandidate` and `submitStep` when a text alternative request is parsed and when background status enters `searching` or `opening_gls`.
6. Rebuilt and reloaded the extension again in Chrome.
7. Re-ran the same broad-search flow and entered `다른 곳 보여줘`.
8. Observed the previous recommendation card clear immediately while the alternative search continued.
9. Observed a different recommended room with the same date/time/headcount.
10. Entered `여러 개 같이 보여줘` and observed the one-at-a-time graceful decline: `후보를 길게 나열하지 않고 한 곳씩 보여드려요. 같은 조건으로 다음 공간을 찾아볼게요.`
11. Stopped the flow before any final save/submit action.

### Observation

- The alternative-room behavior itself could eventually find another space, but the UI was misleading during the search interval because the stale recommendation card stayed visible.
- The fix keeps the side-panel review state aligned with the automation state: once a new search begins, the previous candidate is no longer presented as the current actionable recommendation.
- The post-fix run also verified the candidate-list request is handled as a one-at-a-time flow, not a long candidate dump.
- No `GLS 신청 저장` action was clicked.

## Additional Case Results Recorded In Iteration 11

| UC | Result | Evidence |
| --- | --- | --- |
| UC-13 | PASS after fix | `다른 곳 보여줘` cleared the stale recommendation while searching and then produced a different candidate; `여러 개 같이 보여줘` was limited to one-at-a-time search. |

## Iteration 12

### User Flow

1. Confirmed `localhost:8000` health and rebuilt the extension with `pnpm build`.
2. Reloaded the unpacked extension through the real Chrome extensions UI and reopened the side panel.
3. Started a new real Chrome side-panel chat and entered `6월 25일 18시부터 2시간 20명 400126 예약해줘`.
4. Observed the assistant summarize the request as `400126호`, proving the six-digit number was interpreted as a room code, not as a date or headcount.
5. Observed the search validate exactly one candidate: `반도체관 · 첨단강의실`.
6. Observed the recommendation card show `첨단강의실 (400126)`, `반도체관(40동)`, `시간 18:00 – 20:00`, and `날짜 2026-06-25`.
7. Cancelled the numeric-space-code flow before any final save/submit action.
8. Started another new real Chrome side-panel chat and entered `6월 25일 저녁 여섯시 스무명 회의실 잡아줘`.
9. Observed the app understand the date, `저녁 여섯시`, and `스무명`, then ask only for the missing duration.
10. Selected `2시간` and observed the app show `6/25(목) 18:00부터 2시간, 20명으로 가능한 공간을 찾아볼게요.` before search.
11. Stopped the flow before any final save/submit action.

### Observation

- Numeric space-code handling worked as a safety-sensitive exact-room request: the code constrained the candidate queue and the recommendation preserved the same code.
- Colloquial input did not silently fail or invent missing duration; it asked one focused follow-up and then continued after the answer.
- The interpreted-summary line gave the user a chance to catch date/time/headcount mistakes before search.
- No product fix was needed in this iteration.
- No `GLS 신청 저장` action was clicked.

## Additional Case Results Recorded In Iteration 12

| UC | Result | Evidence |
| --- | --- | --- |
| UC-16 | PASS | `저녁 여섯시` and `스무명` were understood, with only missing duration asked before search. |
| UC-107 | PASS | The app displayed the interpreted `6/25(목) 18:00부터 2시간, 20명` summary before search. |
| UC-133 | PASS | Numeric space code `400126` was treated as a specific room and only `첨단강의실 (400126)` was recommended. |

## Iteration 13

### User Flow

1. Started a real Chrome side-panel chat and entered `6월 25일 18시부터 2시간 20명 반도체관 400126호 예약해줘`.
2. Observed the app validate exactly one candidate and recommend `첨단강의실 (400126)`.
3. Started a new chat and entered `6월 25일 18시부터 2시간 20명 학생회관 예약해줘`.
4. Observed the app ask whether the user meant 명륜 or 율전/자과캠 student center instead of guessing.
5. Answered `율전` and observed the app continue with the same date/time/headcount and recommend `학생회관(03동)` `연습실 (03B08)`.
6. Started a new chat and entered `6월 25일 18시부터 2시간 2명 회의실 예약해줘`.
7. Captured the pre-fix issue: after smaller candidates had communication errors, the app recommended the oversized 120-person `첨단강의실 (400126)`.
8. Added a server-side small-headcount candidate cap for general requests: 3 or fewer people now only receive spaces up to 24 seats unless the user explicitly specifies a building or room.
9. Verified `pnpm verify` and `pnpm build` in `server`, and confirmed the API returns only 20/24-person candidates for a general 2-person request while still allowing `space=400126`.
10. Re-ran the 2-person Chrome flow and observed the candidate queue shrink to `검증 1/2` with only `수선관 · 세미나실` and `산학협력센터 · 세미나실 I`.
11. Observed the first small candidate show a communication error, then the app continue and recommend `세미나실 I (85529)`, a 20-person room.
12. Did not click `GLS 신청 저장`.

### Observation

- Specific-room selection worked as expected when the user gave both building and room code.
- Ambiguous `학생회관` input was handled conservatively with a campus clarification question.
- The small-headcount gap was structural: candidate sorting preferred smaller rooms, but it still allowed oversized fallback rooms if smaller candidates failed validation.
- The fix keeps exact-room requests possible while preventing general 2-person room searches from falling through to a 120-person room.
- The post-fix candidate-failure continuation also supports UC-102: one candidate communication error did not end the whole search.

## Additional Case Results Recorded In Iteration 13

| UC | Result | Evidence |
| --- | --- | --- |
| UC-84 | PASS | `반도체관 400126호` validated one candidate and recommended `첨단강의실 (400126)`. |
| UC-86 | PASS | Ambiguous `학생회관` asked for campus clarification instead of guessing. |
| UC-87 | PASS | `율전` was accepted as a campus alias and narrowed the student-center search correctly. |
| UC-93 | PASS after fix | A 2-person general request no longer fell through to an oversized 120-person room; post-fix it recommended a 20-person room. |
| UC-102 | PASS | One small candidate communication error was skipped and the next small candidate was recommended. |

## Iteration 14

### User Flow

1. Confirmed `localhost:8000` health and verified the previous recorded subset state.
2. Used the real macOS Chrome side panel to continue a recommendation-stage flow with `첨단강의실 (400126)` at `18:00-20:00`.
3. Entered `아 시간은 19시부터로 바꿔줘` after the recommendation.
4. Captured the pre-fix issue: the visible recommendation initially stayed at the old `18:00-20:00` time.
5. Broadened inline slot-edit recognition for `바꿔`/`시간은`, added the side panel's current slot snapshot to `POPUP_CHAT_REQUEST`, and cleared stale recommendation UI when a modified slot needs a fresh search.
6. Matched the server parse-route inline edit guard with the same wording.
7. Verified `pnpm build` in `extension`, `pnpm build` in `server`, and `pnpm verify` in `server`.
8. Observed the real Chrome side panel revalidate the same `400126` room as `19:00-21:00`.
9. Reloaded the unpacked extension through Chrome and reopened the side panel.
10. Observed the restored conversation clear stale candidate UI and enter fresh search for the modified time before stopping the active search.
11. Did not click `GLS 신청 저장`.

### Observation

- The root cause was split between language coverage and restored-state robustness: `바꿔줘`/`시간은` needed to be recognized as a slot edit, and a reloaded side panel can know the visible slots before background/server context has a reliable previous-slot base.
- Passing the client slot snapshot keeps post-recommendation edits deterministic after extension reload or conversation restore.
- Clearing stale candidates during `modify_slot` re-search prevents the old recommendation from remaining actionable while a new time window is being checked.
- The final recommendation evidence showed `시간 19:00-21:00`, `날짜 2026-06-25`, and the same `첨단강의실 (400126)` room.
- No actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 14

| UC | Result | Evidence |
| --- | --- | --- |
| UC-96 | PASS after fix | `아 시간은 19시부터로 바꿔줘` after a recommendation revalidated the same room at `19:00-21:00` and did not keep the old `18:00-20:00` card as the current recommendation. |

## Iteration 15

### User Flow

1. Confirmed the workspace and E2E record state, then used the real macOS Chrome side panel for UC-110.
2. Started a new chat and entered `회의실 예약하고 싶어`.
3. Selected the `20명` chip.
4. Captured the pre-fix issue: the assistant said it would reuse the same date/time even though only headcount had been collected.
5. Entered `아 잠깐, 6월 26일 14시부터 2시간으로 다시 할게`.
6. Captured the pre-fix failure: the assistant stayed in an incomplete prompt state and did not preserve the explicit `6월 26일` date.
7. Updated extension and server inline slot-date parsing so explicit month/day edits can anchor to the request timestamp when no previous slot date exists.
8. Updated headcount-only correction copy so it asks for date/time until the request is search-ready.
9. Verified `pnpm build` in `extension`, `pnpm build` in `server`, and `pnpm verify` in `server`.
10. Reloaded the unpacked extension through Chrome and replayed the same UC-110 flow.
11. Observed the post-fix headcount-only response: `인원을 20명으로 기록했어요. 날짜와 시간을 알려주세요.`
12. Entered the same change message and observed the conversation switch to the `2026-06-26` search state instead of asking for duration again.
13. Clicked `중단`/cancel controls and observed the flow stop before any final save/submit action.
14. Did not click `GLS 신청 저장`.

### Observation

- The root cause was a missing anchor for explicit month/day edits after partial slot collection. `parseExplicitDateEdit()` required a previous slot date, so `6월 26일` could not resolve when only headcount existed.
- Passing the request timestamp keeps server and extension inline edits deterministic for partial conversations.
- The corrected copy avoids telling the user that an uncollected date/time will be reused.
- The post-fix run was intentionally stopped after search start; no actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 15

| UC | Result | Evidence |
| --- | --- | --- |
| UC-110 | PASS after fix | After only headcount was collected, `아 잠깐, 6월 26일 14시부터 2시간으로 다시 할게` preserved `2026-06-26`, entered search, and was safely cancelled before final save/submit. |

## Iteration 16

### User Flow

1. Started a fresh real Chrome side-panel chat after the UC-110 run.
2. Entered `6월 26일 오전 9시부터 10시간 10명 회의실 예약해줘`.
3. Observed the app respond without starting GLS/search automation.
4. Verified the visible guidance: one 10-hour reservation may exceed limits, so the user should split it or reduce it to 8 hours or less.
5. No `중단` or `GLS 신청 저장` action was needed because no search or application draft started.

### Observation

- No product code change was required in this pass.
- The overlong request was handled as early guidance instead of a pointless search.
- No actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 16

| UC | Result | Evidence |
| --- | --- | --- |
| UC-26 | PASS | A 10-hour request was declined before search with guidance to split or shorten to 8 hours or less. |

## Iteration 17

### User Flow

1. Started a fresh real Chrome side-panel chat to exercise a logistics-only request with no event description.
2. Entered `6월 26일 14시부터 2시간 20명 반도체관 400126호 예약해줘`.
3. Observed the app constrain validation to the requested `반도체관 · 첨단강의실`.
4. Observed that the specific room was unavailable due to an existing `10:00~18:00` reservation block.
5. Verified the app reported that the requested condition had no matching space and did not silently recommend a different room.
6. Started another fresh chat and entered `6월 26일 18시부터 2시간 20명 반도체관 400126호 예약해줘`.
7. Observed a valid recommendation for `첨단강의실 (400126)`.
8. Because the request had no event description, observed one combined application-info prompt: `단체와 행사명을 알려주세요`, with quick-fill examples.
9. Entered `취소` and observed the flow stop before any final save/submit action.
10. Did not click `GLS 신청 저장`.

### Observation

- No product code change was required in this pass.
- The specific-room unavailable path preserved user intent and did not substitute another room without consent.
- The application-metadata path asked one focused follow-up after recommendation rather than collecting every draft field separately.
- No actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 17

| UC | Result | Evidence |
| --- | --- | --- |
| UC-29 | PASS | With logistics only and no event description, the app asked once for organization/event information after recommendation. |
| UC-22 | PASS | The unavailable specific room/time showed a no-matching-space result instead of silent loading or an unrelated recommendation. |
| UC-85 | PASS | When the requested `400126호` was unavailable at 14:00-16:00, the app reported no matching space instead of silently choosing another room. |
| UC-124 | PASS | A requested specific room that was occupied was clearly reported unavailable, and the app did not auto-scan or switch to another room. |

## Iteration 18

### User Flow

1. Confirmed `localhost:8000/health` returned `{"ok":true}` and continued with the loaded Chrome extension.
2. Started a fresh real Chrome side-panel chat.
3. Entered `6월 26일 18시부터 2시간 20명 반도체관 400126호 학회 세미나 예약해줘`.
4. Observed the request reach a valid `첨단강의실 (400126)` recommendation and application draft preview.
5. Verified the draft classified the event as `교내단체행사 (세미나/스터디)` without requiring the user to know the GLS category.
6. Entered `아니, 취소할게` at the final review/draft preview stage and observed `예약 진행을 중단했어요`.
7. Started another fresh real Chrome side-panel chat.
8. Entered `다음 주 금요일 18시부터 2시간 20명 반도체관 400126호 예약해줘`.
9. Because the current test date is 2026-06-04, verified the app resolved `다음 주 금요일` to `6/12(금)` / `2026-06-12`.
10. Observed the relative-date flow reach recommendation/application-metadata prompt with date `2026-06-12`.
11. Entered `취소` and observed the flow stop.
12. Did not click `GLS 신청 저장` or any final submit control.

### Observation

- No product code change was required in this pass.
- Relative date parsing, event-category draft classification, and final-review cancellation were all visible through the real Chrome side panel.
- The UI showed a clear stopped state after cancellation, and no actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 18

| UC | Result | Evidence |
| --- | --- | --- |
| UC-07 | PASS | As of 2026-06-04, `다음 주 금요일` resolved to `6/12(금)` / `2026-06-12`, and the flow was safely cancelled. |
| UC-31 | PASS | `학회 세미나` was classified as `교내단체행사 (세미나/스터디)` in the draft preview. |
| UC-120 | PASS | `아니, 취소할게` at final review stopped the flow before any save/submit action. |

## Iteration 19

### User Flow

1. Confirmed the current recorded subset state and `localhost:8000/health`.
2. Started a fresh real Chrome side-panel chat and observed starter example buttons, including `6월 25일(목) 오후 6시부터 2시간 20명 학생회 회의`.
3. Clicked that first starter example and observed it send as a user message.
4. Captured the pre-fix issue: the flow reached a valid recommendation, but the application draft polluted metadata with the parenthesized weekday token: `주관단체 (목) 학생회`, `행사명 (목) 학생회 회의`, and `사용목적 (목) 학생회 회의 진행`.
5. Cancelled the pre-fix flow before any final save/submit action.
6. Updated server-side application metadata derivation to strip parenthesized weekday tokens and route derived draft descriptions through schedule/logistics cleanup.
7. Added bare organization extraction for `학생회`/`동아리`-style phrases after cleanup.
8. Verified the exact phrase directly through `buildApplicationState`, confirming `주관단체 학생회`, `행사명 학생회 회의`, and `사용목적 학생회 회의 진행`.
9. Verified `pnpm build` and `pnpm verify` in `server`, then restarted the local watch server on port 8000.
10. Reran the same first starter example through the real Chrome side panel.
11. Observed the auto title `2026-06-25 학생회 회의` and search start without weekday noise.
12. Observed a valid `첨단강의실 (400126)` recommendation and a clean draft preview: `주관단체 학생회`, `행사명 학생회 회의`, `행사인원 20명`, `사용목적 학생회 회의 진행`.
13. Entered `취소` in the chat input and observed `예약 진행을 중단했어요`.
14. Did not click `GLS 신청 저장`.

### Observation

- The root cause was structural, not just a starter-example wording issue: `stripScheduleAndReservationWords()` removed date/time/headcount words but did not remove parenthesized weekday tokens like `(목)`, and `deriveDraftFromDescription()` could be called with text that had not been sanitized at that layer.
- The fix keeps the visible request wording unchanged while ensuring GLS draft metadata uses only the event content.
- The recommendation path still works after the cleanup, and cancellation remained safe.
- No actual GLS reservation was submitted.

## Additional Case Results Recorded In Iteration 19

| UC | Result | Evidence |
| --- | --- | --- |
| UC-04 | PASS after fix | Clicking the starter example sent the exact example request, reached recommendation/draft, and cancelled safely; post-fix draft metadata no longer contained `(목)`. |
| UC-60 | PASS after fix | The same starter-example flow generated a meaningful conversation title, `2026-06-25 학생회 회의`, without parenthesized weekday noise. |

## Open Risks

- The final goal criteria are not yet satisfied: UC-01 through UC-145 full regression was not completed.
- PASS ratio is not meaningful for the full suite yet because most UCs remain `NOT_RUN`; current recorded subset is 65 PASS, 6 PARTIAL, 0 FAIL/BLOCKED, 71 NOT_RUN.
- Chrome extension error log still showed an old `readFormSnapshot no popupFrame open` error button from earlier GLS probing; it did not block this regression.
- Computer Use Korean `type_text` was unreliable, so Korean text entry used accessible `set_value` on the real Chrome UI text area.
- No actual GLS reservation was submitted in this run.
