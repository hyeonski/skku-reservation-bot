import { Icon } from '../icons';

interface ChatHeaderProps {
  title: string;
  sessionLabel?: string;
  onBack: () => void;
  onNew?: () => void;
}

export function ChatHeader({ title, sessionLabel, onBack, onNew }: ChatHeaderProps) {
  return (
    <div className="popup-head">
      <button className="icon-btn" onClick={onBack} title="대화 목록" type="button">
        <Icon name="menu" />
      </button>
      <div className="popup-title">
        <div className="glyph">SK</div>
        <span>{title}</span>
        {sessionLabel && <span className="session-label">· {sessionLabel}</span>}
      </div>
      <button className="icon-btn" title="새 대화" onClick={onNew} type="button">
        <Icon name="plus" />
      </button>
    </div>
  );
}
