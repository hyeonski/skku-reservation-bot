import type { BgChatResponse, PopupToBackground } from '../../shared/messages';
import type { ChatMessage, ParseResult } from '../../shared/types';
import {
  emptyFilledSlots,
  isSearchReady,
  normalizeSlotEndTime,
} from '../../../../shared/reservation/slotPolicy';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import {
  applyDraftModification,
  parseModification,
} from '../../sidepanel/utils/parseModification';
import {
  applyApplicationLengthGuard,
  applyChatSafetyOverride,
  asksForCandidateList,
  emptyApplicationState,
  unsupportedAvailabilityWindowMessage,
} from '../chatPolicies';
import {
  applyHeadcountRangeOverride,
  applyHeadcountToDraft,
  applyInlineSlotEdits,
  applyRetrySlotAdjustment,
  applySlotCorrection,
  candidateSupportsHeadcount,
  extractLatestHeadcountRangeUpper,
  preservePreviousSlotContext,
} from '../chatSlotCorrections';
import {
  applyAmbiguousMeridiemOverride,
  applyDurationLimitOverride,
  applyFutureBookingWindowOverride,
  applySameDayTimeOverride,
  applyTimeGranularityOverride,
} from '../chatResultOverrides';
import { getOrCreateContext, pendingStarts, persistContexts } from '../contextStore';
import {
  mirrorConversation,
  syncConversationSummaryFromContext,
} from '../conversationPersistence';
import { syncApplicationDraftToAutomation } from '../automationState';

function parseFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|network|load failed/i.test(message)) {
    return '예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.';
  }
  return '예약 요청을 해석하는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
}

export async function handleChatRequest(
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

  const requestNow = apiClient.localOffsetIso();
  let result: ParseResult;
  try {
    result = await apiClient.parse({
      conversationId: msg.conversationId,
      history: msg.history,
      now: requestNow,
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
    result = {
      ...result,
      intent: 'modify_slot',
      filled_slots: slotCorrection,
      ready_to_search: canReuseCurrentCandidate ? false : isSearchReady(slotCorrection),
      missing_required:
        canReuseCurrentCandidate || isSearchReady(slotCorrection)
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
    const inlineSlotEditBase =
      previousSlots ?? (result.intent === 'modify_slot' ? result.filled_slots : null);
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
    const modified = applyDraftModification(previousDraft, parsedDraftCommand) ?? null;
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

  return { type: 'BG_CHAT_RESPONSE', result };
}
