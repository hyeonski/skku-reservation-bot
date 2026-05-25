# 03. 디자인 토큰

모든 값은 `prototype/styles.css`의 `:root` 블록에서 가져왔고, 변경 없이 그대로 코드베이스에 가져가야 합니다. CSS 변수로 두든 Tailwind config로 두든 무방.

## 색상 (Color)

### Surface

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#ffffff` | 패널 메인 배경 |
| `--bg-subtle` | `#fafafa` | 컴포저 배경, 예시 카드 |
| `--bg-muted` | `#f4f4f5` | 봇 말풍선 배경, hover, hint chip 기본 |
| `--bg-strong` | `#e4e4e7` | 진행바 트랙, 비활성 버튼 |

### Border

| 토큰 | 값 | 용도 |
|---|---|---|
| `--border` | `#e5e5e7` | 일반 디바이더, 카드 테두리 |
| `--border-strong` | `#d4d4d8` | hover 시 강조, 컴포저 활성 |

### Text

| 토큰 | 값 | 용도 |
|---|---|---|
| `--text` | `#18181b` | 본문 텍스트 |
| `--text-muted` | `#71717a` | 부가 정보, 메타 |
| `--text-subtle` | `#a1a1aa` | placeholder, 시간 |
| `--text-faint` | `#c9c9cf` | 비활성 텍스트, 큰따옴표 장식 |

### Accent (메인 컬러)

OKLCH 컬러스페이스 사용 — 일관된 hue로 명도/채도만 변화. hex 변환이 필요하면 `oklch(0.55 0.12 264)` ≈ `#5f6acf`.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--accent` | `oklch(0.55 0.12 264)` | primary 버튼, 사용자 말풍선, 글리프 |
| `--accent-hover` | `oklch(0.5 0.13 264)` | primary 버튼 hover |
| `--accent-soft` | `oklch(0.96 0.025 264)` | 추천 카드 아이콘 배경, 칩 hover, 리마인드 그라데이션 |
| `--accent-text` | `oklch(0.45 0.13 264)` | accent 컬러 위에 올라가는 텍스트, 'accent' 태그 |

### 상태 컬러

| 토큰 | 값 | 용도 |
|---|---|---|
| `--success` | `oklch(0.6 0.13 155)` | completed 상태 dot, 가용 발견 마커 |
| `--success-soft` | `oklch(0.96 0.03 155)` | success 태그 배경 |
| `--success-text` | `oklch(0.45 0.14 155)` | success 텍스트 |
| `--warning` | `oklch(0.7 0.12 75)` | 로그인 카드 아이콘 배경 |
| `--warning-soft` | `oklch(0.96 0.05 80)` | 학과 우선 안내 배경 |
| `--warning-text` | `oklch(0.5 0.14 60)` | warning 텍스트 |
| `--danger` | `oklch(0.6 0.17 25)` | 실패 카드 (사용 시), 삭제 버튼 |
| `--danger-soft` | `oklch(0.96 0.04 25)` | danger 배경 |
| `--danger-text` | `oklch(0.5 0.18 25)` | danger 텍스트 |

### 채팅 전용

| 토큰 | 값 |
|---|---|
| `--bot-bubble` | `#f4f4f5` (= `--bg-muted`) |
| `--user-bubble` | `oklch(0.55 0.12 264)` (= `--accent`) |
| `--user-bubble-text` | `#ffffff` |

## 타이포그래피

### Font Family

```css
--font-sans: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", Menlo, monospace;
```

