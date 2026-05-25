/**
 * 대화 mirror 라우트 (D-018, D-021, D-024).
 *
 * 라우트:
 * - POST   /conversations/:id          — upsert mirror
 * - GET    /conversations/:id          — fetch (이어가기)
 * - POST   /conversations/:id/abandon  — 사용자 명시적 중단
 * - DELETE /conversations/:id          — 논리 삭제
 *
 * 소유권 검증: conversation.clientId === req.clientId, 불일치 시 403.
 * 모든 요청은 clientIdPlugin(onRequest)에서 X-Client-Id 검증을 거쳐 req.clientId 주입됨.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Conversation } from '@prisma/client';
import { z } from 'zod';
import {
  ConversationDto,
  ConversationSummaryDto,
  UpsertConversationBody,
} from '../schemas/conversation.js';
import type {
  ChatMessage,
  FilledSlots as ParsedFilledSlots,
} from '../schemas/parse.js';
import {
  parseStoredApplicationState,
  parseStoredReservationForm,
  summarizeReservationLabel,
} from '../application/state.js';
import { summarizeConversationTitle } from '../llm/client.js';

const IdParam = z.object({
  id: z.string().uuid(),
});

function toDto(row: Conversation): z.infer<typeof ConversationDto> {
  // history / lastFilledSlots 는 Prisma Json. 타입 캐스팅으로 그대로 전달.
  return {
    id: row.id,
    status: row.status,
    title: row.title ?? null,
    history: (row.history as unknown as ChatMessage[]) ?? [],
    lastIntent: row.lastIntent ?? null,
    lastFilledSlots: (row.lastFilledSlots as unknown) ?? null,
    lastApplicationState: parseStoredApplicationState(row.lastApplicationState),
    confirmedReservationForm: parseStoredReservationForm(row.confirmedReservationForm),
    confirmedReservationLabel:
      row.confirmedReservationLabel ??
      (parseStoredReservationForm(row.confirmedReservationForm)
        ? summarizeReservationLabel(parseStoredReservationForm(row.confirmedReservationForm)!)
        : null),
    confirmedSpaceCode: row.confirmedSpaceCode ?? null,
    confirmedSpaceLabel: row.confirmedSpaceLabel ?? null,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeHistory(history: ChatMessage[]): {
  firstUserMessage: string | null;
  lastMessagePreview: string | null;
} {
  const firstUserMessage =
    history.find((message) => message.role === 'user')?.content ?? null;

  let lastMessagePreview: string | null = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const content = normalizeWhitespace(history[i]?.content ?? '');
    if (!content) continue;
    lastMessagePreview = content.slice(0, 60);
    break;
  }

  return {
    firstUserMessage: firstUserMessage ? normalizeWhitespace(firstUserMessage) : null,
    lastMessagePreview,
  };
}

function toSummaryDto(row: Conversation): z.infer<typeof ConversationSummaryDto> {
  const history = (row.history as unknown as ChatMessage[]) ?? [];
  const summary = summarizeHistory(history);
  return {
    id: row.id,
    status: row.status,
    title: row.title ?? null,
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    firstUserMessage: summary.firstUserMessage,
    lastMessagePreview: summary.lastMessagePreview,
    lastFilledSlots: (row.lastFilledSlots as unknown) ?? null,
    confirmedReservationLabel:
      row.confirmedReservationLabel ??
      (parseStoredReservationForm(row.confirmedReservationForm)
        ? summarizeReservationLabel(parseStoredReservationForm(row.confirmedReservationForm)!)
        : null),
    confirmedSpaceCode: row.confirmedSpaceCode ?? null,
    confirmedSpaceLabel: row.confirmedSpaceLabel ?? null,
  };
}

export async function conversationsRoute(app: FastifyInstance): Promise<void> {
  app.get('/conversations', async (req, reply: FastifyReply) => {
    const rows = await app.prisma.conversation.findMany({
      where: { clientId: req.clientId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return reply.send(rows.map((row) => toSummaryDto(row)));
  });

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
    if (existing?.deletedAt) {
      return reply.code(404).send({ error: '대화를 찾을 수 없습니다' });
    }
    if (existing && existing.clientId !== req.clientId) {
      return reply
        .code(403)
        .send({ error: '대화 소유자가 아닙니다 (clientId 불일치)' });
    }

    const now = new Date();
    const isCompleted = body.status === 'completed';
    let generatedTitle: string | null = null;
    if (isCompleted) {
      try {
        generatedTitle = await summarizeConversationTitle({
          history: body.history,
          filledSlots: (body.lastFilledSlots as ParsedFilledSlots | null | undefined) ?? null,
          previousTitle: body.title ?? existing?.title ?? null,
          confirmedReservationLabel: body.confirmedReservationLabel ?? null,
        });
      } catch (err) {
        req.log.warn({ err }, 'conversation title generation failed during completion');
      }
    }

    // history / lastFilledSlots 는 JSON 컬럼.
    const historyJson = body.history as unknown as Prisma.InputJsonValue;
    const lastFilledSlotsProvided = body.lastFilledSlots !== undefined;
    const lastFilledSlotsJson = lastFilledSlotsProvided
      ? (body.lastFilledSlots === null
          ? Prisma.JsonNull
          : (body.lastFilledSlots as Prisma.InputJsonValue))
      : undefined;
    const lastApplicationStateProvided = body.lastApplicationState !== undefined;
    const lastApplicationStateJson = lastApplicationStateProvided
      ? (body.lastApplicationState === null
          ? Prisma.JsonNull
          : (body.lastApplicationState as Prisma.InputJsonValue))
      : undefined;
    const confirmedReservationFormProvided = body.confirmedReservationForm !== undefined;
    const confirmedReservationFormJson = confirmedReservationFormProvided
      ? (body.confirmedReservationForm === null
          ? Prisma.JsonNull
          : (body.confirmedReservationForm as Prisma.InputJsonValue))
      : undefined;

    const updateData: Prisma.ConversationUpdateInput = {
      history: historyJson,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.title !== undefined
        ? { title: body.title }
        : generatedTitle
          ? { title: generatedTitle }
          : {}),
      ...(body.lastIntent !== undefined
        ? { lastIntent: body.lastIntent }
        : {}),
      ...(lastFilledSlotsProvided
        ? { lastFilledSlots: lastFilledSlotsJson }
        : {}),
      ...(lastApplicationStateProvided
        ? { lastApplicationState: lastApplicationStateJson }
        : {}),
      ...(confirmedReservationFormProvided
        ? { confirmedReservationForm: confirmedReservationFormJson }
        : {}),
      ...(body.confirmedReservationLabel !== undefined
        ? { confirmedReservationLabel: body.confirmedReservationLabel }
        : {}),
      ...(body.confirmedSpaceCode !== undefined
        ? { confirmedSpaceCode: body.confirmedSpaceCode }
        : {}),
      ...(body.confirmedSpaceLabel !== undefined
        ? { confirmedSpaceLabel: body.confirmedSpaceLabel }
        : {}),
      ...(isCompleted ? { completedAt: now } : {}),
    };

    const createData: Prisma.ConversationCreateInput = {
      id,
      client: { connect: { id: req.clientId } },
      history: historyJson,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.title !== undefined
        ? { title: body.title }
        : generatedTitle
          ? { title: generatedTitle }
          : {}),
      ...(body.lastIntent !== undefined
        ? { lastIntent: body.lastIntent }
        : {}),
      ...(lastFilledSlotsProvided && body.lastFilledSlots !== null
        ? { lastFilledSlots: body.lastFilledSlots as Prisma.InputJsonValue }
        : {}),
      ...(lastApplicationStateProvided && body.lastApplicationState !== null
        ? { lastApplicationState: body.lastApplicationState as Prisma.InputJsonValue }
        : {}),
      ...(confirmedReservationFormProvided && body.confirmedReservationForm !== null
        ? { confirmedReservationForm: body.confirmedReservationForm as Prisma.InputJsonValue }
        : {}),
      ...(body.confirmedReservationLabel !== undefined && body.confirmedReservationLabel !== null
        ? { confirmedReservationLabel: body.confirmedReservationLabel }
        : {}),
      ...(body.confirmedSpaceCode !== undefined && body.confirmedSpaceCode !== null
        ? { confirmedSpaceCode: body.confirmedSpaceCode }
        : {}),
      ...(body.confirmedSpaceLabel !== undefined && body.confirmedSpaceLabel !== null
        ? { confirmedSpaceLabel: body.confirmedSpaceLabel }
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
    if (!row || row.deletedAt) {
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
    if (!existing || existing.deletedAt) {
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

  app.delete('/conversations/:id', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid conversation id' });
    }
    const { id } = paramsParsed.data;

    const existing = await app.prisma.conversation.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return reply.code(404).send({ error: '대화를 찾을 수 없습니다' });
    }
    if (existing.clientId !== req.clientId) {
      return reply
        .code(403)
        .send({ error: '대화 소유자가 아닙니다 (clientId 불일치)' });
    }

    await app.prisma.conversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return reply.code(204).send();
  });
}
