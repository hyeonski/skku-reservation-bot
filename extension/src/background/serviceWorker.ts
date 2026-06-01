/**
 * Background Service Worker — MV3 entry (D-026, D-027).
 *
 * 책임:
 * - popup ↔ content ↔ server 메시지 라우팅
 * - 자동화 오케스트레이션 (chat 응답 → 후보 조회 → content 통신 → confirm → submit)
 * - 진행 중 상태를 chrome.storage.session에 mirror (SW idle 종료 대비)
 */

import type {
  PopupToBackground,
  ContentToBackground,
  BgChatResponse,
  BgStatusUpdate,
  BgReservationDone,
  ApplicationStateResponse,
  ConversationListResponse,
  ReminderResponse,
} from '../shared/messages';
import type { CoordinatorBroadcast } from './glsCoordinator';
import type {
  AutomationStatus,
  FilledSlots,
  Intent,
  ApplicationState,
  ParseResult,
  ReservationFormData,
  ConversationSessionSummary,
  ConversationStatus,
  ChatMessage,
} from '../shared/types';
import * as apiClient from './apiClient';
import * as gls from './glsCoordinator';
import { getOrCreateClientId } from '../shared/clientId';
import {
  applyDraftModification,
  parseModification,
} from '../sidepanel/utils/parseModification';
import {
  CONVERSATION_INDEX_KEY,
  isPlaceholderConversationSummary,
  SNAPSHOT_PREFIX,
  makeConversationSessionSummary,
  mergeConversationSessionSummaries,
  shouldAppearInConversationHistory,
} from '../shared/conversationSessions';
import {
  applicationLengthIssueMessage,
  findApplicationLengthIssue,
  hasRepeatReservationCondition,
} from './chatSafety';

interface PendingStartRequest {
  conversationId: string;
  slots: FilledSlots;
  candidates?: import('../shared/types').SpaceCandidate[];
  pendingFormData?: ReservationFormData;
}

// ---------- per-conversation context (history + last parse) ----------

interface ConversationContext {
  conversationId: string;
  title: string | null;
  history: ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  conversationStatus: ConversationStatus;
  confirmedReservationLabel: string | null;
  confirmedSpaceCode: string | null;
  confirmedSpaceLabel: string | null;
  updatedAt: string;
  lastStatus: AutomationStatus;
  pendingStart: PendingStartRequest | null;
  lastProposed: import('../shared/types').SpaceCandidate | null;
  loginPrompt:
    | {
        variant: 'needed' | 'expired';
        tabId: number | null;
      }
    | null;
}

const contexts = new Map<string, ConversationContext>();
const pendingStarts = new Map<string, PendingStartRequest>();

const SESSION_KEY = 'sw_contexts_v1';
const MAX_RESERVATION_DURATION_MIN = 8 * 60;
const MAX_FUTURE_BOOKING_DAYS = 180;
const SUPPORTED_TIME_MINUTES = new Set([0, 30]);
const rehydrationReady = (async () => {
  await rehydrateContexts();
  await gls.waitForQueuesRehydrated();
})();

async function persistContexts(): Promise<void> {
  try {
    const obj: Record<string, ConversationContext> = {};
    for (const [k, v] of contexts) obj[k] = v;
    await chrome.storage.session.set({ [SESSION_KEY]: obj });
  } catch {
    // session storage may not be available — non-fatal.
  }
}

async function rehydrateContexts(): Promise<void> {
  try {
    const got = await chrome.storage.session.get(SESSION_KEY);
    const obj = got?.[SESSION_KEY] as Record<string, ConversationContext> | undefined;
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) contexts.set(k, v);
  } catch {
    // ignore
  }
}

function getOrCreateContext(conversationId: string): ConversationContext {
  let ctx = contexts.get(conversationId);
  if (!ctx) {
    ctx = {
      conversationId,
      title: null,
      history: [],
      lastIntent: null,
      lastFilledSlots: null,
      applicationState: null,
      conversationStatus: 'active',
      confirmedReservationLabel: null,
      confirmedSpaceCode: null,
      confirmedSpaceLabel: null,
      updatedAt: new Date().toISOString(),
      lastStatus: { kind: 'idle' },
      pendingStart: null,
      lastProposed: null,
      loginPrompt: null,
    };
    contexts.set(conversationId, ctx);
  } else {
    ctx.conversationStatus ??= 'active';
    ctx.title ??= null;
    ctx.confirmedReservationLabel ??= null;
    ctx.confirmedSpaceCode ??= null;
    ctx.confirmedSpaceLabel ??= null;
    ctx.updatedAt ??= new Date().toISOString();
    ctx.loginPrompt ??= null;
  }
  return ctx;
}

function isLoginCompleteUrl(url?: string): boolean {
  return !!url && url.startsWith('https://kingoinfo.skku.edu/');
}

function setLoginPrompt(
  conversationId: string,
  prompt:
    | {
        variant: 'needed' | 'expired';
        tabId: number | null;
      }
    | null,
): void {
  const ctx = getOrCreateContext(conversationId);
  ctx.loginPrompt = prompt;
  void persistContexts();
}

function clearLoginPrompt(conversationId: string): void {
  setLoginPrompt(conversationId, null);
}

function isSearchReady(slots: FilledSlots | null | undefined): slots is FilledSlots {
  if (!slots) return false;
  return Boolean(
    slots.date &&
      slots.start_time &&
      (slots.end_time || slots.duration_min != null) &&
      slots.headcount != null,
  );
}

function emptyFilledSlots(): FilledSlots {
  return {
    date: null,
    start_time: null,
    end_time: null,
    duration_min: null,
    headcount: null,
    campus: null,
    building: null,
    space: null,
  };
}

function clearTimeSlots(slots: FilledSlots | null | undefined): FilledSlots {
  return {
    ...(slots ?? emptyFilledSlots()),
    start_time: null,
    end_time: null,
  };
}

function hasAnyFilledSlot(slots: FilledSlots | null | undefined): boolean {
  if (!slots) return false;
  return Boolean(
    slots.date ||
      slots.start_time ||
      slots.end_time ||
      slots.duration_min != null ||
      slots.headcount != null ||
      slots.campus ||
      slots.building ||
      slots.space,
  );
}

function preservePreviousSlotContext(
  result: ParseResult,
  previousSlots: FilledSlots | null,
): ParseResult {
  if (!previousSlots) return result;
  if (
    result.intent === 'cancel' ||
    hasAnyFilledSlot(result.filled_slots) ||
    !hasAnyFilledSlot(previousSlots)
  ) {
    return result;
  }

  return {
    ...result,
    filled_slots: previousSlots,
    ready_to_search: false,
  };
}

function emptyApplicationState(): ApplicationState {
  return {
    draft: null,
    missing_application: ['organization', 'eventName', 'purpose', 'hangsaGbCode'],
    needs_application_collection: true,
    suggested_memory: null,
    recommendation: null,
    confidence: {
      organization: 'low',
      eventName: 'low',
      purpose: 'low',
      hangsaGbCode: 'low',
    },
    source: null,
  };
}

function mostlyEnglishReservationRequest(text: string): boolean {
  const latinLetters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const hangulLetters = text.match(/\p{Script=Hangul}/gu)?.length ?? 0;
  if (latinLetters < 8) return false;
  if (hangulLetters === 0) return true;
  return /\b(?:book|reserve|reservation|room|meeting|people|person|pm|am)\b/i.test(text) &&
    latinLetters > hangulLetters;
}

function hasUnsupportedFacilityCondition(text: string): boolean {
  return /빔\s*프로젝터|프로젝터|화이트\s*보드|칠판|마이크|스피커|모니터|컴퓨터|\bpc\b|콘센트|hdmi|음향|장비/i.test(
    text,
  );
}

function asksToChangeSubmittedReservation(text: string): boolean {
  if (!/(예약|신청)/.test(text)) return false;
  if (!/(취소|변경|수정)/.test(text)) return false;
  return /(방금|이미|완료|제출|저장|신청한|예약한|했던|지난번|이전)/.test(text);
}

