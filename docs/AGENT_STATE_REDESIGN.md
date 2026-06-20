# 채팅 에이전트 상태 모델 재설계 (2026-06-20)

> 목표: **클라 로직 최소 + 서버 흐름-휴리스틱 최소 + LLM이 값·화행만 책임, 나머지는 데이터에서 결정론적으로 파생.**
> 핵심 전환: `intent(7개)` + `클라 derivePhase(15 phase)` + `클라 action 휴리스틱` →
> **2개 데이터 트랙 + 2개 게이트 액션 + 4개 화행 + 서버 파생 reducer.**

---

## 1. 모델 개요

phase를 "사용자가 전이해 들어가는 단계 체인"으로 보지 않는다.
실제 구조는 **병렬 데이터 트랙 2개 + 전제조건이 걸린 액션 2개 + 이벤트 구동 자동화 region**이다.

```
 [Track S: 필수 필터]──(gate: slotsComplete)──→ 탐색 ──(후보 제안)──┐
                                                                    ├─→ (gate: canSubmit) 제출
 [Track A: 신청서 메타]──────────────────────────────────────────┘
        ↑↓  S·A 는 독립 — 자유롭게 왕복하며 채움 (순서 강제 없음)

 [Region C: 자동화]  searching / proposed / no_candidate / login / submitting / done
        └ 채팅 입력이 아니라 background 이벤트로 전이. LLM 소유 아님. UI 투영 전용.
```

**강제되는 순서는 단 하나:** `필터 완료 → 탐색 → (후보 ∧ 신청서 완료) → 제출`.
S와 A 사이에는 순서가 없다.

---

## 2. 데이터 트랙 정의

LLM은 두 버킷에 **값만 선언**한다(full echo + 병합). 완료 여부는 **서버가 파생**한다.

### Track S — 필수 필터 (slots)
| 필드 | 필수 | 비고 |
|---|---|---|
| `date`, `start_time`, `end_time`\|`duration_min`, `headcount`, `campus` | ✅ | 탐색 전제조건 |
| `building`, `space` | ⬜ | 선택 필터 |

- 완료 판정: `slotsComplete = isSearchReady(slots)` — **이미 존재** ([shared/reservation/slotPolicy.ts:43](../shared/reservation/slotPolicy.ts)). campus 해석 가능 여부 포함.
- 파생: `missing_required`는 LLM이 아니라 이 함수에서 역산. (현재 LLM 출력 필드 제거 대상.)

### Track A — 신청서 메타 (application)
| 필드 | 비고 |
|---|---|
| `organization`, `eventName`, `purpose`, `hangsaGbCode` | LLM이 말한 만큼 채움 + confidence |
| `headcount` | Track S에서 동기화(별도 입력 아님) |

- 완료 판정: `appComplete = hasCompleteReservationForm(draft)` — **이미 존재** ([server/src/application/state.ts:236](../server/src/application/state.ts)).
- `needs_application_collection` / `missing_application` 도 서버 파생 유지 ([state.ts buildApplicationState](../server/src/application/state.ts)).

### Region C — 자동화 (참고: 채팅 state 아님)
`searching → candidate_found(proposed) | no_candidate`, `login_required(needed|expired)`, `filling → saving → saved(done)`.
background 이벤트(`BG_CANDIDATE_PROPOSAL`, `SESSION_EXPIRED` 등)로만 전이. 서버 채팅 state에 넣지 않는다. UI는 (트랙 완성도 + 이 region)에서 파생.

---

## 3. 게이트 / cascade 규칙

### 게이트된 액션 (결정 확정 §7)
| 액션 | 전제조건 | 발화 트리거 |
|---|---|---|
| `search` | `slotsComplete` | (a) slots가 false→true로 막 완성 / (b) 후보 있는데 slots 변경(cascade) / (c) 화행 `request_alternative`(다음 후보) |
| `fill_form` | `canSubmit` (`hasCandidate ∧ appComplete`) | 화행 `accept` — **폼만 채움(미리보기), 제출 안 함** |
| `submit` | `canSubmit` | **버튼 전용**(채팅에서 자동 발사 안 함) — GLS 외부 비가역 동작이라 명시적 클릭 |

