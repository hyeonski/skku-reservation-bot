# 06. Mock vs Real — 무엇을 서버/GLS와 연결해야 하는가

프로토타입은 모든 데이터/응답을 클라이언트 안에서 mock 합니다. production 구현 시 다음 매핑을 따라 실제 시스템과 연결하세요.

## Mock된 것 → 실제 매핑

### 1. LLM parse 응답 (`parsePrompt` in `prototype/app.jsx`)

프로토타입은 클라이언트에서 정규식으로 슬롯 추출. 실제로는:

```ts
// 사용자 메시지 들어올 때마다
const res = await apiClient.post("/parse", {
  conversation_id,
  history: [...messages, { role: "user", content: userText }],
  now: new Date().toISOString(),
});
// res = { filled_slots, missing_required, intent, ready_to_search, assistant_message, application_state? }
```

`assistant_message`를 그대로 봇 메시지로 추가, `filled_slots`로 클라이언트 슬롯 state 업데이트, `intent`/`missing_required`/`ready_to_search`로 phase 전이 결정.

기존 코드: `extension/src/background/apiClient.ts`에 이미 `parseChat` 같은 함수가 있을 것 — 그대로 활용.

### 2. 슬롯 → 후보 공간 조회 (`candidates` 배열 in 프로토타입)

```ts
const spaces = await apiClient.get("/spaces", {
  headcount: slots.count,
  campusCode: slots.campusCode,  // 옵션
  buildingNo: slots.buildingNo,  // 옵션
  userOrgCode: clientPreference.orgCode,  // P2 — 옵션
});
// spaces = Array<Space>
```

`D-022 Space` 모델 그대로. 응답에 `useJojikName`, `contents`, `capacityMin/Max`, `limitTimeHHMM` 포함됨.

### 3. GLS 검증 (`iterateSearch`)

프로토타입은 setTimeout 시뮬레이션. 실제는 background SW가 candidate 하나씩 content script로 보냄:

```ts
// background → content (GLS 탭)
chrome.tabs.sendMessage(glsTabId, {
  type: "BG_CHECK_AVAILABILITY",
  candidate: { code, name, building },
  date: slots.date,
  startHour: parseInt(slots.start),
  endHour: parseInt(slots.end),
});

// content → background
{
  type: "CONTENT_AVAILABILITY_RESULT",
  code,
  available: boolean,
  conflicts: Array<{ gubun, info1, tm_term }>,  // dsGrdSub
}
```

기존 코드: `extension/src/background/glsCoordinator.ts` (이미 있을 것). 사이드패널이 background로 검증 시작 메시지 보내고, background는 후보를 직렬로 순회하면서 각 후보 검증 시도. 진행 상태는 `BG_STATUS_UPDATE` 메시지로 사이드패널에 broadcast하여 UI를 업데이트.

브로드캐스트 메시지 예:
```ts
{
  type: "BG_SEARCH_PROGRESS",
  conversation_id,
  currentIdx: number,
  candidates: Array<{ code, name, building, result }>,
  glsPhase: "searching" | "found",
  currentCode: string,
}
```

### 4. GLS 세션 체크

검증 시작 전, content script가 현재 URL 기반으로 1차 판단:

```ts
const isLoggedIn = !location.href.startsWith("https://login.skku");
const isGlsActive = typeof nexacro !== "undefined" && !!nexacro.getApplication();
```

`isLoggedIn === false` → background에서 사이드패널로 `LOGIN_NEEDED` 송신 → 사이드패널이 `GLSLoginCard` 메시지로 변환.

검증 도중 세션 만료는 content script가 form submit 시도하거나 다음 후보 클릭할 때 login.skku 로 리다이렉트 감지. 마찬가지로 `SESSION_EXPIRED` 송신 + currentIdx (재개 인덱스).

### 5. 로그인 완료 감지

```ts
// background SW
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.startsWith("https://kingoinfo.skku.edu") && tab.url.includes("/gaia")) {
    // 로그인 완료된 것으로 판단
    sidePanelBroadcast({ type: "LOGIN_COMPLETE", tabId });
  }
});
```

사이드패널은 `LOGIN_COMPLETE` 받으면 phase가 `awaiting-login`이었으면 → 새 searching 시작, `awaiting-relogin`이었으면 → resumeIdx부터 iterate 재개.

### 6. 신청 메타 P2 추천 (P2 기능)

