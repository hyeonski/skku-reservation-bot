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
  ConfidenceLevel,
  FilledSlots,
  Intent,
  type ChatMessage,
} from '../schemas/parse.js';
import {
  SYSTEM_PROMPT,
  TITLE_SYSTEM_PROMPT,
  renderFewShotBlock,
  renderMemoryContextBlock,
  renderStateBlock,
  type ConversationStateSnapshot,
} from './prompts.js';

const MAX_CONVERSATION_TITLE_LENGTH = 36;

/**
 * LLM 에 보낼 최근 메시지 수(역할 단위). 전체 history 를 재생하지 않고
 * 누적 상태(stateSnapshot)+최근 윈도우만 보내, 긴 history 에서 일부 모델이
 * 공백만 출력하는 quirk 를 피하고 토큰 비용을 줄인다. 누적값은 상태 블록이 단일 진실.
 */
const RECENT_HISTORY_WINDOW = 6;

/**
 * LLM 이 공백/빈 문자열만 반환할 때(일부 모델의 긴 컨텍스트 quirk) 재시도할 횟수.
 */
const EMPTY_CONTENT_RETRIES = 2;

/**
 * LLM 에 재사용 후보로 주입하는 최근 완료 예약 1건의 컨텍스트.
 * 빈도 통계(count/isFrequent)는 서버가 deterministic 하게 계산해 넘기고,
 * 재사용 제안 여부·문구는 LLM 이 결정한다.
 */
export interface MemoryContext {
  id: string;
  organization: string;
  eventName: string;
  purpose: string;
  hangsaGbCode: string;
  count: number;
  isFrequent: boolean;
}

export interface ParseInput {
  history: ChatMessage[];
  now: string;
  memories?: MemoryContext[];
  /** 지금까지 누적된 슬롯·신청서·진행 상황. 전체 history 대신 이걸 단일 진실로 주입한다. */
  stateSnapshot?: ConversationStateSnapshot | null;
}

export interface TitleInput {
  history: ChatMessage[];
  filledSlots?: z.infer<typeof FilledSlots> | null;
  previousTitle?: string | null;
  confirmedReservationLabel?: string | null;
}

/**
 * LLM 이 신청서(주관단체/행사명/사용목적/행사구분)에 대해 내리는 결정.
 * - draft: 현재까지 확정 가능한 신청서 초안(모르는 필드는 "").
 * - confidence: 필드별 확신도. 낮으면 서버가 미수집으로 보고 되묻는다.
 * - suggest_reuse_memory_id: 과거 예약 재사용을 제안할 때 그 메모리 id(아직 미확정 단계).
 */
const LLMApplication = z.object({
  draft: z
    .object({
      organization: z.string(),
      eventName: z.string(),
      purpose: z.string(),
      hangsaGbCode: z.string(),
    })
    .nullable(),
  confidence: z.object({
    organization: ConfidenceLevel,
    eventName: ConfidenceLevel,
    purpose: ConfidenceLevel,
    hangsaGbCode: ConfidenceLevel,
  }),
  suggest_reuse_memory_id: z.string().nullable(),
});
export type LLMApplication = z.infer<typeof LLMApplication>;

/**
 * LLM 이 돌려주는 JSON 스키마 — conversation_id 를 제외한 ParseResponse.
 * application 은 모델이 누락해도 502 로 죽지 않도록 관대하게(.optional) 받는다.
 * 누락 시 다운스트림(normalizeApplicationFromLLM)이 draft 없음으로 처리한다.
 */
const LLMOutput = z.object({
  filled_slots: FilledSlots,
  missing_required: z.array(z.string()),
  intent: Intent,
  ready_to_search: z.boolean(),
  assistant_message: z.string(),
  application: LLMApplication.nullable().optional(),
});

export type LLMParseResult = z.infer<typeof LLMOutput>;

const TitleOutput = z.object({
  title: z.string(),
});

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
  const { history, now, memories, stateSnapshot } = input;

  const client = getClient();

  // System prompt: 본문 + few-shot + 메모리 후보 + 누적 상태 + 현재 시각 주입.
  // 누적 슬롯·신청서는 stateSnapshot(단일 진실)에서 오고, history 는 최근 윈도우만 보낸다.
  const systemContent = [
    SYSTEM_PROMPT,
    renderFewShotBlock(),
    renderMemoryContextBlock(memories ?? []),
    renderStateBlock(stateSnapshot),
    `## 현재 시각\n현재 시각: ${now}`,
  ].join('\n\n');

  // 전체 history 를 재생하지 않고 최근 N개 메시지만 보낸다(상태 블록이 누적값을 담당).
  const recentHistory = history.slice(-RECENT_HISTORY_WINDOW);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 일부 모델은 특정 컨텍스트에서 공백만 출력하는 quirk 가 있다(JSON.parse 실패).
  // 빈/공백 응답이면 제한적으로 재시도한다. 윈도우링으로 빈도는 크게 줄지만 방어선으로 둔다.
  let raw: string | undefined;
  for (let attempt = 0; attempt <= EMPTY_CONTENT_RETRIES; attempt += 1) {
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
    const content = completion.choices[0]?.message?.content;
    if (content && content.trim().length > 0) {
      raw = content;
      break;
    }
  }

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

function normalizeTitle(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > MAX_CONVERSATION_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1).trimEnd()}…`
    : normalized;
}

export async function summarizeConversationTitle(
  input: TitleInput,
): Promise<string> {
  const client = getClient();
  const payload = {
    previous_title: input.previousTitle ?? null,
    confirmed_reservation_label: input.confirmedReservationLabel ?? null,
    filled_slots: input.filledSlots ?? null,
    history: input.history,
  };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: TITLE_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload, null, 2) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM title generation failed: ${msg}`);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('LLM returned empty title content');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM title returned invalid JSON: ${msg}; raw=${raw.slice(0, 200)}`);
  }

  const parsed = TitleOutput.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `LLM title response failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  const title = normalizeTitle(parsed.data.title);
  if (!title) {
    throw new Error('LLM title response was blank');
  }

  return title;
}
