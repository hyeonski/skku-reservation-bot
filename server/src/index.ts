/**
 * Fastify 엔트리. D-024 라우트 등록.
 *
 * TODO:
 * - Fastify 인스턴스 생성, fastify-type-provider-zod 등록
 * - @fastify/cors (확장에서 호출 위해)
 * - plugins/prisma 등록
 * - plugins/clientId (onRequest 훅) 등록
 * - routes/parse, routes/conversations, routes/spaces 등록
 * - app.listen(config.port)
 */

import { config } from './config.js';

async function main() {
  console.log('TODO: Fastify boot — port', config.port);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
