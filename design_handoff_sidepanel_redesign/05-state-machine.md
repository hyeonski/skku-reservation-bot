# 05. 채팅 상태 머신

채팅 화면은 `phase` 라는 단일 상태에 의해 컨텐츠가 결정됩니다. `prototype/app.jsx`의 `ChatScene` 컴포넌트 참고.

## phase enum

```ts
type ChatPhase =
  | "starter"            // 빈 채팅, 첫 메시지 대기
  | "slots-end"          // 종료시간 묻는 중
  | "slots-count"        // 인원 묻는 중
  | "awaiting-login"     // GLS 로그인 필요 — 사용자가 로그인 완료 대기
  | "searching"          // 후보 공간 직렬 검증 중
  | "awaiting-relogin"   // 검증 중간에 세션 만료 — 재로그인 대기
  | "recommended"        // 추천 카드 표시됨, 사용자 응답 대기
  | "meta-p2"            // P2 추천 카드 표시됨, accept/decline 대기
  | "meta-collect"       // 신청 메타 채팅으로 수집 중
  | "draft"              // 초안 확정 후 사용자 confirm/edit 대기
  | "submitting"         // GLS 제출 진행 중
  | "done"               // 정상 종료 — 입력 비활성
  | "failed-retry"       // 후보 없음, 조건 조정 대기
  | "failed"             // 사용자가 재시도도 포기 (현재 미사용 — 사용 시 "취소했어요" 메시지)
```

## 전이

```
starter
  ├── (사용자 발화 파싱 결과) ──→
  │     slots 다 채워짐         ──→ searching
  │     end_time 누락            ──→ slots-end
  │     count 누락               ──→ slots-count
  │     모두 누락                ──→ slots-count → slots-end
  │
slots-end / slots-count
  └── 사용자 응답              ──→ searching

searching
  ├── 로그인 안 됨 감지         ──→ awaiting-login
  ├── 후보 찾음                 ──→ recommended → (P2 추천 가능 시) meta-p2 / 아니면 meta-collect
  ├── 모든 후보 점유            ──→ failed-retry
  └── 중간에 세션 만료          ──→ awaiting-relogin

awaiting-login
  └── 로그인 완료              ──→ searching (처음부터)

awaiting-relogin
  └── 로그인 완료              ──→ searching (멈춘 인덱스부터 재개)

meta-p2
  ├── accept                  ──→ draft (suggested fields 표시)
  └── decline                 ──→ meta-collect

meta-collect
  └── 사용자가 단체+행사 설명  ──→ draft

draft
  ├── "제출"                   ──→ submitting
  ├── "행사명을 X로" 등 수정    ──→ draft (refresh)
  ├── "다른 공간"              ──→ (다른 후보 탐색) → 현재는 안내 메시지만
  └── "취소"                   ──→ done (취소했어요)

submitting
  └── GLS 응답                 ──→ done

failed-retry
  ├── "100명으로 줄여서 다시"   ──→ slots 업데이트 + retrySearch → searching
  └── "취소"                   ──→ done
```

## 슬롯 (Slot) 데이터

D-021 정의대로:

```ts
interface Slots {
  count: number | null;       // headcount
  date: string | null;        // "5/21(목)" 또는 "2026-05-21" — 표시는 한글, 백엔드 전송은 ISO
  start: string | null;       // "18:00"
  end: string | null;         // "20:00"
  duration_min: number | null;
  building: string | null;
  space: string | null;
}
```

`/parse` 응답의 `filled_slots`를 그대로 클라이언트 state에 mirror.

## GLS 자동화 상태와의 동기화

채팅 phase와 별도로, GLS 페이지의 시각적 표시 상태를 관리:

```ts
interface GLSState {
  phase: "idle" | "searching" | "found" | "filling" | "saving" | "saved" | "logged-out" | "logging-in";
  currentCode?: string;     // 현재 검증/선택 중인 공간 코드
}
```

