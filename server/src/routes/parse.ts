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
  applyContextualMeridiemRange,
  clearTimeSlots,
  emptyFilledSlots,
  hasAmbiguousBareMeridiemTime,
  isSupportedReservationMinute,
  timeToMinutes,
} from '../../../shared/reservation/slotPolicy.js';
import { applyInlineSlotEdits } from '../../../shared/reservation/slotEdits.js';
import {
  SLOT_GUARD_MESSAGES,
  STUDENT_CENTER_CAMPUS_MESSAGE,
  type SlotStateGuardReason,
  evaluateSlotStateGuards,
  hasContextualBareTimeEdit,
  hasExplicitStudentCenterCampus,
  mentionsStudentCenter,
} from '../../../shared/reservation/slotGuards.js';

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

function isSymbolOnlyInput(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return !/[0-9A-Za-z가-힣]/.test(normalized);
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

function makeInvalidInputResult(
  message: string,
  missingRequired: string[] = [],
  intent: LLMParseResult['intent'] = 'new_reservation',
): LLMParseResult {
  return {
    filled_slots: makeEmptySlots(),
    missing_required: missingRequired,
    intent,
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

function extractExplicitHeadcount(text: string): number | null {
  let latest: number | null = null;
  const matches = text.replace(/,/g, '').matchAll(/(^|[^\d])(\d{1,4})\s*명/g);
  for (const match of matches) {
    const value = Number.parseInt(match[2] ?? '', 10);
    if (Number.isFinite(value) && value > 0) latest = value;
  }
  return latest;
}

/**
 * LLM 보정 가드: 사용자가 "N명"을 명시했는데 LLM 이 headcount 를 다르게/누락해
 * 채우는 경우가 있어, 원문에서 마지막 "N명"을 다시 추출해 덮어쓴다.
 */
function applyExplicitHeadcountOverride(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const headcount = extractExplicitHeadcount(text);
  if (headcount == null || result.filled_slots.headcount === headcount) return result;
  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      headcount,
    },
  };
}

function extractExplicitKoreanClockMinutes(text: string): number | null {
  const match = text.match(
    /(오전|오후|아침|점심|낮|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)(?:\s*(반|[0-5]?\d\s*분))?/,
  );
  if (!match?.[2]) return null;
  let hour = Number.parseInt(match[2], 10);
  let minute = 0;
  if (match[3]) {
    minute = match[3].includes('반')
      ? 30
      : Number.parseInt(match[3].replace(/\D/g, ''), 10);
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 24) {
    return null;
  }
  const meridiem = match[1];
  if (/(오후|점심|낮|저녁|밤)/.test(meridiem ?? '') && hour < 12) hour += 12;
  if (/(오전|아침|새벽)/.test(meridiem ?? '') && hour === 12) hour = 0;
  if (hour === 24 && minute !== 0) return null;
  return hour * 60 + minute;
}

function isPastTodayRequest(text: string, now: string): boolean {
  if (!/오늘/.test(text)) return false;
  const today = parseIsoDateOnly(now);
  const nowDate = parseIsoDateOnly(now);
  if (!today || today !== nowDate) return false;
  const nowMinutes = localMinutesFromIso(now);
  const requestedMinutes = extractExplicitKoreanClockMinutes(text);
  return nowMinutes != null && requestedMinutes != null && requestedMinutes <= nowMinutes;
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
  return makeInvalidInputResult(SLOT_GUARD_MESSAGES.past_slot, ['date'], 'out_of_scope');
}

const GUARD_FORCES_OUT_OF_SCOPE = new Set<SlotStateGuardReason>([
  'beyond_window',
  'over_duration',
]);

function applySlotStateGuards(result: LLMParseResult, now: string): LLMParseResult {
  const outcome = evaluateSlotStateGuards(result.filled_slots, now);
  if (!outcome) return result;
  return {
    ...result,
    filled_slots: outcome.filledSlots,
    missing_required: outcome.missingRequired,
    ready_to_search: false,
    intent: GUARD_FORCES_OUT_OF_SCOPE.has(outcome.reason) ? 'out_of_scope' : result.intent,
    assistant_message: outcome.message,
  };
}

/**
 * LLM 보정 가드: LLM 이 "학생회"(단체)를 건물 "학생회관"으로 과추론하는 경우가
 * 있어, 사용자가 "학생회관"이라 말하지 않았다면 building 을 비운다.
 * 근본 해결은 프롬프트 보강이지만 LLM eval 전까지의 안전망.
 */
function applyStudentCouncilBuildingDisambiguation(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const building = result.filled_slots.building?.trim();
  if (building !== '학생회관') return result;
  if (mentionsStudentCenter(text)) return result;
  if (!/학생\s*회/.test(text)) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      building: null,
    },
  };
}

/**
 * LLM 보정 가드: "학생회관"은 캠퍼스마다 존재해 LLM 이 캠퍼스를 임의 추정하기
 * 쉽다. 캠퍼스 명시가 없으면 campus 를 비우고 되묻는다. (탐지·문구는 shared.)
 */
function applyStudentCenterCampusClarification(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const building = result.filled_slots.building?.trim();
  if (!mentionsStudentCenter(text)) return result;
  if (hasExplicitStudentCenterCampus(text)) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      campus: null,
      building: building === '학생회관' ? result.filled_slots.building : null,
    },
    missing_required: Array.from(new Set([...result.missing_required, 'campus'])),
    ready_to_search: false,
    assistant_message: STUDENT_CENTER_CAMPUS_MESSAGE,
  };
}

