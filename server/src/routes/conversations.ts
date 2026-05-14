/**
 * 대화 mirror 라우트 (D-018, D-021, D-024).
 *
 * 라우트:
 * - POST   /conversations/:id          — upsert mirror
 * - GET    /conversations/:id          — fetch (이어가기)
 * - POST   /conversations/:id/abandon  — 사용자 명시적 중단
 *
 * 소유권 검증: conversation.clientId === req.clientId, 불일치 시 403.
 * 모든 요청은 clientIdPlugin(onRequest)에서 X-Client-Id 검증을 거쳐 req.clientId 주입됨.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Conversation } from '@prisma/client';
import { z } from 'zod';
import {
  ConversationDto,
  UpsertConversationBody,
} from '../schemas/conversation.js';
import type { ChatMessage } from '../schemas/parse.js';

const IdParam = z.object({
  id: z.string().uuid(),
});

function toDto(row: Conversation): z.infer<typeof ConversationDto> {
  // history / lastFilledSlots 는 Prisma Json. 타입 캐스팅으로 그대로 전달.
  return {
    id: row.id,
    status: row.status,
    history: (row.history as unknown as ChatMessage[]) ?? [],
    lastIntent: row.lastIntent ?? null,
    lastFilledSlots: (row.lastFilledSlots as unknown) ?? null,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function conversationsRoute(app: FastifyInstance): Promise<void> {
  // POST /conversations/:id — upsert mirror
  app.post('/conversations/:id', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid conversation id' });
    }
    const { id } = paramsParsed.data;

    const bodyParsed = UpsertConversationBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid body', details: bodyParsed.error.flatten() });
    }
    const body = bodyParsed.data;

    // 존재 여부·소유권 확인
    const existing = await app.prisma.conversation.findUnique({ where: { id } });
    if (existing && existing.clientId !== req.clientId) {
      return reply
        .code(403)
        .send({ error: '대화 소유자가 아닙니다 (clientId 불일치)' });
    }

    const now = new Date();
    const isCompleted = body.status === 'completed';

    // history / lastFilledSlots 는 JSON 컬럼.
    const historyJson = body.history as unknown as Prisma.InputJsonValue;
    const lastFilledSlotsProvided = body.lastFilledSlots !== undefined;
    const lastFilledSlotsJson = lastFilledSlotsProvided
      ? (body.lastFilledSlots === null
          ? Prisma.JsonNull
          : (body.lastFilledSlots as Prisma.InputJsonValue))
      : undefined;

    const updateData: Prisma.ConversationUpdateInput = {
      history: historyJson,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.lastIntent !== undefined
        ? { lastIntent: body.lastIntent }
        : {}),
      ...(lastFilledSlotsProvided
        ? { lastFilledSlots: lastFilledSlotsJson }
        : {}),
      ...(isCompleted ? { completedAt: now } : {}),
    };

    const createData: Prisma.ConversationCreateInput = {
      id,
      client: { connect: { id: req.clientId } },
      history: historyJson,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.lastIntent !== undefined
        ? { lastIntent: body.lastIntent }
        : {}),
      ...(lastFilledSlotsProvided && body.lastFilledSlots !== null
        ? { lastFilledSlots: body.lastFilledSlots as Prisma.InputJsonValue }
        : {}),
      ...(isCompleted ? { completedAt: now } : {}),
    };

    const row = await app.prisma.conversation.upsert({
      where: { id },
      update: updateData,
      create: createData,
    });

    return reply.code(existing ? 200 : 201).send(toDto(row));
  });

  // GET /conversations/:id — fetch
  app.get('/conversations/:id', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid conversation id' });
    }
    const { id } = paramsParsed.data;

    const row = await app.prisma.conversation.findUnique({ where: { id } });
    if (!row) {
      return reply.code(404).send({ error: '대화를 찾을 수 없습니다' });
    }
    if (row.clientId !== req.clientId) {
      return reply
        .code(403)
        .send({ error: '대화 소유자가 아닙니다 (clientId 불일치)' });
    }

    return reply.send(toDto(row));
  });

  // POST /conversations/:id/abandon — 사용자 명시적 중단
  app.post('/conversations/:id/abandon', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid conversation id' });
    }
    const { id } = paramsParsed.data;

    const existing = await app.prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: '대화를 찾을 수 없습니다' });
    }
    if (existing.clientId !== req.clientId) {
      return reply
        .code(403)
        .send({ error: '대화 소유자가 아닙니다 (clientId 불일치)' });
    }

    // completedAt 은 건드리지 않음 (completed 전용).
    const updated = await app.prisma.conversation.update({
      where: { id },
      data: { status: 'abandoned_user' },
    });

    return reply.send(toDto(updated));
  });
}
