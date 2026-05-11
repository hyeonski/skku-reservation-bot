/**
 * 대화 상태 훅 (D-018: 클라가 진실의 원천).
 *
 * 책임:
 * - conversationId 발급·유지 (mount 시 UUID v4 생성)
 * - messages 배열 보유
 * - sendMessage(text): popup → BG (POPUP_CHAT_REQUEST) → BG 응답 받아 messages에 추가
 * - 자동화 진행 상태 (AutomationStatus) 구독
 * - confirm/cancel 액션
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, AutomationStatus, SpaceCandidate } from '../../shared/types';
import type {
  PopupToBackground,
  BackgroundToPopup,
  BgChatResponse,
} from '../../shared/messages';

export interface UseConversationResult {
  conversationId: string;
  messages: ChatMessage[];
  status: AutomationStatus;
  candidate: SpaceCandidate | null;
  busy: boolean;
  sendMessage: (text: string) => Promise<void>;
  confirmReservation: (confirmed: boolean) => Promise<void>;
  cancel: () => void;
}

/** chrome.runtime.sendMessage 의 Promise 래퍼 */
function sendToBackground<TResp = unknown>(msg: PopupToBackground): Promise<TResp | undefined> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        // 개발(vite dev) 환경에서 chrome.* 없을 때 안전하게 무시
        resolve(undefined);
        return;
      }
      chrome.runtime.sendMessage(msg, (response: TResp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

export function useConversation(): UseConversationResult {
  const conversationId = useMemo(() => uuidv4(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AutomationStatus>({ kind: 'idle' });
  const [candidate, setCandidate] = useState<SpaceCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  // 항상 최신 messages 를 보고 BG로 history를 보낼 수 있도록 ref 동기화
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
  }, []);

  // BG → popup 이벤트 구독
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    const listener = (msg: BackgroundToPopup) => {
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
      switch (msg.type) {
        case 'BG_STATUS_UPDATE':
          if (msg.conversationId === conversationId) {
            setStatus(msg.status);
          }
          break;
        case 'BG_CANDIDATE_PROPOSAL':
          if (msg.conversationId === conversationId) {
            setCandidate(msg.candidate);
            const c = msg.candidate;
            const lines: string[] = [
              `${c.buildingName} ${c.roomName} 공간이 가능합니다. 예약할까요? (예/아니오)`,
            ];
            if (c.contents) lines.push(`안내: ${c.contents}`);
            if (c.useJojikName) lines.push(`주의: 사용권한 조직(${c.useJojikName}) 확인 필요`);
            appendAssistant(lines.join('\n'));
          }
          break;
        case 'BG_RESERVATION_DONE':
          if (msg.conversationId === conversationId) {
            appendAssistant('예약이 완료되었습니다.');
            setCandidate(null);
          }
          break;
        default:
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [conversationId, appendAssistant]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      setBusy(true);

      try {
        const resp = await sendToBackground<BgChatResponse>({
          type: 'POPUP_CHAT_REQUEST',
          conversationId,
          history: nextHistory,
          latestMessage: trimmed,
        });

        if (resp && resp.type === 'BG_CHAT_RESPONSE') {
          const { result } = resp;
          if (result.assistant_message) {
            appendAssistant(result.assistant_message);
          }
          if (result.ready_to_search) {
            await sendToBackground({
              type: 'POPUP_START_SEARCH',
              conversationId,
              slots: result.filled_slots,
            });
          }
        }
      } catch (e) {
        appendAssistant(`오류가 발생했어요: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, appendAssistant],
  );

  const confirmReservation = useCallback(
    async (confirmed: boolean) => {
      if (!candidate) return;
      const userMsg: ChatMessage = {
        role: 'user',
        content: confirmed ? '예' : '아니오',
      };
      setMessages((prev) => [...prev, userMsg]);
      try {
        await sendToBackground({
          type: 'POPUP_CONFIRM_RESERVATION',
          conversationId,
          spaceCode: candidate.glsSpaceCode,
          confirmed,
        });
        if (!confirmed) {
          setCandidate(null);
          appendAssistant('다른 조건을 알려주시면 다시 찾아볼게요.');
        }
      } catch (e) {
        appendAssistant(`확인 처리 중 오류: ${(e as Error).message}`);
      }
    },
    [candidate, conversationId, appendAssistant],
  );

  const cancel = useCallback(() => {
    void sendToBackground({ type: 'POPUP_CANCEL', conversationId });
    setMessages([]);
    setCandidate(null);
    setStatus({ kind: 'idle' });
  }, [conversationId]);

  // no_candidate 상태가 되면 1회 안내 메시지
  const lastNoCandidateRef = useRef(false);
  useEffect(() => {
    if (status.kind === 'no_candidate' && !lastNoCandidateRef.current) {
      lastNoCandidateRef.current = true;
      appendAssistant('조건에 맞는 공간을 찾지 못했어요. 시간이나 인원, 건물을 바꿔볼까요?');
    } else if (status.kind !== 'no_candidate') {
      lastNoCandidateRef.current = false;
    }
  }, [status, appendAssistant]);

  return {
    conversationId,
    messages,
    status,
    candidate,
    busy,
    sendMessage,
    confirmReservation,
    cancel,
  };
}
