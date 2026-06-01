# GLS DOM 분석 노트

> Claude_in_Chrome MCP로 실제 페이지를 둘러보며 채워나가는 라이브 노트.
분석 시작: 2026-05-12

---

## ⚠️ 전제: GLS는 Nexacro Platform SPA

`https://kingoinfo.skku.edu/gaia/nxui/index.html` 는 **Nexacro Platform** 기반 SPA.

```js
typeof nexacro                // 'object'
nexacro.getApplication()      // 앱 객체 반환
```

### Nexacro의 자동화 특성
- 모든 UI 요소가 절대 위치 `<div>`로 렌더 (1349개 중 1338개에 id 존재)
- CSS class는 자동생성 — **의존 금지**
- **id 속성은 컴포넌트 경로 그대로**: `mainframe.TopFrame.form.divFrame....btnInsert4`
- id suffix(`btnInsert4`, `edtSinchungEvent`)는 **의미 기반 명칭**이며 학교 시스템 전반에서 고정
- `popupFrame<uuid>`처럼 세션마다 다른 부분은 무시 — **suffix 매칭이 정답**

### 전략 A로 충분 (검증 완료)
1. 모든 요소를 `[id$=".btnInsert4"]:not([id$=":icontext"])` 같이 **suffix 매칭**으로 찾는다.
2. 클릭은 **mouse event 시퀀스를 직접 dispatch** — `el.click()` 만으로는 Nexacro가 무시.

```js
function nexClick(el) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width/2, y = r.top + r.height/2;
  for (const t of ['mouseover','mousemove','mousedown','mouseup','click']) {
    el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, clientX:x, clientY:y, button:0, view:window}));
  }
}
```

3. 텍스트 매칭이 필요한 경우: `Array.from(document.querySelectorAll('div')).filter(d => d.innerText.trim() === '공간대여신청')` — submenu 등.

---

## 1. 로그인 / 세션 감지

### 로그인 페이지
- URL: `https://login.skku.edu/?retUrl=<token>`
- 아이디 input: `input[placeholder="아이디를 입력하세요."]`
- 비밀번호 input: `input[type="password"][placeholder="비밀번호를 입력하세요."]`
- 로그인 버튼: `button` text="로그인"

### 세션 감지 로직 (확장에서 활용)
```js
// GLS 페이지 또는 ticket 만료 시 login.skku.edu로 리다이렉트됨
const isLoggedIn = !location.href.startsWith('https://login.skku');
// 또는 nexacro 앱 존재 여부
const isGlsActive = typeof nexacro !== 'undefined' && !!nexacro.getApplication();
```

**자동 로그인은 하지 않는다**. 사용자에게 "로그인이 필요합니다" 안내만.

---

## 2. GLS 진입 및 메뉴 네비게이션

### 진입 URL
- `https://kingoinfo.skku.edu` — SSO 인증되어 있으면 자동으로 ticket 부여
- ticket 만료 시 login.skku.edu 리다이렉트 → 위의 세션 감지로 캐치

### 상단 메뉴 (M-코드)
| 텍스트 | id suffix |
|---|---|
| 학사일정 | `btnM532000000` |
| **신청/자격관리** | `btnM532010000` ← 우리가 쓸 메뉴 |
| 학적/개인영역 | `btnM532020000` |
| 수업영역 | `btnM532030000` |
| 학업영역 | `btnM532040000` |
| 장학영역 | `btnM546050902` |
| 공학인증 | `btnM532060000` |

### 신청/자격관리 → 공간대여신청
- 신청/자격관리 클릭 후 팝업 메뉴에서 텍스트로 매칭하는 게 가장 안정적
- 공간대여신청 버튼 id suffix: `btnMenuM000011122`
- 클릭 시 페이지 진입

---

## 3. 공간대여신청 페이지 (기본 화면)

