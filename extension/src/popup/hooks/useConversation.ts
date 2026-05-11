/**
 * 대화 상태 훅 (D-018: 클라가 진실의 원천).
 *
 * 책임:
 * - conversationId 발급·유지 (mount 시 UUID v4 생성)
 * - messages 배열 보유
 * - sendMessage(text): popup → BG (POPUP_CHAT_REQUEST) → BG 응답 받아 messages에 추가
 * - 자동화 진행 상태 (AutomationStatus) 구독
 * - confirm/cancel 액션
 *
 * TODO: chrome.runtime.sendMessage / onMessage 와이어업.
 */

import type { ChatMessage, AutomationStatus, SpaceCandidate } from '../../shared/types';

export interface UseConversationResult {
  conversationId: string;
  messages: ChatMessage[];
  status: AutomationStatus;
  candidate: SpaceCandidate | null;
  sendMessage: (text: string) => Promise<void>;
  confirmReservation: (confirmed: boolean) => Promise<void>;
  cancel: () => void;
}

export function useConversation(): UseConversationResult {
  // TODO
  throw new Error('not implemented');
}