- (a)(b)는 **데이터 diff로 서버가 파생** → LLM 신호 불필요.
- (c) "다른 곳"은 데이터가 안 바뀌므로 **화행으로만** 구분 가능 → LLM이 `request_alternative`.
- `request_alternative`는 **이미 찾은 후보 리스트의 다음 후보**로 이동(`next_candidate`). 새 탐색은 slots 변경 시에만(현행 유지).
- `accept`는 폼만 채우는 `fill_form`까지만(현 `previewReservation` 경로). 실제 `submit`은 버튼.

### cascade 비대칭 (반드시 보존)
| 변경 | 후보(Region C) | 제출 게이트 |
|---|---|---|
| **slots 변경** | 무효화 → 재탐색 필요 | 다시 잠김 |
| **application 변경** | 유지 | 영향 없음 |

"다른 건물로"(slots 변경=후보무효) vs "행사명 바꿔"(application 변경=후보유지)의 구분이 여기서 자동으로 나온다.

### 서버 reducer (전이 = 부수효과 파생)
입력: `(prevSlots, prevApp, hasCandidate, signal, nextSlots, nextApp)`
```
1. 값 병합 (slots echo / app 병합) + 하드 검증 가드(§5 KEEP)
2. 파생: slotsComplete, appComplete, slotsChanged, canSubmit
3. action 결정:
   signal = cancel             → action=none,  lifecycle=cancelled  (데이터 보존*)
   signal = out_of_scope       → action=none,  데이터 불변          (데이터 보존*)
   signal = request_alternative→ hasCandidate ? action=next_candidate : none
   signal = accept             → canSubmit ? action=fill_form : none(부족분 되묻기)   ← 폼만, 제출은 버튼
   signal = info               → (slotsChanged ∧ hasCandidate) → action=search   (cascade)
                                  else (slotsComplete ∧ ¬prevComplete) → action=search (첫 탐색)
                                  else action=none
4. 반환: { slots, application_state, canSubmit, action, assistant_message }
   (`submit` action 은 reducer 가 내지 않음 — 버튼 클릭 핸들러가 직접 POPUP_CONFIRM_RESERVATION 발사)
```
\* **버그 수정**: 현재 `out_of_scope`/`cancel`이 클라에서 누적 슬롯을 null로 날림([useConversation.ts:422](../extension/src/sidepanel/hooks/useConversation.ts)). 신모델에선 데이터 트랙을 건드리지 않는다(취소는 lifecycle 플래그만).

---

## 4. LLM I/O 계약

### 입력 (대부분 이미 구현됨 — `renderStateBlock`)
- 최근 k개 history 원문 (`RECENT_HISTORY_WINDOW=6`)
- 누적 slots + application draft/confidence (working memory)
- 자동화 컨텍스트: `hasCandidate`, `lastProposedSpace`, `pendingReuseMemoryId`
- 사용자 입력

### 출력 (슬림화)
```jsonc
{
  "slots": { /* 8필드 full echo, 모르면 null */ },
  "application": {
    "draft": { "organization","eventName","purpose","hangsaGbCode" } | null,
    "confidence": { ... },
    "suggest_reuse_memory_id": string | null
  },
  "signal": "info" | "accept" | "request_alternative" | "cancel" | "out_of_scope",
  "assistant_message": "..."
}
```

### 제거되는 LLM 출력 필드 (→ 서버 파생)
| 제거 | 대체 |
|---|---|
| `intent` (7개) | `signal` (5개). `new_reservation`/`modify_slot`/`modify_application` → 전부 `info`로 통합. "어느 트랙이 바뀌나"는 diff로 서버가 판단 |
| `missing_required` | `isSearchReady` 역산 |
| `ready_to_search` | `slotsComplete` |

### 와이어 (ParseResponse)
- 추가: `action: 'search' | 'next_candidate' | 'fill_form' | 'none'`, `can_submit: boolean`
- 클라는 `result.action`을 **실행만** 한다(분기 판단 없음). `submit`은 와이어 action이 아니라 버튼 핸들러.

---

## 5. 휴리스틱 인벤토리 — 걷어낼 것 vs 살릴 것

흩어진 휴리스틱은 두 부류다. **흐름 제어**는 reducer가 흡수하므로 제거, **하드 도메인 검증**(LLM이 신뢰성 있게 못 하는 사실)은 살리되 *데이터/intent를 오염시키지 않도록* 분리.

