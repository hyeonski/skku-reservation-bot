# SKKU 공간예약 에이전트

성균관대학교 GLS(정보광장) 공간대여신청을 **자연어 대화 한 번으로** 자동화하는 크롬 확장 에이전트.

> "다음 주 화요일 6시 20명 회의실 잡아줘" → 에이전트가 빈 공간을 찾아 예약 신청서까지 작성.

학생회·동아리 임원이 매주 반복하는 공간예약 잡무를 줄이는 게 목표입니다. 기존 GLS 시스템을 수정하지 않고 위에 지능형 레이어를 얹는 접근.

상세 배경·로드맵: [docs/PRD.md](docs/PRD.md)

---

## 프로젝트 구조

```
skku-reservation-bot/
├── extension/          크롬 확장 (Vite + @crxjs + React 18, MV3)
│   ├── manifest.json
│   ├── src/popup/      채팅 UI
│   ├── src/background/ Service Worker + 자동화 오케스트레이터
│   ├── src/content/    GLS DOM 자동화 (main-world bridge)
│   └── src/shared/     UUID·메시지 타입
│
├── server/             TypeScript + Fastify + Prisma + MySQL
│   ├── prisma/schema.prisma
│   ├── src/routes/     /parse, /conversations, /spaces
│   ├── src/llm/        DeepSeek-Chat 어댑터 + 프롬프트
│   ├── src/plugins/    Prisma, X-Client-Id 훅
│   └── scripts/scrape-spaces.ts   GLS 공간 메타 시딩
│
├── shared/gls/         확장·서버가 함께 import (tsconfig paths @gls/*)
│   ├── nexacroPaths.ts    GLS Nexacro 컴포넌트 id 사전 (M-코드 등)
│   └── schemas.ts         Nexacro 데이터셋 row 타입 + toNumber 헬퍼
│   # 자동화 함수 본체는 실행 환경 격리로 공유 불가 (D-017 개정 참조).
│   # bridgeMainWorld.ts / scrape-spaces.ts 가 각자 인라인 유지.
│
└── docs/
    ├── PRD.md           통합 PRD 요약
    ├── DECISIONS.md     D-001~D-028 의사결정 로그
    └── GLS_DOM_NOTES.md GLS Nexacro 자동화 PoC 결과
```

기술 스택 선택 이유는 [docs/DECISIONS.md](docs/DECISIONS.md)에 항목별로 정리되어 있습니다.

---

## 사전 준비

- Node.js 20+
- pnpm 10+
- MySQL 8+ (로컬 또는 원격)
- 크롬 (확장 개발용)
- DeepSeek API 키 (또는 OpenAI 호환 엔드포인트)

---

## 셋업

### 1. 클론 후 의존성 설치

```bash
git clone <repo>
cd skku-reservation-bot
pnpm install -C extension
pnpm install -C server
```

### 2. 서버 환경 변수

`server/.env.example` 복사 → `server/.env`:

```
PORT=3000
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
DATABASE_URL="mysql://user:password@localhost:3306/skku_reservation"
```

### 3. DB 마이그레이션

```bash
cd server
pnpm prisma migrate dev
```

`Client`, `Conversation`, `Space` 테이블이 생성됩니다 (D-022, D-023).

### 4. 공간 메타데이터 시딩

GLS 공간 정보(`Space` 테이블)를 채워둬야 P1 흐름이 동작합니다.

```bash
# 크롬에서 kingoinfo.skku.edu 로그인 후 DevTools → Application → Cookies
# 의 모든 쿠키를 "name1=val1; name2=val2" 형태로 합쳐 GLS_COOKIE에 주입
GLS_COOKIE="JSESSIONID=...; ticket=..." pnpm scrape:spaces

# 헤드리스로 돌리려면
GLS_COOKIE="..." HEADLESS=1 pnpm scrape:spaces
```

자동화 정책상 자격증명은 서버에 저장하지 않습니다 (D-009). 시딩은 개발자가 1회성으로 돌리고, 학기마다 수동 재실행 (D-015 sub-3).

### 5. 서버 실행

```bash
cd server
pnpm dev
```

`http://localhost:3000/health` → `{ ok: true }` 확인.

### 6. 확장 빌드 + 로드

```bash
cd extension
pnpm dev     # vite dev — 코드 변경 시 자동 리빌드
```

