/**
 * popup ↔ background SW ↔ content script 메시지 타입 (D-026).
 * Discriminated union — chrome.runtime.sendMessage / chrome.tabs.sendMessage 페이로드로 사용.
 */

import type {
  ChatMessage,
  ParseResult,
  SpaceCandidate,
  AutomationStatus,
  FilledSlots,
  ReservationFormData,
  ApplicationState,
  ConversationSessionSummary,
} from './types';

// ---------- popup → background ----------

export interface PopupChatRequest {
  type: 'POPUP_CHAT_REQUEST';
  conversationId: string;
  history: ChatMessage[];
  latestMessage: string;
}

export interface PopupStartSearch {
  type: 'POPUP_START_SEARCH';
  conversationId: string;
  slots: FilledSlots;
}

export interface PopupConfirmReservation {
  type: 'POPUP_CONFIRM_RESERVATION';
  conversationId: string;
  spaceCode: string;
  confirmed: boolean;
  formData?: ReservationFormData;
}

export interface PopupPreviewReservation {
  type: 'POPUP_PREVIEW_RESERVATION';
  conversationId: string;
  spaceCode: string;
  formData?: ReservationFormData;
}

export interface PopupCancel {
  type: 'POPUP_CANCEL';
  conversationId: string;
}

/**
 * 사이드패널이 "다른 공간 찾기" 를 트리거할 때 (핸드오프 결정 #2).
 * background 는 현재 후보를 폐기하고 다음 후보부터 iterate 재개한다 — 큐가
 * 비어 있으면 no_candidate 로 전이.
 */
export interface PopupRejectCandidate {
  type: 'POPUP_REJECT_CANDIDATE';
  conversationId: string;
}

export interface PopupGetStatus {
  type: 'POPUP_GET_STATUS';
  conversationId: string;
}

export interface PopupListConversations {
  type: 'POPUP_LIST_CONVERSATIONS';
}

export interface PopupDeleteConversation {
  type: 'POPUP_DELETE_CONVERSATION';
  conversationId: string;
}

export interface PopupApplySuggestedMemory {
  type: 'POPUP_APPLY_SUGGESTED_MEMORY';
  conversationId: string;
}

export interface PopupDismissSuggestedMemory {
  type: 'POPUP_DISMISS_SUGGESTED_MEMORY';
  conversationId: string;
}

export interface PopupOpenLoginTab {
  type: 'POPUP_OPEN_LOGIN_TAB';
  conversationId: string;
  variant: 'needed' | 'expired';
}

// ---------- background → popup ----------

export interface BgChatResponse {
  type: 'BG_CHAT_RESPONSE';
  result: ParseResult;
}

export interface BgStatusUpdate {
  type: 'BG_STATUS_UPDATE';
  conversationId: string;
  status: AutomationStatus;
}

export interface BgCandidateProposal {
  type: 'BG_CANDIDATE_PROPOSAL';
  conversationId: string;
  candidate: SpaceCandidate;
}

export interface BgReservationDone {
  type: 'BG_RESERVATION_DONE';
  conversationId: string;
  spaceCode: string;
}

/**
 * 후보 검증 시작 시 1회 broadcast — 사이드패널 SearchProgressCard 가 pending
 * 마커를 그릴 수 있도록 전체 후보 리스트를 한 번에 전달.
 * (핸드오프 결정 #3 — 분리된 두 메시지 중 첫 번째)
 */
export interface BgSearchStarted {
  type: 'BG_SEARCH_STARTED';
  conversationId: string;
  candidates: SpaceCandidate[];
}

/**
 * 각 후보 검증 결과. 사이드패널은 currentIdx 로 진행 상태/스피너 위치를 갱신.
 * available=true 가 마지막 항목이 되며 그 다음에 BG_CANDIDATE_PROPOSAL 이
 * 별도로 발사된다.
 */
export interface BgCandidateResult {
  type: 'BG_CANDIDATE_RESULT';
  conversationId: string;
  spaceCode: string;
  available: boolean;
  /** 사이드패널 우측에 표시할 사유 텍스트 ("18:00 충돌" 등). */
  why?: string;
  currentIdx: number;
  total: number;
}

/**
 * 신청서 제출 단계 진행 상황. content script 가 fill→save 를 atomic 하게
 * 처리하므로 'filling' / 'saving' 은 background 에서 시간 경계로 emit 한다.
 * 'saved' 는 ContentSubmitResult 성공 시.
 */
