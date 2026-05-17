# 결정 로그 (Decision Log)

프로젝트 진행 중 내린 결정을 시간순으로 기록한다. 각 항목은 **결정 / 배경 / 대안 / 영향** 구조를 따른다. PRD는 [PRD.md](PRD.md) 참조.

---

## D-001. 서버 언어: TypeScript

- **일자**: 2026-05-12
- **결정**: 서버를 TypeScript로 작성한다.
- **배경**: 크롬 확장이 JS/TS이므로 언어를 통일하면 타입·스키마(ReservationRequest 등)를 양측에서 공유 가능. 팀이 Express/Nest/Next 경험이 있어 학습 비용도 낮음.
- **대안**: PRD §4-2 원안의 Python + FastAPI. 두 언어로 스키마를 이중 정의해야 한다는 단점이 있었음.
- **영향**: PRD §4-2 스택 항목 변경. 서버 코드 전반의 도구 체계(타입, 빌드, 패키지 매니저)가 Node 생태계로 결정됨.

---

## D-002. 서버 프레임워크: Fastify

- **일자**: 2026-05-12
- **결정**: 서버 프레임워크로 Fastify를 사용한다.
- **배경**: Express와 사고방식이 거의 동일해 학습 비용이 낮고, JSON Schema 기반 검증과 Zod/TypeBox 연동이 1급 기능. Phase 2에서 Prisma + Zod + Fastify가 표준 조합이라 자료가 풍부.
- **대안**:
  - **Express**: 타입/검증 통합이 약함. 굳이 선택할 이유 없음.
  - **Hono**: 초경량, 엣지 배포 친화적이지만 우리는 평범한 Node 서버라 이점 없음. 생태계도 얇음.
  - **Nest**: 데코레이터/모듈 시스템이 MVP 규모에 과함.
- **영향**: 서버 라우팅·미들웨어·플러그인 구조가 Fastify 컨벤션을 따름.

---

## D-003. ORM: Prisma

- **일자**: 2026-05-12
- **결정**: ORM으로 Prisma를 사용한다.
- **배경**: 타입 안전성과 마이그레이션 워크플로우가 깔끔. Phase 2에서 예약 이력/선호 저장 시 즉시 활용 가능.
- **대안**: 검토하지 않음 (TypeScript 진영 표준에 가까움).
- **영향**: `server/prisma/schema.prisma`가 DB 스키마의 단일 소스. Phase 1에선 거의 비어 있고 Phase 2에서 모델 추가 예정.

---

## D-004. 프로젝트 최상위 구조: `extension/` + `server/` 분리

- **일자**: 2026-05-12
- **결정**: 레포 최상위를 `extension/`, `server/`, `docs/`로 분리한다.
- **배경**: 런타임·언어·배포 경로가 다르므로 최상위에서 끊는 게 명확함. 향후 모바일 앱(PRD §3-1 시나리오 C)이 들어와도 `apps/mobile`을 동등하게 추가하기 좋음.
- **대안**: `server/`만 하위로 두는 평탄한 구조 — 가볍지만 확장성이 떨어짐.
- **영향**: 확장의 모든 코드는 `extension/` 아래, 서버는 `server/` 아래에 위치.

### Phase 1 디렉터리 윤곽 (D-016·D-017 반영)

```
skku-reservation-bot/
├── extension/
│   ├── manifest.json           # Vite + @crxjs entry
│   ├── vite.config.ts
│   ├── tsconfig.json           # paths: @gls/* → ../shared/gls/*
│   ├── src/
│   │   ├── popup/              # 채팅형 UI
│   │   ├── background/         # Service Worker
│   │   ├── content/
│   │   │   ├── contentScript.ts
│   │   │   ├── glsAgent.ts     # 탐색/예약 오케스트레이션
│   │   │   └── formFiller.ts
│   │   └── shared/             # apiClient, messages, types (확장 내부 공유)
│   └── (확장 자체 doc 없음 — 모든 문서는 최상위 docs/ 에)
├── server/
│   ├── prisma/schema.prisma    # MySQL, Space 모델 포함
│   ├── tsconfig.json           # paths: @gls/* → ../shared/gls/*
│   ├── scripts/
│   │   └── scrape-spaces.ts    # D-015: 시딩 스크립트 (개발자 1회 실행)
│   └── src/
│       ├── index.ts            # Fastify entry
│       ├── routes/             # /parse, /spaces 등
│       ├── llm/                # DeepSeek 클라이언트
│       └── schemas/            # Zod
├── shared/
│   └── gls/                    # D-017: 양 프로젝트가 타입·상수만 import
│       ├── nexacroPaths.ts     # Nexacro 컴포넌트 id suffix 사전 (M-코드, cboBuildCd 등)
│       └── schemas.ts          # dsCboSpace, dsGrdSub row 타입 + toNumber 헬퍼
└── docs/
    ├── PRD.md
    ├── DECISIONS.md
    └── GLS_DOM_NOTES.md         # PoC 결과 — 자동화 시퀀스·데이터셋·셀 클릭 동작
```

---

## D-005. Phase 1 MVP 범위: 인원 기반 최적 할당 포함

- **일자**: 2026-05-12
- **결정**: Phase 1에 인원 기반 최적 할당까지 포함한다. 인원·정확한 시간 등 누락 정보는 **채팅 멀티턴**으로 사용자에게 되묻는다.
- **배경**: 공간 비효율(쏠림) 방지가 PRD의 핵심 차별점 중 하나이며, 인원 기반 할당이 없으면 "기존 GLS와 다를 게 없는" MVP가 됨. 멀티턴 되묻기는 자연어 입력의 누락을 보완하기 위한 필수 장치.
- **영향**: P1 LLM 프롬프트가 단순 추출이 아닌 **누락 슬롯 식별 → 후속 질문 생성**까지 담당해야 함. 확장 UI는 채팅형(아래 D-006)이어야 함.

