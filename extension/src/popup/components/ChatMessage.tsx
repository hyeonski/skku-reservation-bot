/**
 * 단일 메시지 버블.
 * - role 별 스타일링 (user 우측, assistant 좌측)
 * - 줄바꿈 보존
 */

import type { ChatMessage as ChatMessageType } from '../../shared/types';

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const roleClass = message.role === 'user' ? 'chat-message--user' : 'chat-message--assistant';
  return (
    <div className={`chat-message ${roleClass}`}>
      <div className="chat-bubble">{message.content}</div>
    </div>
  );
}
