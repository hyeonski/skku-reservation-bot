/**
 * /space-feedback 라우트 검증 (DB 없이 Fastify inject + stub prisma).
 *
 * 거절 후보 soft penalty 입력 경로의 계약을 본다:
 * - 정상 기록 시 created:true
 * - 같은 (대화·공간·날짜·시작시간) 중복 기록은 멱등하게 created:false
 * - 대화 소유자가 다르면 403 (다른 사람 이력에 끼어들지 못함)
 * - 대화를 못 찾으면 소유권 검사 없이 기록 (created:true)
 * - eventType 리터럴 위반 등 잘못된 본문은 400
 *
 * 대응 UC: UC-139(거절→뒤로 밀림)·UC-79(이력 격리)의 서버측 토대.
 */

import assert from 'node:assert/strict';

import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';

import { spaceFeedbackRoute } from '../src/routes/spaceFeedback.js';

interface StoredFeedbackEvent {
  id: string;
  clientId: string;
  conversationId: string;
  spaceCode: string;
  eventType: string;
  date: string | null;
  startTime: string | null;
}

interface FindFirstArgs {
  where: {
    clientId: string;
    conversationId: string;
    spaceCode: string;
    eventType: string;
    date: string | null;
    startTime: string | null;
  };
}

interface CreateArgs {
  data: Omit<StoredFeedbackEvent, 'id'>;
}

/** 라우트가 실제로 호출하는 prisma 메서드만 구현한 인메모리 스텁. */
function makeStubPrisma(conversationOwner: Record<string, string | null>) {
  const events: StoredFeedbackEvent[] = [];
  let seq = 0;

  const stub = {
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (!(where.id in conversationOwner)) return null;
        return { clientId: conversationOwner[where.id] ?? null };
      },
    },
    spaceFeedbackEvent: {
      findFirst: async ({ where }: FindFirstArgs) => {
        const hit = events.find(
          (e) =>
            e.clientId === where.clientId &&
            e.conversationId === where.conversationId &&
            e.spaceCode === where.spaceCode &&
            e.eventType === where.eventType &&
            e.date === where.date &&
            e.startTime === where.startTime,
        );
        return hit ? { id: hit.id } : null;
      },
      create: async ({ data }: CreateArgs) => {
        const row: StoredFeedbackEvent = { id: `evt-${(seq += 1)}`, ...data };
        events.push(row);
        return row;
      },
    },
  };

  return { stub, events };
}

async function buildApp(conversationOwner: Record<string, string | null>) {
  const { stub, events } = makeStubPrisma(conversationOwner);
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('prisma', stub as unknown as PrismaClient);
  app.decorateRequest('clientId', '');
  app.addHook('onRequest', async (req) => {
    const raw = req.headers['x-client-id'];
    req.clientId = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  });

  await app.register(spaceFeedbackRoute);
  await app.ready();
  return { app, events };
}

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';
const CONV_OWNED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function postFeedback(
  app: Awaited<ReturnType<typeof buildApp>>['app'],
  clientId: string,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: '/space-feedback',
    headers: { 'x-client-id': clientId, 'content-type': 'application/json' },
    payload: body,
  });
}

// 1) 정상 기록 → created:true, 같은 입력 재요청 → created:false (멱등)
{
  const { app, events } = await buildApp({ [CONV_OWNED]: CLIENT_A });
  const body = {
    conversationId: CONV_OWNED,
    spaceCode: '400126',
    eventType: 'rejected_candidate',
    date: '2026-06-08',
    startTime: '18:00',
  };

  const first = await postFeedback(app, CLIENT_A, body);
  assert.equal(first.statusCode, 200, 'first feedback succeeds');
  assert.deepEqual(first.json(), { ok: true, created: true }, 'first records the event');

  const second = await postFeedback(app, CLIENT_A, body);
  assert.equal(second.statusCode, 200, 'duplicate feedback still 200');
  assert.deepEqual(second.json(), { ok: true, created: false }, 'duplicate is idempotent');
  assert.equal(events.length, 1, 'only one event persisted for duplicate input');

  await app.close();
}

// 2) 같은 공간이라도 다른 시간대면 별개 이벤트로 기록된다
{
  const { app, events } = await buildApp({ [CONV_OWNED]: CLIENT_A });
  const base = {
    conversationId: CONV_OWNED,
    spaceCode: '400126',
    eventType: 'rejected_candidate',
    date: '2026-06-08',
  };
  await postFeedback(app, CLIENT_A, { ...base, startTime: '18:00' });
  const other = await postFeedback(app, CLIENT_A, { ...base, startTime: '09:00' });
  assert.deepEqual(other.json(), { ok: true, created: true }, 'different slot is a new event');
  assert.equal(events.length, 2, 'distinct slots persist separately');
  await app.close();
}

// 3) 대화 소유자가 다르면 403 (남의 이력에 끼어들지 못함, UC-79 토대)
{
  const { app, events } = await buildApp({ [CONV_OTHER]: CLIENT_B });
  const res = await postFeedback(app, CLIENT_A, {
    conversationId: CONV_OTHER,
    spaceCode: '400126',
    eventType: 'rejected_candidate',
  });
  assert.equal(res.statusCode, 403, 'owner mismatch is rejected');
  assert.equal(events.length, 0, 'no event recorded on mismatch');
  await app.close();
}

// 4) 대화를 못 찾으면 소유권 검사 없이 기록된다 (date/startTime 생략 가능)
{
  const { app, events } = await buildApp({});
  const res = await postFeedback(app, CLIENT_A, {
    conversationId: CONV_MISSING,
    spaceCode: '400126',
    eventType: 'rejected_candidate',
  });
  assert.equal(res.statusCode, 200, 'missing conversation does not block recording');
  assert.deepEqual(res.json(), { ok: true, created: true });
  assert.equal(events[0]?.date, null, 'omitted date stored as null');
  assert.equal(events[0]?.startTime, null, 'omitted startTime stored as null');
  await app.close();
}

// 5) 잘못된 본문(eventType 리터럴 위반)은 400 — 임의 이벤트 타입을 받지 않는다
{
  const { app, events } = await buildApp({ [CONV_OWNED]: CLIENT_A });
  const res = await postFeedback(app, CLIENT_A, {
    conversationId: CONV_OWNED,
    spaceCode: '400126',
    eventType: 'confirmed',
  });
  assert.equal(res.statusCode, 400, 'unknown eventType is rejected by schema');
  assert.equal(events.length, 0, 'invalid body records nothing');
  await app.close();
}

console.log('space feedback route verification passed');