---

## D-006. 에이전트 UI: 채팅형 멀티턴

- **일자**: 2026-05-12
- **결정**: 확장 팝업을 **채팅형 멀티턴 인터페이스**로 구성한다. 입력 폼 방식은 사용하지 않는다.
- **배경**: D-005에서 인원·시간을 대화로 보완하기로 했고, PRD §3-1의 "다른 곳 보여줘" 같은 재탐색 흐름도 채팅형이 자연스러움.
- **영향**: `popup/`은 채팅 메시지 리스트 + 입력창 컴포넌트. 대화 컨텍스트(이전 발화) 유지가 필요하므로 `chrome.storage.session` 또는 메모리 상태 관리 설계가 들어감.

---

## D-007. LLM 모델: DeepSeek-Chat (DeepSeek V3)

- **일자**: 2026-05-12
- **결정**: 1차 LLM으로 `deepseek-chat` (DeepSeek V3)를 사용한다.
- **배경**: 저비용 옵션 중 한국어 자연어 파싱 품질이 합리적이라 판단. PoC로 사용한 뒤 성능이 부족하면 대체 모델 검토.
- **영향**: `server/src/llm/client.ts`는 DeepSeek 호환 엔드포인트(OpenAI 호환 API)를 기본 어댑터로 구현. 환경 변수로 모델·키 주입.

---

## D-008. DB: MySQL (개인 서버 + 로컬)

- **일자**: 2026-05-12
- **결정**: DB는 MySQL을 사용한다. 운영은 개인 MySQL 서버, 개발은 로컬에서도 동작.
- **배경**: 사용자 보유 인프라.
- **영향**: `server/prisma/schema.prisma`의 `provider`를 `mysql`로 변경. `DATABASE_URL` 형식도 MySQL 커넥션 문자열로.

---

## D-009. 사용자 식별: 확장 설치 시 UUID 부여 (별도 계정 시스템 없음)

- **일자**: 2026-05-12
- **결정**:
  - 확장이 최초 설치/실행 시 UUID를 생성해 `chrome.storage.local`에 저장하고, 서버 호출의 사용자 식별자로 사용한다.
  - 별도 회원가입/로그인 시스템은 만들지 않는다.
  - **GLS 로그인은 사용자가 직접 수행**한다. 우리는 GLS 계정을 관리하지 않는다.
- **배경**: 예약 이력·선호 데이터는 익명 식별자에 묶여도 충분. 본인 인증 필요성 없음. 확장을 재설치하면 이력이 초기화되는 트레이드오프는 수용.
- **영향**:
  - 서버 API는 모든 요청에 `X-Client-Id` 헤더(또는 body 필드) 형태로 UUID를 받는다.
  - DB의 사용자 키는 이 UUID 문자열. 별도 user 테이블 인증 컬럼 없음.
  - GLS 세션은 사용자 브라우저 쿠키에만 존재 (PRD 원칙 유지).

---

## D-010. GLS 자동화 범위 (Phase 1)

- **일자**: 2026-05-12
- **결정**: Phase 1에서 다음 DOM 자동화를 모두 구현한다.
  1. 확장에서 GLS 페이지 열기
  2. 로그인 화면 감지 시 사용자에게 로그인 유도 (자동 로그인 안 함)
  3. 채팅으로 수집된 조건(날짜·시간·인원·건물 등)을 토대로 **공간 후보군 조회**
  4. 후보 공간 각각의 **예약 가능 여부 확인** (시간표 조회)
  5. 선택된 공간에 대해 **예약 신청 폼 작성 및 제출**
- **영향**: 현재 구현은 `extension/src/content/bridgeMainWorld.ts` + `glsAgent.ts`를 중심으로 DOM/Nexacro 시퀀스를 분리한다. 초기 `selectors.ts` 가정은 D-017 개정으로 폐기되었다.

---

## D-011. 반려 플로우 미고려

- **일자**: 2026-05-12
- **결정**: PRD §3-2의 반려 감지 및 재신청 플로우는 Phase 1 범위에서 제외한다.
- **배경**: 학기 내 우선순위. 신청 후 결과는 사용자가 직접 GLS에서 확인.
- **영향**: 폴링 주기, 반려 사유 파싱, 반려 이력 누적 모두 구현하지 않음. 향후 단계에서 재검토.

---

## D-012. 확장만 만든다 (앱 미개발)

- **일자**: 2026-05-12
- **결정**: 학기 내에는 크롬 확장만 개발한다. PRD §3-1 시나리오 C의 모바일 앱은 미래 계획으로만 언급.
- **영향**: 레포 구조에서 `apps/` 추상화는 도입하지 않고 최상위 `extension/` 유지.

---

## D-013. Phase 1 핵심 대화·예약 흐름 (확정)

- **일자**: 2026-05-12
- **결정**: Phase 1은 아래 흐름으로 동작한다. **"예약 자동화 end-to-end가 동작한다"** 가 P1의 최우선 목표이며, 우선순위 알고리즘·반려 처리 등 부가 로직은 모두 후순위.

### 대화 슬롯 채우기 (멀티턴)
필수 탐색 슬롯: `날짜`, `시작시간`, `종료시간`(또는 `duration`), `인원`.
1. 사용자: "언제 공간 예약해줘"
2. 봇: "몇 명인가요?"
3. 사용자: "○명"
4. 봇: "언제(날짜) 사용하시나요? 몇 시부터 몇 시간 동안 사용하시나요?" (시작+종료 또는 시작+duration 둘 다 허용)
5. 사용자가 응답하면 슬롯 충족 → 탐색 단계로.

> 사용자의 최초 발화에 슬롯이 일부 또는 전부 포함될 수도 있다. LLM은 누락된 슬롯만 식별해 되묻는다.