### 상단 필터
| 라벨 | id suffix |
|---|---|
| 학번 | `edtSinchungHakbun` (자동) |
| 성명 | `edtSinchungPerNm` (자동) |
| 신청구분 | `edtSinChungGb` (자동, "학생") |
| 캠퍼스 | `cboCampusCd` |
| 예약년 | `cboYear` |
| 예약월 | `cboMonth` |
| 예약일 가능시간 | `edtSAVE_TIME` |

### 상단 버튼
| 텍스트 | id suffix |
|---|---|
| 조회 | `btnSearch` |
| 신청취소 | `btnDelete4` |
| **예약신청** | `btnInsert4` ← 모달 오픈 |
| 강의실 종합안내 | `btnClassURL` |

---

## 4. 예약신청 모달 (`popupFrame<uuid>.form.divManage.form.*`)

> popupFrame uuid는 세션마다 다름 — suffix만으로 찾을 것.

### 폼 필드
| 라벨 | id suffix | 비고 |
|---|---|---|
| 학번 | `edtSinchungHakbun` | 자동 채움 |
| 성명 | `edtSinchungPerNm` | 자동 채움 |
| 연락처 | `edSinchungTel` | (`edSinchung` 오타 주의) |
| **행사구분** | `cboHangsaGb` | dropdown, 필수 |
| **주관단체** | `edtSinchungGroup` | 필수 |
| **행사명** | `edtSinchungEvent` | 필수 |
| **행사인원** | `edtUseNum` | 필수, 숫자 |
| **캠퍼스** | `cboCampusCd` | dropdown |
| **건물** | `cboBuildCd` | dropdown |
| **공간(호실)** | `cboSpaceCd` | dropdown — 캠퍼스/건물 선택 후 활성 |
| **예약일** | `calUseDt` | date picker |
| **시작시간** | `cboResStTime` | dropdown |
| **종료시간** | `cboResEdTime` | dropdown |
| **사용목적** | `TextArea00` | textarea, 필수 |
| 최대 수용 가능인원 | `edtCAPA_NO` | 공간 선택 시 자동 채워짐 |

### 저장
- 버튼 텍스트: "저장"
- id suffix: `btnSave`

### 모달 우측 — 예약 현황 그리드
- 공간코드, 공간명, 층, 09:00 ~ 시간별 점유 상태
- 건물 선택 시 해당 건물의 모든 공간 시간표가 표시됨
- ⚠️ **이 그리드 셀들의 상태 판정 셀렉터는 별도 PoC 필요** (다음 분석 단계).

---

## 5. 자동화 시퀀스 (Phase 1 핵심 — PoC 최종)

> §6의 Nexacro 컴포넌트 API + §10의 dsGrdSub 가용성 판정 결론을 반영한 최종 의사코드.

