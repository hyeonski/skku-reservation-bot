# SKKU 공간예약 에이전트

성균관대학교 GLS(정보광장) 공간대여신청을 **자연어 대화 한 번으로** 처리하는 크롬 확장 에이전트.

> "다음 주 화요일 18시 20명 회의실 잡아줘" → 에이전트가 조건에 맞는 빈 공간을 찾아 GLS 신청서까지 작성·제출.

학생회·동아리 임원이 매주 반복하는 공간예약 잡무를 줄이는 것이 목표입니다. 기존 GLS 시스템을 수정하지 않고, side panel 채팅 UI와 백엔드를 그 위에 지능형 레이어로 얹는 구조입니다.

대화로 요청을 받아 → 조건을 파싱하고 → 후보 공간을 조회한 뒤 → 실제 GLS 화면에서 가용성을 확인하고 → 신청 폼을 자동으로 채워 제출합니다. 과거 예약 이력을 재사용한 신청 정보 추천과, 반복 패턴 기반 리마인더도 지원합니다.

---

## 구성

세 부분으로 나뉩니다.

```
skku-reservation-bot/
├── extension/   크롬 확장 (MV3) — Vite + @crxjs + React 18
│   ├── manifest.json
│   └── src/
│       ├── sidepanel/    채팅 UI (React)
│       ├── background/   Service Worker + 자동화 오케스트레이터
│       ├── content/      GLS DOM 자동화 (Nexacro main-world bridge)
│       └── shared/       UUID·메시지 타입
│
├── server/      백엔드 — TypeScript + Fastify + Prisma + MySQL
│   ├── prisma/schema.prisma
│   └── src/
│       ├── routes/   /parse · /conversations · /spaces · /reminders · /space-feedback
│       ├── llm/      DeepSeek V4 Flash(OpenAI 호환) 어댑터 + 프롬프트
│       ├── plugins/  Prisma, X-Client-Id 식별 훅
│       └── ...
│
└── shared/gls/  확장·서버가 함께 import 하는 GLS 메타 (Nexacro 컴포넌트 id 사전, 데이터셋 row 타입)
```

- **확장(extension)**: 사용자가 보는 채팅 패널과, GLS 페이지를 직접 조작하는 자동화 로직.
- **서버(server)**: 자연어 파싱(LLM), 공간 후보 조회, 대화·예약 이력 저장.
- **shared/gls**: 양쪽이 공유하는 GLS 화면 식별자·타입.

---

## 사전 준비

- Node.js 20+
- pnpm 10+
- MySQL 8+ (로컬 또는 원격)
- 크롬 (확장 로드용)
- DeepSeek API 키 (또는 OpenAI 호환 엔드포인트)

---

## 셋업

### 1. 클론 후 의존성 설치

```bash
git clone <repo>
cd skku-reservation-bot
pnpm install -C server
pnpm install -C extension
```

### 2. 서버 환경 변수

`server/.env.example` 를 복사해 `server/.env` 를 만들고 값을 채웁니다.

```bash
cp server/.env.example server/.env
```

```
PORT=8000

# DeepSeek (OpenAI 호환)
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash

# MySQL — 로컬 또는 원격
DATABASE_URL="mysql://user:password@localhost:3306/skku_reservation"
```

### 3. DB 마이그레이션

```bash
cd server
pnpm prisma:migrate
```

`Client`, `Conversation`, `Space`, 예약/리마인더 관련 테이블이 생성됩니다.

### 4. 공간 메타데이터 시딩

공간 후보 조회가 동작하려면 `Space` 테이블에 GLS 공간 정보가 채워져 있어야 합니다.

```bash
cd server

# 크롬에서 kingoinfo.skku.edu 로그인 후 DevTools → Application → Cookies 의
# 쿠키들을 "name1=val1; name2=val2" 형태로 합쳐 GLS_COOKIE 에 주입
GLS_COOKIE="JSESSIONID=...; ticket=..." pnpm scrape:spaces

# 헤드리스로 돌리려면
GLS_COOKIE="..." HEADLESS=1 pnpm scrape:spaces
```

자격증명은 서버에 저장하지 않습니다. 시딩은 개발자가 1회성으로 실행하고, 학기마다 수동 재실행합니다.

> 실제 GLS 쿠키 없이 동작만 확인하려면 더미 공간 데이터를 넣을 수 있습니다.
> ```bash
> pnpm seed:e2e-spaces      # 테스트용 공간 데이터
> pnpm seed:demo-history    # 데모용 대화·예약 이력
> ```

### 5. 서버 실행

```bash
cd server
pnpm dev
```

`http://localhost:8000/health` 가 `{ ok: true }` 를 반환하면 정상입니다.

### 6. 확장 빌드 + 로드

```bash
cd extension
pnpm build   # dist/ 생성
```

크롬에서:

1. `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** → `extension/dist` 선택

브라우저 툴바의 확장 아이콘을 클릭하면 side panel 채팅창이 열립니다. GLS(`kingoinfo.skku.edu`)에 직접 로그인한 상태에서 사용하세요.

---

## 사용 흐름

1. side panel 채팅창에 자연어로 요청 — "내일 14시부터 2시간, 10명"
2. 서버가 요청에서 날짜·시간·인원 등 조건을 추출하고, 누락된 조건은 멀티턴으로 되묻습니다.
3. 조건이 충족되면 인원·캠퍼스·건물 필터로 후보 공간을 조회합니다.
4. 확장이 GLS 탭에서 후보 공간을 하나씩 시간표에 대조해 가용성을 확인합니다.
5. 가용 공간을 찾으면 추천 카드로 보여주고, 신청 정보(행사명·주관단체 등)를 채팅으로 받거나 과거 이력에서 추천합니다.
6. 사용자가 확인하면 GLS 신청 폼을 자동으로 채우고 저장까지 실행한 뒤 완료 알림을 띄웁니다.

---

## 개발 명령어

### 서버 (`cd server`)

```bash
pnpm dev              # tsx watch, hot reload
pnpm build            # tsc → dist/
pnpm start            # 빌드 결과 실행
pnpm prisma:generate  # Prisma client 재생성
pnpm prisma:migrate   # 마이그레이션 적용
pnpm scrape:spaces    # 공간 시딩 (GLS_COOKIE 필요)
pnpm verify           # 라우트/로직 검증 스크립트 일괄 실행
```

### 확장 (`cd extension`)

```bash
pnpm dev      # vite dev server (side panel HMR — UI만 빠르게 확인할 때)
pnpm build    # 타입 체크 + vite build → dist/ (확장 로드용)
```

### 타입 체크

```bash
cd server && pnpm exec tsc --noEmit
cd extension && pnpm exec tsc -b --noEmit
```

---

## 기술 스택 요약

| 영역 | 선택 |
|---|---|
| 서버 | TypeScript · Fastify · Prisma · MySQL |
| LLM | DeepSeek V4 Flash (OpenAI 호환 API) |
| 확장 빌드 | Vite · @crxjs/vite-plugin (MV3) |
| UI | React 18 채팅형 멀티턴 side panel |
| 사용자 식별 | 확장 설치 시 발급되는 UUID (별도 계정 없음) |
| GLS 인증 | 사용자가 브라우저에서 직접 로그인, 서버는 자격증명 비저장 |
| GLS 자동화 | Nexacro 컴포넌트 API + DOM cascade 조작 |
