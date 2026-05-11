/**
 * POST /parse — 채팅 멀티턴 파싱 (D-021).
 *
 * 흐름:
 * 1. body 검증 (ParseRequest)
 * 2. parseWithLLM(history, now) 호출
 * 3. conversation_id 채워 ParseResponse 형태로 응답
 * 4. Conversation 테이블에 mirror upsert (D-018)
 *    - 기존 row 있으면 ownership 검증 (clientId 일치). 불일치 시 403.
 *    - status 는 기본 active 유지. intent === "cancel" 이면 abandoned_user 로 마킹.
 */

import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ParseRequest, ParseResponse } from '../schemas/parse.js';
import { parseWithLLM } from '../llm/client.js';

const ErrorResponse = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export async function parseRoute(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/parse',
    {
      schema: {
        body: ParseRequest,
        response: {
          200: ParseResponse,
          403: ErrorResponse,
          502: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const clientId = request.clientId;

      // 1) Ownership check (대화가 이미 존재하면 clientId 일치 확인).
      const existing = await app.prisma.conversation.findUnique({
        where: { id: body.conversation_id },
        select: { clientId: true, status: true },
      });

      if (existing && existing.clientId !== clientId) {
        reply.code(403).send({ error: 'conversation does not belong to client' });
        return;
      }

      // 2) LLM 호출.
      let llmResult;
      try {
        llmResult = await parseWithLLM({ history: body.history, now: body.now });
      } catch (err) {
        request.log.error({ err }, 'parseWithLLM failed');
        reply.code(502).send({
          error: 'llm parse failed',
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const response: ParseResponse = {
        conversation_id: body.conversation_id,
        ...llmResult,
      };

      // 3) Conversation mirror upsert (D-018).
      //   - status: 기본 active. intent=cancel 이면 abandoned_user.
      //   - completed 마킹은 실제 예약 제출 시 별도 라우트에서. 여기선 active/abandoned_user 만 다룬다.
      const nextStatus =
        llmResult.intent === 'cancel' ? 'abandoned_user' : 'active';

      try {
        await app.prisma.conversation.upsert({
          where: { id: body.conversation_id },
          create: {
            id: body.conversation_id,
            clientId,
            status: nextStatus,
            history: body.history,
            lastIntent: llmResult.intent,
            lastFilledSlots: llmResult.filled_slots,
          },
          update: {
            history: body.history,
            lastIntent: llmResult.intent,
            lastFilledSlots: llmResult.filled_slots,
            status: nextStatus,
          },
        });
      } catch (err) {
        // mirror 실패는 사용자 응답을 막지 않는다 (D-018: mirror 일시 장애 시 대화 계속 진행).
        request.log.error({ err }, 'Conversation mirror upsert failed');
      }

      return response;
    },
  );
}