```ts
// 1. 진입 + 세션 확인
await openTab('https://kingoinfo.skku.edu');
if (location.href.startsWith('https://login.skku')) {
  promptUserToLogin(); return;
}

// 2. 메뉴 진입: 신청/자격관리 → 공간대여신청 (M-코드 + nexClick)
nexClick(byIdSuffix('btnM532010000'));      // 신청/자격관리
await wait(500);
nexClick(findByText('공간대여신청'));         // 서브메뉴
await wait(1500);

// 3. 예약신청 모달 오픈
nexClick(byIdSuffix('btnInsert4'));
await wait(800);
const dm = activePopupForm();               // 가장 최근 popupFrame.form.divManage.form

// 4. 캠퍼스 → 건물 cascade: DOM 콤보 클릭 (onItemChanged 발화 필요)
selectComboByText(dm, 'cboCampusCd', '자연과학캠퍼스');
await wait(500);
selectComboByText(dm, 'cboBuildCd', '반도체관');
await wait(1500);  // dsCboSpace + dsGrdMainNew 로드 대기

// 5. 날짜·시간 set_value (cascade 불필요한 단순 값)
dm.calUseDt.set_value('20260520');
dm.cboResStTime.set_value('1800');
dm.cboResEdTime.set_value('2000');

// 6. 후보 공간 순회 — DB에서 (캠퍼스, 건물, 인원) 필터로 뽑은 리스트
for (const spaceCode of candidateCodes) {
  // 시간표 row 클릭으로 dsGrdSub 로드 (가용성 판정의 유일한 출처)
  clickSpaceRow(spaceCode);  // grdCal의 해당 row 좌표 클릭
  await wait(600);
  dismissNoticeIfShown();    // CONTENTS 있는 공간은 alert 팝업 자동 닫기
  const conflicts = readDataset('dsGrdSub').filter(r =>
    overlaps(r.TM_TERM, [startHour, endHour]) && coversDate(r, date)
  );
  if (conflicts.length === 0) { selectedCode = spaceCode; break; }
}

// 7. 폼 나머지 필드 채움 (set_value)
dm.cboHangsaGb.set_value('111');             // 행사구분
dm.edtSinchungGroup.set_value('소프트웨어학과 학생회');
dm.edtSinchungEvent.set_value('주간 회의');
dm.edtUseNum.set_value('20');                // 클릭으로 자동채워진 최대값 덮어쓰기
dm.cboSpaceCd.set_value(selectedCode);
dm.TextArea00.set_value('학생회 주간 정기 회의');

// 8. 저장 — 사용자 confirm 후
await userConfirm(buildPreview(dm));
dm.parent.parent.btnSave_OnClick();          // form 메서드 직접 호출
```

핵심 헬퍼는 `shared/gls/`에 둠: `nexClick`, `byIdSuffix`, `activePopupForm`, `selectComboByText`, `readDataset`, `dismissNoticeIfShown` 등.

---

## 6. 결정적 발견: Nexacro 컴포넌트 API 직접 호출

진행하면서 발견한 가장 중요한 사실 — DOM 이벤트 dispatch보다 **Nexacro 컴포넌트 객체의 메서드를 직접 호출**하는 것이 훨씬 안정적이다.

```js
const app = nexacro.getApplication();
const top = app.mainframe.TopFrame;
const popupName = Object.keys(top).find(k => k.startsWith('popupFrame'));
const dm = top[popupName].form.divManage.form;

// 모든 값 설정 — 단순한 메서드 호출
dm.cboHangsaGb.set_value('111');             // 행사구분 (코드)
dm.edtSinchungGroup.set_value('학생회');
dm.edtSinchungEvent.set_value('주간 회의');
dm.edtUseNum.set_value('20');
dm.cboCampusCd.set_value('2');               // 자연과학캠퍼스
dm.cboBuildCd.set_value('240');              // 반도체관
dm.calUseDt.set_value('20260520');           // yyyymmdd
dm.cboResStTime.set_value('1800');           // HHMM
dm.cboResEdTime.set_value('2000');
dm.cboSpaceCd.set_value('400126');           // 공간 코드
dm.TextArea00.set_value('학생회 회의');
```

### 주의: cascade 트리거는 DOM 이벤트로

`set_value`는 값만 커밋하고 `onItemChanged` 핸들러는 발화하지 않음. 캠퍼스→건물→공간 cascade 갱신을 위해서는 **DOM 콤보를 실제 클릭**해서 변경하거나, 변경 핸들러를 명시적으로 호출.

검증된 방식: `dropbutton` 클릭 → `combolist.item_N` 클릭 시퀀스 (앞서 검증된 `nexClick` 헬퍼).

---

## 7. 데이터셋 — 구조화된 데이터 직접 접근

Nexacro의 백엔드 응답이 그대로 `dsXxx` 데이터셋에 들어가 있다. **DOM 파싱이 아니라 데이터셋 dump가 정답**.

### 주요 데이터셋 (popup form 기준)

