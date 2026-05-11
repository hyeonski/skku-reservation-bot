/**
 * 채팅 메시지 리스트 — user/assistant 메시지를 시간순 렌더.
 *
 * TODO:
 * - props: messages: ChatMessage[]
 * - 스크롤 최하단 자동 유지
 * - 메시지별 role에 따른 스타일 분기
 */

import type { ChatMessage } from '../../shared/types';

export function ChatHistory(_props: { messages: ChatMessage[] }) {
  // TODO
  return <div className="chat-history" />;
}
