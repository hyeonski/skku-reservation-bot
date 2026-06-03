import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const SpaceFeedbackBody = z.object({
  conversationId: z.string().uuid(),
  spaceCode: z.string().trim().min(1).max(40),
  eventType: z.literal('rejected_candidate'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
}).strict();

const SpaceFeedbackResponse = z.object({
  ok: z.literal(true),
  created: z.boolean(),
});

export async function spaceFeedbackRoute(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/space-feedback',
    {
      schema: {
        body: SpaceFeedbackBody,
        response: {
          200: SpaceFeedbackResponse,
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply: FastifyReply) => {
      const body = SpaceFeedbackBody.parse(req.body);
      const conversation = await app.prisma.conversation.findUnique({
        where: { id: body.conversationId },
        select: { clientId: true },
      });

      if (conversation && conversation.clientId !== req.clientId) {
        return reply.code(403).send({ error: 'conversation owner mismatch' });
      }

      const date = body.date ?? null;
      const startTime = body.startTime ?? null;
      const existing = await app.prisma.spaceFeedbackEvent.findFirst({
        where: {
          clientId: req.clientId,
          conversationId: body.conversationId,
          spaceCode: body.spaceCode,
          eventType: body.eventType,
          date,
          startTime,
        },
        select: { id: true },
      });

      if (existing) {
        return { ok: true, created: false };
      }

      await app.prisma.spaceFeedbackEvent.create({
        data: {
          clientId: req.clientId,
          conversationId: body.conversationId,
          spaceCode: body.spaceCode,
          eventType: body.eventType,
          date,
          startTime,
        },
      });

      return { ok: true, created: true };
    },
  );
}
