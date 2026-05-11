/**
 * LLM 어댑터 — DeepSeek (D-007), OpenAI 호환 API.
 *
 * 책임:
 * - DeepSeek-Chat에 슬롯 파싱 요청
 * - 응답을 ParseResponse 형태로 정규화
 *
 * TODO:
 * - openai 패키지로 baseUrl=config.llm.baseUrl 설정해 인스턴스 생성
 * - prompts.ts의 시스템 프롬프트 + history를 messages로 변환
 * - response_format JSON 강제
 * - JSON 파싱 + Zod 검증
 */

import type { ParseResponse, ChatMessage } from '../schemas/parse.js';

export interface ParseInput {
  history: ChatMessage[];
  now: string;
}

export async function parseWithLLM(_input: ParseInput): Promise<ParseResponse> {
  // TODO
  throw new Error('not implemented');
}
