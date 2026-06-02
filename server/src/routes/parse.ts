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
import {
  FilledSlots,
  ParseRequest,
  ParseResponse,
  type FilledSlots as FilledSlotsType,
} from '../schemas/parse.js';
import {
  type LLMParseResult,
  parseWithLLM,
  summarizeConversationTitle,
} from '../llm/client.js';
import {
  buildApplicationState,
  parseStoredApplicationState,
  parseStoredReservationForm,
  summarizeReservationLabel,
} from '../application/state.js';
import {
  clearTimeSlots,
  crossesMidnight,
  emptyFilledSlots,
  hasAmbiguousBareMeridiemTime,
  isBeyondFutureBookingWindow,
  isSupportedReservationMinute,
  usesUnsupportedReservationMinute,
} from '../../../shared/reservation/slotPolicy.js';

const ErrorResponse = z.object({
  error: z.string(),
  message: z.string().optional(),
});

function parseStoredFilledSlots(value: unknown): FilledSlotsType | null {
  const parsed = FilledSlots.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function makeEmptySlots(): FilledSlotsType {
  return emptyFilledSlots<FilledSlotsType>();
}

function isLikelyOutOfScopeSmallTalk(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  const reservationSignal =
    /(예약|대여|빌리|잡아|찾아|회의실|강의실|공간|세미나실|연습실|행사|회의|세미나|스터디|동아리|학생회|모임)/;
  if (reservationSignal.test(normalized)) return false;
  return /(점심|저녁|아침|밥|먹|메뉴|날씨|심심|농담|안녕|고마워|뭐\s*(?:먹|하지|할까))/.test(
    normalized,
  );
}

function makeOutOfScopeResult(): LLMParseResult {
  return {
    filled_slots: makeEmptySlots(),
    missing_required: ['headcount', 'date', 'start_time', 'end_time'],
    intent: 'out_of_scope',
    ready_to_search: false,
    assistant_message:
      '저는 GLS 공간예약을 도와드리는 도우미예요. 예약하실 날짜, 시간, 인원을 알려주시면 찾아드릴게요.',
  };
}

function makeInvalidInputResult(message: string, missingRequired: string[] = []): LLMParseResult {
  return {
    filled_slots: makeEmptySlots(),
    missing_required: missingRequired,
    intent: 'new_reservation',
    ready_to_search: false,
    assistant_message: message,
  };
}

function hasImpossibleHeadcount(text: string): boolean {
  const match = text.replace(/,/g, '').match(/(^|[^\d])(-?\d+)\s*명/);
  if (!match?.[2]) return false;
  const headcount = Number.parseInt(match[2], 10);
  return Number.isFinite(headcount) && headcount <= 0;
}

function hasImpossibleClock(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  const matches = normalized.matchAll(/(\d{1,2})시(?!간)/g);
  for (const match of matches) {
    const hour = Number.parseInt(match[1] ?? '', 10);
    if (Number.isFinite(hour) && (hour < 0 || hour > 23)) return true;
  }
  return false;
}

function hasUnsupportedMinuteUnit(text: string): boolean {
  const matches = text.matchAll(/(\d{1,2})\s*시(?!간)(?:\s*([0-5]?\d)\s*분)?/g);
  for (const match of matches) {
    if (!match[2]) continue;
    const minute = Number.parseInt(match[2], 10);
    if (Number.isFinite(minute) && !isSupportedReservationMinute(minute)) return true;
  }
  return false;
}

function parseIsoDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function localMinutesFromIso(value: string): number | null {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match?.[1] || !match[2]) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isPastSlot(slots: FilledSlotsType, now: string): boolean {
  if (!slots.date) return false;
  const today = parseIsoDateOnly(now);
  if (!today) return false;
  if (slots.date < today) return true;
  if (slots.date > today || !slots.start_time) return false;

  const nowMinutes = localMinutesFromIso(now);
  const startMinutes = timeToMinutes(slots.start_time);
  return nowMinutes != null && startMinutes != null && startMinutes <= nowMinutes;
}

function applyImpossibleSlotOverride(result: LLMParseResult, now: string): LLMParseResult {
  if (!isPastSlot(result.filled_slots, now)) return result;
  return makeInvalidInputResult(
    '지난 날짜나 이미 지난 시간으로는 예약할 수 없어요. 오늘 이후의 날짜와 시간을 다시 알려주세요.',
    ['date'],
  );
}

function applyFutureBookingWindowOverride(result: LLMParseResult, now: string): LLMParseResult {
  if (!isBeyondFutureBookingWindow(result.filled_slots, now)) return result;
  return makeInvalidInputResult(
    '너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.',
    ['date'],
  );
}

function applyStudentCouncilBuildingDisambiguation(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const building = result.filled_slots.building?.trim();
  if (building !== '학생회관') return result;
  if (/학생\s*회관/.test(text)) return result;
  if (!/학생\s*회/.test(text)) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      building: null,
    },
  };
}

