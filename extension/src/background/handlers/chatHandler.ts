import type { BgChatResponse, PopupToBackground } from '../../shared/messages';
import type { ChatMessage, ParseResult } from '../../shared/types';
import {
  emptyFilledSlots,
  normalizeSlotEndTime,
} from '../../../../shared/reservation/slotPolicy';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import {
  applyChatSafetyOverride,
  asksForCandidateList,
  emptyApplicationState,
} from '../chatPolicies';
import { getOrCreateContext, pendingStarts, persistContexts } from '../contextStore';
import { mirrorConversation } from '../conversationPersistence';
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

/**
 * 트리비얼 명령 단축경로 — LLM 왕복 없이 즉시 처리할 두 가지뿐.
 * (그 외 인라인 편집·신청서 입력·모호성 처리는 모두 서버 /parse(LLM)로 보낸다.)
 */
function detectTrivialCommand(text: string): 'cancel' | 'alternative' | null {
  const t = text.trim();
  if (
    /^(?:이제\s*)?(?:아니(?:요)?[,，]?\s*)?(?:그만(?:할래|할게요?|하자|해|요)?|취소(?:할래|해줘|해주세요|할게요?|하자|요)?|중단(?:할래|해줘|해주세요|할게요?|요)?|중지(?:할래|해줘|해주세요|할게요?|요)?|안\s*할래요?)\s*[.!?。]*$/.test(
      t,
    )
  ) {
    return 'cancel';
  }
  if (
    /^(?:다른\s*(?:공간|곳|후보|방)(?:\s*(?:보여|찾아|찾|추천|줘|주세요|보여줘|찾아줘))?|대안\s*(?:공간|후보)?\s*(?:보여|찾아|찾|추천|줘|주세요|보여줘|찾아줘)|여러\s*개(?:\s*(?:같이|한꺼번에|동시에))?\s*(?:보여|찾아|추천|줘|주세요|보여줘|찾아줘)|비교(?:해줘|해주세요|해|))\s*[.!?。]*$/.test(
      t,
    )
  ) {
    return 'alternative';
  }
  return null;
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
    signal: 'out_of_scope',
    ready_to_search: false,
    missing_required: [],
    action: 'none',
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

export async function handleChatRequest(
  msg: Extract<PopupToBackground, { type: 'POPUP_CHAT_REQUEST' }>,
): Promise<BgChatResponse> {
  const ctx = getOrCreateContext(msg.conversationId);
  const previousSlots = msg.clientSlots ?? ctx.lastFilledSlots;
  const trivialCommand = detectTrivialCommand(msg.latestMessage);
  // Trust the popup's history snapshot (clientside authority — D-018).
  ctx.history = msg.history;

  if (trivialCommand === 'cancel') {
    gls.clearQueue(msg.conversationId);
    pendingStarts.delete(msg.conversationId);
    const applicationState = emptyApplicationState();
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: emptyFilledSlots(),
      missing_required: [],
      ready_to_search: false,
      assistant_message: '예약 진행을 중단했어요. 필요하면 새 대화로 다시 시작할 수 있어요.',
      application_state: applicationState,
      signal: 'cancel',
      action: 'none',
      can_submit: false,
    };

    ctx.pendingStart = null;
    ctx.lastProposed = null;
    ctx.lastStatus = { kind: 'idle' };
    ctx.conversationStatus = 'abandoned_user';
    ctx.confirmedReservationLabel = null;
    ctx.confirmedSpaceCode = null;
    ctx.confirmedSpaceLabel = null;
    ctx.updatedAt = new Date().toISOString();
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
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: 'abandoned_user',
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

  if (trivialCommand === 'alternative') {
    const result: ParseResult = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      ready_to_search: false,
      assistant_message: asksForCandidateList(msg.latestMessage)
        ? '후보를 길게 나열하지 않고 한 곳씩 보여드려요. 같은 조건으로 다음 공간을 찾아볼게요.'
        : '같은 조건으로 다른 공간을 찾아볼게요.',
      application_state: ctx.applicationState ?? emptyApplicationState(),
      signal: 'request_alternative',
      action: 'next_candidate',
      can_submit: false,
    };

    ctx.updatedAt = new Date().toISOString();
    ctx.lastFilledSlots = result.filled_slots;
    ctx.applicationState = result.application_state;

    const assistantMessageTs = new Date().toISOString();
    const historyWithAssistant: ChatMessage[] = [
      ...msg.history,
      { role: 'assistant', content: result.assistant_message, ts: assistantMessageTs },
    ];
    ctx.history = historyWithAssistant;
    void persistContexts();
    void mirrorConversation(
      msg.conversationId,
      {
        history: historyWithAssistant,
        status: ctx.conversationStatus,
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
  const lastProposedSpace = ctx.lastProposed
    ? [ctx.lastProposed.campusName, ctx.lastProposed.buildingName, ctx.lastProposed.roomName]
        .filter(Boolean)
        .join(' ')
    : null;
  let result: ParseResult;
  try {
    result = await apiClient.parse({
      conversationId: msg.conversationId,
      history: msg.history,
      now: requestNow,
      clientLastFilledSlots: previousSlots ?? null,
      clientLastApplicationState: ctx.applicationState ?? null,
      clientLastProposedSpace: lastProposedSpace,
    });
  } catch (error) {
    result = {
      conversation_id: msg.conversationId,
      filled_slots: previousSlots ?? emptyFilledSlots(),
      missing_required: [],
      ready_to_search: false,
      assistant_message: parseFailureMessage(error),
      application_state: ctx.applicationState ?? emptyApplicationState(),
      signal: 'out_of_scope',
      action: 'none',
      can_submit: false,
    };
  }

  // 슬롯·신청서·intent·메시지는 서버 /parse(LLM + 하드 가드)가 단일 권한으로 결정한다.
  // 클라에서는 (1) 지원 범위를 벗어난 요청 클래스 차단(스코프 가드), (2) 종료시각 정규화,
  // (3) 정원 preflight(DB 사실), (4) draft 인원-슬롯 동기화만 한다.
  result = applyChatSafetyOverride(
    result,
    msg.latestMessage,
    ctx.applicationState,
    previousSlots ?? null,
  );
  result = {
    ...result,
    filled_slots: normalizeSlotEndTime(result.filled_slots),
  };
  result = await applyCapacityPreflight(result);

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

  void mirrorConversation(
    msg.conversationId,
    {
      history: historyWithAssistant,
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