`/parse` 응답의 `application_state.recommendation` 필드. 서버는 사용자의 과거 완료된 대화들을 분석해서 가장 빈도 높은 단체+행사+사용목적 조합을 추천 후보로 내려준다. confidence 임계값(예: 0.7) 이상이면 사이드패널에서 P2SuggestCard 노출.

P1 단계에서는 항상 `recommendation: null`로 두고 UI만 코드 안에 준비.

### 7. 폼 자동 작성 + 제출

기존 코드: `extension/src/content/formFiller.ts` + `glsAgent.ts`. 사이드패널이 background로 `START_SUBMISSION` 보내면 진행. 진행 상태는 `SUBMIT_STATUS` (filling → saving → saved) 로 broadcast.

### 8. P3 패턴 리마인드

신설 필요. 데이터 흐름:

- 서버에서 사용자의 완료 대화 이력을 주기적으로 분석 (예: 매일 자정 cron, 혹은 사이드패널 진입 시 lazy)
- 패턴 발견 시 `Reminder` row 생성 (신설 모델)
- 사이드패널 진입 시 `GET /reminders` 호출 → 활성 리마인드 받음
- 사용자가 "네 예약할게요" → 새 대화 시작 + 미리 채워진 슬롯
- "나중에" → `POST /reminders/:id/dismiss`

패턴 감지 로직은 P3 진입 시 별도 설계. 최소 기준:
- 같은 요일 + 같은 시간대 + 같은 단체 + 같은 행사 = N회 이상 연속 (N = 3 또는 4)
- 다음 발생 예상일 (current_week + 1)에 이미 예약된 게 없다

### 9. 세션 목록

기존 `D-024 GET /conversations` 그대로. 응답에 `status`, `lastFilledSlots`, `lastIntent`도 활용해서:
- title: 첫 슬롯 채워진 시점 또는 완료 시점의 자연어 요약 — 서버가 LLM에 한 번 요약 호출하거나, 클라이언트가 휴리스틱으로 (`{date} {event}` 또는 history 마지막 사용자 메시지의 첫 부분)
- preview: 완료된 경우 결과 ("학생회관 401호 예약 완료"), 진행 중인 경우 마지막 봇 메시지, abandoned인 경우 사용자의 마지막 메시지
- when: 상대시간 ("방금 전", "1시간 전", "3일 전", "2주 전")

### 10. 대화 삭제

`D-024 DELETE /conversations/:id` — 논리 삭제. 클라이언트는 낙관적 UI (1.5초 [✓] 표시 후 목록에서 제거).

---

## 환경별 차이

### 개발 (`pnpm dev`)

- 서버 `http://localhost:8000` 직접 호출
- GLS는 진짜 GLS — 사용자 직접 로그인
- 사이드패널 진입은 `chrome://extensions` 의 reload + 액션 아이콘 클릭

### 데모 (학생회/동아리 알파테스트)

- 동일하나 서버는 배포된 인스턴스

### 프로토타입 (이 디자인 파일들)

- 모든 데이터 mock — 서버, GLS, 자동화 모두 fake
- Tweaks 패널의 점프 버튼으로 다양한 시나리오 시연

---

## 사이드패널이 받는 메시지 정리

D-026의 메시지 타입 정의에 추가/변경할 항목:

| 새 메시지 | 방향 | 의미 |
|---|---|---|
| `SIDEPANEL_OPEN_REQUEST` | sidepanel → bg | 사이드패널이 열렸음 (상태 복원용) |
| `BG_SESSION_RESTORE` | bg → sidepanel | chrome.storage.session에 저장된 진행 중 상태 복원 |
| `LOGIN_NEEDED` | bg → sidepanel | GLS 세션 없음 — `GLSLoginCard variant="needed"` 표시 |
| `SESSION_EXPIRED` | bg → sidepanel | 검증 도중 세션 만료 — `variant="expired"` + resumeIdx |
| `LOGIN_COMPLETE` | bg → sidepanel | 사용자가 GLS 로그인 완료 — 진행 재개 |
| `BG_SEARCH_PROGRESS` | bg → sidepanel | 후보 검증 진행 상태 |
| `BG_REMINDER_AVAILABLE` | bg → sidepanel | P3 — 패턴 리마인드 있음 |

기존 D-026 메시지들은 `POPUP_*` → `SIDEPANEL_*` 또는 일반화 (`UI_*`) 로 이름 변경 권장.
