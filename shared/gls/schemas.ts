/**
 * GLS Nexacro 데이터셋 row 타입 정의.
 * 시딩 스크립트와 확장 content script가 동일 타입으로 핸들링.
 *
 * 출처: docs/GLS_DOM_NOTES.md §7 (PoC dump 결과).
 */

/** dsCboCampusCd row */
export interface CampusRow {
  COM_CD: string;     // "1" | "2"
  CD_NM: string;      // "인문사회과학캠퍼스" | "자연과학캠퍼스"
  SHRT_NM: string;    // "인사캠" | "자과캠"
}

/** dsCboBuildCd row */
export interface BuildingRow {
  CAMPUS_CD: string;
  BUILD_NO: string;   // 예: "240"
  BUILD_NM: string;   // 예: "반도체관"
}

/** dsCboSpace row — 시딩의 핵심 소스 */
export interface SpaceRow {
  GU_SPACE_CD: string;        // 공간 코드 (unique) 예: "400126"
  CAMPUS_CD: string;
  BUILD_NO: string;
  SPACE_NM: string;            // 예: "[400126] 첨단강의실 / 40 명 ~ 120 명"

  CAPA_NO: number | { hi: number; lo: number };    // 최대 정원 (Nexacro 64bit 타입 가능)
  MIN_PERSON: number | { hi: number; lo: number }; // 최소 인원

  USE_JOJIK_CD: string;        // 사용 우선 학과/행정실 코드
  USE_JOJIK_CD_NM: string;     // 예: "정보통신/소프트웨어융합/공과대학행정실"
  ADMIN_JOJIK_CD: string;
  ADMIN_JOJIK_CD_NM: string;   // 예: "교무팀"

  CONTENTS: string;            // 공지문 본문 (alert로 띄워지는 텍스트)

  LIMIT_DAY_YN: 'Y' | 'N' | '';
  LIMIT_DAY: string;           // 일수 문자열 ("0", "3" 등)
  LIMIT_TIME_YN: 'Y' | 'N' | '';
  LIMIT_TIME: string;          // HHMM 예: "0800" = 8시간

  DAEYEO_GB: string;           // "1" = 학생대여가능

  DUP_YN?: string;
  RES_TIME?: string;
  SINCHUNG_FROM_DT?: string;
  SINCHUNG_TO_DT?: string;
}

/**
 * dsGrdSub row — 가용성 판정의 단일 진실.
 * 공간 row 클릭 시 해당 공간의 점유 일정으로 채워진다.
 */
export interface SpaceScheduleRow {
  GUBUN: '수업' | '예약' | '대여';
  INFO1: string;               // 이름 + 사람 예: "성균논어[노단경]", "정규세션[신청자:정지운]"
  INFO2: string;               // 기간 또는 상태 예: "2026/05/11~2026/05/17", " (승인)"
  TM_TERM: string;             // "HH:MM~HH:MM"
  GANGJWA_START_DATE: string;  // "yyyymmdd"
}

/** dsCboHangsaGb row */
export interface HangsaGbRow {
  CD: string;   // 코드 (예: "111")
  CD_NM: string; // 이름 (예: "교내단체행사(학생회/동아리)")
}

/** dsCboTime row */
export interface TimeRow {
  CD: string;   // "0900" | "0930" | ...
  CD_NM: string; // "09:00" | ...
}

/**
 * Nexacro 64bit 정수가 들어올 수 있으므로 정규화 헬퍼.
 * `{ hi, lo }` 형태일 경우 `hi`만 사용해도 P1 범위(0~999명) 충분.
 */
export function toNumber(v: number | { hi: number; lo: number } | string | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10) || 0;
  return v.hi;
}
