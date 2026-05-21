import { useState } from 'react';
import type { MouseEvent } from 'react';
import { Icon } from '../icons';
import type { SessionSummary } from '../types';

interface SessionItemProps {
  session: SessionSummary;
  onPick: (s: SessionSummary) => void;
  onDelete?: (id: string) => void;
}

export function SessionItem({ session, onPick, onDelete }: SessionItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusCls = `status-pill ${session.status}`;

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete?.(session.id);
      return;
    }
    setConfirmDelete(true);
    setTimeout(() => setConfirmDelete(false), 1500);
  };

  return (
    <div
      className="session-item"
      role="button"
      tabIndex={0}
      onClick={() => onPick(session)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(session);
        }
      }}
    >
      <div className="row1">
        <div className={statusCls} />
        <div className="title">{session.title}</div>
        <div className="when">{session.when}</div>
      </div>
      <div className="preview">{session.preview}</div>
      <button
        type="button"
        className="menu"
        onClick={handleDelete}
        title={confirmDelete ? '한 번 더 누르면 삭제' : '삭제'}
      >
        <Icon name={confirmDelete ? 'check' : 'trash'} size={13} />
      </button>
    </div>
  );
}
