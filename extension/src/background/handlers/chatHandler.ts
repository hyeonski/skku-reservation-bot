import type { BgChatResponse, PopupToBackground } from '../../shared/messages';
import type {
  ApplicationConfidenceLevel,
  ApplicationField,
  ChatMessage,
  FilledSlots,
  ParseResult,
  ReservationFormData,
} from '../../shared/types';
import {
  emptyFilledSlots,
  isSearchReady,
  normalizeSlotEndTime,
} from '../../../../shared/reservation/slotPolicy';
import { HANGSA_CODES } from '@gls/nexacroPaths';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import {
  applyDraftModification,
  parseModification,
} from '../../sidepanel/utils/parseModification';
import {
  applyApplicationLengthGuard,
  applyApplicationCollectionPromptGuard,
  applyChatSafetyOverride,
  asksForCandidateList,
  emptyApplicationState,
  unsupportedAvailabilityWindowMessage,
} from '../chatPolicies';
import {
  applyHeadcountRangeOverride,
  applyHeadcountToDraft,
  applyRetrySlotAdjustment,
  applySlotCorrection,
  candidateSupportsHeadcount,
  extractLatestHeadcountRangeUpper,
  preservePreviousSlotContext,
} from '../chatSlotCorrections';
import { applyInlineSlotEdits } from '../../../../shared/reservation/slotEdits';
import { hasContextualBareTimeEdit } from '../../../../shared/reservation/slotGuards';
import {
  applyAmbiguousMeridiemOverride,
  applyContextualMeridiemRangeOverride,
  applyDurationLimitOverride,
  applyFutureBookingWindowOverride,
  applyGeneralReservationHoursOverride,
  applySameDayTimeOverride,
  applyTimeGranularityOverride,
} from '../chatResultOverrides';
import { getOrCreateContext, pendingStarts, persistContexts } from '../contextStore';
import {
  mirrorConversation,
  syncConversationSummaryFromContext,
} from '../conversationPersistence';
import {
  syncApplicationDraftToAutomation,
  syncDraftHeadcountFromSlots,
} from '../automationState';

function parseFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|network|load failed/i.test(message)) {
    return '예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.';
  }
  return '예약 요청을 해석하는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
}

function computeMissingApplication(
  draft: ReservationFormData | null,
  confidence: Record<ApplicationField, ApplicationConfidenceLevel>,
): ApplicationField[] {
  if (!draft) return ['organization', 'eventName', 'purpose', 'hangsaGbCode'];

  const missing: ApplicationField[] = [];
  if (!draft.organization.trim()) missing.push('organization');
  if (!draft.eventName.trim()) missing.push('eventName');
  if (!draft.purpose.trim()) missing.push('purpose');
  if (!draft.hangsaGbCode.trim() || confidence.hangsaGbCode === 'low') {
    missing.push('hangsaGbCode');
  }
  return missing;
}

function canApplyDraftOnlyEdit(
  command: ReturnType<typeof parseModification>,
  latestMessage: string,
): command is Extract<ReturnType<typeof parseModification>, { intent: 'edit' }> {
  if (command.intent !== 'edit') return false;
  if (/인원|\d+\s*명/.test(latestMessage)) return false;
  return command.edits.every((edit) =>
    edit.field === 'event' ||
    edit.field === 'group' ||
    edit.field === 'purpose' ||
    edit.field === 'category',
  );
}

function applyEditedFieldConfidence(
  confidence: Record<ApplicationField, ApplicationConfidenceLevel>,
  command: Extract<ReturnType<typeof parseModification>, { intent: 'edit' }>,
): Record<ApplicationField, ApplicationConfidenceLevel> {
  const next = { ...confidence };
  for (const edit of command.edits) {
    if (edit.field === 'event') next.eventName = 'high';
    if (edit.field === 'group') next.organization = 'high';
    if (edit.field === 'purpose') next.purpose = 'high';
    if (edit.field === 'category') next.hangsaGbCode = 'high';
  }
  return next;
}

