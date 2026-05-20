/**
 * 환경 변수 로드 및 검증 (Zod).
 *
 * 부팅 시 LLM_API_KEY / DATABASE_URL 누락 시 즉시 throw.
 */

import { z } from 'zod';

const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 8000))
    .pipe(z.number().int().positive()),
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required'),
  LLM_BASE_URL: z.string().url().optional().default('https://api.deepseek.com'),
  LLM_MODEL: z.string().min(1).optional().default('deepseek-chat'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  llm: {
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
  },
  databaseUrl: env.DATABASE_URL,
} as const;

export type AppConfig = typeof config;
