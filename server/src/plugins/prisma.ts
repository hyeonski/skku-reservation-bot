/**
 * Fastify 플러그인 — PrismaClient를 app.prisma 로 노출.
 *
 * TODO:
 * - PrismaClient 인스턴스 생성
 * - app.decorate('prisma', prisma)
 * - app.addHook('onClose', async () => prisma.$disconnect())
 */

import type { FastifyInstance } from 'fastify';

export async function prismaPlugin(_app: FastifyInstance): Promise<void> {
  // TODO
}
