/**
 * 확장 내부 공유 도메인 타입.
 * 서버 측 schemas/parse.ts의 응답 형태를 클라가 다루기 좋은 형태로 보관.
 */

export type ChatRole = 'user' | 'assistant';
export type ApplicationField = 'organization' | 'eventName' | 'purpose' | 'hangsaGbCode';
export type ApplicationConfidenceLevel = 'high' | 'medium' | 'low';
export type ApplicationDraftSource = 'conversation' | 'memory' | 'user_modified';
export type ConversationStatus =
  | 'active'
  | 'completed'
  | 'abandoned_user';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  ts?: string;
}

export interface FilledSlots {
  date: string | null;        // "YYYY-MM-DD"
  start_time: string | null;  // "HH:MM"
  end_time: string | null;    // "HH:MM"
  duration_min: number | null;
  headcount: number | null;
  campus: string | null;
  building: string | null;
  space: string | null;
}

/** 흐름-제어 화행. 클라는 cancel lifecycle 판단에만 쓴다. */
export type Signal = 'info' | 'accept' | 'request_alternative' | 'cancel' | 'out_of_scope';

/** 서버 reducer 가 파생하는 실행 액션. 클라는 실행만 한다. */
export type Action = 'search' | 'next_candidate' | 'fill_form' | 'none';

export interface ReservationFormData {
  hangsaGbCode: string;
  organization: string;
  eventName: string;
  headcount: number;
  purpose: string;
}

export interface SuggestedApplicationMemory {
  conversationId: string;
  label: string;
  formData: ReservationFormData;
  reason: 'frequency' | 'reuse_signal';
  count: number | null;
  frequency: string;
  confidence: number;
}

export interface ApplicationRecommendation {
  from_conversation_id: string;
  group: string;
  event: string;
  category: string;
  purpose: string;
  confidence: number;
  frequency: string;
}

export interface ApplicationState {
  draft: ReservationFormData | null;
  missing_application: ApplicationField[];
  needs_application_collection: boolean;
  suggested_memory: SuggestedApplicationMemory | null;
  recommendation: ApplicationRecommendation | null;
  confidence: Record<ApplicationField, ApplicationConfidenceLevel>;
  source: ApplicationDraftSource | null;
}

export interface ParseResult {
  conversation_id: string;
  filled_slots: FilledSlots;
  missing_required: string[];
  ready_to_search: boolean;
  assistant_message: string;
  application_state: ApplicationState;
  /** 흐름-제어 화행(서버 파생). 클라는 cancel lifecycle 판단에만 쓴다. */
  signal: Signal;
  /** 서버 reducer 가 파생한 실행 액션. 클라는 분기 없이 실행만. */
  action: Action;
  /** 후보 제안됨 ∧ 신청서 완성 — 폼/제출 버튼 게이트. */
  can_submit: boolean;
}

export interface ConversationSessionSummary {
  id: string;
  title: string;
  status: ConversationStatus;
  updatedAt: string;
  lastMessagePreview: string;
  confirmedReservationLabel?: string | null;
  confirmedSpaceCode?: string | null;
  confirmedSpaceLabel?: string | null;
}

export type ReminderStatus = 'active' | 'dismissed' | 'accepted';

export interface ReminderDto {
  id: string;
  status: ReminderStatus;
  title: string;
  pattern: string;
  proposed: {
    date: string;
    time: string;
    space: string;
    spaceCode: string | null;
    group: string;
    event: string;
    prompt: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** 자동화 탐색 로그 — 후보 1개 시도 결과 */
export interface SearchLogEntry {
  glsSpaceCode: string;
  buildingName: string;
  roomName: string;
  available: boolean;
  conflicts: Array<{ kind: string; timeTerm: string; info: string }>;
}

/** 자동화 진행 상태 — popup에 표시 */
export type AutomationStatus =
  | { kind: 'idle' }
  | { kind: 'navigation_required' }
  | { kind: 'opening_gls' }
  | {
      kind: 'login_required';
      reason: 'needed' | 'expired';
      resumeIdx?: number;
    }
  | { kind: 'searching'; tried: number; total: number; log: SearchLogEntry[] }
  | {
      kind: 'candidate_found';
      spaceCode: string;
      spaceName: string;
      log: SearchLogEntry[];
    }
  | { kind: 'submitting' }
  | { kind: 'done'; spaceCode: string }
  | { kind: 'no_candidate'; log: SearchLogEntry[] }
  | { kind: 'error'; message: string };

/** 후보 공간 (서버 SpaceDto의 클라 측 alias) */
export interface SpaceCandidate {
  glsSpaceCode: string;
  campusCode: string;
  buildingNo: string;
  campusName: string;
  buildingName: string;
  roomName: string;
  capacityMin: number;
  capacityMax: number;
  useJojikName: string | null;
  contents: string | null;
  limitTimeHHMM: string | null;
  personalizationReason?: string | null;
}