크롬 → `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다" → `extension/dist` 선택.

브라우저 액션 아이콘 클릭 → popup 채팅창에서 사용.

---

## Phase 1 동작 흐름

1. 사용자가 popup 채팅창에 자연어로 요청 ("내일 14시부터 2시간 10명")
2. 서버 `/parse` 가 DeepSeek-Chat으로 슬롯 추출
3. 누락 슬롯 있으면 멀티턴으로 되묻기 (D-013)
4. 슬롯 충족 시 `/spaces` 로 후보 공간 조회 (인원·캠퍼스 필터)
5. 확장이 GLS 탭을 열고 (또는 재사용), content script가 후보 공간을 하나씩 시간표에서 가용성 검증
6. 가용 공간 발견 → popup에 카드로 표시 → 사용자 확인
7. 폼 자동 작성 후 저장 클릭 → 결과 알림

자세한 메시지 흐름은 [docs/DECISIONS.md](docs/DECISIONS.md) D-026 참조.

---

## P1 범위 / 비범위

**포함**: 멀티턴 슬롯필링, 인원 기반 최적 후보 추천, GLS 자동 신청서 작성·제출

**제외 (Phase 2 이후)**:
- 반려 감지·재신청 (D-011)
- 개인화 선호 학습 (Phase 2)
- 정기 예약 알림·자동 실행 (Phase 3·4)
- 도서관·열람실 등 다른 시스템 (Phase 5)

---

## 개발 명령어

### 서버

```bash
cd server
pnpm dev              # tsx watch, hot reload
pnpm build            # tsc 빌드 → dist/
pnpm prisma:generate  # Prisma client 재생성
pnpm prisma:migrate   # 마이그레이션 적용
pnpm scrape:spaces    # 공간 시딩 (GLS_COOKIE 필요)
```

### 확장

```bash
cd extension
pnpm dev      # vite dev (popup HMR)
pnpm build    # tsc check + vite build → dist/ (확장 로드용)
```

### 타입체크

```bash
cd server && pnpm exec tsc --noEmit
cd extension && pnpm exec tsc --noEmit
```

---

## 주요 결정 요약

| 항목 | 결정 |
|---|---|
| 서버 | TypeScript + Fastify + Prisma + MySQL |
| LLM | DeepSeek-Chat (OpenAI 호환) |
| 확장 빌드 | Vite + @crxjs/vite-plugin |
| UI | React 18 채팅형 멀티턴 |
| 사용자 식별 | 확장 설치 시 UUID, 별도 계정 없음 |
| GLS 인증 | 사용자가 직접 로그인. 서버는 자격증명 비저장 |
| 자동화 전략 | Nexacro 컴포넌트 API + DOM cascade 클릭 |
| 가용성 판정 | `dsGrdSub` (공간 row 클릭으로 로드) |
| 공간 시딩 | 개발자 쿠키 주입 + Playwright 1회성 실행 |

전체 결정 로그: [docs/DECISIONS.md](docs/DECISIONS.md) (D-001~D-028)

---

## 라이브 검증 시 다듬을 부분

P1 코드는 컴파일과 단위 흐름까진 통과했지만 실제 GLS에서 검증해야 튜닝이 끝나는 항목들:

- `clickSpaceRow` / `dismissNoticeIfShown` 정확도 — bridge `ops` 와 시딩 헬퍼에 인라인. GLS 페이지 변동 시 [extension/src/content/bridgeMainWorld.ts](extension/src/content/bridgeMainWorld.ts) + [server/scripts/scrape-spaces.ts](server/scripts/scrape-spaces.ts) 양쪽 갱신 필요.
- 저장 후 성공/실패 감지 (5초 폴링) — 실제 GLS 응답 메시지 텍스트 확정 후 튜닝
- 행사 메타(행사구분 코드·주관단체·사용목적) 수집 UI — popup 확인 단계에 폼 추가 필요
- 자연어 건물명 → `campusCode`/`buildingNo` 매핑 — DB lookup으로 보강
- `chrome.notifications` 아이콘 자원 추가

---

## 팀

성균관대학교 소프트웨어학과 학생 프로젝트.

- 김현승, 김민성, 오모세, 박지호

기여 가이드라인은 별도 문서 작성 예정.