### 탐색·예약 시퀀스
1. **DB 필터**: 인원에 맞는 공간 후보 리스트를 DB에서 추출. 캠퍼스·건물·공간 자연어 슬롯이 있으면 함께 필터링한다.
2. **순회**: 후보 리스트를 하나씩 GLS에서 예약 가능 여부 조회. 현재 구현은 데모 편의상 서버 후보를 1회 shuffle 한 뒤 직렬 검증한다.
3. **첫 가능 공간 발견 시**: 채팅 아래 별도 추천 카드에 공간 요약을 표시한다. 후보 리스트를 채팅 로그에 길게 누적하지 않는다.
4. **신청 메타 수집**: 신청서에 필요한 `행사구분`, `주관단체`, `행사명`, `사용목적`은 탐색 슬롯과 분리해 다룬다.
5. **초안 생성**: 사용자의 현재/직전 발화에 단체/행사 설명이 있으면 바로 신청 초안을 만들고, 없으면 "신청서에는 어떤 단체의 어떤 행사로 넣을까요?" 같은 상위 질문 1회로 수집한다.
6. **과거 대화 재사용**: 완료된 과거 대화의 확정 신청 정보는 새 대화에서 `추천만` 할 수 있다. 자동 적용은 하지 않고, 사용자가 수락한 경우에만 초안으로 복사한다.
7. **수정 방식**: 신청 메타 수정은 인라인 폼이 아니라 채팅 명령으로만 처리한다. 예: "행사명은 운영위원회 회의로", "주관단체는 총학생회로".
8. **제출**: 사용자가 카드에서 요약 초안을 확인하면 GLS 신청서를 자동 작성하고 제출한다.
9. **불가능 시**: 다음 후보로 이동.
10. **모두 불가능 시**: "조건에 맞는 공간이 없습니다" 응답 + 다른 액션 유도 채팅 (조건 조정 제안 등).

### 세션 UX
- popup은 초기화 버튼 대신 **대화 선택 버튼**으로 최근 대화 10개를 보여준다.
- 새 대화는 버튼을 누르는 즉시 목록에 생기지 않고, **첫 메시지가 전송된 순간** 세션 이력에 등록된다.
- 각 대화는 독립 `conversation_id`를 가지며, 활성 세션 전환 시 popup snapshot을 복원한다.
- 대화 이력은 삭제 가능하며, 삭제된 대화는 신청 메타 추천에도 다시 쓰지 않는다.

### P1에서 의도적으로 빼는 것
- 우선순위 알고리즘 (선호 기반 정렬 등 — Phase 2로)
- 반려 감지 (D-011)
- 동시 여러 후보 병렬 조회 (직렬 처리로 시작)

---

## D-014. 공간 메타데이터 DB 도입

- **일자**: 2026-05-12
- **결정**: 공간(강의실/회의실) 정보를 서버 DB에 테이블로 보관한다. 최소 컬럼: `id`, `건물명`, `호실`, `정원(capacity)`, `이용가능시간대` 등.
- **배경**: D-013의 "DB에서 인원에 맞는 공간 추출" 단계는 메타데이터가 있어야 가능. GLS는 시간별 점유 현황을 보여주지만, **공간 정원 일람**을 효율적으로 가져오는 API는 없으므로 우리 쪽에 미러를 둔다.
- **시딩 방식 (미정, 별도 결정 필요)**:
  - 옵션 A: GLS DOM을 크롤링해 일괄 시딩하는 스크립트 작성
  - 옵션 B: 학교 공개 자료(편람·건물 정보)에서 수동/반자동 수집
  - 옵션 C: 사용하며 점진적으로 채움 (lazy seeding)
- **영향**:
  - `server/prisma/schema.prisma`에 `Space` 모델 추가 (Phase 1 필수 — P2로 미루지 않음)
  - 시딩 스크립트 작성 필요. 시딩 완료가 P1 동작의 선결 조건.

---

## D-015. 공간 메타데이터 시딩: GLS 스크래핑 스크립트 (옵션 A)

- **일자**: 2026-05-12
- **결정**: D-014의 시딩 방식으로 **옵션 A — GLS DOM 크롤러 스크립트**를 채택한다. 캠퍼스·건물별로 GLS의 공간대여신청 페이지를 순회하며 호실 목록·정원·이용가능 시간대 등을 추출해 DB에 적재한다.
- **배경**:
  - 수동 수집(옵션 B)은 학교 자료가 분산되어 있고 정원 정보가 산발적임.
  - Lazy seeding(옵션 C)은 첫 사용자 경험이 비어 있어 P1 데모가 어려움.
  - D-010에서 어차피 GLS DOM 자동화 자산이 만들어지므로, 최소한 경로 상수와 데이터셋 타입은 재사용하는 편이 낫다.
- **위치**: `server/scripts/scrape-spaces.ts` (또는 별도 `scripts/` 최상위 — 아래 미결).
- **출력**: `Space` 테이블에 upsert. 멱등하게 동작해야 함(여러 번 돌려도 중복 없음).
- **영향**:
  - 시딩 완료가 P1 end-to-end 동작의 선결 조건.
  - 현재 구현 기준 공유 범위는 `shared/gls/`의 경로 상수 + 데이터셋 타입까지다. 자동화 함수 본체는 실행 환경 차이로 공유하지 않는다(D-017 개정).

### 시딩 스크립트의 sub-결정 (모두 확정, 2026-05-12)

1. **인증 처리: 옵션 A1 채택**. 개발자가 직접 로그인된 브라우저에서 세션 쿠키를 복사해 스크립트에 주입하고 1회 실행한다. 시딩 결과만 DB에 들어가면 됨. 자격증명은 환경에 상주하지 않음.
   - 함의: 스크립트는 쿠키를 인자/환경변수로 받아 HTTP 요청 또는 헤드리스 브라우저로 GLS DOM을 순회한다. dotenv에 ID/PW를 두지 않는다.
