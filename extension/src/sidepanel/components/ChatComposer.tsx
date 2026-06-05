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

function endsWithHangulJamo(text: string): boolean {
  const last = Array.from(text.trimEnd()).at(-1);
  if (!last) return false;
  const code = last.codePointAt(0);
  if (code == null) return false;
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xd7b0 && code <= 0xd7ff)
  );
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
  const composingRef = useRef(false);

  // auto-grow: 컨텐츠에 맞춰 height 갱신 (min 22, max 90).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '22px';
    const next = Math.min(90, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [value]);

  const canSend = !disabled && value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    const isComposing =
      composingRef.current ||
      e.nativeEvent.isComposing ||
      endsWithHangulJamo(value);
    e.preventDefault();
    if (isComposing) return;
    if (canSend) onSend();
  };

  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button
        type="button"
        className="send-btn"
        disabled={!canSend}
        onClick={onSend}
        title="전송"
      >
        <Icon name="send" size={14} />
      </button>
    </div>
  );
}