이 상태는 background SW에서 content script로 가는 메시지(D-026의 `BG_CHECK_AVAILABILITY` 등)와 1:1 동기화. 사이드패널은 background SW로부터 status broadcast를 받아 `glsState` 업데이트.

| `chat phase` | `glsState.phase` (보통) |
|---|---|
| starter | idle |
| slots-* | idle |
| awaiting-login | logged-out |
| searching | searching → found |
| awaiting-relogin | logged-out (재로그인 중에는 logging-in) |
| meta-* / draft | found (계속 강조 유지) |
| submitting | filling → saving → saved |
| done | idle |

GLS 페이지에서 UI 강조 (행 하이라이트, 폼 자동 채움 시각화)는 content script가 이미 함 — 사이드패널의 GLS 페이지 placeholder는 디자인 시연용일 뿐, 실제 production에서는 진짜 GLS DOM이 들어감.

## 메시지 시퀀스 — 정상 케이스

(타이밍은 ms, `awaitSequence` 헬퍼로 추상화)

```
User: "내일 6시 20명 학생회 회의"

Bot typing 900ms
Bot: "5/21(목) · 18:00 · 20명, 몇 시까지 사용하시나요?"
Hints: [20시까지] [2시간] [한 시간만]

User: "20시까지"

Bot typing 800ms
Bot: "5/21(목) 18:00–20:00, 20명 확인했어요. 빈 공간 찾아볼게요."
[SearchProgressCard inserted]
GLS state: searching, current=230304
... 1200ms 후보별로 진행 ...
GLS state: searching, current=230401 → found

[RecommendationCard inserted (학생회관 401호)]

500ms 후 (P2 가능 시)
[P2SuggestCard inserted]

User: "네, 같게요"

[DraftCard inserted with suggested fields]
Bot: "좋아요. 지난번 내용 그대로 채웠어요. 확인하고 제출해주세요."
Hints: [제출] [행사명만 바꾸기] [다른 공간]

User: "제출"

[SubmitProgressCard inserted]
GLS state: filling → 1200ms → saving → 1400ms → saved
Bot: "✓ GLS 예약 신청을 완료했어요."
phase = done
OS notification fires
```

## 메시지 시퀀스 — GLS 로그인 필요

```
User: "내일 6시 20명 학생회 회의"
(slots 다 채워진 케이스 가정)

Bot: "5/21(목) 18:00–20:00, 20명, 빈 공간 찾아볼게요."
Bot typing 500ms
Bot: "GLS 세션 확인 중…"
(content script로 세션 체크 요청 → logged-out 응답)

500ms 후
Bot: "GLS 로그인이 풀려있어요. 새 탭에서 잠깐 로그인해주시면 이어서 진행할게요."
[GLSLoginCard variant="needed" inserted]
phase = awaiting-login
Composer disabled

(사용자가 [GLS 로그인 열기] 클릭)
→ chrome.tabs.create({url: "https://kingoinfo.skku.edu"})
→ background SW가 해당 탭의 URL 변경을 listen
→ login.skku.edu → kingoinfo.skku.edu 로 돌아오면 "로그인됨"으로 판단
→ 사이드패널에 LOGIN_COMPLETE 메시지

card props: loggingIn=true 동안 "로그인 확인 중…"
Bot: "✓ 로그인 확인했어요. 빈 공간 찾아볼게요."
phase = searching
[정상 검증 시퀀스 진행]
```

## 메시지 시퀀스 — 세션 만료 (검증 도중)

```
[Search 시작, 1번째 후보 검증 통과 (점유)]
[2번째 후보 검증 시도]
→ content script가 로그인 화면 리다이렉트 감지
→ background SW에 SESSION_EXPIRED, currentIdx=1

[GLSLoginCard variant="expired" inserted]
phase = awaiting-relogin
GLS state: logged-out

(사용자 재로그인 → LOGIN_COMPLETE)

Bot: "✓ 다시 로그인됐어요. 멈췄던 지점부터 이어서 진행할게요."
phase = searching
iterateSearch(resumeIdx=1) → 2번째 후보부터 재시도
```

