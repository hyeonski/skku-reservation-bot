/**
 * 채팅 메시지 리스트 — user/assistant 메시지를 시간순 렌더.
 * - 스크롤 최하단 자동 유지
 */

import { useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage as ChatMessageType } from '../../shared/types';
import { ChatMessage } from './ChatMessage';

interface Props {
  messages: ChatMessageType[];
  footer?: ReactNode;
}

export function ChatHistory({ messages, footer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, footer]);

  return (
    <div className="chat-history" ref={containerRef}>
      {messages.length === 0 && (
        <div className="chat-empty">
          예: "내일 오후 2시부터 4시까지 6명 회의실 잡아줘"
        </div>
      )}
      {messages.map((m, i) => (
        <ChatMessage key={i} message={m} />
      ))}
      {footer}
    </div>
  );
}
