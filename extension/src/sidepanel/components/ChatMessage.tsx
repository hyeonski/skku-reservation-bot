import type { ReactNode } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  children: ReactNode;
  ts?: string;
}

/** 사용자/봇 말풍선. */
export function ChatMessage({ role, children, ts }: ChatMessageProps) {
  const cls = role === 'user' ? 'msg user' : 'msg bot';
  return (
    <div className={cls}>
      <div className="bubble">{children}</div>
      {ts && <div className="ts">{ts}</div>}
    </div>
  );
}