function hasExplicitStudentCenterCampus(text: string): boolean {
  return /(율전|자과캠|자연과학캠퍼스|자연과학\s*캠퍼스|명륜|인사캠|인문사회과학캠퍼스|인문사회\s*캠퍼스)/.test(
    text,
  );
}

function applyStudentCenterCampusClarification(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const building = result.filled_slots.building?.trim();
  if (building !== '학생회관') return result;
  if (!/학생\s*회관/.test(text)) return result;
  if (hasExplicitStudentCenterCampus(text)) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      campus: null,
    },
    missing_required: Array.from(new Set([...result.missing_required, 'campus'])),
    ready_to_search: false,
    assistant_message:
      '학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.',
  };
}

function applySameDayTimeOverride(result: LLMParseResult): LLMParseResult {
  if (!crossesMidnight(result.filled_slots)) return result;
  return makeInvalidInputResult(
    '자정을 넘기는 예약은 지원하지 않아요. 같은 날짜 안에서 시작·종료 시간이 끝나도록 다시 알려주세요.',
    ['start_time', 'end_time'],
  );
}

function applyTimeGranularityOverride(result: LLMParseResult): LLMParseResult {
  if (!usesUnsupportedReservationMinute(result.filled_slots)) return result;
  return makeInvalidInputResult(
    'GLS 공간예약은 30분 단위 시간만 안정적으로 처리할 수 있어요. 예: 18:00 또는 18:30처럼 다시 알려주세요.',
    ['start_time', 'end_time'],
  );
}

function applyAmbiguousMeridiemSlotOverride(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  if (!hasAmbiguousBareMeridiemTime(text)) return result;
  return {
    ...result,
    filled_slots: clearTimeSlots(result.filled_slots),
    missing_required: Array.from(new Set([...result.missing_required, 'start_time'])),
    ready_to_search: false,
    assistant_message:
      '오전/오후가 빠진 시간은 헷갈릴 수 있어요. 예: 오전 6시 또는 오후 6시처럼 다시 알려주세요.',
  };
}

function makeImpossibleInputResult(text: string): LLMParseResult | null {
  if (hasImpossibleHeadcount(text)) {
    return makeInvalidInputResult(
      '사용 인원은 1명 이상이어야 해요. 실제 사용할 인원을 다시 알려주세요.',
      ['headcount'],
    );
  }
  if (hasImpossibleClock(text)) {
    return makeInvalidInputResult(
      '시간은 0시부터 23시 사이로 알려주세요. 예: 18시부터 2시간',
      ['start_time'],
    );
  }
  if (hasUnsupportedMinuteUnit(text)) {
    return makeInvalidInputResult(
      'GLS 공간예약은 30분 단위 시간만 안정적으로 처리할 수 있어요. 예: 18:00 또는 18:30처럼 다시 알려주세요.',
      ['start_time', 'end_time'],
    );
  }
  if (hasAmbiguousBareMeridiemTime(text)) {
    return makeInvalidInputResult(
      '오전/오후가 빠진 시간은 헷갈릴 수 있어요. 예: 오전 6시 또는 오후 6시처럼 다시 알려주세요.',
      ['start_time'],
    );
  }
  return null;
}