| 데이터셋 | 용도 | 핵심 컬럼 |
|---|---|---|
| `dsCboHangsaGb` | 행사구분 옵션 | code, name (9 rows) |
| `dsCboCampusCd` | 캠퍼스 옵션 | COM_CD("1"/"2"), CD_NM, SHRT_NM (2 rows) |
| `dsCboBuildCd` | 건물 옵션 | CAMPUS_CD, BUILD_NO, BUILD_NM (캠퍼스별 9~15+) |
| **`dsCboSpace`** | **공간 메타데이터 (시딩의 핵심)** | 아래 별도 절 |
| `dsCboTime` | 시간 옵션 | "09:00"~"22:00" (27 rows) |
| `dsGrdMainNew` | 시간표 좌측 메타 (정원/이름) | BUILD_NM, GU_SPACE_CD, SPACE_NM, FLOOR + TM09~TM23 ⚠️ (TMxx는 가용성 지표 아님 — §10 참조) |
| **`dsGrdSub`** | **선택된 공간의 점유 일정 (가용성 판정의 단일 진실)** | GUBUN, INFO1, INFO2, TM_TERM, GANGJWA_START_DATE |
| `dsCboBeamSpace` | 빔프로젝터 공간 | (P1에선 미사용) |

### 시딩에 최적 — `dsCboSpace` 전체 컬럼

PoC에서 확인한 `dsCboSpace`의 row 한 줄에는 시딩에 필요한 거의 모든 정보가 들어있다. `Space` 모델은 이 컬럼들을 그대로 매핑한다.

| 컬럼 | 의미 | 예시 |
|---|---|---|
| `GU_SPACE_CD` | 공간 코드 (unique) | `"400126"` |
| `CAMPUS_CD` | 캠퍼스 코드 | `"2"` |
| `BUILD_NO` | 건물 코드 | `"240"` |
| `SPACE_NM` | 표시명 + 정원 범위 | `"[400126] 첨단강의실 / 40 명 ~ 120 명"` |
| `CAPA_NO` | 최대 정원 (정수) | `120` |
| `MIN_PERSON` | 최소 인원 (정수) | `40` |
| `USE_JOJIK_CD` / `USE_JOJIK_CD_NM` | 사용 우선 학과/행정실 | `"정보통신/소프트웨어융합/공과대학행정실"` |
| `ADMIN_JOJIK_CD` / `ADMIN_JOJIK_CD_NM` | 관리 행정실 | `"교무팀"` |
| `CONTENTS` | 공지문 본문 (alert로 띄워지는 텍스트) | 장문 (§10 예시 참조) |
| `LIMIT_DAY_YN` / `LIMIT_DAY` | 일 제한 | `"N"` / `0` |
| `LIMIT_TIME_YN` / `LIMIT_TIME` | 시간 제한 | `"Y"` / `"0800"` (8시간) |
| `DAEYEO_GB` | 대여 구분 | `"1"` = 학생대여가능 |
| `DUP_YN`, `RES_TIME`, `SINCHUNG_FROM_DT`, `SINCHUNG_TO_DT` | 기타 메타 (P1 미사용) | — |

`SPACE_NM` 파싱: `/^\[\d+\]\s*(.+?)\s*\/\s*\d+\s*명\s*~/` → `roomName`. 단 슬래시 다중 케이스(`"첨단e+ 강의실(75명) / 국제화첨단강의실 / 10 명 ~ 75 명"`)에 주의 — 첫 슬래시 이전만.

사용자 입력·표시 관점에서는 `BUILD_NO`와 `GU_SPACE_CD`가 모두 중요하다. 성균관대에서는 공간을 건물번호·공간코드·호실 번호처럼 숫자로 부르는 일이 많으므로, "330112 예약해줘" 같은 입력은 공간명 검색보다 `GU_SPACE_CD` exact match를 먼저 시도한다. 응답에는 `제2공학관(26동) XXX강의실(26312)`처럼 건물명 옆 건물번호/동, 공간명 옆 공간코드를 함께 보여줘야 한다. 한 건물이 여러 동으로 나뉘는 경우가 있어 숫자는 보조 라벨이 아니라 오인식 방지용 식별자다.

