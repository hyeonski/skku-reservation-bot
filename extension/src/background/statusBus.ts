import type { BgReservationDone, BgStatusUpdate } from '../shared/messages';
import type { AutomationStatus } from '../shared/types';
import type { CoordinatorBroadcast } from './glsCoordinator';
import * as gls from './glsCoordinator';
import { getOrCreateContext, persistContexts, setLoginPrompt } from './contextStore';

export function broadcastToSidepanel(msg: CoordinatorBroadcast): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

export function makeStatusEmitter(conversationId: string): (s: AutomationStatus) => void {
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