**Pretendard Variable** 우선 사용. CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css`. 확장에서는 폰트를 번들하거나 CDN에서 fetch (배포 시 CSP 검토 필요).

### Scale

크기는 모두 px (rem 안 씀 — 사이드패널은 사용자 폰트 사이즈 영향 받지 않게):

| 위치 | size | weight | line-height | letter-spacing |
|---|---|---|---|---|
| H1 (온보딩) | 22px | 700 | 1.25 | -0.025em |
| H2 (작은 페이지 타이틀) | 17px | 600 | 1.4 | -0.02em |
| 카드 제목 | 14px | 600 | 1.4 | -0.01em |
| 채팅 말풍선 | 13.5px | 400 | 1.45 | normal |
| 본문 (온보딩 p) | 13.5px | 400 | 1.5 | normal |
| 헤더 타이틀 | 13px | 600 | normal | -0.01em |
| 세션 항목 제목 | 13px | 500 | normal | -0.005em |
| 일반 버튼 | 12px | 500 | normal | normal |
| small 버튼 | 11.5px | 500 | normal | normal |
| 칩 (chip) | 11.5px | 400 | normal | normal |
| 메타 (rec-meta) | 11.5px | 400 | normal | normal |
| 카드 태그 (tag) | 10px | 500 | normal | 0.04em uppercase |
| 메시지 timestamp | 10px (mono) | 400 | normal | normal |

### Pretendard Weight

- `weight: 400` 일반
- `weight: 500` 강조
- `weight: 600` 제목
- `weight: 700` H1 / 글리프

가변 폰트라 임의 weight 가능하지만 위 4단계만 사용.

## 간격 (Spacing)

px 기준. 8px grid를 느슨하게 따르되 4px 단위로 미세조정 허용.

| 컨텍스트 | 값 |
|---|---|
| Thread padding | 16px 14px 8px 14px |
| 메시지 사이 gap | 10px |
| 말풍선 padding | 9px 13px |
| 카드 padding (body) | 12px 14px |
| 카드 head padding | 10px 14px 8px |
| 카드 actions padding | 8px 10px |
| 컴포저 padding | 8px 8px 8px 12px |
| 힌트 칩 padding | 4px 10px |
| 버튼 padding (일반) | 6px 12px |
| 버튼 padding (small) | 4px 9px |
| 세션 항목 padding | 10px 12px |
| 온보딩 outer | 20px 20px 16px |
| Popup header | height 48px, padding 0 12px 0 16px |

## Border Radius

```css
--radius-xs: 4px;    /* 작은 디테일 */
--radius-sm: 6px;    /* 버튼, 칩 inner */
--radius:    8px;    /* 기본 */
--radius-md: 10px;   /* 컴포저, 추천 카드 */
--radius-lg: 12px;   /* 사이드패널 (실제로는 안 적용 — 사이드패널은 Chrome이 그림) */
--radius-xl: 16px;   /* 큰 콘테이너 */
```

말풍선은 14px (한쪽 모서리만 4px로 꺾어 화살표 흉내):
```css
.bubble.user { border-radius: 14px; border-bottom-right-radius: 4px; }
.bubble.bot  { border-radius: 14px; border-bottom-left-radius: 4px; }
```

칩 (pill 모양): `border-radius: 999px`
Status dot: `border-radius: 50%`

## Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow:    0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.04);
```

채팅 안에서는 거의 안 씀 (사이드패널이 이미 그림자 안에 있음). 글리프(SKKU 마크)에 액센트 컬러 그림자: `box-shadow: 0 12px 24px oklch(0.55 0.12 264 / 0.3)`.

## 애니메이션

- 호버/포커스 트랜지션: `transition: all 0.12s` 또는 `0.15s`
- 진행바 fill: `transition: width 0.4s ease`
- 점 인디케이터 (온보딩): `transition: all 0.3s`
- pulse (active dot, 자동화 배지): 1.6s 또는 1.4s infinite
- 타이핑 인디케이터: 1.2s infinite, 각 dot 0.15s씩 지연

CSS keyframes:

```css
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.6); }
}

@keyframes typingDot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-3px); opacity: 1; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

메시지 등장 애니메이션은 프로토타입에 있었지만 **production에서는 빼는 걸 권장** — 캡처 도구나 일부 환경에서 fillMode 이슈가 있고, 채팅 UI에서는 메시지 등장이 너무 화려하면 산만함. 필요시 매우 짧게(150ms 이내) 의 fade-in만.

## 한글 줄바꿈

```css
body {
  word-break: keep-all;
  overflow-wrap: break-word;
}
```

`text-wrap: pretty`를 H1과 본문 단락에 적용 (지원되는 브라우저에서 자동 균형 잡힘):

```css
.onboard h1, .onboard p { text-wrap: pretty; }
```

## 아이콘

프로토타입의 `Icon` 컴포넌트는 인라인 SVG (`stroke-width: 1.75`). 코드베이스 도입 시:
- 그대로 가져가거나
- **Lucide** (https://lucide.dev) 추천 — 동일한 스타일 라인 아이콘 세트. `lucide-react`로 import.

쓰인 아이콘 매핑 (`ui.jsx`의 `Icon` 컴포넌트 참조):

| 프로토타입 name | Lucide 대응 |
|---|---|
| send | Send |
| back / forward | ChevronLeft / ChevronRight |
| menu | Menu |
| plus | Plus |
| close | X |
| trash | Trash2 |
| bell | Bell |
| calendar | Calendar |
| users | Users |
| clock | Clock |
| building | Building2 |
| info | Info |
| sparkles | Sparkles |
| edit | Pencil |
| search | Search |
| lock | Lock |
| check | Check |
| alert | TriangleAlert |
| refresh | RefreshCw |
| settings | Settings |
| more | MoreHorizontal |
