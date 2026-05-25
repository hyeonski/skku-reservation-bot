import { Icon } from '../icons';
import type { ReminderData } from '../types';

interface ReminderBannerProps {
  /** null 이면 렌더하지 않음 (P3 패턴 분석 응답이 없을 때). */
  reminder: ReminderData | null;
  onAccept: () => void;
  onDismiss: () => void;
}

export function ReminderBanner({ reminder, onAccept, onDismiss }: ReminderBannerProps) {
  if (!reminder) return null;
  return (
    <div className="reminder-banner">
      <div className="label">
        <Icon name="sparkles" size={11} />
        패턴 알림 · Phase 3
      </div>
      <div className="text">{reminder.title}</div>
      <div className="meta">{reminder.pattern}</div>
      <div className="pills">
        <span className="pattern-pill">
          <Icon name="calendar" size={11} />
          {reminder.proposed.date}
        </span>
        <span className="pattern-pill">
          <Icon name="clock" size={11} />
          {reminder.proposed.time}
        </span>
        <span className="pattern-pill">
          <Icon name="building" size={11} />
          {reminder.proposed.space}
        </span>
      </div>
      <div className="actions">
        <button type="button" className="btn primary small" onClick={onAccept}>
          네, 예약할게요
        </button>
        <button type="button" className="btn small" onClick={onDismiss}>
          나중에
        </button>
      </div>
    </div>
  );
}