### 가능 여부 판정 — `dsGrdSub` (§10 결론)

⚠️ **`dsGrdMainNew.TMxx`는 가용성 지표가 아니다**. 수업·예약이 잡힌 강의실에서도 항상 `"0"`이었음. §10 참조.

진짜 점유 정보는 **공간 row 클릭 후 채워지는 `dsGrdSub`**에 있다. 자세한 컬럼·알고리즘은 §10 "가용성 판정 알고리즘".

---

## 8. Form의 비즈니스 로직 함수 직접 호출 가능

```
btnSave_OnClick           — 저장
btnClose_OnClick          — 닫기
btnX_OnClick              — X (닫기), 단 내부에 grdMain 의존이 있어 직접 호출 시 일부 실패 가능 → 좌표 클릭 권장
fncSpaceSearch            — 공간 재검색
divManage_cboCampusCd_OnChanged
divManage_cboBuildCd_OnChanged
divManage_calUseDt_OnChanged
divManage_cboResStTime_OnChanged
divManage_cboResEdTime_OnChanged
fn_cboHangsaGb_onChanged
fn_space_info             — 공간 상세
fn_space_limit            — 공간 제한 체크
fncLimitChk
fncBeamSpaceCheck
```

P1 자동화에서는 **저장 직전까지 set_value로 데이터 커밋 + 실제 UI에 dropdown 한 번씩 클릭으로 cascade 트리거** 후 `btnSave_OnClick()`만 호출하면 충분.

---

## 9. 검증 결과 — 전략 A 최종 확인 ✅

| 단계 | 검증 | 메커니즘 |
|---|---|---|
| 로그인 확인 | ✅ | URL 패턴 |
| GLS 접속 | ✅ | `kingoinfo.skku.edu` |
| 공간대여신청 페이지 진입 | ✅ | M-코드 메뉴 + nexClick |
| 예약신청 모달 오픈 | ✅ | `btnInsert4` + nexClick |
| 텍스트 입력 (3종) | ✅ | `cmp.set_value(str)` |
| dropdown 선택 (8개) | ✅ | `cmp.set_value(code)` 또는 dropbutton + item click |
| cascade (campus→build→space) | ✅ | DOM 클릭 시 자동 트리거 |
| 캘린더 입력 | ✅ | `cal.set_value('yyyymmdd')` |
| 시작/종료 시간 | ✅ | `cmp.set_value('HHMM')` |
| **시간표 가능 여부 판독** | ✅ | 공간 row 클릭 → `dsGrdSub` 읽어 conflict 검사 (§10) |
| 사용목적 textarea | ✅ | `ta.set_value(str)` |
| 공간 코드 set | ✅ | `cboSpaceCd.set_value('400126')` |
| 저장 직전 폼 완성도 | ✅ | 시각/내부 dataset 모두 일치 확인 |
| 모달 닫기 | ✅ | 우상단 X 좌표 클릭 |
| 실제 저장 | ⛔ 의도적으로 안 함 | `btnSave_OnClick()` 한 줄로 가능 |

**결론**: 전략 A로 Phase 1 자동화 스크립트 작성에 **구조적 장애물이 전혀 없음**. 추가로 발견한 Nexacro 컴포넌트 API/데이터셋 접근은 DOM 셀렉터 기반 자동화보다 훨씬 안정적이라, 사실상 **Nexacro 컴포넌트 path를 모은 사전**을 자동화의 기준으로 삼아야 함.

---

## 10. 추가 PoC — 시간표 셀 클릭 동작과 안내 팝업 (2026-05-12 후속)

### 핵심 결정 변경: `dsGrdMainNew.TMxx`는 가용성 지표가 **아니다**

