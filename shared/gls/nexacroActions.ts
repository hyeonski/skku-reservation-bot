/**
 * GLS Nexacro 자동화 헬퍼.
 *
 * 이 모듈의 함수들은 GLS 페이지의 `window.nexacro` 전역에 의존한다.
 * 확장 content script에서 import해 직접 실행하거나, 시딩 스크립트의
 * Playwright `page.evaluate` 컨텍스트 안에서만 호출 가능.
 *
 * 모든 구현은 PoC에서 검증된 패턴을 따른다 — docs/GLS_DOM_NOTES.md 참조.
 */

import type { SpaceScheduleRow } from './schemas';

declare global {
  // GLS 페이지 컨텍스트에서만 존재
  // eslint-disable-next-line no-var
  var nexacro: any;
}

// ---------- 기본 DOM 헬퍼 ----------

/**
 * Nexacro가 인식하는 마우스 이벤트 시퀀스를 dispatch.
 * `el.click()`만으로는 Nexacro가 반응하지 않으므로 mouseover→mousedown→mouseup→click을 순서대로 발화.
 */
export function nexClick(el: Element): void {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (const type of ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        view: window,
      }),
    );
  }
}

/**
 * id suffix로 보이는 요소 1개를 찾는다 (`:icontext` 제외).
 * 예: `byIdSuffix('btnInsert4')` → `[id$=".btnInsert4"]:not([id$=":icontext"])`
 */
