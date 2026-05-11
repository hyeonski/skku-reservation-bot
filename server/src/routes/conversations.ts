/**
 * 대화 mirror 라우트 (D-018, D-024).
 *
 * 라우트:
 * - POST   /conversations          — upsert (id는 body의 conversation_id 또는 별도 경로 형태)
 * - GET    /conversations/:id      — fetch (이어가기)
 * - POST   /conversations/:id/abandon — 사용자 명시적 중단
 *
 * 소유권 검증: conversation.clientId === req.clientId, 불일치 시 403.
 *
 * TODO: 구현
 */

import type { FastifyInstance } from 'fastify';

export async function conversationsRoute(_app: FastifyInstance): Promise<void> {
  // TODO
}
