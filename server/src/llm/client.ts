/**
 * LLM 어댑터 — DeepSeek (D-007), OpenAI 호환 API.
 *
 * 책임:
 * - DeepSeek-Chat 에 슬롯 파싱 요청
 * - 응답 JSON 을 ParseResponse 형태로 정규화·검증
 *
 * 주의:
 * - 서버는 stateless 변환기 (D-018, D-021): history 전체를 매 호출마다 전달.
 * - conversation_id 는 본 모듈 범위 밖. 라우트가 채워 넣는다.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config.js';
import {
  FilledSlots,
  Intent,
  type ChatMessage,
  type ParseResponse,
} from '../schemas/parse.js';
import { SYSTEM_PROMPT, renderFewShotBlock } from './prompts.js';

export interface ParseInput {
  history: ChatMessage[];
  now: string;
}

/**
 * LLM 이 돌려주는 JSON 스키마 — conversation_id 를 제외한 ParseResponse.
 */
const LLMOutput = z.object({
  filled_slots: FilledSlots,
  missing_required: z.array(z.string()),
  intent: Intent,
  ready_to_search: z.boolean(),
  assistant_message: z.string(),
});

export type LLMParseResult = Omit<ParseResponse, 'conversation_id'>;

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  if (!config.llm.apiKey) {
    throw new Error('LLM_API_KEY is not configured');
  }
  cachedClient = new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseUrl,
  });
  return cachedClient;
}

/**
 * history(클라 권위) + now 를 받아 LLM 으로 슬롯 추출.
 * conversation_id 는 호출자(parseRoute)가 책임진다.
 */
export async function parseWithLLM(input: ParseInput): Promise<LLMParseResult> {
  const { history, now } = input;

  const client = getClient();

  // System prompt: 본문 + few-shot + 현재 시각 주입.
  const systemContent = [
    SYSTEM_PROMPT,
    renderFewShotBlock(),
    `## 현재 시각\n현재 시각: ${now}`,
  ].join('\n\n');

  // OpenAI Chat Completions 메시지로 변환.
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: config.llm.model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM API call failed: ${msg}`);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('LLM returned empty content');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM returned invalid JSON: ${msg}; raw=${raw.slice(0, 200)}`);
  }

  const parsed = LLMOutput.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `LLM response failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  return parsed.data;
}
