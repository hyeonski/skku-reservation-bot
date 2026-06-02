import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Icon } from '../icons';
import type { SessionSummary } from '../types';
import { formatRelativeTime } from '../utils/formatRelativeTime';

interface SessionItemProps {
  session: SessionSummary;
  onPick: (s: SessionSummary) => void;
  onDelete?: (id: string) => void;
}

export function SessionItem({ session, onPick, onDelete }: SessionItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whenLabel = session.when ?? (session.updatedAt ? formatRelativeTime(session.updatedAt) : '');

  const statusCls = `status-pill ${session.status}`;

  const clearDeleteConfirmTimer = () => {
    if (deleteConfirmTimer.current) {
      clearTimeout(deleteConfirmTimer.current);
      deleteConfirmTimer.current = null;
    }
  };

  const confirmDeletion = () => {
    clearDeleteConfirmTimer();
    onDelete?.(session.id);
  };

  const handlePick = () => {
    if (confirmDelete) {
      confirmDeletion();
      return;
    }
    onPick(session);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      confirmDeletion();
      return;
    }
    setConfirmDelete(true);
    clearDeleteConfirmTimer();
    deleteConfirmTimer.current = setTimeout(() => {
      setConfirmDelete(false);
      deleteConfirmTimer.current = null;
    }, 5000);
  };

  useEffect(() => {
    return () => {
      clearDeleteConfirmTimer();
    };
  }, []);

  return (
    <div
      className="session-item"
      role="button"
      tabIndex={0}
      onClick={handlePick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePick();
        }
      }}
    >
      <div className="row1">
        <div className={statusCls} />
        <div className="title">{session.title}</div>
        <div className="when">{whenLabel}</div>
      </div>
      <div className="preview">{session.preview}</div>
      <button
        type="button"
        className="menu"
        aria-label={confirmDelete ? '대화 삭제 확인' : '대화 삭제'}
        onClick={handleDelete}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (confirmDelete) {
            e.preventDefault();
            confirmDeletion();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            if (confirmDelete) {
              confirmDeletion();
              return;
            }
            setConfirmDelete(true);
            clearDeleteConfirmTimer();
            deleteConfirmTimer.current = setTimeout(() => {
              setConfirmDelete(false);
              deleteConfirmTimer.current = null;
            }, 5000);
          }
        }}
        title={confirmDelete ? '한 번 더 누르면 삭제' : '삭제'}
      >
        <Icon name={confirmDelete ? 'check' : 'trash'} size={13} />
      </button>
    </div>
  );
}
