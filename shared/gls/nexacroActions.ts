/**
 * GLS Nexacro 자동화 헬퍼.
 *
 * 이 모듈의 함수들은 GLS 페이지의 `window.nexacro` 전역에 의존한다.
 * 확장 content script에서 import해 직접 실행하거나, 시딩 스크립트의
 * Playwright `page.evaluate` 컨텍스트 안에서만 호출 가능.
 *
 * 모든 구현은 PoC에서 검증된 패턴을 따른다 — docs/GLS_DOM_NOTES.md 참조.
 */

import type { SpaceRow, SpaceScheduleRow } from './schemas';

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
  // TODO
  throw new Error('not implemented');
}

/**
 * id suffix로 보이는 요소 1개를 찾는다 (`:icontext` 제외).
 * 예: `byIdSuffix('btnInsert4')` → `[id$=".btnInsert4"]:not([id$=":icontext"])`
 */
export function byIdSuffix(suffix: string): HTMLElement | null {
  // TODO
  throw new Error('not implemented');
}

/** 현재 화면에 보이는 모든 요소 중 텍스트가 정확히 일치하는 div 반환 */
export function findByText(text: string): HTMLElement | null {
  // TODO
  throw new Error('not implemented');
}

// ---------- Nexacro 컴포넌트 트리 접근 ----------

/**
 * 가장 최근에 열린 popupFrame (예약신청 모달)의 `.form` 객체 반환.
 * 여러 popupFrame이 살아있을 수 있어 마지막 키를 active로 간주.
 */
export function activePopupForm(): any {
  // TODO: return nexacro.getApplication().mainframe.TopFrame[lastPopupName].form
  throw new Error('not implemented');
}

/** active popup form의 `divManage.form` — 모달 필드 컨테이너 */
export function activeModalDM(): any {
  // TODO
  throw new Error('not implemented');
}

// ---------- 콤보박스 ----------

/**
 * 콤보박스를 텍스트 라벨로 선택. cascade(onItemChanged) 발화에 필요.
 * 내부적으로 dropbutton 클릭 → combolist.item_N 텍스트 매칭 후 클릭.
 */
export function selectComboByText(dm: any, comboSuffix: string, label: string): void {
  // TODO
  throw new Error('not implemented');
}

/**
 * 콤보박스에 코드 값을 직접 set (cascade 발화 안 함, 단순 커밋용).
 */
export function setComboValue(dm: any, comboSuffix: string, code: string): void {
  // TODO: dm[comboSuffix].set_value(code)
  throw new Error('not implemented');
}

// ---------- 데이터셋 ----------

/** popup form에서 데이터셋 1개를 row 배열로 dump */
export function readDataset<T = unknown>(form: any, dsName: string): T[] {
  // TODO
  throw new Error('not implemented');
}

// ---------- 공지사항 alert 처리 ----------

/**
 * 공간 row 클릭 시 뜨는 공지사항 alert가 있으면 닫는다.
 * 없으면 무시 (idempotent).
 */
export function dismissNoticeIfShown(): void {
  // TODO: 우상단 X 좌표 클릭 또는 Nexacro alert close API
  throw new Error('not implemented');
}

// ---------- 자동화 시퀀스 (고수준) ----------

/**
 * 모달의 공간 시간표 row를 클릭하여 dsGrdSub를 로드한다.
 * 클릭 후 dsGrdSub에 해당 공간의 점유 일정이 채워짐.
 */
export function clickSpaceRow(glsSpaceCode: string): void {
  // TODO: dsGrdMainNew에서 row index 찾고, 좌표 계산 후 클릭
  throw new Error('not implemented');
}

/**
 * 폼 여러 필드를 한 번에 set_value.
 * cascade 트리거가 필요한 필드(campus/build)는 별도로 selectComboByText를 써야 함.
 */
export function setFormValues(dm: any, values: Record<string, string>): void {
  // TODO
  throw new Error('not implemented');
}

/**
 * 예약 저장. 호출 전 모든 필수 필드가 채워졌는지 호출 측이 검증해야 함.
 */
export function submitReservation(): void {
  // TODO: activePopupForm().btnSave_OnClick()
  throw new Error('not implemented');
}

// ---------- 가용성 판정 ----------

/**
 * 한 공간이 [startHour:00, endHour:00] 동안 비어있는지 판정.
 * dsGrdSub의 row 들을 받아 TM_TERM·GANGJWA_START_DATE를 보고 conflict 검사.
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
  // TODO
  throw new Error('not implemented');
}
