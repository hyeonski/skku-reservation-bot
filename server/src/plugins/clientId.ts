/**
 * Fastify onRequest 훅 — X-Client-Id 검증 및 Client upsert (D-019, D-024).
 *
 * 동작:
 * 1. `X-Client-Id` 헤더가 UUID v4 형식인지 확인. 아니면 400.
 * 2. `Client` 레코드 upsert (없으면 생성, lastSeenAt 갱신).
 * 3. `req.clientId` 에 주입하여 라우트에서 사용.
 *
 * 헬스체크(/health) 경로는 스킵.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    clientId: string;
  }
}

const uuidV4Schema = z.string().uuid();

const SKIP_PATHS = new Set<string>(['/health']);

export const clientIdPlugin = fp(async function clientIdPlugin(app: FastifyInstance) {
  // 기본값 데코레이트 — 모든 요청에서 안전하게 접근 가능하도록.
  app.decorateRequest('clientId', '');

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const routePath = req.routeOptions?.url ?? req.url;
    if (SKIP_PATHS.has(routePath)) {
      return;
    }

    const raw = req.headers['x-client-id'];
    const headerValue = Array.isArray(raw) ? raw[0] : raw;

    const parsed = uuidV4Schema.safeParse(headerValue);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid X-Client-Id' });
      return reply;
    }

    const id = parsed.data;

    try {
      await app.prisma.client.create({ data: { id } });
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        await app.prisma.client.update({
          where: { id },
          data: { lastSeenAt: new Date() },
        });
      } else {
        req.log.error({ err }, 'failed to upsert Client');
        reply.code(500).send({ error: 'client upsert failed' });
        return reply;
      }
    }

    req.clientId = id;
  });
});
