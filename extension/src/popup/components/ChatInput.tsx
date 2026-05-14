/**
 * 채팅 입력창.
 * - Enter 전송, Shift+Enter 줄바꿈
 * - disabled 동안 입력/전송 차단
 */

import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <textarea
        className="chat-input__textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? '응답을 기다리는 중…' : '메시지를 입력하세요'}
        rows={2}
      />
      <button
        type="submit"
        className="chat-input__send"
        disabled={disabled || !value.trim()}
      >
        전송
      </button>
    </form>
  );
}
