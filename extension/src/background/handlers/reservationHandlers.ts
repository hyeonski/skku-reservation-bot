import type { PopupToBackground } from '../../shared/messages';
import * as apiClient from '../apiClient';
import * as gls from '../glsCoordinator';
import {
  clearLoginPrompt,
  contexts,
  getOrCreateContext,
  pendingStarts,
  persistContexts,
  setLoginPrompt,
  type PendingStartRequest,
} from '../contextStore';
import {
  mirrorConversation,
  syncConversationSummaryFromContext,
} from '../conversationPersistence';
import {
  hasCompleteReservationForm,
  resolveSearchSlots,
  summarizeReservationLabel,
  summarizeSpaceLabel,
} from '../automationState';
import { broadcastToSidepanel, makeStatusEmitter } from '../statusBus';

export async function resumePendingStartIfReady(conversationId: string): Promise<void> {
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

export async function resumeAfterLoginComplete(
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

export async function handleStartSearch(
  msg: Extract<PopupToBackground, { type: 'POPUP_START_SEARCH' }>,
): Promise<void> {
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

export async function handleRejectCandidate(
  msg: Extract<PopupToBackground, { type: 'POPUP_REJECT_CANDIDATE' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  void gls.continueAfterRejection(msg.conversationId, emit, broadcastToSidepanel).catch((e) => {
    emit({ kind: 'error', message: (e as Error).message });
  });
}

export async function handleOpenLoginTab(
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

export async function handleConfirm(
  msg: Extract<PopupToBackground, { type: 'POPUP_CONFIRM_RESERVATION' }>,
): Promise<void> {
  const emit = makeStatusEmitter(msg.conversationId);
  const queue = gls.getQueue(msg.conversationId);
  const ctx = getOrCreateContext(msg.conversationId);
  const candidate = queue?.lastProposed ?? ctx.lastProposed;

  if (!msg.confirmed) {
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
      const ctx = contexts.get(msg.conversationId);
      if (ctx) {
        ctx.conversationStatus = 'completed';
        ctx.confirmedReservationLabel = summarizeReservationLabel(formData);
        ctx.confirmedSpaceCode = candidate.glsSpaceCode;
        ctx.confirmedSpaceLabel = summarizeSpaceLabel(candidate);
        ctx.updatedAt = new Date().toISOString();
        void persistContexts();
        void syncConversationSummaryFromContext(ctx);
        void mirrorConversation(
          msg.conversationId,
          {
            history: ctx.history,
            status: 'completed',
            lastIntent: ctx.lastIntent,
            lastFilledSlots: ctx.lastFilledSlots,
            lastApplicationState: ctx.applicationState,
            confirmedReservationForm: formData,
            confirmedReservationLabel: ctx.confirmedReservationLabel,
            confirmedSpaceCode: ctx.confirmedSpaceCode,
            confirmedSpaceLabel: ctx.confirmedSpaceLabel,
          },
          '[SW] completed mirror failed:',
        );
      }
    })
    .catch((e) => {
      emit({ kind: 'error', message: (e as Error).message });
    });
}

export async function handlePreview(
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

export async function handleCancel(
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
