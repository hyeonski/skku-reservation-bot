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
 */
export function selectComboByText(dm: any, comboSuffix: string, label: string): void {
  const combo = dm[comboSuffix];
  if (!combo) throw new Error(`combo not found: ${comboSuffix}`);
  const dropId = combo.id + '.dropbutton';
  const drop = document.getElementById(dropId);
  if (!drop) throw new Error(`dropbutton not found: ${dropId}`);
  nexClick(drop);

  const itemPrefix = combo.id + '.combolist.item_';
  const items = Array.from(
    document.querySelectorAll<HTMLElement>('div[id*=".combolist.item_"]'),
  ).filter((d) => d.id.startsWith(itemPrefix) && !d.id.endsWith(':text'));
  const target = items.find((it) => it.innerText.trim() === label);
  if (!target) {
    const available = items.map((i) => i.innerText.trim()).join(', ');
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
 * 클릭 후 dsGrdSub에 해당 공간의 점유 일정이 채워짐.
 *
 * 1차 시도: Nexacro grdCal.selectRow + cell click handler 호출
 * 2차 시도: 좌표 기반 클릭 (PoC에서 검증된 방식)
 *
 * TODO: 슬라이스 9에서 실제 환경에서 더 견고한 방법 검증·보강.
 */
export function clickSpaceRow(glsSpaceCode: string): void {
  const form = activePopupForm();
  const ds = form.dsGrdMainNew;
  let rowIdx = -1;
  for (let i = 0; i < ds.getRowCount(); i++) {
    if (ds.getColumn(i, 'GU_SPACE_CD') === glsSpaceCode) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx === -1) {
    throw new Error(`space ${glsSpaceCode} not in dsGrdMainNew — re-trigger building cascade?`);
  }

  const grdCal = form.grdCal;
  if (grdCal && typeof grdCal.selectRow === 'function') {
    grdCal.selectRow(rowIdx);
    // grdCal_OnCellClick 핸들러는 보통 user event라 직접 호출은 어색하지만, 일부 환경에선 작동
    try {
      form.grdCal_OnCellClick?.(grdCal, { row: rowIdx, cell: 0 });
    } catch {
      /* ignore — fallback below */
    }
  }
  // 좌표 폴백은 슬라이스 9에서 grdCal DOM 구조 확인 후 보강
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