function asksForCandidateList(text: string): boolean {
  return /(여러\s*개|후보.*(?:목록|리스트|비교)|비교해서|같이\s*보여)/.test(text);
}

function asksForSpecificRoomAvailabilityWindow(text: string): boolean {
  const normalized = text.trim();
  if (!/(언제|몇\s*시|빈\s*(?:시간|날짜|때)|가능한\s*(?:시간|날짜|때)|비어|비는|남는|가용)/.test(normalized)) {
    return false;
  }
  return /(?:그|이|해당|원하는)\s*(?:방|공간|곳)|빈\s*시간|언제\s*비어/.test(normalized);
}

function unsupportedAvailabilityWindowMessage(): string {
  return '특정 공간의 빈 시간대를 자동으로 훑어 제안하는 기능은 아직 지원하지 않아요. 원하는 날짜와 시간을 하나 정해서 다시 요청해 주세요. 지금 조건으로 다른 공간을 찾고 싶다면 "다른 공간"이라고 알려주세요.';
}

function applyChatSafetyOverride(
  result: ParseResult,
  latestMessage: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (mostlyEnglishReservationRequest(latestMessage)) {
    return {
      ...result,
      filled_slots: emptyFilledSlots(),
      missing_required: ['headcount', 'date', 'start_time', 'end_time'],
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message:
        '현재는 한국어 예약 요청만 안정적으로 처리할 수 있어요. 날짜, 시간, 인원을 한국어로 다시 알려주세요.',
      application_state: previousApplicationState ?? emptyApplicationState(),
    };
  }

  if (hasRepeatReservationCondition(latestMessage)) {
    return {
      ...result,
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message:
        '반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.',
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  if (hasUnsupportedFacilityCondition(latestMessage)) {
    return {
      ...result,
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message:
        '빔프로젝터, 화이트보드 같은 시설·장비 조건은 아직 GLS에서 자동 확인할 수 없어요. 날짜, 시간, 인원 기준으로만 찾을 수 있습니다.',
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  if (asksToChangeSubmittedReservation(latestMessage)) {
    return {
      ...result,
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message:
        '이미 저장되거나 제출된 예약의 취소·변경은 이 확장에서 대신 처리하지 않아요. GLS 화면에서 직접 확인해 주세요.',
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  if (asksForSpecificRoomAvailabilityWindow(latestMessage)) {
    return {
      ...result,
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message: unsupportedAvailabilityWindowMessage(),
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  return result;
}

function applyApplicationLengthGuard(result: ParseResult): ParseResult {
  const issue = findApplicationLengthIssue(result.application_state.draft);
  if (!issue) return result;

  return {
    ...result,
    intent: 'modify_application',
    ready_to_search: false,
    assistant_message: applicationLengthIssueMessage(issue),
    application_state: {
      ...result.application_state,
      missing_application: Array.from(new Set([
        issue.field,
        ...result.application_state.missing_application,
      ])),
      needs_application_collection: true,
      suggested_memory: null,
      recommendation: null,
      source: result.application_state.source ?? 'user_modified',
    },
  };
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1] ?? '', 10);
  const minute = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isSupportedReservationMinute(minute: number): boolean {
  return SUPPORTED_TIME_MINUTES.has(minute);
}

function hasAmbiguousBareMeridiemTime(text: string): boolean {
  const matches = text.matchAll(/(\d{1,2})\s*시(?!간)(?:\s*([0-5]?\d)\s*분)?/g);
  for (const match of matches) {
    const hour = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(hour) || hour < 1 || hour > 12) continue;

    const startIndex = match.index ?? 0;
    const before = text.slice(Math.max(0, startIndex - 8), startIndex);
    const segment = `${before}${match[0]}`;
    if (/(오전|오후|아침|점심|낮|저녁|밤|새벽|정오|자정)/.test(segment)) {
      continue;
    }

    return true;
  }
  return false;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`;
}

function parseKoreanClock(text: string): string | null {
  const match = text.match(/(?:오전|오후)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/);
  if (!match?.[1]) return null;
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (/오후/.test(match[0]) && hour < 12) hour += 12;
  if (/오전/.test(match[0]) && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function addDaysToIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function applyRetrySlotAdjustment(base: FilledSlots | null, text: string): FilledSlots | null {
  if (!base) return null;
  const next: FilledSlots = { ...base };
  let changed = false;

  const countMatch = text.match(/(\d+)\s*명/);
  if (countMatch) {
    const parsed = Number.parseInt(countMatch[1] ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== next.headcount) {
      next.headcount = parsed;
      changed = true;
    }
  }

  const rangeMatch = text.match(/(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*시/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1] ?? '', 10);
    const end = Number.parseInt(rangeMatch[2] ?? '', 10);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      next.start_time = formatHour(start);
      next.end_time = formatHour(end);
      next.duration_min = (end - start) * 60;
      changed = true;
    }
  }

  const durationMatch = text.match(/(\d+)\s*시간/);
  if (durationMatch && next.start_time) {
    const hours = Number.parseInt(durationMatch[1] ?? '', 10);
    if (Number.isFinite(hours) && hours > 0) {
      next.duration_min = hours * 60;
      const [sh, sm] = next.start_time.split(':');
      const endMin =
        Number.parseInt(sh ?? '0', 10) * 60 +
        Number.parseInt(sm ?? '0', 10) +
        hours * 60;
      next.end_time = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      changed = true;
    }
  }

  if (/다음\s*주/.test(text) && next.date) {
    next.date = addDaysToIso(next.date, 7);
    changed = true;
  }

  if (!changed) return null;
  return next;
}

function extractHeadcountRangeUpper(text: string): number | null {
  const normalized = text.replace(/,/g, '');
  const matches = [
    normalized.match(/(\d+)\s*(?:명)?\s*[-–~]\s*(\d+)\s*명/),
    normalized.match(/(\d+)\s*명\s*(?:에서|부터)\s*(\d+)\s*명/),
  ];
  const match = matches.find(Boolean);
  if (!match) return null;

  const first = Number.parseInt(match[1] ?? '', 10);
  const second = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const upper = Math.max(first, second);
  return upper > 0 ? upper : null;
}

function extractLatestHeadcountRangeUpper(
  history: ChatMessage[],
  latestMessage: string,
): number | null {
  const userTexts = history
    .filter((message) => message.role === 'user')
    .map((message) => message.content);
  if (userTexts[userTexts.length - 1] !== latestMessage) {
    userTexts.push(latestMessage);
  }

  for (let i = userTexts.length - 1; i >= 0; i -= 1) {
    const text = userTexts[i] ?? '';
    const upper = extractHeadcountRangeUpper(text);
    if (upper != null) return upper;
    if (/\d+\s*명/.test(text)) return null;
  }
  return null;
}

function applyHeadcountRangeOverride(result: ParseResult, upper: number | null): ParseResult {
  if (upper == null || result.filled_slots.headcount === upper) return result;

  const previous = result.filled_slots.headcount;
  const filledSlots = {
    ...result.filled_slots,
    headcount: upper,
  };
  const missingRequired = result.missing_required.filter((field) => field !== 'headcount');
  const assistantMessage =
    previous != null
      ? result.assistant_message.replace(new RegExp(`${previous}\\s*명`, 'g'), `${upper}명`)
      : result.assistant_message;

  return {
    ...result,
    filled_slots: filledSlots,
    missing_required: missingRequired,
    ready_to_search: isSearchReady(filledSlots),
    assistant_message: assistantMessage,
    application_state: {
      ...result.application_state,
      draft: applyHeadcountToDraft(result.application_state.draft, upper),
    },
  };
}

function applySlotCorrection(base: FilledSlots | null, text: string): FilledSlots | null {
  if (!base) return null;
  const normalized = text.trim();
  const headcountMatch = normalized.match(
    /^(?:아니(?:요)?\s*)?(?:인원(?:은|을|는)?\s*)?(\d+)\s*명(?:으로)?\s*(?:(?:바꿔?|변경|수정)(?:해줘|해주세요)?)?$/,
  );
  if (!headcountMatch) return null;

  const headcount = Number.parseInt(headcountMatch[1] ?? '', 10);
  if (!Number.isFinite(headcount) || headcount <= 0 || headcount === base.headcount) {
    return null;
  }

  return {
    ...base,
    headcount,
  };
}

function applyInlineSlotEdits(base: FilledSlots | null, text: string): FilledSlots | null {
  if (!base) return null;
  const normalized = text.trim();
  if (!/(바꾸|변경|수정|아니)/.test(normalized)) {
    return null;
  }

  const next: FilledSlots = { ...base };
  let changed = false;
  let explicitSlotValue = false;

  const headcountMatch = normalized.match(/(\d+)\s*명/);
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

  const rangeMatch = normalized.match(
    /(\d{1,2})\s*시(?!간)(?:\s*\d{1,2}\s*분)?\s*(?:부터|[-–~])\s*(\d{1,2})\s*시(?!간)/,
  );
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const start = parseKoreanClock(`${rangeMatch[1]}시`);
    const end = parseKoreanClock(`${rangeMatch[2]}시`);
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (start && end && startMin != null && endMin != null && endMin > startMin) {
      explicitSlotValue = true;
      if (
        next.start_time !== start ||
        next.end_time !== end ||
        next.duration_min !== endMin - startMin
      ) {
        next.start_time = start;
        next.end_time = end;
        next.duration_min = endMin - startMin;
        changed = true;
      }
    }
  } else {
    const startMatch = normalized.match(
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

  const durationMatch = normalized.match(/(\d+)\s*시간/);
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

function applyHeadcountToDraft(
  draft: ReservationFormData | null,
  headcount: number | null,
): ReservationFormData | null {
  if (!draft || headcount == null) return draft;
  return {
    ...draft,
    headcount,
  };
}

function candidateSupportsHeadcount(
  candidate: import('../shared/types').SpaceCandidate | null,
  headcount: number | null,
): boolean {
  if (!candidate || headcount == null) return false;
  return candidate.capacityMin <= headcount && headcount <= candidate.capacityMax;
}

async function loadConversationIndex(): Promise<ConversationSessionSummary[]> {
  try {
    const got = await chrome.storage.local.get(CONVERSATION_INDEX_KEY);
    const stored = got?.[CONVERSATION_INDEX_KEY];
    return Array.isArray(stored)
      ? (stored as ConversationSessionSummary[]).filter(
          (summary) => !isPlaceholderConversationSummary(summary),
        )
      : [];
  } catch {
    return [];
  }
}

async function saveConversationIndex(index: ConversationSessionSummary[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONVERSATION_INDEX_KEY]: index });
  } catch {
    // non-fatal
  }
}

async function removeConversationIndexEntry(conversationId: string): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = current.filter((item) => item.id !== conversationId);
  await saveConversationIndex(next);
  return next;
}

async function persistConversationSnapshot(ctx: ConversationContext): Promise<void> {
  try {
    await chrome.storage.local.set({
      [`${SNAPSHOT_PREFIX}${ctx.conversationId}`]: {
        history: ctx.history,
        lastFilledSlots: ctx.lastFilledSlots,
        applicationState: ctx.applicationState,
        conversationStatus: ctx.conversationStatus,
        lastStatus: ctx.lastStatus,
        lastProposed: ctx.lastProposed,
        pendingFormData: ctx.pendingStart?.pendingFormData ?? null,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
        confirmedSpaceCode: ctx.confirmedSpaceCode,
        confirmedSpaceLabel: ctx.confirmedSpaceLabel,
        updatedAt: ctx.updatedAt,
      },
    });
  } catch {
    // local snapshot is a resilience aid; never block the live flow.
  }
}

function buildSummaryFromContext(ctx: ConversationContext): ConversationSessionSummary {
  return makeConversationSessionSummary({
    id: ctx.conversationId,
    title: ctx.title,
    status: ctx.conversationStatus,
    updatedAt: ctx.updatedAt,
    confirmedReservationLabel: ctx.confirmedReservationLabel,
    confirmedSpaceCode: ctx.confirmedSpaceCode,
    confirmedSpaceLabel: ctx.confirmedSpaceLabel,
    messages: ctx.history,
    lastFilledSlots: ctx.lastFilledSlots,
  });
}

function buildSummaryFromServer(
  row: apiClient.ConversationSummaryDto,
): ConversationSessionSummary | null {
  if (
    !shouldAppearInConversationHistory({
      status: row.status,
      messages: row.firstUserMessage
        ? [{ role: 'user', content: row.firstUserMessage }]
        : [],
      lastFilledSlots: row.lastFilledSlots,
      confirmedReservationLabel: row.confirmedReservationLabel,
      lastMessagePreview: row.lastMessagePreview,
    })
  ) {
    return null;
  }
  return makeConversationSessionSummary({
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updatedAt,
    confirmedReservationLabel: row.confirmedReservationLabel,
    confirmedSpaceCode: row.confirmedSpaceCode,
    confirmedSpaceLabel: row.confirmedSpaceLabel,
    firstUserMessage: row.firstUserMessage,
    lastMessagePreview: row.lastMessagePreview,
    lastFilledSlots: row.lastFilledSlots,
  });
}

async function syncConversationIndexWithSummary(
  summary: ConversationSessionSummary,
): Promise<ConversationSessionSummary[]> {
  const current = await loadConversationIndex();
  const next = mergeConversationSessionSummaries(current, [summary]);
  await saveConversationIndex(next);
  return next;
}

async function syncConversationSummaryFromContext(
  ctx: ConversationContext,
): Promise<ConversationSessionSummary[]> {
  if (
    !shouldAppearInConversationHistory({
      status: ctx.conversationStatus,
      messages: ctx.history,
      lastFilledSlots: ctx.lastFilledSlots,
      applicationState: ctx.applicationState,
      confirmedReservationLabel: ctx.confirmedReservationLabel,
    })
  ) {
    await removeConversationSnapshot(ctx.conversationId);
    return removeConversationIndexEntry(ctx.conversationId);
  }
  await persistConversationSnapshot(ctx);
  return syncConversationIndexWithSummary(buildSummaryFromContext(ctx));
}

async function refreshConversationIndexFromServer(): Promise<ConversationSessionSummary[]> {
  const localIndex = await loadConversationIndex();
  const remoteRows = await apiClient.listConversations();
  const remoteIndex = remoteRows
    .map((row) => buildSummaryFromServer(row))
    .filter((row): row is ConversationSessionSummary => row !== null);
  const contextIndex = [...contexts.values()]
    .filter((ctx) =>
      shouldAppearInConversationHistory({
        status: ctx.conversationStatus,
        messages: ctx.history,
        lastFilledSlots: ctx.lastFilledSlots,
        applicationState: ctx.applicationState,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
      }),
    )
    .map((ctx) => buildSummaryFromContext(ctx));
  const merged = mergeConversationSessionSummaries(localIndex, remoteIndex, contextIndex);
  await saveConversationIndex(merged);
  return merged;
}

async function removeConversationSnapshot(conversationId: string): Promise<void> {
  try {
    await chrome.storage.local.remove(`${SNAPSHOT_PREFIX}${conversationId}`);
  } catch {
    // non-fatal
  }
}

async function hydrateContextFromSnapshot(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const got = await chrome.storage.local.get(`${SNAPSHOT_PREFIX}${conversationId}`);
    const snapshot = got?.[`${SNAPSHOT_PREFIX}${conversationId}`] as
      | Partial<ConversationContext & { pendingFormData: ReservationFormData | null }>
      | undefined;
    if (!snapshot) return null;
    const ctx = getOrCreateContext(conversationId);
    ctx.history = Array.isArray(snapshot.history) ? snapshot.history : [];
    ctx.lastFilledSlots = snapshot.lastFilledSlots ?? null;
    ctx.applicationState = snapshot.applicationState ?? null;
    ctx.conversationStatus = snapshot.conversationStatus ?? 'active';
    ctx.lastStatus = snapshot.lastStatus ?? { kind: 'idle' };
    ctx.lastProposed = snapshot.lastProposed ?? null;
    ctx.pendingStart = snapshot.pendingFormData
      ? {
          conversationId,
          slots: ctx.lastFilledSlots ?? emptyFilledSlots(),
          pendingFormData: snapshot.pendingFormData,
        }
      : null;
    ctx.confirmedReservationLabel = snapshot.confirmedReservationLabel ?? null;
    ctx.confirmedSpaceCode = snapshot.confirmedSpaceCode ?? null;
    ctx.confirmedSpaceLabel = snapshot.confirmedSpaceLabel ?? null;
    ctx.updatedAt = snapshot.updatedAt ?? new Date().toISOString();
    await persistContexts();
    return ctx;
  } catch {
    return null;
  }
}

async function hydrateContextFromSummary(
  conversationId: string,
): Promise<ConversationContext | null> {
  const summary = (await loadConversationIndex()).find((item) => item.id === conversationId);
  if (!summary) return null;
  const ctx = getOrCreateContext(conversationId);
  ctx.history = summary.lastMessagePreview
    ? [{ role: 'assistant', content: summary.lastMessagePreview, ts: summary.updatedAt }]
    : [];
  ctx.conversationStatus = summary.status;
  ctx.lastStatus =
    summary.status === 'completed'
      ? { kind: 'done', spaceCode: summary.confirmedSpaceCode ?? 'completed' }
      : { kind: 'idle' };
  ctx.confirmedReservationLabel = summary.confirmedReservationLabel ?? null;
  ctx.confirmedSpaceCode = summary.confirmedSpaceCode ?? null;
  ctx.confirmedSpaceLabel = summary.confirmedSpaceLabel ?? null;
  ctx.updatedAt = summary.updatedAt;
  await persistContexts();
  return ctx;
}

async function hydrateContextFromServer(
  conversationId: string,
): Promise<ConversationContext | null> {
  try {
    const dto = await apiClient.getConversation(conversationId);
    const ctx = getOrCreateContext(conversationId);
    ctx.history = dto.history;
    ctx.title = dto.title;
    ctx.lastIntent = dto.lastIntent;
    ctx.lastFilledSlots = dto.lastFilledSlots;
    ctx.applicationState = dto.lastApplicationState;
    ctx.conversationStatus = dto.status;
    ctx.confirmedReservationLabel = dto.confirmedReservationLabel;
    ctx.confirmedSpaceCode = dto.confirmedSpaceCode;
    ctx.confirmedSpaceLabel = dto.confirmedSpaceLabel;
    ctx.updatedAt = dto.updatedAt;
    ctx.lastStatus = { kind: 'idle' };
    ctx.pendingStart = null;
    ctx.lastProposed = null;
    ctx.loginPrompt = null;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
    return ctx;
  } catch (error) {
    if (error instanceof apiClient.ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function mirrorConversation(
  conversationId: string,
  body: apiClient.UpsertConversationBody,
  warnLabel: string,
): Promise<void> {
  try {
    const dto = await apiClient.upsertConversation(conversationId, body);
    const ctx = contexts.get(conversationId);
    if (!ctx) return;
    ctx.title = dto.title;
    ctx.conversationStatus = dto.status;
    ctx.confirmedReservationLabel = dto.confirmedReservationLabel;
    ctx.confirmedSpaceCode = dto.confirmedSpaceCode;
    ctx.confirmedSpaceLabel = dto.confirmedSpaceLabel;
    ctx.updatedAt = dto.updatedAt;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
  } catch (e) {
    console.warn(warnLabel, e);
  }
}

function deriveEndTime(slots: FilledSlots | null | undefined): string | null {
  if (!slots) return null;
  if (slots.end_time) return slots.end_time;
  if (!slots.start_time || slots.duration_min == null) return null;
  const [hRaw, mRaw] = slots.start_time.split(':');
  const startMin = Number.parseInt(hRaw ?? '', 10) * 60 + Number.parseInt(mRaw ?? '', 10);
  if (!Number.isFinite(startMin)) return null;
  const endMin = (startMin + slots.duration_min) % (24 * 60);
  const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
  const em = String(endMin % 60).padStart(2, '0');
  return `${eh}:${em}`;
}

function normalizeSlotEndTime(slots: FilledSlots): FilledSlots {
  if (slots.end_time) return slots;
  const endTime = deriveEndTime(slots);
  return endTime ? { ...slots, end_time: endTime } : slots;
}

function crossesMidnight(slots: FilledSlots | null | undefined): boolean {
  if (!slots) return false;
  const startMin = timeToMinutes(slots.start_time);
  const endMin = timeToMinutes(slots.end_time);
  if (startMin != null && endMin != null && endMin <= startMin) return true;
  if (startMin != null && slots.duration_min != null) {
    return startMin + slots.duration_min >= 24 * 60;
  }
  return false;
}

function applySameDayTimeOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!crossesMidnight(result.filled_slots)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['start_time', 'end_time'],
    assistant_message:
      '자정을 넘기는 예약은 지원하지 않아요. 같은 날짜 안에서 시작·종료 시간이 끝나도록 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}

function usesUnsupportedReservationMinute(slots: FilledSlots | null | undefined): boolean {
  if (!slots) return false;
  const startMinutes = timeToMinutes(slots.start_time);
  const endMinutes = timeToMinutes(slots.end_time);
  if (startMinutes != null && !isSupportedReservationMinute(startMinutes % 60)) return true;
  if (endMinutes != null && !isSupportedReservationMinute(endMinutes % 60)) return true;
  if (startMinutes != null && slots.duration_min != null) {
    return !isSupportedReservationMinute((startMinutes + slots.duration_min) % 60);
  }
  return false;
}

function applyTimeGranularityOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!usesUnsupportedReservationMinute(result.filled_slots)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['start_time', 'end_time'],
    filled_slots: emptyFilledSlots(),
    assistant_message:
      'GLS 공간예약은 30분 단위 시간만 안정적으로 처리할 수 있어요. 예: 18:00 또는 18:30처럼 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}

function applyAmbiguousMeridiemOverride(
  result: ParseResult,
  text: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!hasAmbiguousBareMeridiemTime(text)) return result;
  return {
    ...result,
    intent: result.intent,
    ready_to_search: false,
    missing_required: Array.from(new Set([...result.missing_required, 'start_time'])),
    filled_slots: clearTimeSlots(result.filled_slots),
    assistant_message:
      '오전/오후가 빠진 시간은 헷갈릴 수 있어요. 예: 오전 6시 또는 오후 6시처럼 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}

function getSlotDurationMinutes(slots: FilledSlots | null | undefined): number | null {
  if (!slots) return null;
  if (slots.duration_min != null) return slots.duration_min;
  const startMin = timeToMinutes(slots.start_time);
  const endMin = timeToMinutes(slots.end_time);
  if (startMin == null || endMin == null) return null;
  const delta = endMin >= startMin ? endMin - startMin : endMin + 24 * 60 - startMin;
  return delta > 0 ? delta : null;
}

function applyDurationLimitOverride(
  result: ParseResult,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  const durationMin = getSlotDurationMinutes(result.filled_slots);
  if (durationMin == null || durationMin <= MAX_RESERVATION_DURATION_MIN) return result;
  const hours = Math.round((durationMin / 60) * 10) / 10;
  return {
    ...result,
    intent: 'out_of_scope',
    ready_to_search: false,
    missing_required: [],
    assistant_message: `한 번에 ${hours}시간 예약은 제한을 넘을 수 있어요. 안전하게 진행하려면 최대 8시간 이내로 나누거나 시간을 줄여서 요청해 주세요.`,
    application_state: previousApplicationState ?? result.application_state,
  };
}

function parseIsoDateOnly(value: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function isoDateToEpochDay(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const time = Date.UTC(year, month - 1, day);
  if (Number.isNaN(time)) return null;
  return Math.floor(time / 86_400_000);
}

function isBeyondFutureBookingWindow(slots: FilledSlots | null | undefined, now: string): boolean {
  if (!slots?.date) return false;
  const today = parseIsoDateOnly(now);
  if (!today) return false;
  const todayDay = isoDateToEpochDay(today);
  const slotDay = isoDateToEpochDay(slots.date);
  if (todayDay == null || slotDay == null) return false;
  return slotDay - todayDay > MAX_FUTURE_BOOKING_DAYS;
}

function applyFutureBookingWindowOverride(
  result: ParseResult,
  now: string,
  previousApplicationState: ApplicationState | null,
): ParseResult {
  if (!isBeyondFutureBookingWindow(result.filled_slots, now)) return result;
  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: ['date'],
    filled_slots: emptyFilledSlots(),
    assistant_message:
      '너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.',
    application_state: previousApplicationState ?? result.application_state,
  };
}

function resolveSearchSlots(ctx: ConversationContext): {
  date: string;
  startTime: string;
  endTime: string;
} | null {
  const queue = gls.getQueue(ctx.conversationId);
  if (queue?.date && queue.startTime && queue.endTime) {
    return {
      date: queue.date,
      startTime: queue.startTime,
      endTime: queue.endTime,
    };
  }

  const slots = ctx.pendingStart?.slots ?? ctx.lastFilledSlots;
  const endTime = deriveEndTime(slots);
  if (!slots?.date || !slots.start_time || !endTime) return null;
  return {
    date: slots.date,
    startTime: slots.start_time,
    endTime,
  };
}

function hasCompleteReservationForm(
  formData: ReservationFormData | null | undefined,
): formData is ReservationFormData {
  return Boolean(
    formData &&
      formData.hangsaGbCode.trim() &&
      formData.organization.trim() &&
      formData.eventName.trim() &&
      formData.purpose.trim() &&
      formData.headcount > 0,
  );
}

function summarizeReservationLabel(formData: ReservationFormData): string {
  const eventName = formData.eventName.trim();
  const organization = formData.organization.trim();
  if (!eventName) return organization || '예약 신청';
  if (!organization || eventName.includes(organization)) return eventName;
  return `${organization} ${eventName}`;
}

function summarizeSpaceLabel(candidate: import('../shared/types').SpaceCandidate): string {
  return `${candidate.buildingName} ${candidate.roomName}`.trim();
}

function syncApplicationDraftToAutomation(
  ctx: ConversationContext,
  draft: ReservationFormData | null,
): void {
  const normalizedDraft = hasCompleteReservationForm(draft) ? draft : undefined;
  const queue = gls.getQueue(ctx.conversationId);
  if (queue) {
    queue.pendingFormData = normalizedDraft;
    gls.markQueuesDirty();
  }
  if (ctx.pendingStart) {
    ctx.pendingStart.pendingFormData = normalizedDraft;
  }
}

/**
 * 결정 #1 이후 사실상 dead path — `navigation_required` 가 더 이상 생성되지
 * 않는다. 이전 SW 가 storage 에 남긴 잔여 상태를 정리하기 위한 안전망으로만
 * 남겨둠. 발견되면 즉시 runReservationFlow 재시작.
 */
async function resumePendingStartIfReady(
  conversationId: string,
): Promise<void> {
  const ctx = getOrCreateContext(conversationId);
  const pending = pendingStarts.get(conversationId) ?? ctx.pendingStart;
  if (!pending) return;
  if (ctx.lastStatus.kind !== 'navigation_required') return;

  const emit = makeStatusEmitter(conversationId);
  pendingStarts.delete(conversationId);
  ctx.pendingStart = pending;
  ctx.lastStatus = { kind: 'opening_gls' };
  ctx.updatedAt = new Date().toISOString();
  void persistContexts();

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      forceNewTab: false,
      onStatusChange: emit,
      emitBroadcast: broadcastToSidepanel,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

// ---------- popup/sidepanel status pushing ----------

/**
 * 사이드패널이 후보 검증 진행 / 제출 단계를 풍부하게 표시하도록 broadcast.
 * AutomationStatus 보다 카드 단위로 의미가 명확한 메시지들 (BG_SEARCH_STARTED,
 * BG_CANDIDATE_RESULT, BG_SUBMIT_STATUS) 을 일괄 송신. 수신자가 없으면 무시.
 */
function broadcastToSidepanel(msg: CoordinatorBroadcast): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function makeStatusEmitter(conversationId: string): (s: AutomationStatus) => void {
  return (status) => {
    const ctx = getOrCreateContext(conversationId);
    ctx.lastStatus = status;
    if (status.kind === 'candidate_found') {
      ctx.lastProposed = gls.getQueue(conversationId)?.lastProposed ?? ctx.lastProposed;
    } else if (status.kind !== 'submitting') {
      ctx.lastProposed = null;
    }
    if (status.kind === 'done' || status.kind === 'no_candidate' || status.kind === 'idle') {
      ctx.pendingStart = null;
    }
    void persistContexts();

    const msg: BgStatusUpdate = {
      type: 'BG_STATUS_UPDATE',
      conversationId,
      status,
    };
    // popup may be closed — swallow errors.
    chrome.runtime.sendMessage(msg).catch(() => {});

    if (status.kind === 'login_required') {
      setLoginPrompt(conversationId, {
        variant: status.reason,
        tabId: null,
      });

      if (status.reason === 'expired') {
        chrome.runtime
          .sendMessage({
            type: 'SESSION_EXPIRED',
            conversationId,
            resumeIdx: status.resumeIdx ?? 0,
          })
          .catch(() => {});
      } else {
        chrome.runtime
          .sendMessage({
            type: 'LOGIN_NEEDED',
            conversationId,
          })
          .catch(() => {});
      }
    }

    if (status.kind === 'done') {
      const doneMsg: BgReservationDone = {
        type: 'BG_RESERVATION_DONE',
        conversationId,
        spaceCode: status.spaceCode,
      };
      chrome.runtime.sendMessage(doneMsg).catch(() => {});
    }
  };
}

// ---------- lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  // Seed client_id early so first server call doesn't race.
  void getOrCreateClientId();
});

// Action 아이콘 클릭 시 사이드패널을 연다 (D-026 사이드패널 마이그레이션).
// setPanelBehavior 는 idempotent — 매 SW 기동 시 호출해도 안전.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[sidePanel.setPanelBehavior] failed', err));

chrome.runtime.onStartup?.addListener(() => {
  void rehydrationReady;
});

// Best-effort rehydrate on cold module load too.
void rehydrationReady;

async function resumeAfterLoginComplete(
  conversationId: string,
  reason: 'needed' | 'expired',
  tabId: number,
): Promise<void> {
  const emit = makeStatusEmitter(conversationId);
  const ctx = getOrCreateContext(conversationId);
  clearLoginPrompt(conversationId);

  chrome.runtime
    .sendMessage({
      type: 'LOGIN_COMPLETE',
      conversationId,
      tabId,
      reason,
    })
    .catch(() => {});

  if (reason === 'expired' && gls.getQueue(conversationId)) {
    gls.setQueueTabId(conversationId, tabId);
    void gls.resumeQueuedSearch(conversationId, emit, broadcastToSidepanel, tabId).catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
    return;
  }

  const pending = ctx.pendingStart;
  if (!pending) return;

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      existingTabId: tabId,
      forceNewTab: false,
      onStatusChange: emit,
      emitBroadcast: broadcastToSidepanel,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab.url;
  if (!isLoginCompleteUrl(url)) return;

  for (const ctx of contexts.values()) {
    const prompt = ctx.loginPrompt;
    if (!prompt) continue;
    if (prompt.tabId != null && prompt.tabId !== tabId) continue;
    void resumeAfterLoginComplete(ctx.conversationId, prompt.variant, tabId);
  }
});

// ---------- message router ----------

chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  // Distinguish popup-origin vs content-origin by sender.tab presence.
  const fromTab = sender.tab !== undefined;

  if (fromTab) {
    // Content → background messages. In this design, the coordinator awaits
    // tab responses via chrome.tabs.sendMessage's promise (the content script
    // replies via sendResponse), so unsolicited content-pushed messages are
    // rare. Acknowledge and drop.
    return false;
  }

  const msg = rawMsg as PopupToBackground;

  switch (msg.type) {
    case 'POPUP_CHAT_REQUEST':
      handleChatRequest(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ error: (e as Error).message }));
      return true;

    case 'POPUP_START_SEARCH':
      handleStartSearch(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_REJECT_CANDIDATE':
      handleRejectCandidate(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CONFIRM_RESERVATION':
      handleConfirm(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_APPLY_SUGGESTED_MEMORY':
      handleApplySuggestedMemory(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DISMISS_SUGGESTED_MEMORY':
      handleDismissSuggestedMemory(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_OPEN_LOGIN_TAB':
      handleOpenLoginTab(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_PREVIEW_RESERVATION':
      handlePreview(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_CANCEL':
      handleCancel(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_GET_STATUS': {
      // popup 재오픈 시 호출. BG 가 들고 있는 대화 컨텍스트 + 자동화 큐 상태를
      // 반환해서 popup 이 history / 진행 상태 / 미확정 후보 카드 까지 복원할 수 있도록.
      void (async () => {
        await rehydrationReady;
        await resumePendingStartIfReady(msg.conversationId);
        let ctx =
          contexts.get(msg.conversationId) ??
          (await hydrateContextFromServer(msg.conversationId)) ??
          (await hydrateContextFromSnapshot(msg.conversationId)) ??
          (await hydrateContextFromSummary(msg.conversationId));
        const localSummary = (await loadConversationIndex()).find(
          (item) => item.id === msg.conversationId,
        );
        if (
          localSummary?.status === 'completed' &&
          ctx?.conversationStatus !== 'completed'
        ) {
          ctx = await hydrateContextFromSummary(msg.conversationId);
        }
        const queue = gls.getQueue(msg.conversationId);
        const restoredStatus =
          ctx?.conversationStatus === 'completed'
            ? { kind: 'done' as const, spaceCode: ctx.confirmedSpaceCode ?? 'completed' }
            : (ctx?.lastStatus ?? { kind: 'idle' as const });
        sendResponse({
          status: restoredStatus,
          lastFilledSlots: ctx?.lastFilledSlots ?? null,
          history: ctx?.history ?? [],
          lastProposed: queue?.lastProposed ?? ctx?.lastProposed ?? null,
          pendingFormData: queue?.pendingFormData ?? ctx?.pendingStart?.pendingFormData ?? null,
          applicationState: ctx?.applicationState ?? null,
          conversationStatus: ctx?.conversationStatus ?? 'active',
        });
      })().catch((e) => sendResponse({ error: (e as Error).message }));
      return true;
    }

    case 'POPUP_LIST_CONVERSATIONS':
      (async () => {
        await rehydrationReady;
        const localIndex = await loadConversationIndex();
        try {
          const conversations = await refreshConversationIndexFromServer();
          sendResponse({ ok: true, conversations });
        } catch (e) {
          console.warn('[SW] listConversations refresh failed:', e);
          sendResponse({ ok: true, conversations: localIndex });
        }
      })().catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_GET_REMINDER':
      handleGetReminder()
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DISMISS_REMINDER':
      handleDismissReminder(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_ACCEPT_REMINDER':
      handleAcceptReminder(msg)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    case 'POPUP_DELETE_CONVERSATION':
      handleDeleteConversation(msg)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
      return true;

    default:
      return false;
  }
});

// ---------- handlers ----------

async function handleChatRequest(
  msg: Extract<PopupToBackground, { type: 'POPUP_CHAT_REQUEST' }>,
): Promise<BgChatResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const previousDraft = ctx.applicationState?.draft ?? null;
  const previousSlots = ctx.lastFilledSlots;
  const parsedDraftCommand = parseModification(msg.latestMessage);
  // Trust the popup's history snapshot (clientside authority — D-018).
  ctx.history = msg.history;

  if (parsedDraftCommand.intent === 'cancel') {
    gls.clearQueue(msg.conversationId);
    pendingStarts.delete(msg.conversationId);
    const applicationState = emptyApplicationState();
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: emptyFilledSlots(),
      missing_required: [],
      intent: 'cancel',
      ready_to_search: false,
      assistant_message: '예약 진행을 중단했어요. 필요하면 새 대화로 다시 시작할 수 있어요.',
      application_state: applicationState,
    };

    ctx.pendingStart = null;
    ctx.lastProposed = null;
    ctx.lastStatus = { kind: 'idle' };
    ctx.conversationStatus = 'abandoned_user';
    ctx.confirmedReservationLabel = null;
    ctx.confirmedSpaceCode = null;
    ctx.confirmedSpaceLabel = null;
    ctx.updatedAt = new Date().toISOString();
    ctx.lastIntent = 'cancel';
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = applicationState;
    syncApplicationDraftToAutomation(ctx, applicationState.draft);

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: import('../shared/types').ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(msg.conversationId, {
      history: historyWithAssistant,
      status: 'abandoned_user',
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
      confirmedReservationLabel: null,
      confirmedSpaceCode: null,
      confirmedSpaceLabel: null,
    }, '[SW] cancelConversation mirror failed:');

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  if (parsedDraftCommand.intent === 'availability_window_unsupported') {
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message: unsupportedAvailabilityWindowMessage(),
      application_state: ctx.applicationState ?? emptyApplicationState(),
    };

    ctx.updatedAt = new Date().toISOString();
    ctx.lastIntent = result.intent;
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = result.application_state;

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: import('../shared/types').ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(msg.conversationId, {
      history: historyWithAssistant,
      status: ctx.conversationStatus,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
      confirmedReservationLabel: ctx.confirmedReservationLabel,
      confirmedSpaceCode: ctx.confirmedSpaceCode,
      confirmedSpaceLabel: ctx.confirmedSpaceLabel,
    }, '[SW] availabilityWindowUnsupported mirror failed:');

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  if (parsedDraftCommand.intent === 'alternative') {
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      intent: 'request_alternative',
      ready_to_search: false,
      assistant_message: asksForCandidateList(msg.latestMessage)
        ? '후보를 길게 나열하지 않고 한 곳씩 보여드려요. 같은 조건으로 다음 공간을 찾아볼게요.'
        : '같은 조건으로 다른 공간을 찾아볼게요.',
      application_state: ctx.applicationState ?? emptyApplicationState(),
    };

    ctx.updatedAt = new Date().toISOString();
    ctx.lastIntent = 'request_alternative';
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = result.application_state;

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: import('../shared/types').ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(msg.conversationId, {
      history: historyWithAssistant,
      status: ctx.conversationStatus,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
      confirmedReservationLabel: ctx.confirmedReservationLabel,
      confirmedSpaceCode: ctx.confirmedSpaceCode,
      confirmedSpaceLabel: ctx.confirmedSpaceLabel,
    }, '[SW] alternativeConversation mirror failed:');

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  const requestNow = apiClient.localOffsetIso();
  let result = await apiClient.parse({
    conversationId: msg.conversationId,
    history: msg.history,
    now: requestNow,
  });
  result = applyHeadcountRangeOverride(
    result,
    extractLatestHeadcountRangeUpper(msg.history, msg.latestMessage),
  );
  result = preservePreviousSlotContext(result, previousSlots);

  if (
    ctx.lastStatus.kind === 'no_candidate' &&
    !result.ready_to_search
  ) {
    const adjusted = applyRetrySlotAdjustment(
      result.filled_slots ?? previousSlots,
      msg.latestMessage,
    );
    if (adjusted) {
      result.filled_slots = adjusted;
      result.ready_to_search = isSearchReady(adjusted);
      if (result.ready_to_search) {
        result.missing_required = [];
      }
    }
  }

  const slotEditBase = previousSlots ?? result.filled_slots;
  const slotCorrection = applySlotCorrection(slotEditBase, msg.latestMessage);
  if (slotCorrection) {
    const canReuseCurrentCandidate = candidateSupportsHeadcount(
      ctx.lastProposed,
      slotCorrection.headcount,
    );
    result = {
      ...result,
      intent: 'modify_slot',
      filled_slots: slotCorrection,
      ready_to_search: canReuseCurrentCandidate ? false : isSearchReady(slotCorrection),
      missing_required: canReuseCurrentCandidate || isSearchReady(slotCorrection)
        ? []
        : result.missing_required,
      assistant_message: canReuseCurrentCandidate
        ? `인원을 ${slotCorrection.headcount}명으로 바꿨어요. 현재 추천 공간 정원 범위 안이라 같은 공간으로 이어갈 수 있어요.`
        : `인원을 ${slotCorrection.headcount}명으로 바꿨어요. 같은 날짜와 시간으로 다시 확인할게요.`,
      application_state: {
        ...result.application_state,
        draft: applyHeadcountToDraft(
          result.application_state.draft ?? previousDraft,
          slotCorrection.headcount,
        ),
        suggested_memory: null,
        recommendation: null,
        source: result.application_state.draft || previousDraft
          ? 'user_modified'
          : result.application_state.source,
      },
    };
  }

  if (!slotCorrection) {
    const inlineSlotEditBase = previousSlots ?? (result.intent === 'modify_slot' ? result.filled_slots : null);
    const inlineSlotEdits = applyInlineSlotEdits(inlineSlotEditBase, msg.latestMessage);
    if (inlineSlotEdits) {
      result = {
        ...result,
        intent: 'modify_slot',
        filled_slots: inlineSlotEdits,
        ready_to_search: isSearchReady(inlineSlotEdits),
        missing_required: isSearchReady(inlineSlotEdits) ? [] : result.missing_required,
        assistant_message: '조건을 수정했어요. 같은 조건으로 다시 검색할게요.',
        application_state: {
          ...result.application_state,
          draft: applyHeadcountToDraft(
            result.application_state.draft ?? previousDraft,
            inlineSlotEdits.headcount,
          ),
          suggested_memory: null,
          recommendation: null,
          source: result.application_state.draft || previousDraft
            ? 'user_modified'
            : result.application_state.source,
        },
      };
    }
  }

  result = applyChatSafetyOverride(result, msg.latestMessage, ctx.applicationState);
  result = applyAmbiguousMeridiemOverride(result, msg.latestMessage, ctx.applicationState);

  result = {
    ...result,
    filled_slots: normalizeSlotEndTime(result.filled_slots),
  };
  result = applyFutureBookingWindowOverride(result, requestNow, ctx.applicationState);
  result = applySameDayTimeOverride(result, ctx.applicationState);
  result = applyTimeGranularityOverride(result, ctx.applicationState);
  result = applyDurationLimitOverride(result, ctx.applicationState);

  if (
    previousDraft &&
    (result.intent === 'modify_slot' ||
      result.intent === 'modify_application' ||
      parsedDraftCommand.intent === 'edit')
  ) {
    const modified =
      applyDraftModification(previousDraft, parsedDraftCommand) ??
      null;
    if (modified) {
      result.application_state = {
        ...result.application_state,
        draft: modified,
        missing_application: [],
        needs_application_collection: false,
        suggested_memory: null,
        recommendation: null,
        source: 'user_modified',
      };
    }
  }

  result = applyApplicationLengthGuard(result);

  ctx.conversationStatus = 'active';
  ctx.confirmedReservationLabel = null;
  ctx.confirmedSpaceCode = null;
  ctx.confirmedSpaceLabel = null;
  ctx.updatedAt = new Date().toISOString();
  ctx.lastIntent = result.intent;
  ctx.lastFilledSlots = result.filled_slots;
  ctx.applicationState = result.application_state;
  syncApplicationDraftToAutomation(ctx, result.application_state.draft);

  // Append assistant message to local history so subsequent persists carry it.
  const assistantMessageTs = new Date().toISOString();
  const historyWithAssistant: import('../shared/types').ChatMessage[] = [
    ...msg.history,
    { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
  ];
  ctx.history = historyWithAssistant;
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);

  // Mirror to server (D-018). Fire-and-forget; failure shouldn't block UX.
  void mirrorConversation(msg.conversationId, {
      history: historyWithAssistant,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
    }, '[SW] upsertConversation mirror failed:');

  return { type: 'BG_CHAT_RESPONSE', result };
}

async function handleStartSearch(
  msg: Extract<PopupToBackground, { type: 'POPUP_START_SEARCH' }>,
): Promise<void> {
  // 사이드패널 마이그레이션 결정 #1: GLS 탭 이동 확인 단계를 제거하고 곧바로
  // runReservationFlow 로 들어간다. 활성 탭이 GLS 가 아니면 coordinator 가
  // 비활성 (background) 탭을 직접 새로 열어 진행 — 사용자는 사이드패널에서
  // SearchProgressCard 로 진행 상황을 보고, 필요시 GLS 탭을 활성화한다.
  const emit = makeStatusEmitter(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  clearLoginPrompt(msg.conversationId);
  ctx.conversationStatus = 'active';
  const pending: PendingStartRequest = {
    conversationId: msg.conversationId,
    slots: msg.slots,
    pendingFormData: hasCompleteReservationForm(ctx.applicationState?.draft)
      ? ctx.applicationState?.draft
      : undefined,
  };
  pendingStarts.set(msg.conversationId, pending);
  ctx.pendingStart = pending;
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);

  void gls
    .runReservationFlow({
      conversationId: pending.conversationId,
      slots: pending.slots,
      candidates: pending.candidates,
      pendingFormData: pending.pendingFormData,
      forceNewTab: false,
      onStatusChange: emit,
      emitBroadcast: broadcastToSidepanel,
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

/**
 * 사이드패널이 "다른 공간" 트리거 — 현재 후보 폐기 후 다음 후보부터 iterate
 * (결정 #2). 큐가 비어있으면 coordinator 가 no_candidate 로 전이.
 */
async function handleRejectCandidate(
  msg: Extract<PopupToBackground, { type: 'POPUP_REJECT_CANDIDATE' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  void gls.continueAfterRejection(msg.conversationId, emit, broadcastToSidepanel).catch((e) => {
    emit({ kind: 'error', message: (e as Error).message });
  });
}

async function handleOpenLoginTab(
  msg: Extract<PopupToBackground, { type: 'POPUP_OPEN_LOGIN_TAB' }>,
): Promise<{ ok: true; tabId: number }> {
  const tab = await chrome.tabs.create({
    url: 'https://kingoinfo.skku.edu/',
    active: true,
  });
  if (tab.id === undefined) {
    throw new Error('로그인 탭을 열지 못했습니다.');
  }
  setLoginPrompt(msg.conversationId, { variant: msg.variant, tabId: tab.id });
  return { ok: true, tabId: tab.id };
}

async function handleGetReminder(): Promise<ReminderResponse> {
  const reminder = await apiClient.getReminder();
  return { ok: true, reminder };
}

async function handleDismissReminder(
  msg: Extract<PopupToBackground, { type: 'POPUP_DISMISS_REMINDER' }>,
): Promise<ReminderResponse> {
  const reminder = await apiClient.dismissReminder(msg.reminderId);
  return { ok: true, reminder };
}

async function handleAcceptReminder(
  msg: Extract<PopupToBackground, { type: 'POPUP_ACCEPT_REMINDER' }>,
): Promise<ReminderResponse> {
  const reminder = await apiClient.acceptReminder(msg.reminderId);
  return { ok: true, reminder };
}

async function handleConfirm(
  msg: Extract<PopupToBackground, { type: 'POPUP_CONFIRM_RESERVATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const queue = gls.getQueue(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const candidate = queue?.lastProposed ?? ctx.lastProposed;

  if (!msg.confirmed) {
    // User rejected the proposed candidate — try the next one.
    void gls.continueAfterRejection(msg.conversationId, emit, broadcastToSidepanel).catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
    return;
  }

  if (!candidate) {
    emit({ kind: 'error', message: '제안된 후보가 없습니다.' });
    return;
  }

  const formData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ctx.applicationState?.draft ??
    null;

  if (!hasCompleteReservationForm(formData)) {
    emit({ kind: 'error', message: '신청 정보가 아직 완성되지 않았습니다. 먼저 신청 정보를 알려 주세요.' });
    return;
  }

  if (queue) queue.pendingFormData = formData;
  if (ctx.pendingStart) ctx.pendingStart.pendingFormData = formData;
  if (ctx.applicationState) {
    ctx.applicationState = {
      ...ctx.applicationState,
      draft: formData,
      source: ctx.applicationState.source ?? 'conversation',
    };
  }
  gls.markQueuesDirty();
  void persistContexts();

  const slots = resolveSearchSlots(ctx);
  if (!slots) {
    emit({ kind: 'error', message: '제출할 예약 슬롯을 복원하지 못했습니다.' });
    return;
  }

  void gls
    .submitConfirmedReservation({
      conversationId: msg.conversationId,
      candidate,
      formData,
      date: slots.date,
      startTime: slots.startTime,
      endTime: slots.endTime,
      onStatusChange: emit,
      emitBroadcast: broadcastToSidepanel,
    })
    .then(async (completed) => {
      if (!completed) return;
      // Mark conversation completed on server (mirror).
      const ctx = contexts.get(msg.conversationId);
      if (ctx) {
        ctx.conversationStatus = 'completed';
        ctx.confirmedReservationLabel = summarizeReservationLabel(formData);
        ctx.confirmedSpaceCode = candidate.glsSpaceCode;
        ctx.confirmedSpaceLabel = summarizeSpaceLabel(candidate);
        ctx.updatedAt = new Date().toISOString();
        void persistContexts();
        void syncConversationSummaryFromContext(ctx);
        void mirrorConversation(msg.conversationId, {
            history: ctx.history,
            status: 'completed',
            lastIntent: ctx.lastIntent,
            lastFilledSlots: ctx.lastFilledSlots,
            lastApplicationState: ctx.applicationState,
            confirmedReservationForm: formData,
            confirmedReservationLabel: ctx.confirmedReservationLabel,
            confirmedSpaceCode: ctx.confirmedSpaceCode,
            confirmedSpaceLabel: ctx.confirmedSpaceLabel,
          }, '[SW] completed mirror failed:');
      }
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

async function handlePreview(
  msg: Extract<PopupToBackground, { type: 'POPUP_PREVIEW_RESERVATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const queue = gls.getQueue(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const candidate = queue?.lastProposed ?? ctx.lastProposed;
  if (!candidate) {
    throw new Error('미리보기할 후보가 없습니다.');
  }
  if (candidate.glsSpaceCode !== msg.spaceCode) {
    throw new Error('현재 제안된 후보와 미리보기 대상이 다릅니다.');
  }

  const formData =
    msg.formData ??
    queue?.pendingFormData ??
    ctx.pendingStart?.pendingFormData ??
    ctx.applicationState?.draft ??
    null;

  if (!hasCompleteReservationForm(formData)) {
    throw new Error('신청 정보가 아직 완성되지 않았습니다.');
  }

  if (queue) queue.pendingFormData = formData;
  if (ctx.pendingStart) ctx.pendingStart.pendingFormData = formData;
  gls.markQueuesDirty();
  void persistContexts();

  const slots = resolveSearchSlots(ctx);
  if (!slots) {
    throw new Error('미리보기할 예약 슬롯을 복원하지 못했습니다.');
  }

  const result = await gls.previewReservationForm({
    conversationId: msg.conversationId,
    candidate,
    formData,
    date: slots.date,
    startTime: slots.startTime,
    endTime: slots.endTime,
  });

  if (result.loginRequired) {
    emit({ kind: 'login_required', reason: 'expired' });
    return;
  }
  if (!result.ok) {
    throw new Error(result.error ?? '폼 미리보기를 준비하지 못했습니다.');
  }
}

async function handleApplySuggestedMemory(
  msg: Extract<PopupToBackground, { type: 'POPUP_APPLY_SUGGESTED_MEMORY' }>,
): Promise<ApplicationStateResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const suggestion = ctx.applicationState?.suggested_memory;
  if (!suggestion) {
    return { ok: false, error: '적용할 추천 신청 정보가 없습니다.' };
  }

  const headcount =
    ctx.lastFilledSlots?.headcount ??
    gls.getQueue(msg.conversationId)?.requestedHeadcount ??
    suggestion.formData.headcount;
  const formData: ReservationFormData = {
    ...suggestion.formData,
    headcount: headcount ?? suggestion.formData.headcount,
  };

  ctx.applicationState = {
    ...(ctx.applicationState ?? {
      draft: null,
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      recommendation: null,
      confidence: {
        organization: 'high',
        eventName: 'high',
        purpose: 'high',
        hangsaGbCode: 'high',
      },
      source: 'memory',
    }),
    draft: formData,
    missing_application: [],
    needs_application_collection: false,
    suggested_memory: null,
    recommendation: null,
    confidence: {
      organization: 'high',
      eventName: 'high',
      purpose: 'high',
      hangsaGbCode: 'high',
    },
    source: 'memory',
  };
  ctx.updatedAt = new Date().toISOString();
  syncApplicationDraftToAutomation(ctx, formData);
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  void mirrorConversation(msg.conversationId, {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    }, '[SW] applySuggestedMemory mirror failed:');

  return { ok: true, applicationState: ctx.applicationState };
}

async function handleDismissSuggestedMemory(
  msg: Extract<PopupToBackground, { type: 'POPUP_DISMISS_SUGGESTED_MEMORY' }>,
): Promise<ApplicationStateResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const current = ctx.applicationState;
  if (!current) {
    return { ok: false, error: '신청 상태를 찾지 못했습니다.' };
  }

  ctx.applicationState = {
    ...current,
    suggested_memory: null,
    recommendation: null,
    draft: null,
    source: null,
    missing_application: ['organization', 'eventName', 'purpose', 'hangsaGbCode'],
    needs_application_collection: true,
    confidence: {
      organization: 'low',
      eventName: 'low',
      purpose: 'low',
      hangsaGbCode: 'low',
    },
  };
  ctx.updatedAt = new Date().toISOString();
  syncApplicationDraftToAutomation(ctx, null);
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  void mirrorConversation(msg.conversationId, {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    }, '[SW] dismissSuggestedMemory mirror failed:');

  return { ok: true, applicationState: ctx.applicationState };
}

async function handleCancel(
  msg: Extract<PopupToBackground, { type: 'POPUP_CANCEL' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  ctx.pendingStart = null;
  ctx.lastProposed = null;
  ctx.lastStatus = { kind: 'idle' };
  ctx.conversationStatus = 'abandoned_user';
  ctx.updatedAt = new Date().toISOString();
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);
  try {
    const abandoned = await apiClient.abandonConversation(msg.conversationId);
    ctx.history = abandoned.history;
    ctx.lastIntent = abandoned.lastIntent;
    ctx.lastFilledSlots = abandoned.lastFilledSlots;
    ctx.applicationState = abandoned.lastApplicationState;
    ctx.conversationStatus = abandoned.status;
    ctx.confirmedReservationLabel = abandoned.confirmedReservationLabel;
    ctx.confirmedSpaceCode = abandoned.confirmedSpaceCode;
    ctx.confirmedSpaceLabel = abandoned.confirmedSpaceLabel;
    ctx.updatedAt = abandoned.updatedAt;
    await persistContexts();
    await syncConversationSummaryFromContext(ctx);
  } catch (e) {
    console.warn('[SW] abandonConversation failed:', e);
  }
}

async function handleDeleteConversation(
  msg: Extract<PopupToBackground, { type: 'POPUP_DELETE_CONVERSATION' }>,
): Promise<void> {
  gls.clearQueue(msg.conversationId);
  pendingStarts.delete(msg.conversationId);
  contexts.delete(msg.conversationId);
  await persistContexts();
  await removeConversationSnapshot(msg.conversationId);
  await removeConversationIndexEntry(msg.conversationId);

  try {
    await apiClient.deleteConversation(msg.conversationId);
  } catch (e) {
    console.warn('[SW] deleteConversation failed:', e);
    throw e;
  }

  try {
    await refreshConversationIndexFromServer();
  } catch (e) {
    console.warn('[SW] refresh after delete failed:', e);
  }
}