여러 건물·날짜 테스트 결과, `dsGrdMainNew.TMxx`는 어떤 공간/날짜를 봐도 항상 `"0"`이었음 — 수업 5개가 잡힌 강의실에서도, 예약(승인된 정규세션)이 있는 강의실에서도. 즉 이 컬럼은 시각적 occupancy 렌더에 직접 매핑되지 않거나, 별도 갱신이 필요한 내부 상태로 추정됨.

**진짜 occupancy 데이터는 `dsGrdSub`** — 사용자가 특정 공간 행을 클릭하면 그 공간의 일/주간 일정이 채워진다.

### 시간표 셀 클릭 동작 (검증된 사실)

호암관 50104, 수선관 61605 등 다중 케이스로 확인:

1. **클릭한 column(시간)은 무시되고 row 전체가 선택됨**.
2. **공간(`cboSpaceCd`) 자동 선택** — 해당 row의 GU_SPACE_CD가 set됨.
3. **행사인원(`edtUseNum`) 자동 셋** — 그 공간의 최대 정원으로 채워짐.
4. **공지사항 alert 팝업** — 해당 공간에 안내 사항이 있으면 모달 형태로 표시.
5. **`dsGrdSub` 데이터 갱신** — 해당 공간의 모든 일정이 다음 컬럼으로 로드:
   - `GUBUN`: `"수업"` / `"예약"` / `"대여"`
   - `INFO1`: 이름 + 담당자/신청자 (예: `"성균논어[노단경]"`, `"정규세션[신청자:정지운]"`)
   - `INFO2`: 기간 또는 상태 (예: `"2026/05/11~2026/05/17"`, `" (승인)"`)
   - `TM_TERM`: 시간대 (`"09:00~09:50"`)
   - `GANGJWA_START_DATE`: 시작일 (yyyymmdd)

### 공지사항 출처: `dsCboSpace.CONTENTS`

처음에 못 본 컬럼이 있음. 실제로 `dsCboSpace`는 다음 컬럼도 포함:
| 컬럼 | 의미 |
|---|---|
| `CONTENTS` | **공지사항 본문 전문** — 시딩 시 함께 끌어와 사용자에게 사전 안내 가능 |
| `CAPA_NO` | 최대 정원 (정수) |
| `MIN_PERSON` | 최소 인원 (정수) |
| `LIMIT_DAY_YN` / `LIMIT_DAY` | 일 제한 |
| `LIMIT_TIME_YN` / `LIMIT_TIME` | 시간 제한 (예: `"0800"` = 8시간) |
| `DAEYEO_GB` | 대여 구분 (`"1"` = 학생대여가능) |

예시 (수선관 61605 e+강의실):
```
CONTENTS:
"★사회과학/예술대학 행정실 관리 강의실 대여 공지사항★
 [해당 강의실은 사회과학/예술대학 행정실 소속 강의실로,
  사회과학/예술대학 소속 학생 우선 신청 가능합니다.]
 - 강의실 대여 승인 이후에도 교내 행사 및 보충수업 등으로...
 - 신청 시 (대여사유, 행사내용, 참여인원) 등 제반 정보를 구체적으로 작성하여야 하며...
 - 강의실 승인 여부 확인 후 승인 시에는 반드시 공간 사용 허가서를 출력하여...
 문의사항 : 02-760-0905"
LIMIT_TIME: "0800"  // 최대 8시간 사용
LIMIT_TIME_YN: "Y"
CAPA_NO: 70
MIN_PERSON: 10
USE_JOJIK_CD_NM: "사회과학/예술대학행정실"
```

### 학과 우선/제한 패턴

조사한 모든 건물(반도체관, 다산경제관, 호암관, 수선관, 법학관)에서 **모든 공간**이 `USE_JOJIK_CD_NM` 값을 가짐 — 즉 "어느 학과/행정실 소속인지"가 항상 기록됨. 다만 안내 문구는 보통 **"우선 신청 가능"** 표현이라, 다른 학과도 신청은 가능하나 우선순위가 낮음.

