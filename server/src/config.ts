/**
 * 환경 변수 로드 및 검증.
 * TODO: zod로 env 스키마 정의 후 export.
 */

export const config = {
  port: Number(process.env.PORT ?? 3000),
  llm: {
    apiKey: process.env.LLM_API_KEY ?? '',
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
  },
  databaseUrl: process.env.DATABASE_URL ?? '',
};