### 🟥 제거 (흐름 제어 → 서버 reducer가 흡수)
**클라 [useConversation.ts](../extension/src/sidepanel/hooks/useConversation.ts)**
- `shouldPreserveActiveSlots` (398) — 슬롯 보존은 reducer 책임
- `shouldStartSearch` (538) + `hasSlotSearchCue` 정규식 (149) — cascade는 데이터 diff로 파생
- `modify_slot && ready_to_search` 자동화 리셋 블록 (445)
- `confirm_reservation` 자동 제출 블록 (514) → `action==='submit'` 실행으로 대체
- `request_alternative` 라우팅 (486) → `action==='next_candidate'` 실행으로 대체
- intent별 slots/app null 처리 (420–480) → action 실행 + 데이터 보존

**클라 [useChatStateMachine.ts](../extension/src/sidepanel/hooks/useChatStateMachine.ts)**
- `derivePhase` 15-phase → 작은 파생 투영(트랙 완성도 + Region C)으로 축소. UI 라벨/placeholder/hints는 그 투영에서 파생(enum에 박지 않음).

**백그라운드 [chatPolicies.ts](../extension/src/background/chatPolicies.ts)**
- `applyApplicationCollectionPromptGuard`의 `intent==='modify_application'` 분기 (262) — intent 의존 제거

### 🟩 유지 (하드 도메인 검증 — 단, intent=out_of_scope 오버로딩 끊기)
> 원칙: 이들은 `signal`/데이터를 덮어쓰지 말고 **"검증 에러 + 데이터 보존"**으로 동작. 지금처럼 `intent=out_of_scope`로 만들어 클라가 슬롯을 날리게 하지 않는다.

**서버 [parse.ts](../server/src/routes/parse.ts)**
- 과거 시각(`isPastSlot`/`isPastTodayRequest`), 30분 단위(`hasUnsupportedMinuteUnit`), `beyond_window`/`over_duration` (`applySlotStateGuards`)
- 오전/오후 모호(`applyAmbiguousMeridiemSlotOverride`), campus 필수(`applyRequiredCampusGuard`), 학생회관 캠퍼스(`applyStudentCenterCampusClarification`)
- 공간코드 DB 보강(`applyExplicitSpaceCodeOverride`), 불가능 인원/시각

**백그라운드 [chatPolicies.ts](../extension/src/background/chatPolicies.ts) / [chatHandler.ts](../extension/src/background/handlers/chatHandler.ts)**
- 정원 preflight(`applyCapacityPreflight` — DB 사실), 종료시각 정규화(`normalizeSlotEndTime`), 신청서 길이(`applyApplicationLengthGuard`), draft 인원 동기화(`syncDraftHeadcountFromSlots`)

### 🟨 재검토 (제품 스코프 거절 — 살리되 데이터 불변 self-loop로)
**백그라운드 `applyChatSafetyOverride`** (영어 요청/반복예약/시설조건/제출후변경/특정실 가용창 (160–214)):
지원범위 밖 안내는 필요하나, **데이터 트랙을 비우지 말 것**. `signal=out_of_scope` self-loop(데이터 보존)로 통일.

---

## 6. 마이그레이션 순서 / 구현 상태