PRD §1-2 ②의 "반려 리스크"는 결국 이 USE_JOJIK + 행사 적합성 매칭의 결과. **시딩 단계에서 CONTENTS+USE_JOJIK을 모두 끌어와 두면, 우리 사용자의 소속(학과)과 매칭해 안내 가능**:
- 동일 학과 → "우선 신청 가능 공간입니다"
- 다른 학과 → "이 공간은 X학과 우선이며 반려될 수 있습니다"

### 가용성 판정 알고리즘 (P1 확정)

```ts
// 입력: 캠퍼스, 건물, 날짜, [startHour, endHour], 최소인원
// 1. cboCampusCd / cboBuildCd 콤보를 DOM 클릭으로 변경 (cascade 트리거)
// 2. calUseDt.set_value(yyyymmdd)
// 3. dsCboSpace를 인원/USE_JOJIK으로 1차 필터링 → 후보 공간 리스트
// 4. 각 후보 공간 row를 클릭하여 dsGrdSub 로드
//    - 클릭은 좌표 기반 또는 grdCal_OnCellClick(row, col=0) 호출
// 5. dsGrdSub의 행 중 [startHour, endHour]와 TM_TERM이 겹치는 게 있는지 판정
//    - 수업/예약/대여 GUBUN 모두 conflict
//    - 수업: INFO2가 "2026/05/18~2026/05/24" 같은 기간 문자열일 수 있으므로,
//      요청일이 그 기간 안에 들어오면 conflict
//    - 예약/대여: INFO2가 "(승인)" 같은 상태 문자열일 수 있으므로 기간 파싱에만 의존하면 안 됨.
//      현재 선택 날짜 문맥에서 로드된 row라면 TM_TERM 겹침만으로 conflict
// 6. 첫 번째 가용 공간 찾으면 사용자에게 confirm → save
```

### 추가 발견: `dsGrdSub` 컬럼

- `_chk`, `GUBUN`, `INFO1`, `INFO2`, `GANGJWA_START_DATE`, `TM_TERM`

### 다중 popupFrame 이슈

`btnX_OnClick`이나 X 좌표 클릭으로 모달을 닫아도 `popupFrame<uuid>`가 `app.mainframe.TopFrame`에 살아있고, 새로 모달을 열면 새 popupFrame이 생성됨. 자동화 코드는 **가장 최근(배열의 마지막) popupFrame을 active로 간주**해야 함:

```js
const popups = Object.keys(top).filter(k => k.startsWith('popupFrame'));
const activePopup = popups[popups.length - 1];
```

---

## 11. 시딩 스크립트 설계

`server/scripts/scrape-spaces.ts` 의사코드:

```ts
// 1. 개발자 쿠키 주입한 Playwright로 kingoinfo.skku.edu 진입
// 2. 메뉴: 신청/자격관리 → 공간대여신청 → btnInsert4 (예약신청 모달)
// 3. page.evaluate 안에서 nexacro.getApplication() 으로 접근
// 4. dsCboCampusCd → 캠퍼스 목록 dump
// 5. 각 캠퍼스에 대해:
//    a. cboCampusCd 콤보 DOM 클릭으로 변경 (cascade 트리거)
//    b. dsCboBuildCd → 건물 목록 dump
//    c. 각 건물에 대해:
//       - cboBuildCd 콤보 DOM 클릭으로 변경 (cascade 트리거 → dsCboSpace 자동 로드)
//       - 짧은 대기 (1.5s)
//       - dsCboSpace 전체 dump
//       - 각 row를 Space 모델 컬럼에 매핑하여 Prisma upsert
//         (코드·이름·정원범위·USE_JOJIK·CONTENTS·LIMIT 모두 1:1)
// 6. 멱등 — glsSpaceCode 가 unique key
```

캠퍼스/건물 순회만 자동화하면 공간 메타 + 공지문 + 정원 + 학과 제한 + 사용 제한이 한 번에 다 들어옴. **DOM 파싱 거의 없음** — Nexacro 데이터셋 dump가 핵심.
