import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Reminder } from '@prisma/client';
import { z } from 'zod';
import {
  REMINDER_PATTERN_THRESHOLD,
  buildReminderCandidate,
  todayKstIso,
} from '../application/reminders.js';
import { parseStoredReservationForm } from '../application/state.js';
import { FilledSlots } from '../schemas/parse.js';
import { ReminderDto, ReminderResponse } from '../schemas/reminder.js';

const IdParam = z.object({
  id: z.string().uuid(),
});

function toDto(row: Reminder): z.infer<typeof ReminderDto> {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    pattern: row.pattern,
    proposed: {
      date: row.proposedDate,
      time: `${row.startTime}–${row.endTime}`,
      space: row.spaceLabel ?? '이전 추천 공간',
      group: row.organization,
      event: row.eventName,
      prompt: row.prompt,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function generateReminder(app: FastifyInstance, clientId: string): Promise<Reminder | null> {
  const completedCount = await app.prisma.conversation.count({
    where: {
      clientId,
      status: 'completed',
      deletedAt: null,
      confirmedReservationForm: { not: Prisma.JsonNull },
      lastFilledSlots: { not: Prisma.JsonNull },
    },
  });
  if (completedCount < REMINDER_PATTERN_THRESHOLD) return null;

  const rows = await app.prisma.conversation.findMany({
    where: {
      clientId,
      status: 'completed',
      deletedAt: null,
    },
    select: {
      id: true,
      lastFilledSlots: true,
      confirmedReservationForm: true,
      confirmedSpaceLabel: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 40,
  });

  const candidate = buildReminderCandidate(
    rows.map((row) => {
      const slotsParsed = FilledSlots.safeParse(row.lastFilledSlots);
      return {
        id: row.id,
        slots: slotsParsed.success ? slotsParsed.data : null,
        formData: parseStoredReservationForm(row.confirmedReservationForm),
        confirmedSpaceLabel: row.confirmedSpaceLabel,
      };
    }),
  );
  if (!candidate) return null;

  const existing = await app.prisma.reminder.findFirst({
    where: {
      clientId,
      patternKey: candidate.patternKey,
      proposedDate: candidate.proposedDate,
    },
  });
  if (existing) return existing.status === 'active' ? existing : null;

  try {
    return await app.prisma.reminder.create({
      data: {
        client: { connect: { id: clientId } },
        patternKey: candidate.patternKey,
        title: candidate.title,
        pattern: candidate.pattern,
        proposedDate: candidate.proposedDate,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        headcount: candidate.headcount,
        organization: candidate.organization,
        eventName: candidate.eventName,
        spaceLabel: candidate.spaceLabel,
        prompt: candidate.prompt,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return app.prisma.reminder.findFirst({
        where: {
          clientId,
          patternKey: candidate.patternKey,
          proposedDate: candidate.proposedDate,
          status: 'active',
        },
      });
    }
    throw error;
  }
}

export async function remindersRoute(app: FastifyInstance): Promise<void> {
  app.get('/reminders', {
    schema: {
      response: {
        200: ReminderResponse,
      },
    },
  }, async (req, reply: FastifyReply) => {
    const todayIso = todayKstIso();
    await app.prisma.reminder.updateMany({
      where: {
        clientId: req.clientId,
        status: 'active',
        proposedDate: { lt: todayIso },
      },
      data: { status: 'dismissed', dismissedAt: new Date() },
    });

    const existing = await app.prisma.reminder.findFirst({
      where: {
        clientId: req.clientId,
        status: 'active',
        proposedDate: { gte: todayIso },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return reply.send(toDto(existing));

    const generated = await generateReminder(app, req.clientId);
    return reply.send(generated ? toDto(generated) : null);
  });

  app.post('/reminders/:id/dismiss', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid reminder id' });
    }

    const existing = await app.prisma.reminder.findUnique({
      where: { id: paramsParsed.data.id },
    });
    if (!existing || existing.clientId !== req.clientId) {
      return reply.code(404).send({ error: 'reminder not found' });
    }

    const updated = await app.prisma.reminder.update({
      where: { id: existing.id },
      data: { status: 'dismissed', dismissedAt: new Date() },
    });
    return reply.send(toDto(updated));
  });

  app.post('/reminders/:id/accept', async (req, reply: FastifyReply) => {
    const paramsParsed = IdParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid reminder id' });
    }

    const existing = await app.prisma.reminder.findUnique({
      where: { id: paramsParsed.data.id },
    });
    if (!existing || existing.clientId !== req.clientId) {
      return reply.code(404).send({ error: 'reminder not found' });
    }

    const updated = await app.prisma.reminder.update({
      where: { id: existing.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    return reply.send(toDto(updated));
  });
}
