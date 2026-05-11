/**
 * Fastify onRequest 훅 — X-Client-Id 검증 및 Client upsert (D-019, D-024).
 *
 * 동작:
 * 1. `X-Client-Id` 헤더가 UUID v4 형식인지 확인. 아니면 400.
 * 2. `Client` 레코드 upsert (없으면 생성, lastSeenAt 갱신).
 * 3. `req.clientId` 에 주입하여 라우트에서 사용.
 *
 * TODO: 구현
 */

import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    clientId: string;
  }
}

export async function clientIdPlugin(_app: FastifyInstance): Promise<void> {
  // TODO
}
