/**
 * GLS Nexacro 컴포넌트 id suffix 사전.
 *
 * GLS는 Nexacro Platform SPA로 모든 UI 요소가 컴포넌트 경로를 id로 가진다.
 * DOM 매칭은 항상 `[id$=".${SUFFIX}"]:not([id$=":icontext"])` 패턴으로 한다.
 *
 * 출처: docs/GLS_DOM_NOTES.md (PoC 결과). 학교 시스템 업데이트로 깨질 경우 여기만 수정.
 */

// ---------- URL ----------

export const GLS_HOME_URL = 'https://kingoinfo.skku.edu';
export const LOGIN_URL_PREFIX = 'https://login.skku.edu';

// ---------- 상단 메뉴 (M-코드) ----------

export const MENU_CODES = {
  학사일정: 'btnM532000000',
  신청자격관리: 'btnM532010000',
  학적개인영역: 'btnM532020000',
  수업영역: 'btnM532030000',
  학업영역: 'btnM532040000',
  장학영역: 'btnM546050902',
  공학인증: 'btnM532060000',
} as const;

/** 신청/자격관리 > 학생생활관련신청 > 공간대여신청 서브메뉴 */
export const SUBMENU_SPACE_RESERVATION = 'btnMenuM000011122';

// ---------- 공간대여신청 페이지 ----------

export const PAGE_BUTTONS = {
  조회: 'btnSearch',
  예약신청: 'btnInsert4', // 모달 오픈
  신청취소: 'btnDelete4',
  강의실종합안내: 'btnClassURL',
} as const;

// ---------- 예약신청 모달 (popupFrame<uuid>.form.divManage.form.*) ----------

export const MODAL_FIELDS = {
  // 인적사항 (자동 채움)
  학번: 'edtSinchungHakbun',
  성명: 'edtSinchungPerNm',
  연락처: 'edSinchungTel', // 주의: edSinchung (오타 아님, GLS 원본)

  // 신청사항
  행사구분: 'cboHangsaGb',
  주관단체: 'edtSinchungGroup',
  행사명: 'edtSinchungEvent',
  행사인원: 'edtUseNum',

  // 위치
  캠퍼스: 'cboCampusCd',
  건물: 'cboBuildCd',
  공간: 'cboSpaceCd',

  // 일시
  예약일: 'calUseDt',
  시작시간: 'cboResStTime',
  종료시간: 'cboResEdTime',

  // 자유 텍스트
  사용목적: 'TextArea00',

  // 표시 전용 (자동 채움)
  최대수용인원: 'edtCAPA_NO',
} as const;

export const MODAL_BUTTONS = {
  저장: 'btnSave',
  닫기X: 'btnX', // 내부 grdMain 의존으로 직접 호출 시 실패 가능 → 좌표 클릭 권장
  닫기: 'btnClose',
} as const;

// ---------- 모달 내 Nexacro form 메서드 (popupForm.form.*) ----------

export const POPUP_FORM_METHODS = {
  btnSave_OnClick: 'btnSave_OnClick',
  btnClose_OnClick: 'btnClose_OnClick',
  btnX_OnClick: 'btnX_OnClick',
  fncSpaceSearch: 'fncSpaceSearch',
  fn_space_info: 'fn_space_info',
  fn_space_limit: 'fn_space_limit',
  fncLimitChk: 'fncLimitChk',
} as const;

// ---------- 데이터셋 이름 ----------

export const DATASETS = {
  /** 행사구분 옵션 */
  hangsaGb: 'dsCboHangsaGb',
  /** 캠퍼스 옵션 (COM_CD, CD_NM) */
  campus: 'dsCboCampusCd',
  /** 건물 옵션 (CAMPUS_CD, BUILD_NO, BUILD_NM) */
  building: 'dsCboBuildCd',
  /** 공간 메타데이터 — 시딩의 핵심 소스 */
  space: 'dsCboSpace',
  /** 시간 옵션 (HH:MM) */
  time: 'dsCboTime',
  /** 시간표 좌측 메타. ⚠️ TMxx 컬럼은 가용성 지표가 아님 (GLS_DOM_NOTES §10) */
  gridMain: 'dsGrdMainNew',
  /** 선택된 공간의 점유 일정 — 가용성 판정의 단일 진실 */
  gridSub: 'dsGrdSub',
} as const;

// ---------- 행사구분 코드 (dsCboHangsaGb 기반, 라이브 dump 2026-05-13) ----------

export const HANGSA_CODES = {
  보충수업특강시험: '115',
  교내단체행사_학생회동아리: '111',
  교내단체행사_세미나스터디: '113',
  본부부서주관행사: '112',
  단과대학주관행사: '114',
  학과주관행사: '116',
  교외단체행사: '001',
  기타: '117',
} as const;

export const HANGSA_LABELS: Record<(typeof HANGSA_CODES)[keyof typeof HANGSA_CODES], string> = {
  '115': '보충수업/특강/시험',
  '111': '교내단체행사 (학생회/동아리)',
  '113': '교내단체행사 (세미나/스터디)',
  '112': '본부부서 주관행사',
  '114': '단과대학 주관행사',
  '116': '학과 주관행사',
  '001': '교외단체행사',
  '117': '기타',
};

// ---------- 캠퍼스 코드 ----------

export const CAMPUS_CODES = {
  인문사회과학캠퍼스: '1',
  자연과학캠퍼스: '2',
} as const;