## 메시지 시퀀스 — 후보 다 점유 (실패 → 재시도)

```
[모든 후보 검증 실패]
[NoSpaceCard inserted]
Bot: "조건을 조정해서 다시 찾아볼까요? 아래 옵션을 누르거나 직접 알려주셔도 돼요."
phase = failed-retry
Hints: ["100명으로 줄여서 다시", "시간대 19–21시로", "다음 주 같은 요일로"]

User: "100명으로 줄여서 다시"

(slots.count = 100 으로 업데이트)
Bot: "100명으로 다시 찾아볼게요."
[새 SearchProgressCard inserted (이전 카드는 frozen)]
phase = searching
[정상 검증 시퀀스]
```

## 메시지 시퀀스 — 메타 수정

```
[DraftCard 표시 중]
phase = draft

User: "행사명을 정기회의로"

(parseModification → {intent: "edit", field: "event", value: "정기회의"})
draft.event = "정기회의"
Bot: "행사명을 \"정기회의\"로 바꿨어요."
[새 DraftCard inserted (이전 카드는 superseded)]
phase = draft (유지)
Hints: [제출] [다른 곳 수정] [다른 공간]

User: "제출"
→ submitting
```

`parseModification` 정규식은 `prototype/app.jsx` 참고. 실제 production에서는 **LLM이 modify_slot intent로 응답**하는 것을 권장 (D-021 intent enum에 이미 있음). 정규식은 클라이언트 측 fallback.

## 메시지 mirror (D-018)

매 메시지 송수신 시 `POST /conversations/:id`로 history upsert. 진행 중 대화의 권위는 클라이언트, 서버는 mirror.

페이로드는 D-018에 정의된 형태:
```ts
{
  conversation_id: string,
  history: Array<{role: "user" | "assistant", content: string}>,
  now: string  // ISO
}
```

카드는 메시지가 아니라 별도 type — `role`에 안 들어가고 `assistant_metadata`로 별도 저장하는 것을 권장. 단순화하려면 `role: "assistant", content: "[card:search-progress]"` 같은 마커 텍스트로 mirror할 수도 있지만, **LLM에 입력으로 들어갈 history와 UI 렌더링용 history를 분리**하는 것이 깔끔.

## phase 라벨 (헤더 부제용)

```ts
const phaseLabel: Record<ChatPhase, string> = {
  starter: "시작",
  "slots-end": "정보 확인",
  "slots-count": "정보 확인",
  "awaiting-login": "로그인 대기",
  searching: "탐색 중",
  "awaiting-relogin": "재로그인 대기",
  recommended: "후보 확인",
  "meta-p2": "신청 메타",
  "meta-collect": "신청 메타",
  draft: "검토",
  submitting: "제출 중",
  done: "완료",
  "failed-retry": "재시도",
  failed: "실패",
};
```

## composer placeholder

```ts
const phasePlaceholder: Record<ChatPhase, string> = {
  starter: "예: 내일 6시 20명 회의실",
  "slots-end": "예: 20시까지 / 2시간",
  "slots-count": "몇 명이서 사용하세요?",
  "meta-collect": "단체와 행사명을 알려주세요",
  draft: "수정 사항이나 \"제출\"이라고 입력하세요",
  "failed-retry": "조정할 조건을 알려주세요 (인원/시간/날짜)",
  searching: "탐색 중…",
  "awaiting-login": "GLS 로그인 후 진행됩니다",
  "awaiting-relogin": "GLS 로그인 후 진행됩니다",
  submitting: "제출 중…",
  done: "대화가 종료되었어요",
  failed: "대화가 종료되었어요",
  recommended: "메시지 입력…",
  "meta-p2": "메시지 입력…",
};
```
