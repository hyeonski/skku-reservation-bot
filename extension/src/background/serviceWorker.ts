/**
 * Background Service Worker — MV3 entry.
 *
 * 책임:
 * - lifecycle 초기화
 * - sidepanel/content/server 메시지 라우팅
 * - 로그인 완료 감지 후 예약 플로우 재개
 *
 * 대화 처리, 저장소, 예약 실행 handler는 background 하위 모듈로 분리한다.
 */

import type { PopupToBackground } from '../shared/messages';
import * as gls from './glsCoordinator';
import { getOrCreateClientId } from '../shared/clientId';
import {
  contexts,
  isLoginCompleteUrl,
  rehydrateContexts,
} from './contextStore';
import { handleChatRequest } from './handlers/chatHandler';
import {
  handleCancel,
  handleConfirm,
  handleOpenLoginTab,
  handlePreview,
  handleRejectCandidate,
  handleStartSearch,
  resumeAfterLoginComplete,
} from './handlers/reservationHandlers';
import {
  handleAcceptReminder,
  handleDismissReminder,
  handleGetReminder,
} from './handlers/reminderHandlers';
import {
  handleDeleteConversation,
  handleGetStatus,
  handleListConversations,
} from './handlers/conversationHandlers';
import { purgeLegacyLocalStorage } from './conversationPersistence';

const rehydrationReady = (async () => {
  await rehydrateContexts();
  await gls.waitForQueuesRehydrated();
  // 서버-권위 전환 이전에 쌓인 레거시 로컬 대화 캐시(인덱스+스냅샷)를 1회 청소한다.
  void purgeLegacyLocalStorage();
})();

chrome.runtime.onInstalled.addListener(() => {
  // Seed client_id early so first server call doesn't race.
  void getOrCreateClientId();
});

chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[sidePanel.setPanelBehavior] failed', err));

chrome.runtime.onStartup?.addListener(() => {
  void rehydrationReady;
});

void rehydrationReady;

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

chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  // Distinguish popup-origin vs content-origin by sender.tab presence.
  const fromTab = sender.tab !== undefined;

  if (fromTab) {
    // Content → background unsolicited messages are acknowledged and dropped.
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

    case 'POPUP_GET_STATUS':
      handleGetStatus(msg, rehydrationReady)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ error: (e as Error).message }));
      return true;

    case 'POPUP_LIST_CONVERSATIONS':
      handleListConversations(rehydrationReady)
        .then((response) => sendResponse(response))
        .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
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
