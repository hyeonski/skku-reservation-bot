/**
 * 사이드패널 UI 전용 타입 (Phase 1a — 정적 mock 단계).
 *
 * Phase 1b 에서 useChatStateMachine 이 들어오면 shared/types 의 FilledSlots /
 * ApplicationState 등을 참조하도록 통합한다. 지금은 핸드오프 04-components.md
 * 의 props 사양을 그대로 표현하기 위한 narrow 한 모양만 둔다.
 */

export type ChatPhase =
  | 'starter'
  | 'slots-end'
  | 'slots-count'
  | 'awaiting-login'
  | 'searching'
  | 'awaiting-relogin'
  | 'recommended'
  | 'meta-p2'
  | 'meta-collect'
  | 'draft'
  | 'submitting'
  | 'done'
  | 'failed-retry'
  | 'failed';

export interface BubbleMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  preview: string;
  when?: string;
  updatedAt?: string;
  status: 'active' | 'completed' | 'abandoned' | 'abandoned_user' | 'abandoned_timeout';
}

export interface ReminderData {
  id: string;
  status?: 'active' | 'dismissed' | 'accepted';
  title: string;
  pattern: string;
  proposed: {
    date: string;
    time: string;
    space: string;
    group: string;
    event: string;
    prompt: string;
  };
}

export interface SearchCandidate {
  code: string;
  name: string;
  building: string;
  result: 'found' | 'fail' | 'pending';
  why?: string;
}

export interface SpaceSummary {
  code: string;
  name: string;
  building: string;
  buildingNo?: string;
  floor?: string;
  capa: string;
  useJojikName?: string;
  contents?: string | null;
  limitTimeHHMM?: string | null;
}

export interface RecommendationSlots {
  date: string;
  start: string;
  end: string;
}

export interface DraftFields {
  category?: string;
  group?: string;
  event?: string;
  headcount?: string;
  purpose?: string;
}

export type DraftSuggestedFlags = Partial<Record<keyof DraftFields, boolean>>;

export interface P2Recommendation {
  when: string;
  group: string;
  event: string;
  frequencyHint?: string;
}
