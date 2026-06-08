/**
 * 캠퍼스 별칭 해석의 단일 출처.
 *
 * 사용자가 말한 캠퍼스 표현(자유 문자열·별칭)을 GLS campusCode("1"/"2")와
 * 정식 캠퍼스명으로 정규화한다. 이전에는 별칭 매칭 규칙이 세 곳
 * (extension/glsCoordinator 의 resolveCampusCode, slotGuards 의 학생회관
 * 명확화 패턴, server LLM 프롬프트 별칭 예시)에 따로 박혀 미묘하게 갈렸다.
 * campus 를 탐색 필수 슬롯으로 올리면서, 별칭 테이블과 해석 가능 여부 판정을
 * 여기 한 곳으로 모은다.
 */

import { CAMPUS_CODES } from '../gls/nexacroPaths';

export type CampusCode = (typeof CAMPUS_CODES)[keyof typeof CAMPUS_CODES];
export type CampusName = keyof typeof CAMPUS_CODES;

export interface ResolvedCampus {
  code: CampusCode;
  name: CampusName;
}

/**
 * 캠퍼스별 별칭 패턴. 추출된 campus 슬롯 값과 원문 모두에 쓰이도록 substring
 * 매칭(.test)을 전제로 한다. 새 별칭은 반드시 여기에만 추가한다.
 */
const CAMPUS_ALIASES: Array<{ pattern: RegExp; campus: ResolvedCampus }> = [
  {
    pattern: /(자연과학|자과|율전|수원)/,
    campus: { code: CAMPUS_CODES.자연과학캠퍼스, name: '자연과학캠퍼스' },
  },
  {
    pattern: /(인문사회과학|인사|명륜|서울)/,
    campus: { code: CAMPUS_CODES.인문사회과학캠퍼스, name: '인문사회과학캠퍼스' },
  },
];

/** 공백 제거 정규화. 별칭 매칭 전에 항상 적용. */
export function normalizeCampusKeyword(campus: string | null | undefined): string {
  return String(campus ?? '').replace(/\s+/g, '').trim();
}

/**
 * campus 표현/원문을 해석해 코드·정식명을 돌려준다. 해석 불가면 null.
 * 자연과학 별칭을 먼저 검사하므로 "인문사회과학"이 "과학"으로 오인되지 않는다.
 */
export function resolveCampus(campus: string | null | undefined): ResolvedCampus | null {
  const normalized = normalizeCampusKeyword(campus);
  if (!normalized) return null;
  for (const { pattern, campus: resolved } of CAMPUS_ALIASES) {
    if (pattern.test(normalized)) return resolved;
  }
  return null;
}

/** GLS campusCode("1"/"2")로 정규화. 해석 불가면 undefined. */
export function resolveCampusCode(campus: string | null | undefined): CampusCode | undefined {
  return resolveCampus(campus)?.code;
}

/** campus 슬롯이 채워졌고 알려진 캠퍼스로 해석되는가 — 탐색 필수 조건. */
export function isResolvableCampus(campus: string | null | undefined): boolean {
  return resolveCampus(campus) !== null;
}

/** 원문에 캠퍼스가 명시돼 있는지(학생회관 명확화 억제 조건 등). */
export function mentionsCampus(text: string | null | undefined): boolean {
  return resolveCampus(text) !== null;
}