export interface BgSubmitStatus {
  type: 'BG_SUBMIT_STATUS';
  conversationId: string;
  step: 'filling' | 'saving' | 'saved';
}

export interface LoginNeeded {
  type: 'LOGIN_NEEDED';
  conversationId: string;
}

export interface SessionExpired {
  type: 'SESSION_EXPIRED';
  conversationId: string;
  resumeIdx: number;
}

export interface LoginComplete {
  type: 'LOGIN_COMPLETE';
  conversationId: string;
  tabId: number;
  reason: 'needed' | 'expired';
}

// ---------- background → content (GLS 탭) ----------

export interface BgCheckSession {
  type: 'BG_CHECK_SESSION';
}

export interface BgCheckBridge {
  type: 'BG_CHECK_BRIDGE';
}

export interface BgCheckAvailability {
  type: 'BG_CHECK_AVAILABILITY';
  candidate: SpaceCandidate;
  date: string;
  startHour: number;
  endHour: number;
  /**
   * 제공되면 가용 판정 직후 폼 전체 (행사구분/단체/이름/사용목적 등) 까지
   * preview 로 채워둔다. 사용자가 GLS 탭에서 모달 상태를 시각적으로 확인 가능.
   * 실제 저장은 별도 BG_SUBMIT_RESERVATION 에서.
   */
  formData?: ReservationFormData;
  startTime?: string; // "HH:MM"
  endTime?: string;   // "HH:MM"
  strictPreview?: boolean;
}

export interface BgSubmitReservation {
  type: 'BG_SUBMIT_RESERVATION';
  candidate: SpaceCandidate;
  formData: ReservationFormData;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BgClearPreviewForm {
  type: 'BG_CLEAR_PREVIEW_FORM';
}

export interface BgPreviewReservation {
  type: 'BG_PREVIEW_RESERVATION';
  candidate: SpaceCandidate;
  formData: ReservationFormData;
  date: string;
  startTime: string;
  endTime: string;
}

// ---------- content → background ----------

export interface ContentSessionState {
  type: 'CONTENT_SESSION_STATE';
  loggedIn: boolean;
}

export interface ContentBridgeState {
  type: 'CONTENT_BRIDGE_STATE';
  ready: boolean;
  error?: string;
}

export interface ContentAvailabilityResult {
  type: 'CONTENT_AVAILABILITY_RESULT';
  spaceCode: string;
  available: boolean;
  loginRequired?: boolean;
  conflicts?: Array<{ kind: '수업' | '예약' | '대여' | '제외'; timeTerm: string; info: string }>;
}

export interface ContentSubmitResult {
  type: 'CONTENT_SUBMIT_RESULT';
  ok: boolean;
  spaceCode: string;
  error?: string;
}

export interface ContentPreviewResult {
  type: 'CONTENT_PREVIEW_RESULT';
  ok: boolean;
  spaceCode: string;
  loginRequired?: boolean;
  error?: string;
}

export interface ApplicationStateResponse {
  ok: boolean;
  applicationState?: ApplicationState;
  error?: string;
}

export interface ConversationListResponse {
  ok: boolean;
  conversations?: ConversationSessionSummary[];
  error?: string;
}

// ---------- Union ----------

export type PopupToBackground =
  | PopupChatRequest
  | PopupStartSearch
  | PopupRejectCandidate
  | PopupPreviewReservation
  | PopupConfirmReservation
  | PopupCancel
  | PopupGetStatus
  | PopupListConversations
  | PopupDeleteConversation
  | PopupApplySuggestedMemory
  | PopupDismissSuggestedMemory
  | PopupOpenLoginTab;

export type BackgroundToPopup =
  | BgChatResponse
  | BgStatusUpdate
  | BgCandidateProposal
  | BgReservationDone
  | BgSearchStarted
  | BgCandidateResult
  | BgSubmitStatus
  | LoginNeeded
  | SessionExpired
  | LoginComplete;

export type BackgroundToContent =
  | BgCheckSession
  | BgCheckBridge
  | BgCheckAvailability
  | BgSubmitReservation
  | BgClearPreviewForm
  | BgPreviewReservation;

export type ContentToBackground =
  | ContentSessionState
  | ContentBridgeState
  | ContentAvailabilityResult
  | ContentSubmitResult
  | ContentPreviewResult;

export type AnyMessage =
  | PopupToBackground
  | BackgroundToPopup
  | BackgroundToContent
  | ContentToBackground;
