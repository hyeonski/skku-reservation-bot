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

export interface PopupConfirmNavigation {
  type: 'POPUP_CONFIRM_NAVIGATION';
  conversationId: string;
  confirmed: boolean;
}

export interface PopupResumeAfterLogin {
  type: 'POPUP_RESUME_AFTER_LOGIN';
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
  | PopupConfirmNavigation
  | PopupResumeAfterLogin
  | PopupPreviewReservation
  | PopupConfirmReservation
  | PopupCancel
  | PopupGetStatus
  | PopupListConversations
  | PopupDeleteConversation
  | PopupApplySuggestedMemory
  | PopupDismissSuggestedMemory;

export type BackgroundToPopup =
  | BgChatResponse
  | BgStatusUpdate
  | BgCandidateProposal
  | BgReservationDone;

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