export function byIdSuffix(suffix: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[id$=".${suffix}"]:not([id$=":icontext"])`,
  );
}

/** 현재 화면에 보이는 모든 요소 중 텍스트가 정확히 일치하는 div 반환 */
export function findByText(text: string): HTMLElement | null {
  const divs = Array.from(document.querySelectorAll<HTMLElement>('div'));
  return (
    divs.find(
      (d) => d.offsetParent !== null && d.innerText && d.innerText.trim() === text,
    ) ?? null
  );
}

// ---------- Nexacro 컴포넌트 트리 접근 ----------

/**
 * 가장 최근에 열린 popupFrame (예약신청 모달)의 `.form` 객체 반환.
 * 여러 popupFrame이 살아있을 수 있어 마지막 키를 active로 간주.
 */
export function activePopupForm(): any {
  const app = nexacro.getApplication();
  const top = app.mainframe.TopFrame;
  const popupNames = Object.keys(top).filter((k) => k.startsWith('popupFrame'));
  if (popupNames.length === 0) throw new Error('no popupFrame open');
  const latest = popupNames[popupNames.length - 1]!;
  return top[latest].form;
}

/** active popup form의 `divManage.form` — 모달 필드 컨테이너 */
export function activeModalDM(): any {
  return activePopupForm().divManage.form;
}

// ---------- 콤보박스 ----------

/**
 * 콤보박스를 텍스트 라벨로 선택. cascade(onItemChanged) 발화에 필요.
 * 내부적으로 dropbutton 클릭 → combolist.item_N 텍스트 매칭 후 클릭.
 *
 * 주의 1: Nexacro 컴포넌트의 `.id`는 short name(예: `"cboCampusCd"`)만 노출되고
 *   풀패스가 아니라서 `document.getElementById(combo.id + '.dropbutton')`는 항상 null.
 * 주의 2: 같은 suffix가 페이지 본체 `divSearch`와 모달 `divManage` 양쪽에 존재하므로,
 *   현재 popupFrame prefix로 좁힌 suffix 매칭으로 모달 안의 콤보만 잡는다.
 * 주의 3: Nexacro는 dropdown이 열린 직후 item text를 lazy render한다 (cold cache 시
 *   첫 열림에서 500ms로 부족할 수 있음). 따라서 async 폴링으로 매칭 item이 나타날 때까지
 *   최대 3s 대기.
 */
export async function selectComboByText(
  dm: any,
  comboSuffix: string,
  label: string,
): Promise<void> {
  const combo = dm[comboSuffix];
  if (!combo) throw new Error(`combo not found: ${comboSuffix}`);

  const app = nexacro.getApplication();
  const top = app.mainframe.TopFrame;
  const popupKeys = Object.keys(top).filter((k) => k.startsWith('popupFrame'));
  if (popupKeys.length === 0) throw new Error('no popupFrame open');
  const popupPrefix = `mainframe.TopFrame.${popupKeys[popupKeys.length - 1]}.`;

  const dropSel = `div[id^="${popupPrefix}"][id$=".${comboSuffix}.dropbutton"]:not([id$=":icontext"])`;
  const drop = document.querySelector<HTMLElement>(dropSel);
  if (!drop) throw new Error(`dropbutton not found: ${dropSel}`);
  nexClick(drop);

  const itemSel = `div[id^="${popupPrefix}"][id*=".${comboSuffix}.combolist.item_"]`;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const deadline = Date.now() + 3000;
  let target: HTMLElement | null = null;
  let lastSnapshot: HTMLElement[] = [];
  while (Date.now() < deadline) {
    lastSnapshot = Array.from(document.querySelectorAll<HTMLElement>(itemSel)).filter(
      (d) => !d.id.endsWith(':text'),
    );
    target = lastSnapshot.find((it) => it.innerText.trim() === label) ?? null;
    if (target) break;
    await wait(150);
  }
  if (!target) {
    const available = lastSnapshot.map((i) => i.innerText.trim()).join(', ');
    throw new Error(`combo ${comboSuffix} option not found: "${label}". Available: ${available}`);
  }
  nexClick(target);
}

/**
 * 콤보박스에 코드 값을 직접 set (cascade 발화 안 함, 단순 커밋용).
 */
export function setComboValue(dm: any, comboSuffix: string, code: string): void {
  const combo = dm[comboSuffix];
  if (!combo) throw new Error(`combo not found: ${comboSuffix}`);
  combo.set_value(code);
}

// ---------- 데이터셋 ----------

/** popup form에서 데이터셋 1개를 row 배열로 dump */
export function readDataset<T = Record<string, unknown>>(form: any, dsName: string): T[] {
  const ds = form[dsName];
  if (!ds || typeof ds.getRowCount !== 'function') {
    throw new Error(`dataset not found: ${dsName}`);
  }
  const colCount = ds.getColCount();
  const cols: string[] = [];
  for (let c = 0; c < colCount; c++) cols.push(ds.getColID(c));
  const rows: T[] = [];
  for (let i = 0; i < ds.getRowCount(); i++) {
    const r: Record<string, unknown> = {};
    for (const col of cols) r[col] = ds.getColumn(i, col);
    rows.push(r as T);
  }
  return rows;
}

// ---------- 공지사항 alert 처리 ----------

/**
 * 공간 row 클릭 시 뜨는 공지사항 alert가 있으면 닫는다.
 * 없으면 무시 (idempotent).
 *
 * 휴리스틱: "공지사항" 헤더를 가진 가시 div를 찾아 같은 컨테이너 내 닫기 버튼을 클릭.
 * Nexacro alert popup의 정확한 컴포넌트 경로는 슬라이스 9 PoC에서 보강.
 *
 * TODO: 슬라이스 9에서 Nexacro alert API 직접 호출로 대체.
 */
export function dismissNoticeIfShown(): void {
  // "공지사항" 텍스트를 가진 헤더를 찾아 같은 popupFrame 부모의 닫기 버튼 시도
  const noticeHeader = findByText('공지사항');
  if (!noticeHeader) return;
  // 같은 alert 컨테이너에서 X 또는 닫기 버튼 찾기
  // Nexacro alert는 보통 mainframe 직속 별도 frame으로 떠있음
  let parent: HTMLElement | null = noticeHeader.parentElement;
  while (parent) {
    const closeBtn = parent.querySelector<HTMLElement>(
      '[id$=".btnClose"]:not([id$=":icontext"]), [id$=".btnX"]:not([id$=":icontext"])',
    );
    if (closeBtn && closeBtn.offsetParent !== null) {
      nexClick(closeBtn);
      return;
    }
    parent = parent.parentElement;
  }
  // 폴백 — Escape 키 dispatch
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// ---------- 자동화 시퀀스 (고수준) ----------

/**
 * 모달의 공간 시간표 row를 클릭하여 dsGrdSub를 로드한다.
 * 클릭 후 cboSpaceCd가 자동 set되고, edtUseNum이 최대 정원으로 채워지며,
 * dsGrdSub에 해당 공간의 일주일치 점유 일정이 채워진다 (검증 2026-05-13).
 *
 * 클릭 대상: `grdCal.body.gridrow_${rowIdx}.cell_${rowIdx}_0` DOM 요소.
 * Nexacro 의 grdCal.selectRow + grdCal_OnCellClick 직접 호출은 side-effect를
 * 트리거하지 않아 (검증 완료) **반드시 실제 cell DOM에 마우스 이벤트 시퀀스 dispatch**.
 *
 * 또한 `grdCal` 컴포넌트의 `.id` 가 short name (`"grdCal"`) 만 노출되어
 * `getElementById(grd.id + '.body')` 가 항상 null. popup-prefix suffix 매칭으로 찾는다.
 */
export function clickSpaceRow(glsSpaceCode: string): void {
  const form = activePopupForm();
  const ds = form.dsGrdMainNew;
  let rowIdx = -1;
  for (let i = 0; i < ds.getRowCount(); i++) {
    if (String(ds.getColumn(i, 'GU_SPACE_CD')) === String(glsSpaceCode)) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx === -1) {
    throw new Error(`space ${glsSpaceCode} not in dsGrdMainNew — re-trigger building cascade?`);
  }

  const top = nexacro.getApplication().mainframe.TopFrame;
  const popupKeys = Object.keys(top).filter((k) => k.startsWith('popupFrame'));
  if (popupKeys.length === 0) throw new Error('no popupFrame open');
  const popupPrefix = `mainframe.TopFrame.${popupKeys[popupKeys.length - 1]}.`;

  const cellSel = `div[id^="${popupPrefix}"][id$=".grdCal.body.gridrow_${rowIdx}.cell_${rowIdx}_0"]:not([id$=":icontext"])`;
  const cell = document.querySelector<HTMLElement>(cellSel);
  if (!cell) {
    throw new Error(`grdCal cell not found for row ${rowIdx}: ${cellSel}`);
  }
  nexClick(cell);
}

/**
 * 폼 여러 필드를 한 번에 set_value.
 * cascade 트리거가 필요한 필드(campus/build)는 별도로 selectComboByText를 써야 함.
 */
export function setFormValues(dm: any, values: Record<string, string | number>): void {
  for (const [suffix, val] of Object.entries(values)) {
    const cmp = dm[suffix];
    if (!cmp) throw new Error(`component not found: ${suffix}`);
    cmp.set_value(String(val));
  }
}

/**
 * 예약 저장. 호출 전 모든 필수 필드가 채워졌는지 호출 측이 검증해야 함.
 */
export function submitReservation(): void {
  const pf = activePopupForm();
  if (typeof pf.btnSave_OnClick !== 'function') {
    throw new Error('btnSave_OnClick not available');
  }
  pf.btnSave_OnClick();
}

// ---------- 가용성 판정 ----------

/**
 * 한 공간이 [startHour:00, endHour:00] 동안 비어있는지 판정.
 * dsGrdSub의 row 들을 받아 TM_TERM·날짜 정보를 보고 conflict 검사.
 *
 * @param schedule clickSpaceRow 호출 후 dump한 dsGrdSub 내용
 * @param date     "yyyymmdd"
 * @param startHour 시작 시 (24h)
 * @param endHour  종료 시 (24h, exclusive)
 */
export function isAvailable(
  schedule: SpaceScheduleRow[],
  date: string,
  startHour: number,
  endHour: number,
): boolean {
  const wantStart = startHour * 60;
  const wantEnd = endHour * 60;
  for (const row of schedule) {
    if (!coversDate(row, date)) continue;
    const range = parseTimeTerm(row.TM_TERM);
    if (!range) continue;
    const [s, e] = range;
    // 겹침: s < wantEnd && e > wantStart
    if (s < wantEnd && e > wantStart) return false;
  }
  return true;
}

// ---------- 내부 헬퍼 (export하지 않음) ----------

function parseTimeTerm(term: string): [number, number] | null {
  const m = term.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [
    parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10),
    parseInt(m[3]!, 10) * 60 + parseInt(m[4]!, 10),
  ];
}

function coversDate(row: SpaceScheduleRow, date: string): boolean {
  // 단일 발생: GANGJWA_START_DATE가 target과 일치
  if (row.GANGJWA_START_DATE === date) return true;

  // 주간 반복: INFO2의 yyyy/mm/dd~yyyy/mm/dd 범위 내 + DOW 매칭
  const m = row.INFO2?.match(/(\d{4})\/(\d{2})\/(\d{2})\s*~\s*(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return false;
  const rangeStart = m[1]! + m[2]! + m[3]!;
  const rangeEnd = m[4]! + m[5]! + m[6]!;
  if (date < rangeStart || date > rangeEnd) return false;
  return dayOfWeek(row.GANGJWA_START_DATE) === dayOfWeek(date);
}

function dayOfWeek(yyyymmdd: string): number {
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  return new Date(y, m - 1, d).getDay();
}
