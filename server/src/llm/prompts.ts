/**
 * LLM 시스템 프롬프트 + few-shot 예시.
 *
 * D-021 슬롯 스키마와 1:1 대응. 응답 JSON 형식과 intent enum을 명시.
 * 한국어 자연어 표현(상대 날짜·시간 표현)을 정확하게 파싱하는 게 핵심.
 *
 * TODO:
 * - SYSTEM_PROMPT: 슬롯 정의, 응답 JSON 형식, intent 분류 기준
 * - FEW_SHOT: "다음 주 화요일 6시 20명 회의실 잡아줘" 같은 예시들
 * - now 변수를 활용한 상대 날짜 해석 가이드
 */

export const SYSTEM_PROMPT = `TODO: 슬롯 추출 시스템 프롬프트`;

export const FEW_SHOT_EXAMPLES: Array<{ user: string; assistant: string }> = [
  // TODO
];