function resolveHangsaClarificationCode(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  if (/(학생\s*회|총학생회|동아리|동연|동아리\s*연합)/.test(normalized)) {
    return HANGSA_CODES.교내단체행사_학생회동아리;
  }
  if (/(학과|학부|전공|연구실|랩|교수|수업|보충수업|특강|시험)/.test(normalized)) {
    if (/(보충수업|특강|시험)/.test(normalized)) return HANGSA_CODES.보충수업특강시험;
    return HANGSA_CODES.학과주관행사;
  }
  if (/(세미나|스터디)/.test(normalized)) {
    return HANGSA_CODES.교내단체행사_세미나스터디;
  }

  return null;
}

function canApplyHangsaClarification(
  draft: ReservationFormData | null,
  latestMessage: string,
  currentApplicationState: ReturnType<typeof emptyApplicationState>,
): string | null {
  if (!draft) return null;
  if (!currentApplicationState.missing_application.includes('hangsaGbCode')) return null;
  if (currentApplicationState.confidence.hangsaGbCode !== 'low') return null;
  return resolveHangsaClarificationCode(latestMessage);
}

async function applyCapacityPreflight(result: ParseResult): Promise<ParseResult> {
  const headcount = result.filled_slots.headcount;
  if (!result.ready_to_search || headcount == null || headcount <= 0) return result;

  try {
    const capacityCandidates = await apiClient.listSpaces({ headcount });
    if (capacityCandidates.length > 0) return result;
  } catch (error) {
    console.warn('[SW] capacity preflight failed; continuing search:', error);
    return result;
  }

  return {
    ...result,
    intent: 'new_reservation',
    ready_to_search: false,
    missing_required: [],
    assistant_message: `${headcount}명을 수용할 수 있는 공간이 등록되어 있지 않아요. 인원을 줄이거나 행사를 나눠서 다시 알려주세요.`,
  };
}

function isCapacityDeclineResult(result: ParseResult): boolean {
  return (
    !result.ready_to_search &&
    result.filled_slots.headcount != null &&
    result.assistant_message.includes('수용할 수 있는 공간이 등록되어 있지 않아요')
  );
}

function isLocationBroadenCommand(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    /(?:캠퍼스|전체|범위|조건|건물|공간).*(?:넓혀|확대|빼고|풀고|전체로|다시)/.test(normalized) ||
    /(?:같은\s*캠퍼스\s*전체|건물\s*조건\s*빼고|공간\s*조건\s*빼고)/.test(normalized)
  );
}

function broadenLocationScope(slots: FilledSlots): FilledSlots {
  return {
    ...slots,
    building: null,
    space: null,
  };
}

function hasExplicitStudentCenterCampus(text: string): boolean {
  return /(율전|자과캠|자연과학캠퍼스|자연과학\s*캠퍼스|명륜|인사캠|인문사회과학캠퍼스|인문사회\s*캠퍼스)/.test(
    text,
  );
}

function applyStudentCenterCampusGuard(result: ParseResult, latestMessage: string): ParseResult {
  if (!/학생\s*회관/.test(latestMessage)) return result;
  if (hasExplicitStudentCenterCampus(latestMessage)) return result;

  return {
    ...result,
    filled_slots: {
      ...result.filled_slots,
      campus: null,
      building: null,
    },
    missing_required: Array.from(new Set([...result.missing_required, 'campus'])),
    ready_to_search: false,
    assistant_message:
      '학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.',
    application_state: {
      ...result.application_state,
      recommendation: null,
    },
  };
}

