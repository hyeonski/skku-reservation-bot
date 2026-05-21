import { Icon } from '../icons';
import type { ReminderData, SessionSummary } from '../types';
import { ReminderBanner } from './ReminderBanner';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  sessions: SessionSummary[];
  reminder: ReminderData | null;
  onPick: (s: SessionSummary) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  onAcceptReminder?: () => void;
  onDismissReminder?: () => void;
}

export function SessionList({
  sessions,
  reminder,
  onPick,
  onNew,
  onDelete,
  onAcceptReminder,
  onDismissReminder,
}: SessionListProps) {
  return (
    <div className="screen">
      <div className="popup-head">
        <div className="popup-title">
          <div className="glyph">SK</div>
          최근 대화
        </div>
        <button type="button" className="icon-btn" title="새 대화" onClick={onNew}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="popup-body">
        <ReminderBanner
          reminder={reminder}
          onAccept={onAcceptReminder ?? (() => {})}
          onDismiss={onDismissReminder ?? (() => {})}
        />

        <div className="sessions-divider">진행 중 · 완료된 대화</div>
        <div className="sessions-list">
          {sessions.map((s) => (
            <SessionItem key={s.id} session={s} onPick={onPick} onDelete={onDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
