import type { ApplicationStateResponse, PopupToBackground } from '../../shared/messages';
import type { ReservationFormData } from '../../shared/types';
import * as gls from '../glsCoordinator';
import { getOrCreateContext, persistContexts } from '../contextStore';
import {
  mirrorConversation,
  syncConversationSummaryFromContext,
} from '../conversationPersistence';
import { syncApplicationDraftToAutomation } from '../automationState';

export async function handleApplySuggestedMemory(
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
  void mirrorConversation(
    msg.conversationId,
    {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    },
    '[SW] applySuggestedMemory mirror failed:',
  );

  return { ok: true, applicationState: ctx.applicationState };
}

export async function handleDismissSuggestedMemory(
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
  void mirrorConversation(
    msg.conversationId,
    {
      history: ctx.history,
      lastIntent: ctx.lastIntent,
      lastFilledSlots: ctx.lastFilledSlots,
      lastApplicationState: ctx.applicationState,
    },
    '[SW] dismissSuggestedMemory mirror failed:',
  );

  return { ok: true, applicationState: ctx.applicationState };
}
