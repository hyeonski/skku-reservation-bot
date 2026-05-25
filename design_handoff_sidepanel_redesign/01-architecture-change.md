# 01. 아키텍처 변경 — popup → 사이드패널

## 왜 사이드패널인가

원안 (D-026, D-027) 은 popup 기반이었으나, 디자인 검토 중 다음 한계가 명확해졌습니다:

- popup은 포커스 잃으면 자동으로 사라짐 → 사용자가 GLS 페이지를 보거나 다른 작업을 하면 채팅 컨텍스트가 사라짐
- GLS 자동화가 도는 동안 (공간 검증·폼 자동 작성, 수 초~수십 초) 사용자가 진행 상황을 옆에서 볼 수단이 없음
- 사이드패널은 브라우저 우측에 고정으로 붙어있어 **GLS 페이지(왼쪽) ↔ 채팅(오른쪽)** 의 시각적 동기화가 자연스러움

D-026의 다른 원칙은 모두 유지됩니다:
- 사이드패널이 닫혀도 background SW가 자동화를 계속 진행
- 완료 시 `chrome.notifications`로 알림
- 진행 중 상태는 `chrome.storage.session`에 mirror

## manifest.json 변경

```json
{
  "manifest_version": 3,
  "name": "SKKU 공간예약 에이전트",
  "version": "0.1.0",
  "description": "자연어로 GLS 공간예약을 자동화합니다.",

  // 기존 action.default_popup 제거하거나 유지(선택). 사이드패널 단독 사용 권장.
  // popup도 함께 두면 사용자가 둘 다 띄울 수 있어 혼란. 사이드패널만 두는 것이 명확.
  "action": {
    "default_title": "SKKU 공간예약"
  },

  // 추가
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },

  "background": {
    "service_worker": "src/background/serviceWorker.ts",
    "type": "module"
  },

  // content_scripts: 변경 없음

  "permissions": [
    "storage",
    "tabs",
    "scripting",
    "notifications",
    "sidePanel"        // 추가
  ],

  "host_permissions": [
    "https://kingoinfo.skku.edu/*",
    "https://login.skku.edu/*",
    "http://localhost:8000/*"
  ]
}
```

## background service worker 변경

브라우저 액션 아이콘 클릭 시 사이드패널 열기:

```ts
// extension/src/background/serviceWorker.ts (추가)
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
```

기존 popup ↔ background 메시지 라우팅 (`POPUP_*` 타입들) 은 그대로 유지 — 단지 송신자가 popup이 아니라 sidepanel일 뿐, 메시지 채널(`chrome.runtime.sendMessage`)은 동일.

## 디렉터리 구조

```
extension/src/
├── sidepanel/          (신규 — popup/의 구조를 그대로 옮김)
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles.css
│   ├── components/
│   │   ├── ChatHeader.tsx
│   │   ├── ChatThread.tsx
│   │   ├── ChatComposer.tsx
│   │   ├── HintChips.tsx
│   │   ├── SessionList.tsx
│   │   ├── ReminderBanner.tsx
│   │   ├── Onboarding.tsx
│   │   └── cards/
│   │       ├── SearchProgressCard.tsx
│   │       ├── RecommendationCard.tsx
│   │       ├── DraftCard.tsx
│   │       ├── NoSpaceCard.tsx
│   │       ├── GLSLoginCard.tsx
│   │       └── P2SuggestCard.tsx
│   └── hooks/
│       ├── useConversation.ts        (popup/hooks에서 이동/확장)
│       └── useChatStateMachine.ts    (신규)
├── popup/                            (선택: 삭제하거나 deprecated 표시)
└── ... (background, content, shared 변경 없음)
```

### 기존 `extension/src/popup/` 처리 옵션

A. **완전 삭제** — 사이드패널만 운영. 가장 깔끔.
B. **유지하되 단순화** — popup은 "사이드패널 열기" 안내만 띄움. 사용자가 옛 클릭 습관으로 popup을 띄울 때 안내. 권장하지 않음(중복).
C. **재사용을 위해 components/hooks는 popup/ 그대로 두고 sidepanel/은 얇은 래퍼만**. 디자인이 크게 바뀌었으므로 적합하지 않음.

**A 권장.** Vite + @crxjs 환경에서는 manifest의 entry만 바꾸면 popup 디렉터리는 자동으로 빌드에서 빠집니다.

## 사이즈

사이드패널 컨테이너 너비는 Chrome이 결정(보통 320~520px 사이에서 사용자 조절 가능). 디자인은 **400px 기준**으로 작성됐고, 360~480px 범위에서 무리없이 동작하도록 반응형으로 짜야 합니다. 더 좁아지면 (320px) `.rec-meta`의 가로 배치를 세로로 떨어뜨리는 정도의 적응이 필요.

## 빌드/개발

기존 Vite + @crxjs 설정은 그대로 동작합니다. `vite.config.ts`는 manifest를 entry로 받으므로 manifest만 갱신하면 자동으로 새 진입점을 빌드.

개발 중에는 `chrome://extensions` 에서 확장 reload 후 브라우저 액션 아이콘 클릭 → 사이드패널 열림.