2. **스크립트 위치: `server/scripts/`**. Prisma 클라이언트·DB 커넥션·tsconfig를 그대로 재사용. 별도 패키지 분리 없음.
3. **데이터 갱신 주기: 개발자 판단으로 수동 재실행**. 학기마다 최소 1회 돌리는 것을 목표로 하되 자동 스케줄은 두지 않음. 스크립트는 멱등 upsert로 작성.
4. **공유 전략: 부분 공유 (tsconfig paths 방식)**. `shared/gls/`에는 Nexacro 경로 상수와 데이터셋 타입만 두고, `extension/`, `server/`가 각자의 `tsconfig.json`에 `paths` 매핑(`@gls/*` → `../shared/gls/*`)을 설정해 import한다. 자동화 함수 본체는 각 실행 환경에 인라인 유지한다 (D-017 개정).

---

## D-016. 확장 빌드 도구: Vite + @crxjs/vite-plugin

- **일자**: 2026-05-12
- **결정**: 크롬 확장 빌드는 **Vite + `@crxjs/vite-plugin`** 조합을 사용한다.
- **배경**:
  - `manifest.json`을 entry로 인식해 popup/background/content script 빌드를 자동 처리
  - popup HMR이 채팅 UI 개발 속도를 체감 가능하게 향상시킴
  - tsconfig `paths`가 즉시 동작 → D-015의 셀렉터 공유 전략과 자연스럽게 결합
  - 크롬 확장 + TS 조합의 사실상 표준 셋업이라 자료가 풍부
- **대안**:
  - **tsc 단독**: npm 라이브러리 번들링 불가, popup HTML/CSS 수동 처리 부담
  - **esbuild 스크립트**: 빌드 스크립트를 직접 짜야 함 (entry/HTML/HMR)
  - **WXT**: 매력적이나 신규 컨벤션 학습 비용이 학기 일정상 부담
  - **Webpack**: 2026년 시점에 새로 시작할 이유 없음
- **영향**:
  - `extension/vite.config.ts`, `@crxjs/vite-plugin` 설정 추가
  - `extension/manifest.json`이 빌드 entry 역할
  - 확장 디렉터리는 일반적 Vite 구조 따름

---

## D-017. GLS 자동화 공유 모듈 위치: 최상위 `shared/gls/`

- **일자**: 2026-05-12 (PoC 반영 개정 — "셀렉터·파서" → Nexacro 헬퍼·경로 사전)
- **개정**: 2026-05-14 — 실행 함수 공유 불가 확인, `nexacroActions.ts` 제거
- **결정**: GLS 자동화에 필요한 **타입·상수**를 최상위 `shared/gls/`에 두고, `extension/`과 `server/`가 tsconfig `paths` (`@gls/*`)로 import한다.
- **모듈 구성**:
  - `nexacroPaths.ts` — Nexacro 컴포넌트 id suffix 사전 (M-코드 메뉴, `cboBuildCd`/`btnInsert4`/`calUseDt` 등). DOM 매칭 시 `[id$=".<suffix>"]:not([id$=":icontext"])` 패턴.
  - `schemas.ts` — `dsCboSpace`, `dsGrdSub`, `dsGrdMainNew` 등 row 타입 정의 + `toNumber` 헬퍼 (Nexacro `{hi, lo}` 정규화). 시딩 스크립트와 확장 양쪽이 동일 타입으로 핸들링.
- **배경**:
  - 원안은 CSS 셀렉터 + DOM 파서를 가정했으나, PoC에서 GLS가 **Nexacro Platform SPA**임이 확인되고 CSS 셀렉터는 거의 무용지물이라는 결론(GLS_DOM_NOTES §6). 대신 Nexacro 컴포넌트 API 직접 호출이 정답.

### 2026-05-14 개정: `nexacroActions.ts` 삭제

자동화 헬퍼 함수(`nexClick`/`activePopupForm`/`selectComboByText` 등)는 원래 공통 모듈로 단일화 의도였으나, 실행 환경의 비대칭이 단일화를 막는다.

- **Main-world 브리지** (`extension/src/content/bridgeMainWorld.ts`) — manifest `world:"MAIN"` 으로 GLS 페이지 컨텍스트에 주입. CSP 가 `unsafe-eval` 거부해서 동적 op 등록이 불가능하고, RPC 채널(`postMessage`)도 Nexacro `__pWindow._on_default_sys_message` 와 충돌해 CustomEvent 로 분리. 결과적으로 자체 op 레지스트리를 들고 있음.
- **Playwright 시딩 스크립트** (`server/scripts/scrape-spaces.ts`) — Node 호스트라 `window.nexacro` 직접 접근 불가, TS 모듈을 page context 로 옮길 수도 없음. `HELPER_INIT_SCRIPT` raw 문자열을 `page.addInitScript` 로 주입.
- **확장 isolated world** (`glsAgent.ts` 외) — `window.nexacro` 접근 불가, 브리지에 RPC 위임.

세 환경이 nexacroActions.ts 를 직접 호출할 길이 없어 — TypeScript import 시 컴파일은 통과해도 런타임에 함수가 실행되지 않음. 호출자 없는 함수는 silent rot 위험만 키운다 (시그니처 변경해도 빌드 그린). 따라서 함수 본체는 각 환경에 인라인 유지하고, `nexacroActions.ts` 는 삭제.

- **영향**:
  - 양쪽 `tsconfig.json` 의 `paths` 매핑 (`@gls/*`) 유지 — 타입·상수 import 는 계속 작동.
  - 새 자동화 동작을 추가할 땐 **bridgeMainWorld + scrape-spaces 양쪽 인라인 헬퍼를 함께 갱신**해야 한다는 규약. 공유 단일 소스 없음.
  - GLS DOM 셀렉터 패턴이 바뀌면 `nexacroPaths.ts` 한 곳만 수정하면 양쪽이 자동으로 따라온다 (path 상수는 import 됨).

