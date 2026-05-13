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

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, AutomationStatus, SpaceCandidate } from '../../shared/types';
import type {
  PopupToBackground,
  BackgroundToPopup,
  BgChatResponse,
  ReservationFormData,
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
  /** Dev: 슬롯/필터 조건으로 서버에서 후보 공간 리스트 받기. */
  listDevSpaces: (args: {
    headcount: number;
    campusCode?: string;
    buildingNo?: string;
  }) => Promise<SpaceCandidate[]>;
  /** Dev: 채팅·LLM·서버 우회하고 자동화만 직접 트리거. */
  runDevAutomation: (args: {
    slots: import('../../shared/types').FilledSlots;
    candidates: SpaceCandidate[];
    formData: ReservationFormData;
  }) => Promise<void>;
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

const CONVERSATION_ID_KEY = 'gls_conversation_id_v1';

async function loadOrCreateConversationId(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const got = await chrome.storage.local.get(CONVERSATION_ID_KEY);
      const existing = got?.[CONVERSATION_ID_KEY];
      if (typeof existing === 'string' && existing.length > 0) return existing;
    }
  } catch {
    /* storage unavailable — fall through to fresh */
  }
  const fresh = uuidv4();
  try {
    await chrome.storage?.local?.set({ [CONVERSATION_ID_KEY]: fresh });
  } catch {
    /* non-fatal */
  }
  return fresh;
}

export function useConversation(): UseConversationResult {
  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AutomationStatus>({ kind: 'idle' });
  const [candidate, setCandidate] = useState<SpaceCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  // 항상 최신 messages 를 보고 BG로 history를 보낼 수 있도록 ref 동기화
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Mount: 영구 저장된 conversationId 복원 (없으면 새로 발급).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await loadOrCreateConversationId();
      if (!cancelled) setConversationId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // conversationId 결정 직후: BG 에서 history / status / lastProposed 복원.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const resp = (await sendToBackground({
          type: 'POPUP_GET_STATUS',
          conversationId,
        })) as
          | {
              status: AutomationStatus;
              history: ChatMessage[];
              lastProposed: SpaceCandidate | null;
            }
          | undefined;
        if (cancelled || !resp) return;
        if (resp.history?.length) setMessages(resp.history);
        if (resp.status) setStatus(resp.status);
        if (resp.lastProposed) setCandidate(resp.lastProposed);
      } catch {
        /* 첫 진입이거나 BG context 없음 — 빈 상태 그대로 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

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

  const listDevSpaces = useCallback(
    async (args: {
      headcount: number;
      campusCode?: string;
      buildingNo?: string;
    }): Promise<SpaceCandidate[]> => {
      const resp = (await sendToBackground({
        type: 'POPUP_DEV_LIST_SPACES',
        headcount: args.headcount,
        ...(args.campusCode ? { campusCode: args.campusCode } : {}),
        ...(args.buildingNo ? { buildingNo: args.buildingNo } : {}),
      })) as { ok: boolean; candidates?: SpaceCandidate[]; error?: string } | undefined;
      if (!resp) return [];
      if (!resp.ok) throw new Error(resp.error ?? 'listSpaces failed');
      return resp.candidates ?? [];
    },
    [],
  );

  const runDevAutomation = useCallback(
    async (args: {
      slots: import('../../shared/types').FilledSlots;
      candidates: SpaceCandidate[];
      formData: ReservationFormData;
    }) => {
      if (busy) return;
      setBusy(true);
      // 채팅 메시지 영역에 한 줄 남겨 dev 트리거임을 표시
      appendAssistant(
        `[dev] 자동화 시작 — ${args.candidates.length}개 후보, ${args.slots.date} ${args.slots.start_time}-${args.slots.end_time}`,
      );
      try {
        await sendToBackground({
          type: 'POPUP_DEV_RUN_AUTOMATION',
          conversationId,
          slots: args.slots,
          candidates: args.candidates,
          formData: args.formData,
        });
      } catch (e) {
        appendAssistant(`[dev] 트리거 실패: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, appendAssistant],
  );

  const cancel = useCallback(() => {
    void sendToBackground({ type: 'POPUP_CANCEL', conversationId });
    setMessages([]);
    setCandidate(null);
    setStatus({ kind: 'idle' });
    // 영속 저장된 conversationId 도 제거하고 새 ID 발급. 다음 popup 진입은 깨끗한 대화로 시작.
    void (async () => {
      try {
        await chrome.storage?.local?.remove(CONVERSATION_ID_KEY);
      } catch {
        /* ignore */
      }
      const fresh = uuidv4();
      try {
        await chrome.storage?.local?.set({ [CONVERSATION_ID_KEY]: fresh });
      } catch {
        /* ignore */
      }
      setConversationId(fresh);
    })();
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
    listDevSpaces,
    runDevAutomation,
  };
}
