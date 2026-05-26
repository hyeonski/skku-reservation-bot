import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../icons';

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
}

/**
 * auto-grow textarea (22~90px) + 전송 버튼.
 * Enter = 전송, Shift+Enter = 줄바꿈.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
}: ChatComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // auto-grow: 컨텐츠에 맞춰 height 갱신 (min 22, max 90).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '22px';
    const next = Math.min(90, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  const sendAndClear = () => {
    if (!canSend) return;
    onSend();
    if (ref.current) {
      ref.current.value = '';
      ref.current.style.height = '22px';
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendAndClear();
    }
  };

  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button
        type="button"
        className="send-btn"
        disabled={!canSend}
        onClick={sendAndClear}
        title="전송"
      >
        <Icon name="send" size={14} />
      </button>
    </div>
  );
}