---

## D-018. 대화 상태 관리: 클라 권위 + 서버 매 턴 mirror

- **일자**: 2026-05-12
- **결정**:
  - 진행 중인 멀티턴 대화의 **진실의 원천은 확장(클라)**이 들고 있는 history 배열이다.
  - `/parse` 요청은 매번 `{ conversation_id, history, now }`를 self-contained로 보낸다.
  - 서버는 매 턴 `conversations` 테이블에 그 시점까지의 history를 upsert(mirror)한다. status 필드: `active | completed | abandoned_user | abandoned_timeout`.
  - 정상 완료 시 `completed`, 사용자 명시적 중단 시 `abandoned_user`로 마킹한다.
- **배경**:
  - 순수 (A) 모델(완료 시점에만 적재)은 브라우저 비정상 종료/에러로 중단된 대화를 서버가 전혀 모름. P2 선호 학습·깔때기 분석에 손실.
  - 서버가 진행 중 상태의 권위를 갖는 (B) 모델은 DB 장애 시 진행 중 대화가 즉시 중단되고 동시성 처리 부담이 큼.
  - 클라 권위 + 서버 mirror는 양쪽 장점을 결합: 추적성 확보하면서 서버 의존을 낮춤. mirror DB가 일시 장애여도 대화는 계속 진행 가능.
- **영향**:
  - `Conversation` 모델 추가: `id`, `client_id`(UUID FK), `status`, `history`(JSON), `started_at`, `updated_at`, `completed_at?`.
  - 요청 payload에 history 배열 포함 → P1 슬롯필링 5턴 내외 가정상 크기 부담 무시.
  - abandoned timeout 자동 마킹(cron)은 P1엔 안 함.
  - 현재 구현의 복원 범위는 popup snapshot + `chrome.storage.session` 기반 재수화까지이며, 서버에 남아 있는 오래된 `active` 대화를 다시 물어보는 UX는 아직 없다.

---

## D-019. 사용자 식별자 운반: `X-Client-Id` 헤더

- **일자**: 2026-05-12
- **결정**: D-009의 UUID를 모든 서버 요청에 `X-Client-Id` HTTP 헤더로 실어 보낸다. body 필드로 두지 않는다.
- **배경**: 라우트마다 body 스키마가 다르므로 헤더로 통일하면 Fastify 훅 한 곳에서 인증/로깅/메트릭 처리 가능. REST 컨벤션에도 부합.
- **영향**: 서버 측 글로벌 `onRequest` 훅에서 `X-Client-Id` 검증·`Client` upsert·`req.clientId` 주입을 수행한다. 라우트 핸들러는 `req.clientId`로 접근.

---

## D-020. 공간 시딩 범위: 자연·명륜 양 캠퍼스 전체

- **일자**: 2026-05-12
- **결정**: D-015의 시딩 스크립트는 GLS 공간예약 시스템이 노출하는 **자연·명륜 양 캠퍼스의 모든 공간**을 대상으로 한다.
- **배경**: P1 사용자 풀(학생회/동아리)이 캠퍼스 양쪽에 분포. 일부만 시딩하면 "조건 맞는 공간 없음" false negative 발생.
- **영향**:
  - 스크립트는 캠퍼스·건물 셀렉터를 순회하며 모든 건물의 모든 호실을 추출.
  - 시딩 1회 소요시간이 길어질 수 있으나 멱등 upsert이므로 중단·재개 가능하게 설계.

---

## D-021. 슬롯 스키마 및 `/parse` 라우트 계약

- **일자**: 2026-05-12
- **결정**: P1 채팅 파싱 라우트의 입출력 계약과 슬롯 스키마를 아래와 같이 확정한다. LLM 프롬프트 본문은 PoC 단계에서 반복 튜닝.

### 슬롯 분류

| 분류 | 슬롯 | 처리 단계 |
|---|---|---|
| 탐색 필수 | `headcount`, `date`, `start_time`, `end_time` 또는 `duration_min` | 채팅 슬롯필링 |
| 선택 필터 | `building`, `space` | 채팅에서 있으면 채움 (강한 필터) |
| 제출 필수 | `event_category`, `organization`, `event_name`, `purpose` | 폼 단계에서 별도 수집 (`/parse` 범위 외) |

### 값 정규화

- `date`: `"YYYY-MM-DD"`
- `start_time` / `end_time`: 24h `"HH:MM"`
- `duration_min`: 정수(분)
- `headcount`: 정수
- 미상은 `null` (빈 문자열 X)
- 자정 넘는 시간(예: 22:00~01:00) 처리는 GLS DOM PoC 결과 보고 결정. 계약상 허용, 거부는 GLS 단계에서.

### 시간 표현

`start_time` + `end_time` 또는 `start_time` + `duration_min` 중 LLM이 자연스럽게 채운 형태를 허용. GLS 폼 포맷 확정(PoC) 이후 둘 중 하나로 통일하는 정규화 단계는 P1+에서 검토.

### Request

```
POST /parse
Headers: X-Client-Id: <uuid>
Body:
{
  "conversation_id": "<uuid v4>",       // 클라가 발급. 신규 대화 첫 요청 시 새 UUID 생성.
  "history": [
    { "role": "user" | "assistant", "content": "..." }
  ],
  "now": "2026-05-12T14:30:00+09:00"    // 상대 날짜 해석용
}
```

### Response

```
{
  "conversation_id": "<uuid>",
  "filled_slots": {
    "date": "2026-05-19" | null,
    "start_time": "18:00" | null,
    "end_time": "19:00" | null,
    "duration_min": 60 | null,
    "headcount": 20 | null,
    "building": "학생회관" | null,
    "space": null
  },
  "missing_required": ["end_time"],
  "intent": "new_reservation" | "request_alternative" | "modify_slot" | "cancel" | "out_of_scope",
  "ready_to_search": false,
  "assistant_message": "5/19(화) 18시, 20명이군요. 몇 시까지 사용하시나요?"
}
```