1. ✅ **와이어 추가(비파괴)**: `ParseResponse.signal`/`action`/`can_submit` 추가([schemas/parse.ts](../server/src/schemas/parse.ts), [shared/types.ts](../extension/src/shared/types.ts)). `intent` 병행 유지.
2. ✅ **서버 reducer 도입**: `deriveAction`+`intentToSignal`([application/state.ts](../server/src/application/state.ts)), 라우트 배선([routes/parse.ts](../server/src/routes/parse.ts)). 단위 검증 `npm run verify:derive`([scripts/verify-derive-action.ts](../server/scripts/verify-derive-action.ts), 첫탐색/cascade/alternative/accept/cancel/oos/게이트 커버).
3. ✅ **클라 thin화**: `useConversation.sendMessage`을 `result.action` 실행 + 데이터 보존으로 교체([useConversation.ts](../extension/src/sidepanel/hooks/useConversation.ts)). 🟥 휴리스틱(`shouldPreserveActiveSlots`/`shouldStartSearch`/`hasSlotSearchCue`/`mergeFilledSlots`/cascade reset/confirm 자동제출/request_alternative 라우팅) 삭제.
4. ✅ **버튼/자동제출**: [폼 채우고 제출]([DraftCard](../extension/src/sidepanel/components/cards/DraftCard.tsx) onSubmit) / [폼만 채우기](onPreview) 두 버튼 이미 존재. 채팅 자동제출 제거(accept→`fill_form`=미리보기). ⏳ *15→소수 phase enum 리네이밍은 순수 UI 코스메틱(derivePhase는 state 파생, intent 비참조)이라 보류 — 컴포저 라벨/ChatScene 분기 회귀 위험 회피.*
5. ✅ **하드 가드 디커플링**: `out_of_scope`가 누적 슬롯을 날리지 않게 서버([parse.ts](../server/src/routes/parse.ts) `makeOutOfScopeResult`+`deriveMissingRequired`)·클라(P3) 양쪽 수정. background `applyChatSafetyOverride`는 슬롯 보존 self-loop + `action:'none'` 강제([chatPolicies.ts](../extension/src/background/chatPolicies.ts)).
6. ✅ **정리 (LLM signal-native 전환)**: LLM 출력을 `signal` 네이티브로 전환 — 프롬프트 출력형식·signal 분류·규칙·few-shot 12개 전면 갱신([prompts.ts](../server/src/llm/prompts.ts)), LLM 스키마에서 `intent`/`missing_required`/`ready_to_search` 제거([client.ts](../server/src/llm/client.ts) `LLMRawResult`). 서버가 `missing_required`=`deriveMissingRequired`·`ready_to_search`=`isSearchReady`·`intent`=`signalToIntent`로 파생([routes/parse.ts](../server/src/routes/parse.ts) `ParseDraft`). 미사용 dead code `applyApplicationLengthGuard`/`applyApplicationCollectionPromptGuard`+헬퍼 제거([chatPolicies.ts](../extension/src/background/chatPolicies.ts)).
   - ✅ **`intent` 완전 제거**: 와이어(`ParseResponse`)·`Intent` enum·`signalToIntent`·shared `ParseResult.intent`·background `ctx.lastIntent`/DTO 전부 삭제. DB `conversation.last_intent` 컬럼 드롭(마이그레이션 `20260622000000_drop_conversation_last_intent`). 이제 `signal`이 유일한 화행 채널.
   - ✅ **실 LLM 회귀 검증 통과**(2026-06-22): signal/action/slots/cascade/accept→fill_form 7케이스 확인.
   - ✅ **`suggested_memory` 수락/거절 채팅 통일**: P2SuggestCard [적용]/[닫기] = `sendMessage('네, 그걸로 신청할게요')`/`sendMessage('아니요, 직접 입력할게요')`로 일반 `/parse` 흐름 경유. 별도 경로 제거 — 클라 `applySuggestedMemory`/`dismissSuggestedMemory`, background `memoryHandlers.ts`(파일 삭제)+serviceWorker 2 case, 메시지 타입 `PopupApply/DismissSuggestedMemory`·`ApplicationStateResponse`. 프롬프트 규칙 11에 거절 동작 추가. 실 LLM 검증: 수락→draft 채움(reuse_id=null)·거절→draft null+직접입력 유도 ✓.

---

## 7. 결정 확정 (2026-06-20)
- ✅ **`accept` = 폼만 채우기(`fill_form`)**. 실제 GLS 제출은 **버튼 전용**(채팅 자동 제출 제거). 준비 완료 상태에서 [폼만 채우기]/[폼 채우고 제출] 두 버튼 노출.
- ✅ **`search` 자동 발화 유지**: slots 완성 즉시 자동 탐색(결정 #1).
- ✅ **`request_alternative` = 다음 후보**(`next_candidate`). 새 탐색은 slots 변경 시에만. `no_candidate` 후 자동 조건확대 안 함(제안만).
- ✅ **재사용 제안(suggested_memory) 수락/거절 = 채팅 화행으로 통일**. 별도 `applySuggestedMemory`/`dismissSuggestedMemory` 핸들러 제거.
- ✅ **메모리 정정 완료**: `agent-state-model.md` 상단에 미구현 경고 + 본 문서를 단일 진실로 지정.

### phase 투영 최소 집합 (UI 파생 전용, 권위 state 아님)
`derivePhase` 15개 → 아래 투영으로 축소. 라벨/placeholder/hints는 여기서 매핑.
- 자동화 우선: `submitting` / `done` / `login(needed|expired)` / `searching` / `no_candidate` / `proposed`
- 그 외 데이터 트랙: `gathering`(필수 슬롯 미완 — 어느 슬롯인지로 placeholder 분기) / `collecting_app`(슬롯 완료·신청서 미완) / `ready`(canSubmit — 폼/제출 버튼)
