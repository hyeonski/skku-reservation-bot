/**
 * Phase 1c 이후 — chat phase 는 실 state 에서 derive 되므로 점프 의미 없음.
 * 화면(view) 전환 단축 메뉴만 유지. Phase 2 직전에 dev flag 로 wrap 또는 제거.
 */

import type { View } from './App';

const VIEW_OPTIONS: Array<{ id: View; label: string }> = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'sessions-with-reminder', label: 'Sessions + P3' },
  { id: 'chat-start', label: 'Chat — starter' },
  { id: 'chat', label: 'Chat (current)' },
];

interface DevNavigatorProps {
  view: View;
  onView: (v: View) => void;
}

export function DevNavigator({ view, onView }: DevNavigatorProps) {
  return (
    <div className="dev-nav">
      <details>
        <summary>dev · jump</summary>
        <div className="nav-group">
          <div className="label">view</div>
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'active' : ''}
              onClick={() => onView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
