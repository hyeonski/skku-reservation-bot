import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma, type Reminder } from '@prisma/client';
import { z } from 'zod';
import {
  MUTE_THRESHOLD,
  REMINDER_PATTERN_THRESHOLD,
  buildReminderCandidate,
  todayKstIso,
  weekdayOf,
} from '../application/reminders.js';
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
      spaceCode: row.spaceCode ?? null,
      group: row.organization,
      event: row.eventName,
      prompt: row.prompt,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function generateReminder(app: FastifyInstance, clientId: string): Promise<Reminder | null> {
  const recordCount = await app.prisma.reservationRecord.count({ where: { clientId } });
  if (recordCount < REMINDER_PATTERN_THRESHOLD) return null;

  const rows = await app.prisma.reservationRecord.findMany({
    where: { clientId },
    orderBy: { reservedAt: 'desc' },
    take: 40,
  });

  const candidate = buildReminderCandidate(
    rows.map((row) => ({
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      headcount: row.headcount,
      organization: row.organization,
      eventName: row.eventName,
      purpose: row.purpose,
      hangsaGbCode: row.hangsaGbCode,
      spaceLabel: row.spaceLabel,
      spaceCode: row.spaceCode,
    })),
  );
  if (!candidate) return null;

  // 패턴 음소거 가드. 활성 음소거가 있으면, 음소거 이후 같은 패턴을 다시 예약 완료했는지
  // 확인해(read-time release) 해제하거나, 아니면 후보를 억제한다.
  const activeMute = await app.prisma.patternMute.findFirst({
    where: { clientId, patternKey: candidate.patternKey, clearedAt: null },
  });
  if (activeMute) {
    const weekday = weekdayOf(candidate.proposedDate);
    const recompleted = weekday == null
      ? null
      : await app.prisma.reservationRecord.findFirst({
          where: {
            clientId,
            weekday,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
            organization: candidate.organization,
            eventName: candidate.eventName,
            reservedAt: { gt: activeMute.mutedAt },
          },
        });
    if (recompleted) {
      await app.prisma.patternMute.update({
        where: { id: activeMute.id },
        data: { clearedAt: new Date() },
      });
    } else {
      return null;
    }
  }

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
        spaceCode: candidate.spaceCode,
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
      data: { status: 'expired', expiredAt: new Date() },
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

    const now = new Date();
    const updated = await app.prisma.reminder.update({
      where: { id: existing.id },
      data: { status: 'dismissed', dismissedAt: now },
    });

    // 연속 거절 escalation: 마지막 accept 이후의 dismissed 개수가 임계 이상이면 패턴 음소거.
    // (expired는 중립 — 카운트/리셋 안 함)
    const lastAccepted = await app.prisma.reminder.findFirst({
      where: { clientId: req.clientId, patternKey: existing.patternKey, status: 'accepted' },
      orderBy: { acceptedAt: 'desc' },
      select: { acceptedAt: true },
    });
    const dismissedCount = await app.prisma.reminder.count({
      where: {
        clientId: req.clientId,
        patternKey: existing.patternKey,
        status: 'dismissed',
        ...(lastAccepted?.acceptedAt ? { dismissedAt: { gt: lastAccepted.acceptedAt } } : {}),
      },
    });
    if (dismissedCount >= MUTE_THRESHOLD) {
      const alreadyMuted = await app.prisma.patternMute.findFirst({
        where: { clientId: req.clientId, patternKey: existing.patternKey, clearedAt: null },
        select: { id: true },
      });
      if (!alreadyMuted) {
        await app.prisma.patternMute.create({
          data: {
            client: { connect: { id: req.clientId } },
            patternKey: existing.patternKey,
            mutedAt: now,
          },
        });
      }
    }

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

    const now = new Date();
    const updated = await app.prisma.reminder.update({
      where: { id: existing.id },
      data: { status: 'accepted', acceptedAt: now },
    });

    // accept = 패턴을 다시 원함 → 활성 음소거 해제.
    await app.prisma.patternMute.updateMany({
      where: { clientId: req.clientId, patternKey: existing.patternKey, clearedAt: null },
      data: { clearedAt: now },
    });

    return reply.send(toDto(updated));
  });
}