### intent enum

- `new_reservation`: 새 예약 요청
- `request_alternative`: "다른 곳 보여줘" — 슬롯 유지하고 재탐색
- `modify_slot`: "아니 30명으로" — 기존 슬롯 수정
- `cancel`: "그만할래"
- `out_of_scope`: 잡담/무관 발화

### conversation_id 발급 및 검증

- 클라가 발급(UUID v4). 신규 대화 시작 시 클라가 생성, 이후 같은 대화 내내 동일 ID 사용.
- 서버는 매 요청 시:
  1. `conversation_id` 포맷이 UUID v4인지 검증 (Zod)
  2. DB에 해당 ID가 있으면 그 row의 `client_id`가 `X-Client-Id` 헤더와 일치하는지 확인. 불일치 시 403.
  3. DB에 없으면 새 대화로 row 생성 (`client_id` 박음).
- D-009의 `X-Client-Id` 자체는 인증되지 않은 식별자. P1 범위 수용. P3+에서 토큰 기반 인증 재검토.

### 서버는 stateless 변환기

- 매 요청마다 history 전체를 LLM에 (또는 압축 전략으로) 전달해 슬롯 재추출. 서버는 진행 중 슬롯 상태를 메모리에 들고 있지 않음 (D-018과 정합).
- DB mirror는 별도 — D-018대로 매 턴 conversations 테이블에 history upsert.

### 프롬프트 본문은 미결

- 시스템 프롬프트 문구, few-shot 예시, temperature, history 압축 전략(전체 vs 최근 N턴 vs 누적 슬롯 요약)은 PoC 단계에서 반복 튜닝. 계약(위 JSON 형태)만 고정.

---

## D-022. `Space` 모델 컬럼 (Phase 1)

- **일자**: 2026-05-12 (PoC 결과 반영하여 같은 날 개정)
- **결정**: D-014의 공간 메타데이터 테이블 컬럼을 아래로 확정한다. GLS DOM PoC (GLS_DOM_NOTES §7·§10) 결과로 `dsCboSpace` 한 데이터셋에서 거의 모든 정보를 얻을 수 있음이 확인됨에 따라, 원안에서 "P2 이후"로 미뤘던 학과 제한·공지문·정원 범위 컬럼을 P1에 포함시킨다.

```prisma
model Space {
  id              String   @id @default(uuid())

  // GLS 식별 코드 (자동화 시 정확 매칭의 1순위)
  glsSpaceCode    String   @unique     // GU_SPACE_CD 예: "400126"
  campusCode      String                // CAMPUS_CD 예: "1" (인사) / "2" (자연)
  buildingNo      String                // BUILD_NO  예: "240"

  // 사람이 읽는 표기
  campusName      String                // "자연과학캠퍼스"
  buildingName   String                // "반도체관"
  roomName        String                // SPACE_NM에서 코드/정원 제거 후 파싱 — "첨단강의실"

  // 정원 범위 (PoC에서 MIN_PERSON / CAPA_NO로 확인)
  capacityMin     Int                   // MIN_PERSON
  capacityMax     Int                   // CAPA_NO

  // 학과 제한 — PRD §1-2 ②의 반려 리스크 사전 차단용
  useJojikCode    String?               // USE_JOJIK_CD
  useJojikName    String?               // USE_JOJIK_CD_NM 예: "사회과학/예술대학행정실"
  adminJojikCode  String?               // ADMIN_JOJIK_CD
  adminJojikName  String?               // ADMIN_JOJIK_CD_NM 예: "교무팀"

  // 공지/제약
  contents        String?  @db.Text     // CONTENTS — 공지문 전문 (사용자 사전 안내)
  limitDayYn      Boolean  @default(false)  // LIMIT_DAY_YN == "Y"
  limitDay        Int?                  // LIMIT_DAY  (일수)
  limitTimeYn     Boolean  @default(false)  // LIMIT_TIME_YN == "Y"
  limitTimeHHMM   String?               // LIMIT_TIME 예: "0800" = 최대 8시간
  daeyeoGb        String?               // DAEYEO_GB  "1" = 학생대여가능 등

  // 시딩 관리
  scrapedAt       DateTime
  active          Boolean  @default(true)  // GLS에서 사라지면 soft-delete

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([capacityMin, capacityMax])
  @@index([campusCode, buildingNo])
  @@index([useJojikCode])
}
```

### 컬럼 선정 근거

| 컬럼 | 왜 |
|---|---|
| `glsSpaceCode` (unique) | 시딩·자동화의 단일 진실 키. GLS `cboSpaceCd.set_value()` 인자로 직접 사용. |
| `campusCode` / `buildingNo` | GLS 자동화 시 cascade 콤보의 코드 값 (DOM 매칭은 텍스트 라벨이 아닌 코드로 해야 안정적). |
| `campusName` / `buildingName` / `roomName` | 채팅 응답·UI 표시·자연어 매칭. |
| `capacityMin` / `capacityMax` | D-013 1단계 인원 필터. 단일 capacity가 아니라 범위라는 점이 PoC에서 드러남. |
| `useJojik*` | 사용자 소속과 매칭해 "X학과 우선 — 반려될 수 있음" 사전 안내. P1에서 노출. |
| `adminJojik*` | 운영 주체 식별 (문의 안내 등). |
| `contents` | 후보 제시 시 사용자에게 함께 보여줄 안내문. GLS의 alert popup 텍스트와 동일. |
| `limitTimeHHMM` | "이 공간은 최대 8시간"같은 제약. 사용자 요청 duration이 초과하면 후보에서 제외. |
| `daeyeoGb` | "1"이 아닌 공간은 학생 대여 불가. P1 시딩 시 필터 또는 active=false. |
| `scrapedAt` / `active` | D-015 멱등 upsert + soft-delete. |