function parseKoreanClock(text: string): string | null {
  const normalized = text.replace(/\s+/g, '');
  const match = normalized.match(/^(오전|오후)?(\d{1,2})시(?:([0-5]?\d)분)?$/);
  if (!match?.[2]) return null;
  let hour = Number.parseInt(match[2], 10);
  const minute = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 24) {
    return null;
  }
  const meridiem = match[1];
  if (meridiem === '오후' && hour < 12) hour += 12;
  if (meridiem === '오전' && hour === 12) hour = 0;
  if (hour === 24 && minute !== 0) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match?.[1] || !match[2]) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function applyInlineSlotEdits(base: FilledSlotsType | null, text: string): FilledSlotsType | null {
  if (!base || !/(바꾸|변경|수정|아니|시간(?:은|을|는)|\d+\s*명\s*으로)/.test(text)) {
    return null;
  }

  const next: FilledSlotsType = { ...base };
  let changed = false;
  let explicitSlotValue = false;

  const headcountMatch = text.match(/(\d+)\s*명/);
  if (headcountMatch?.[1]) {
    const headcount = Number.parseInt(headcountMatch[1], 10);
    if (Number.isFinite(headcount) && headcount > 0) {
      explicitSlotValue = true;
      if (headcount !== next.headcount) {
        next.headcount = headcount;
        changed = true;
      }
    }
  }

  const rangeMatch = text.match(
    /(\d{1,2})\s*시(?!간)(?:\s*\d{1,2}\s*분)?\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)/,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const start = parseKoreanClock(`${rangeMatch[1]}시`);
    const end = parseKoreanClock(`${rangeMatch[2]}시`);
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (start && end && startMin != null && endMin != null && endMin > startMin) {
      explicitSlotValue = true;
      next.start_time = start;
      next.end_time = end;
      next.duration_min = endMin - startMin;
      changed = true;
    }
  } else {
    const startMatch = text.match(
      /(?:시간(?:은|을|는)?\s*)?((?:오전|오후)?\s*\d{1,2}\s*시(?!간)(?:\s*\d{1,2}\s*분)?)(?:\s*부터)?/,
    );
    const start = startMatch?.[1] ? parseKoreanClock(startMatch[1]) : null;
    if (start) {
      explicitSlotValue = true;
      if (start !== next.start_time) {
        next.start_time = start;
        changed = true;
      }
    }
  }

  const durationMatch = text.match(/(\d+)\s*시간/);
  if (durationMatch?.[1]) {
    const hours = Number.parseInt(durationMatch[1], 10);
    if (Number.isFinite(hours) && hours > 0) {
      explicitSlotValue = true;
      if (next.duration_min !== hours * 60) {
        next.duration_min = hours * 60;
        changed = true;
      }
    }
  }

  const startMin = timeToMinutes(next.start_time);
  if (startMin != null && next.duration_min != null) {
    const endTime = minutesToTime(startMin + next.duration_min);
    if (endTime !== next.end_time) {
      next.end_time = endTime;
      changed = true;
    }
  }

  return changed || explicitSlotValue ? next : null;
}

export const __parseRouteTestables = {
  applyInlineSlotEdits,
  applyAmbiguousMeridiemSlotOverride,
  applyFutureBookingWindowOverride,
  applyImpossibleSlotOverride,
  applySameDayTimeOverride,
  applyStudentCenterCampusClarification,
  applyStudentCouncilBuildingDisambiguation,
  applyTimeGranularityOverride,
  hasAmbiguousBareMeridiemTime,
  hasUnsupportedMinuteUnit,
  hasImpossibleClock,
  hasImpossibleHeadcount,
  isLikelyOutOfScopeSmallTalk,
  makeImpossibleInputResult,
};