export async function handleChatRequest(
  msg: Extract<PopupToBackground, { type: 'POPUP_CHAT_REQUEST' }>,
): Promise<BgChatResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const previousDraft = ctx.applicationState?.draft ?? null;
  const previousSlots = msg.clientSlots ?? ctx.lastFilledSlots;
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
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: 'abandoned_user',
        lastIntent: result.intent,
        lastFilledSlots: result.filled_slots,
        lastApplicationState: result.application_state,
        confirmedReservationLabel: null,
        confirmedSpaceCode: null,
        confirmedSpaceLabel: null,
      },
      '[SW] cancelConversation mirror failed:',
    );

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  if (
    previousSlots &&
    (previousSlots.building || previousSlots.space) &&
    isLocationBroadenCommand(msg.latestMessage)
  ) {
    const broadenedSlots = broadenLocationScope(previousSlots);
    const applicationState = ctx.applicationState ?? emptyApplicationState();
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: broadenedSlots,
      missing_required: [],
      intent: 'modify_slot',
      ready_to_search: isSearchReady(broadenedSlots),
      assistant_message: '건물/공간 조건을 빼고 같은 캠퍼스 전체에서 다시 찾아볼게요.',
      application_state: applicationState,
    };

    ctx.conversationStatus = 'active';
    ctx.confirmedReservationLabel = null;
    ctx.confirmedSpaceCode = null;
    ctx.confirmedSpaceLabel = null;
    ctx.updatedAt = new Date().toISOString();
    ctx.lastIntent = result.intent;
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = applicationState;
    syncApplicationDraftToAutomation(ctx, applicationState.draft);

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: ctx.conversationStatus,
        lastIntent: result.intent,
        lastFilledSlots: result.filled_slots,
        lastApplicationState: result.application_state,
        confirmedReservationLabel: null,
        confirmedSpaceCode: null,
        confirmedSpaceLabel: null,
      },
      '[SW] broadenLocationScope mirror failed:',
    );

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
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: ctx.conversationStatus,
        lastIntent: result.intent,
        lastFilledSlots: result.filled_slots,
        lastApplicationState: result.application_state,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
        confirmedSpaceCode: ctx.confirmedSpaceCode,
        confirmedSpaceLabel: ctx.confirmedSpaceLabel,
      },
      '[SW] availabilityWindowUnsupported mirror failed:',
    );

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
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: ctx.conversationStatus,
        lastIntent: result.intent,
        lastFilledSlots: result.filled_slots,
        lastApplicationState: result.application_state,
        confirmedReservationLabel: ctx.confirmedReservationLabel,
        confirmedSpaceCode: ctx.confirmedSpaceCode,
        confirmedSpaceLabel: ctx.confirmedSpaceLabel,
      },
      '[SW] alternativeConversation mirror failed:',
    );

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  const currentApplicationState = ctx.applicationState ?? emptyApplicationState();
  const hangsaClarificationCode = canApplyHangsaClarification(
    previousDraft,
    msg.latestMessage,
    currentApplicationState,
  );
  if (previousDraft && hangsaClarificationCode) {
    const modified: ReservationFormData = {
      ...previousDraft,
      hangsaGbCode: hangsaClarificationCode,
    };
    const confidence: Record<ApplicationField, ApplicationConfidenceLevel> = {
      ...currentApplicationState.confidence,
      hangsaGbCode: 'high',
    };
    const missingApplication = computeMissingApplication(modified, confidence);
    const applicationState = {
      ...currentApplicationState,
      draft: modified,
      missing_application: missingApplication,
      needs_application_collection: missingApplication.length > 0,
      suggested_memory: null,
      recommendation: null,
      confidence,
      source: 'user_modified' as const,
    };
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      intent: 'modify_application',
      ready_to_search: false,
      assistant_message: '행사구분을 반영했어요. 아래 카드에서 확인해 주세요.',
      application_state: applicationState,
    };

    ctx.conversationStatus = 'active';
    ctx.confirmedReservationLabel = null;
    ctx.confirmedSpaceCode = null;
    ctx.confirmedSpaceLabel = null;
    ctx.updatedAt = new Date().toISOString();
    ctx.lastIntent = result.intent;
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = applicationState;
    syncApplicationDraftToAutomation(ctx, applicationState.draft);

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void syncConversationSummaryFromContext(ctx);
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: ctx.conversationStatus,
        lastIntent: result.intent,
        lastFilledSlots: result.filled_slots,
        lastApplicationState: result.application_state,
        confirmedReservationLabel: null,
        confirmedSpaceCode: null,
        confirmedSpaceLabel: null,
      },
      '[SW] hangsaClarification mirror failed:',
    );

    return { type: 'BG_CHAT_RESPONSE', result };
  }

  if (previousDraft && canApplyDraftOnlyEdit(parsedDraftCommand, msg.latestMessage)) {
    const modified = applyDraftModification(previousDraft, parsedDraftCommand) ?? null;
    if (modified) {
      const currentApplicationState = ctx.applicationState ?? emptyApplicationState();
      const confidence = applyEditedFieldConfidence(
        currentApplicationState.confidence,
        parsedDraftCommand,
      );
      const missingApplication = computeMissingApplication(modified, confidence);
      const applicationState = {
        ...currentApplicationState,
        draft: modified,
        missing_application: missingApplication,
        needs_application_collection: missingApplication.length > 0,
        suggested_memory: null,
        recommendation: null,
        confidence,
        source: 'user_modified' as const,
      };
      const result: ParseResult = applyApplicationCollectionPromptGuard(
        {
          conversation_id: msg.conversationId,
          filled_slots: previousSlots ?? emptyFilledSlots(),
          missing_required: [],
          intent: 'modify_application',
          ready_to_search: false,
          assistant_message: '신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.',
          application_state: applicationState,
        },
        msg.latestMessage,
      );

      ctx.conversationStatus = 'active';
      ctx.confirmedReservationLabel = null;
      ctx.confirmedSpaceCode = null;
      ctx.confirmedSpaceLabel = null;
      ctx.updatedAt = new Date().toISOString();
      ctx.lastIntent = result.intent;
      ctx.lastFilledSlots = result.filled_slots;
      ctx.applicationState = applicationState;
      syncApplicationDraftToAutomation(ctx, applicationState.draft);

      const assistantMessageTs = new Date().toISOString();
      const historyWithAssistant: ChatMessage[] = [
        ...msg.history,
        { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
      ];
      ctx.history = historyWithAssistant;
      void persistContexts();
      void syncConversationSummaryFromContext(ctx);
      void mirrorConversation(
        msg.conversationId,
        {
          history: historyWithAssistant,
          status: ctx.conversationStatus,
          lastIntent: result.intent,
          lastFilledSlots: result.filled_slots,
          lastApplicationState: result.application_state,
          confirmedReservationLabel: null,
          confirmedSpaceCode: null,
          confirmedSpaceLabel: null,
        },
        '[SW] localDraftEdit mirror failed:',
      );

      return { type: 'BG_CHAT_RESPONSE', result };
    }
  }

  const requestNow = apiClient.localOffsetIso();
  let result: ParseResult;
  try {
    result = await apiClient.parse({
      conversationId: msg.conversationId,
      history: msg.history,
      now: requestNow,
      clientLastFilledSlots: previousSlots ?? null,
      clientLastApplicationState: ctx.applicationState ?? null,
    });
  } catch (error) {
    result = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      intent: 'out_of_scope',
      ready_to_search: false,
      assistant_message: parseFailureMessage(error),
      application_state: ctx.applicationState ?? emptyApplicationState(),
    };
  }
  result = applyHeadcountRangeOverride(
    result,
    extractLatestHeadcountRangeUpper(msg.history, msg.latestMessage),
  );
  result = preservePreviousSlotContext(result, previousSlots);
  result = applyStudentCenterCampusGuard(result, msg.latestMessage);

  if (ctx.lastStatus.kind === 'no_candidate' && !result.ready_to_search) {
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
    const slotCorrectionReady = isSearchReady(slotCorrection);
    result = {
      ...result,
      intent: 'modify_slot',
      filled_slots: slotCorrection,
      ready_to_search: canReuseCurrentCandidate ? false : slotCorrectionReady,
      missing_required:
        canReuseCurrentCandidate || slotCorrectionReady
          ? []
          : result.missing_required,
      assistant_message: canReuseCurrentCandidate
        ? `인원을 ${slotCorrection.headcount}명으로 바꿨어요. 현재 추천 공간 정원 범위 안이라 같은 공간으로 이어갈 수 있어요.`
        : slotCorrectionReady
          ? `인원을 ${slotCorrection.headcount}명으로 바꿨어요. 같은 날짜와 시간으로 다시 확인할게요.`
          : `인원을 ${slotCorrection.headcount}명으로 기록했어요. 날짜와 시간을 알려주세요.`,
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
    const inlineSlotEditBase =
      previousSlots ?? (result.intent === 'modify_slot' ? result.filled_slots : null);
    const inlineSlotEdits = applyInlineSlotEdits(
      inlineSlotEditBase,
      msg.latestMessage,
      requestNow,
    );
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
  result = applyContextualMeridiemRangeOverride(result, msg.latestMessage);
  if (!hasContextualBareTimeEdit(msg.latestMessage, previousSlots)) {
    result = applyAmbiguousMeridiemOverride(result, msg.latestMessage, ctx.applicationState);
  }

  result = {
    ...result,
    filled_slots: normalizeSlotEndTime(result.filled_slots),
  };
  result = applyFutureBookingWindowOverride(result, requestNow, ctx.applicationState);
  result = applySameDayTimeOverride(result, ctx.applicationState);
  result = applyTimeGranularityOverride(result, ctx.applicationState);
  result = applyGeneralReservationHoursOverride(result, ctx.applicationState);
  result = applyDurationLimitOverride(result, ctx.applicationState);

  if (
    previousDraft &&
    (result.intent === 'modify_slot' ||
      result.intent === 'modify_application' ||
      parsedDraftCommand.intent === 'edit')
  ) {
    const editBase = result.application_state.draft ?? previousDraft;
    const modified = editBase
      ? applyDraftModification(editBase, parsedDraftCommand)
      : null;
    if (modified) {
      const missingApplication = computeMissingApplication(
        modified,
        result.application_state.confidence,
      );
      result.application_state = {
        ...result.application_state,
        draft: modified,
        missing_application: missingApplication,
        needs_application_collection: missingApplication.length > 0,
        suggested_memory: null,
        recommendation: null,
        source: 'user_modified',
      };
    }
  }

  result = applyApplicationLengthGuard(result);
  const wasReadyBeforeCapacityPreflight = result.ready_to_search;
  result = await applyCapacityPreflight(result);
  if (!wasReadyBeforeCapacityPreflight || result.ready_to_search) {
    result = applyApplicationCollectionPromptGuard(result, msg.latestMessage);
  }
  const syncedDraft = syncDraftHeadcountFromSlots(
    result.application_state.draft,
    result.filled_slots,
  );
  if (syncedDraft !== result.application_state.draft) {
    result = {
      ...result,
      application_state: {
        ...result.application_state,
        draft: syncedDraft,
        source: 'user_modified',
      },
    };
  }
  const capacityDeclined = isCapacityDeclineResult(result);

  ctx.conversationStatus = 'active';
  ctx.confirmedReservationLabel = null;
  ctx.confirmedSpaceCode = null;
  ctx.confirmedSpaceLabel = null;
  ctx.updatedAt = new Date().toISOString();
  ctx.lastIntent = result.intent;
  ctx.lastFilledSlots = result.filled_slots;
  ctx.applicationState = result.application_state;
  if (capacityDeclined) {
    ctx.lastStatus = { kind: 'no_candidate', log: [] };
    ctx.lastProposed = null;
    ctx.pendingStart = null;
  }
  syncApplicationDraftToAutomation(ctx, result.application_state.draft);

  const assistantMessageTs = new Date().toISOString();
  const historyWithAssistant: ChatMessage[] = [
    ...msg.history,
    { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
  ];
  ctx.history = historyWithAssistant;
  void persistContexts();
  void syncConversationSummaryFromContext(ctx);

  void mirrorConversation(
    msg.conversationId,
    {
      history: historyWithAssistant,
      lastIntent: result.intent,
      lastFilledSlots: result.filled_slots,
      lastApplicationState: result.application_state,
    },
    '[SW] upsertConversation mirror failed:',
  );

  return {
    type: 'BG_CHAT_RESPONSE',
    result,
    ...(capacityDeclined ? { status: ctx.lastStatus } : {}),
  };
}