function extractExplicitSpaceCode(text: string): string | null {
  const matches = text.matchAll(/(^|[^\d])(\d{5,6})(?:\s*호)?(?=$|[^\d])/g);
  for (const match of matches) {
    const code = match[2];
    if (code) return code;
  }
  return null;
}

/**
 * LLM 보정 가드: 사용자가 5~6자리 공간코드를 직접 적으면 DB 에서 조회해
 * campus/building/space 를 확정한다. LLM 은 코드를 신뢰성 있게 매핑하지 못한다.
 * (코드가 DB 에 없으면 조용히 무시 — 오타/미시딩 시 일반 흐름으로 진행.)
 */
async function applyExplicitSpaceCodeOverride(
  app: FastifyInstance,
  result: LLMParseResult,
  text: string,
): Promise<LLMParseResult> {
  const code = extractExplicitSpaceCode(text);
  if (!code) return result;

  const space = await app.prisma.space.findUnique({
    where: { glsSpaceCode: code },
    select: {
      campusName: true,
      buildingName: true,
      glsSpaceCode: true,
    },
  });
  if (!space) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      campus: space.campusName,
      building: space.buildingName,
      space: space.glsSpaceCode,
    },
  };
}

function applyContextualMeridiemRangeOverride(
  result: LLMParseResult,
  text: string,
): LLMParseResult {
  const filledSlots = applyContextualMeridiemRange(result.filled_slots, text);
  return filledSlots === result.filled_slots
    ? result
    : {
        ...result,
        filled_slots: filledSlots,
      };
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
    assistant_message: SLOT_GUARD_MESSAGES.ambiguous_meridiem,
  };
}

function makeImpossibleInputResult(text: string, now: string): LLMParseResult | null {
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
    return makeInvalidInputResult(SLOT_GUARD_MESSAGES.unsupported_minute, [
      'start_time',
      'end_time',
    ]);
  }
  if (hasAmbiguousBareMeridiemTime(text)) {
    return makeInvalidInputResult(SLOT_GUARD_MESSAGES.ambiguous_meridiem, ['start_time']);
  }
  if (isPastTodayRequest(text, now)) {
    return makeInvalidInputResult(SLOT_GUARD_MESSAGES.past_slot, ['date'], 'out_of_scope');
  }
  return null;
}

export const __parseRouteTestables = {
  applyInlineSlotEdits,
  applyAmbiguousMeridiemSlotOverride,
  applySlotStateGuards,
  applyImpossibleSlotOverride,
  applyContextualMeridiemRangeOverride,
  extractExplicitSpaceCode,
  applyStudentCenterCampusClarification,
  applyStudentCouncilBuildingDisambiguation,
  applyExplicitHeadcountOverride,
  extractExplicitHeadcount,
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
      const previousFilledSlots =
        parseStoredFilledSlots(existing?.lastFilledSlots ?? null) ??
        parseStoredFilledSlots(body.client_last_filled_slots ?? null);
      const previousApplicationState =
        parseStoredApplicationState(existing?.lastApplicationState ?? null) ??
        parseStoredApplicationState(body.client_last_application_state ?? null);

      // 2) LLM 호출. 명백한 잡담은 LLM 실패에 의존하지 않고 로컬에서 안전하게 안내한다.
      let llmResult: LLMParseResult;
      const impossibleInputResult = makeImpossibleInputResult(latestUserMessage, body.now);
      if (impossibleInputResult) {
        llmResult = applyExplicitHeadcountOverride(impossibleInputResult, latestUserMessage);
      } else if (isSymbolOnlyInput(latestUserMessage)) {
        llmResult = makeInvalidInputResult(
          '예약할 날짜, 시간, 인원처럼 이해할 수 있는 내용으로 다시 알려주세요.',
          ['headcount', 'date', 'start_time', 'end_time'],
        );
      } else if (isLikelyOutOfScopeSmallTalk(latestUserMessage)) {
        llmResult = makeOutOfScopeResult();
      } else {
        try {
          llmResult = await parseWithLLM({ history: body.history, now: body.now });
          llmResult = applyExplicitHeadcountOverride(llmResult, latestUserMessage);
          llmResult = applyStudentCouncilBuildingDisambiguation(llmResult, latestUserMessage);
          llmResult = applyStudentCenterCampusClarification(llmResult, latestUserMessage);
          llmResult = applyImpossibleSlotOverride(llmResult, body.now);
          llmResult = applyContextualMeridiemRangeOverride(llmResult, latestUserMessage);
          llmResult = applySlotStateGuards(llmResult, body.now);
          llmResult = await applyExplicitSpaceCodeOverride(app, llmResult, latestUserMessage);
        } catch (err) {
          request.log.error({ err }, 'parseWithLLM failed');
          reply.code(502).send({
            error: 'llm parse failed',
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      const inlineSlotEdits = applyInlineSlotEdits(
        previousFilledSlots,
        latestUserMessage,
        body.now,
      );
      if (inlineSlotEdits) {
        llmResult = {
          ...llmResult,
          intent: 'modify_slot',
          filled_slots: inlineSlotEdits,
          missing_required: [],
          ready_to_search: true,
          assistant_message: '조건을 수정했어요. 같은 조건으로 다시 검색할게요.',
        };
        llmResult = applyContextualMeridiemRangeOverride(llmResult, latestUserMessage);
        llmResult = applySlotStateGuards(llmResult, body.now);
        llmResult = await applyExplicitSpaceCodeOverride(app, llmResult, latestUserMessage);
      }
      if (!hasContextualBareTimeEdit(latestUserMessage, previousFilledSlots)) {
        llmResult = applyAmbiguousMeridiemSlotOverride(llmResult, latestUserMessage);
      }

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
        previousState: previousApplicationState,
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