### 의도적으로 뺀 것

- **`availability`** (요일별 운영시간): P1엔 GLS 시간표 직접 조회로 충분. P2/3 정기예약 단계에서 다시 검토.
- **`facilities`** (프로젝터·화이트보드 등): GLS dsCboBeamSpace에 빔프로젝터 공간은 별도 데이터셋으로 있으나 P1 필터링엔 안 씀.
- **`floor` 분리 컬럼**: `glsSpaceCode` 앞자리에 층 정보가 포함됨(`40xxxx` = 4층, `61xxx` = 6층 식). 필요 시 함수로 파생.
- **`Campus` Prisma enum**: 향후 율전 등 확장 시 마이그레이션 부담. String 유지.

### `roomName` 파싱 규칙

`SPACE_NM` 원본 예: `"[400126] 첨단강의실 / 40 명 ~ 120 명"` → `roomName = "첨단강의실"`.
- 정규식: `/^\[\d+\]\s*(.+?)\s*\/\s*\d+\s*명\s*~/` → 캡처 그룹 1
- 별칭이 여러 슬래시로 구분되는 케이스 (예: `"첨단e+ 강의실(75명) / 국제화첨단강의실 / 10 명 ~ 75 명"`)는 첫 번째 슬래시 이전까지만.

### 영향

- D-015 시딩 스크립트는 `dsCboSpace` row를 위 컬럼에 그대로 매핑하면 됨.
- D-024 `GET /spaces` 응답 스키마에 `useJojikName`, `contents`, `capacityMin/Max`가 포함되어야 함 (사용자 안내용).
- P2 진입 시 `availability` 등 추가 컬럼은 별도 마이그레이션.

### 원안과의 차이 (참고)

원안에는 `campus`/`building`/`roomNumber`를 자연어 문자열로 두고 `glsSpaceId`를 optional로 두었으나, PoC 결과 GLS는 모든 식별을 숫자 코드로 처리함이 확인됨. 코드 컬럼을 필수로 끌어올리고 unique를 `glsSpaceCode`로 옮김. `departmentOnly`도 P2 이후로 미뤘으나 PoC에서 `USE_JOJIK_CD_NM`이 모든 공간에 존재함이 확인되어 P1에 포함.

---

## D-023. `Conversation` 및 `Client` 모델

- **일자**: 2026-05-12
- **결정**: D-018 대화 mirror + D-009 사용자 식별을 위한 모델을 아래로 확정.

```prisma
model Client {
  id          String        @id  // 확장 설치 시 발급된 UUID (D-009)
  createdAt   DateTime      @default(now())
  lastSeenAt  DateTime      @updatedAt
  conversations Conversation[]
}

enum ConversationStatus {
  active
  completed
  abandoned_user
  abandoned_timeout
}

model Conversation {
  id              String              @id  // 클라가 발급한 UUID v4 (D-021)
  clientId        String
  client          Client              @relation(fields: [clientId], references: [id])

  status          ConversationStatus  @default(active)
  history         Json                // [{ role, content }, ...]
  lastIntent      String?             // 마지막 응답의 intent (D-021)
  lastFilledSlots Json?               // 마지막 응답의 filled_slots 캐시 (분석용)

  startedAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  completedAt     DateTime?

  @@index([clientId, updatedAt])
  @@index([status, updatedAt])
}
```

- `Client` 테이블을 두는 이유: P2 선호/이력 도입 시 어차피 필요. 지금 만들어두는 게 일관적. P1엔 첫 요청 시 upsert로 생성.
- `status`는 Prisma enum 사용. P3+에서 값 추가 시 마이그레이션 필요하지만 의미 명확성이 더 큼.

---

## D-024. P1 서버 API 라우트 목록

- **일자**: 2026-05-12
- **결정**: P1 범위 서버 라우트를 아래로 확정.

| 메서드·경로 | 용도 | 헤더 |
|---|---|---|
| `GET /health` | 헬스체크 | - |
| `POST /parse` | 채팅 파싱 + 신청 메타 상태 계산 | `X-Client-Id` |
| `GET /conversations` | 최근 대화 10개 요약 목록 | `X-Client-Id` |
| `POST /conversations/:id` | 대화 mirror 생성/업데이트 (D-018) | `X-Client-Id` |
| `GET /conversations/:id` | 이어가기 — 과거 대화 fetch | `X-Client-Id` |
| `POST /conversations/:id/abandon` | 사용자 명시적 중단 마킹 | `X-Client-Id` |
| `DELETE /conversations/:id` | 대화 논리 삭제 | `X-Client-Id` |
| `GET /spaces` | 인원·캠퍼스·건물 필터로 후보 조회 (D-013 1단계) | `X-Client-Id` |

- 모든 라우트는 `onRequest` 훅에서 `X-Client-Id` 검증·`Client` upsert·`req.clientId` 주입.
- 소유권 검증(D-021): conversations 라우트는 `conversation.clientId === req.clientId` 확인. 불일치 시 403.
- `POST /parse` 응답은 기존 intent/slot 정보에 더해 `application_state`를 포함한다. 여기에는 신청서 초안(`draft`), 누락 신청 필드, 추가 수집 필요 여부, 과거 대화 기반 추천 초안, 분류 확신도 정보가 들어간다.
- `GET /conversations` 는 `deletedAt IS NULL` 인 대화만 최신순으로 10개 반환한다. popup 대화 선택기에서 제목·상태·미리보기 구성에 사용한다.
- `DELETE /conversations/:id` 는 논리 삭제이며, 삭제된 대화는 목록 복원과 신청 메타 추천 양쪽에서 제외한다.
- `GET /spaces` 쿼리 파라미터: `headcount`(인원으로 `capacityMin <= headcount <= capacityMax` 필터), `campusCode`, `buildingNo`, `userOrgCode?`(사용자 소속 코드 — `useJojikCode` 매칭으로 우선 공간 표시). Zod 검증.
- `GET /spaces` 응답에는 D-022의 `useJojikName`, `contents`, `capacityMin/Max`, `limitTimeHHMM`를 포함해 채팅 UI에서 후보 안내 시 함께 노출.

