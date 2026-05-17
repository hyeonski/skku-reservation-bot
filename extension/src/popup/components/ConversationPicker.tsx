import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationSessionSummary } from '../../shared/types';

interface ConversationPickerProps {
  currentConversationId: string;
  conversations: ConversationSessionSummary[];
  onCreateConversation: () => void | Promise<void>;
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onDeleteConversation: (conversationId: string) => void | Promise<void>;
}

function statusLabel(status: ConversationSessionSummary['status']): string {
  switch (status) {
    case 'completed':
      return '완료';
    case 'abandoned_user':
      return '중단';
    case 'abandoned_timeout':
      return '만료';
    case 'active':
    default:
      return '진행 중';
  }
}

function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value);
  const diffMs = Date.now() - updatedAt.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;

  return updatedAt.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

export function ConversationPicker({
  currentConversationId,
  conversations,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
}: ConversationPickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentTitle = useMemo(
    () => conversations.find((conversation) => conversation.id === currentConversationId)?.title ?? '대화',
    [conversations, currentConversationId],
  );

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPendingDeleteId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPendingDeleteId(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="conversation-picker" ref={rootRef}>
      <button
        type="button"
        className={`conversation-picker__trigger ${open ? 'conversation-picker__trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title={currentTitle}
      >
        <span className="conversation-picker__trigger-label">대화</span>
        <span className="conversation-picker__trigger-title">{currentTitle}</span>
      </button>

      {open && (
        <div className="conversation-picker__popover" role="dialog" aria-label="대화 선택">
          <button
            type="button"
            className="conversation-picker__new"
            onClick={() => {
              setOpen(false);
              setPendingDeleteId(null);
              void onCreateConversation();
            }}
          >
            + 새 대화
          </button>

          <div className="conversation-picker__list">
            {conversations.map((conversation) => {
              const active = conversation.id === currentConversationId;
              return (
                <div
                  key={conversation.id}
                  className={`conversation-picker__item ${active ? 'conversation-picker__item--active' : ''}`}
                >
                  <div className="conversation-picker__item-top">
                    <button
                      type="button"
                      className="conversation-picker__item-main"
                      onClick={() => {
                        setOpen(false);
                        setPendingDeleteId(null);
                        void onSelectConversation(conversation.id);
                      }}
                    >
                      <span className="conversation-picker__item-title">{conversation.title}</span>
                      <span
                        className={`conversation-picker__badge conversation-picker__badge--${conversation.status}`}
                      >
                        {statusLabel(conversation.status)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`conversation-picker__delete ${
                        pendingDeleteId === conversation.id
                          ? 'conversation-picker__delete--confirm'
                          : ''
                      }`}
                      onClick={() => {
                        if (pendingDeleteId === conversation.id) {
                          setPendingDeleteId(null);
                          setOpen(false);
                          void onDeleteConversation(conversation.id);
                          return;
                        }
                        setPendingDeleteId(conversation.id);
                      }}
                    >
                      {pendingDeleteId === conversation.id ? '정말 삭제' : '삭제'}
                    </button>
                  </div>
                  <div className="conversation-picker__item-meta">
                    <span>{formatUpdatedAt(conversation.updatedAt)}</span>
                  </div>
                  <div className="conversation-picker__item-preview">
                    {conversation.lastMessagePreview || '메시지가 아직 없습니다.'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
