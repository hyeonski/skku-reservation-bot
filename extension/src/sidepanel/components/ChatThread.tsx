import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface ChatThreadProps {
  /** 메시지/카드/타이핑 인디케이터 등 thread 내부 노드 (이미 .msg.user/.msg.bot/.card 클래스 가짐). */
  children: ReactNode;
  /** children 길이가 바뀌면 맨 아래로 스크롤. */
  autoScroll?: boolean;
}

export function ChatThread({ children, autoScroll = true }: ChatThreadProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="popup-body" ref={ref}>
      <div className="thread">{children}</div>
    </div>
  );
}