---

## D-025. 확장 UI 프레임워크: React

- **일자**: 2026-05-12
- **결정**: 확장 popup UI를 React로 작성한다.
- **배경**: `@crxjs/vite-plugin`(D-016)과 React 조합 자료가 가장 풍부. 채팅 UI 컴포넌트 라이브러리·훅 생태계 활용 가능. 팀 친숙도도 높음.
- **대안**: Svelte(번들 작지만 자료 적음), Vanilla(채팅 상태 관리 자체 구현 부담).
- **영향**: `extension/src/popup/`에 React 18 + JSX. 상태 관리는 P1 규모상 useState/useReducer로 충분, Zustand 등 도입은 필요해지면 추가.

---

## D-026. 확장 내부 메시징 구조

- **일자**: 2026-05-12
- **결정**: 크롬 확장의 popup ↔ background SW ↔ content script 3-컨텍스트 분리 구조를 채택하고 메시지 타입을 단일 union으로 관리한다.

### 컨텍스트별 책임

| 컨텍스트 | 책임 |
|---|---|
| **popup (React)** | 채팅 UI, 사용자 입력·확인, 진행 상태 표시 |
| **background SW** | 서버 API 호출, GLS 탭 조율, 메시지 라우팅, 영구 상태(chrome.storage) 관리 |
| **content script** (GLS 도메인) | GLS DOM 조작 — 후보 공간 조회, 시간표 파싱, 폼 작성·제출 |

### 메시지 흐름 (대표 예시)

```
popup → background: POPUP_CHAT_REQUEST { history }
background → server:  POST /parse
background → popup:   BG_CHAT_RESPONSE { filled_slots, assistant_message, ready_to_search }

popup → background: POPUP_START_SEARCH { slots }
background → content (GLS 탭): BG_CHECK_AVAILABILITY { candidate, date, startHour, endHour }
content → background: CONTENT_AVAILABILITY_RESULT
background → popup: BG_CANDIDATE_PROPOSAL { candidate }

popup → background: POPUP_PREVIEW_RESERVATION | POPUP_CONFIRM_RESERVATION
background → content: BG_PREVIEW_RESERVATION | BG_SUBMIT_RESERVATION
content → background: CONTENT_PREVIEW_RESULT | CONTENT_SUBMIT_RESULT
background → popup: BG_STATUS_UPDATE / BG_RESERVATION_DONE
```

### 타입 정의 위치
`extension/src/shared/messages.ts`에 TypeScript discriminated union으로 모음. 양쪽이 동일한 타입 import.

### 영향
- popup이 닫혀도 background SW가 자동화를 계속 진행할 수 있다.
- 완료 시 `chrome.notifications`로 사용자에게 알림한다. 진행 중 세부 상태는 popup 재오픈 시 `chrome.storage.session`에서 복원한다.
- content script ↔ background는 `chrome.tabs.sendMessage`/`chrome.runtime.onMessage`로 통신.
- background는 활성 자동화 세션을 메모리에 들고 있을 수 있으나, MV3 SW가 idle 종료될 수 있으므로 진행 상태는 `chrome.storage.session`에 함께 mirror.

---

## D-027. GLS 탭 진입 및 비활성 탭 처리 원칙

- **일자**: 2026-05-12
- **결정**:

### 탭 진입
1. 현재 활성 탭이 이미 GLS면 그대로 재사용
2. 아니면 사용자 확인 후 현재 활성 탭의 URL을 GLS로 전환
3. 강제 새 탭은 Dev/특수 경로에서만 사용

### 비활성 탭 처리 원칙
- **기본은 비활성 탭에서도 자동화 시도**. content script는 비활성 탭에서도 살아있고 대부분 DOM 조작 가능.
- 단계별 검증 실패(셀렉터 timeout, navigation 실패 등) 감지 시 **활성화 안내로 fallback**: popup에서 "GLS 탭이 활성 상태가 아니어서 진행이 어렵습니다. 활성화할까요?" 같은 안내를 띄우고, 사용자 클릭 시 `chrome.tabs.update({active: true})`.
- 구체 fallback 트리거 기준(어떤 단계 실패에서 안내할지)은 PoC 결과 보고 D-027 보강.

### 영향
- popup이 닫힌 채 background SW가 자동화 진행 중에도 동작. 사용자는 완료 시 `chrome.notifications`를 받고, 중간 상태는 popup 재오픈 시 확인한다.
- content script가 step별로 idempotent하게 작성되어야 함 (재시도 가능).

---

## D-028. 패키지 매니저: pnpm

- **일자**: 2026-05-12
- **결정**: `extension/`, `server/` 모두 pnpm 사용.
- **배경**: 디스크·설치 속도. 팀 선호.
- **영향**:
  - 양쪽 디렉터리에 각자 `package.json`. workspace 정의는 D-017대로 도입 안 함 (path mapping만).
  - `pnpm-lock.yaml`이 각 디렉터리에 따로 생성.
  - CI/스크립트 문서엔 `pnpm install`, `pnpm dev` 등으로 통일.

---

## 남은 미결 사항

PRD §9 + 운영 차원에서 추가로 결정 필요한 항목들.

1. **GLS DOM 분석 (선결)**: D-010·D-015 자동화의 전제. 셀렉터 추출 PoC 일정 및 담당.
2. **반려 DB 공유 범위** (PRD §9-4): Phase 2 이후 결정.
3. **이용약관 사전 확인** (PRD §9-5): 주체·시점.
4. **정기예약 형평성** (PRD §9-6): Phase 3 이후 결정.
