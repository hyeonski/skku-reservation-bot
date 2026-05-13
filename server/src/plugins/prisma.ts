/**
 * Fastify 플러그인 — PrismaClient 를 app.prisma 로 노출.
 *
 * - 단일 PrismaClient 인스턴스를 생성하여 decorate
 * - onClose 훅에서 $disconnect 호출
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// fastify-plugin 으로 감싸야 decorate('prisma', ...) 가 부모 app 컨텍스트로 전파된다.
// 미적용 시 sibling 라우트들이 app.prisma 를 못 봐서 "undefined.space" 에러 발생.
export const prismaPlugin = fp(async function prismaPlugin(app: FastifyInstance) {
  const prisma = new PrismaClient();
  await prisma.$connect();

  app.decorate('prisma', prisma);

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
});