export async function parseRoute(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/parse',
    {
      schema: {
        body: ParseRequest,
        response: {
          200: ParseResponse,
          403: ErrorResponse,
          404: ErrorResponse,
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
        select: {
          clientId: true,
          status: true,
          deletedAt: true,
          lastApplicationState: true,
          lastFilledSlots: true,
          title: true,
        },
      });

      if (existing?.deletedAt) {
        reply.code(404).send({ error: 'conversation not found' });
        return;
      }

      if (existing && existing.clientId !== clientId) {
        reply.code(403).send({ error: 'conversation does not belong to client' });
        return;
      }

      const latestUserMessage =
        [...body.history].reverse().find((message) => message.role === 'user')?.content ?? '';
      const previousFilledSlots = parseStoredFilledSlots(existing?.lastFilledSlots ?? null);

      // 2) LLM 호출. 명백한 잡담은 LLM 실패에 의존하지 않고 로컬에서 안전하게 안내한다.
      let llmResult: LLMParseResult;
      const impossibleInputResult = makeImpossibleInputResult(latestUserMessage);
      if (impossibleInputResult) {
        llmResult = impossibleInputResult;
      } else if (isLikelyOutOfScopeSmallTalk(latestUserMessage)) {
        llmResult = makeOutOfScopeResult();
      } else {
        try {
          llmResult = await parseWithLLM({ history: body.history, now: body.now });
          llmResult = applyStudentCouncilBuildingDisambiguation(llmResult, latestUserMessage);
          llmResult = applyStudentCenterCampusClarification(llmResult, latestUserMessage);
          llmResult = applyImpossibleSlotOverride(llmResult, body.now);
          llmResult = applyFutureBookingWindowOverride(llmResult, body.now);
          llmResult = applySameDayTimeOverride(llmResult);
          llmResult = applyTimeGranularityOverride(llmResult);
        } catch (err) {
          request.log.error({ err }, 'parseWithLLM failed');
          reply.code(502).send({
            error: 'llm parse failed',
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      const inlineSlotEdits = applyInlineSlotEdits(previousFilledSlots, latestUserMessage);
      if (inlineSlotEdits) {
        llmResult = {
          ...llmResult,
          intent: 'modify_slot',
          filled_slots: inlineSlotEdits,
          missing_required: [],
          ready_to_search: true,
          assistant_message: '조건을 수정했어요. 같은 조건으로 다시 검색할게요.',
        };
        llmResult = applyFutureBookingWindowOverride(llmResult, body.now);
        llmResult = applySameDayTimeOverride(llmResult);
        llmResult = applyTimeGranularityOverride(llmResult);
      }
      llmResult = applyAmbiguousMeridiemSlotOverride(llmResult, latestUserMessage);

      const memories = await app.prisma.conversation.findMany({
        where: {
          clientId,
          status: 'completed',
          deletedAt: null,
          id: { not: body.conversation_id },
        },
        select: {
          id: true,
          confirmedReservationForm: true,
          confirmedReservationLabel: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 4,
      });

      const memoryCandidates = memories
        .map((row) => {
          const formData = parseStoredReservationForm(row.confirmedReservationForm);
          if (!formData) return null;
          return {
            conversationId: row.id,
            label: row.confirmedReservationLabel ?? summarizeReservationLabel(formData),
            formData,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const applicationResult = buildApplicationState({
        history: body.history,
        latestUserMessage,
        baseIntent: llmResult.intent,
        baseAssistantMessage: llmResult.assistant_message,
        filledSlots: llmResult.filled_slots,
        readyToSearch: llmResult.ready_to_search,
        previousState: parseStoredApplicationState(existing?.lastApplicationState ?? null),
        memories: memoryCandidates,
      });

      const response: ParseResponse = {
        conversation_id: body.conversation_id,
        ...llmResult,
        intent: applicationResult.intent,
        assistant_message: applicationResult.assistantMessage,
        application_state: applicationResult.applicationState,
      };

      let generatedTitle: string | null = null;
      if (!existing?.title && llmResult.ready_to_search && applicationResult.intent !== 'cancel') {
        try {
          generatedTitle = await summarizeConversationTitle({
            history: body.history,
            filledSlots: llmResult.filled_slots,
          });
        } catch (err) {
          request.log.warn({ err }, 'conversation title generation failed during parse');
        }
      }

      // 3) Conversation mirror upsert (D-018).
      //   - status: 기본 active. intent=cancel 이면 abandoned_user.
      //   - completed 마킹은 실제 예약 제출 시 별도 라우트에서. 여기선 active/abandoned_user 만 다룬다.
      const nextStatus =
        applicationResult.intent === 'cancel' ? 'abandoned_user' : 'active';

      try {
        await app.prisma.conversation.upsert({
          where: { id: body.conversation_id },
          create: {
            id: body.conversation_id,
            clientId,
            status: nextStatus,
            history: body.history,
            ...(generatedTitle ? { title: generatedTitle } : {}),
            lastIntent: applicationResult.intent,
            lastFilledSlots: llmResult.filled_slots,
            lastApplicationState: applicationResult.applicationState,
          },
          update: {
            history: body.history,
            ...(generatedTitle ? { title: generatedTitle } : {}),
            lastIntent: applicationResult.intent,
            lastFilledSlots: llmResult.filled_slots,
            lastApplicationState: applicationResult.applicationState,
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
