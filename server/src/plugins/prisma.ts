/**
 * Fastify 플러그인 — PrismaClient 를 app.prisma 로 노출.
 *
 * - 단일 PrismaClient 인스턴스를 생성하여 decorate
 * - onClose 훅에서 $disconnect 호출
 */

import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export async function prismaPlugin(app: FastifyInstance): Promise<void> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  app.decorate('prisma', prisma);

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}
