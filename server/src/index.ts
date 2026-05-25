/**
 * Fastify 엔트리. D-024 라우트 등록.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { config } from './config.js';
import { prismaPlugin } from './plugins/prisma.js';
import { clientIdPlugin } from './plugins/clientId.js';
import { parseRoute } from './routes/parse.js';
import { conversationsRoute } from './routes/conversations.js';
import { spacesRoute } from './routes/spaces.js';
import { remindersRoute } from './routes/reminders.js';

async function main() {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
                singleLine: false,
              },
            },
          }
        : {}),
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS — 크롬 확장에서 호출. 개발 편의를 위해 origin:true (요청 origin 반영).
  await app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Client-Id'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Prisma 먼저 (clientId 훅이 prisma 사용)
  await app.register(prismaPlugin);
  await app.register(clientIdPlugin);

  // Health check — clientId 훅에서 SKIP_PATHS 로 제외됨.
  app.get('/health', async () => ({ ok: true }));

  // 라우트 (현재는 stub — 슬라이스 4/5/6 에서 채움)
  await app.register(parseRoute);
  await app.register(conversationsRoute);
  await app.register(spacesRoute);
  await app.register(remindersRoute);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`SKKU reservation server listening on port ${config.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
