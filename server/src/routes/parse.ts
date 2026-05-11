/**
 * POST /parse — 채팅 멀티턴 파싱 (D-021).
 *
 * TODO:
 * - body 검증 (ParseRequest)
 * - llm/client.parse(history, now) 호출
 * - 응답을 ParseResponse 형태로 정규화
 * - 동시에 conversations 테이블에 mirror upsert (D-018) — 또는 별도 라우트에서 클라가 호출
 */

import type { FastifyInstance } from 'fastify';

export async function parseRoute(_app: FastifyInstance): Promise<void> {
  // TODO
}
