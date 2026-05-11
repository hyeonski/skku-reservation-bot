/**
 * popup ↔ background SW ↔ content script 메시지 타입 (D-026).
 * Discriminated union — chrome.runtime.sendMessage / chrome.tabs.sendMessage 페이로드로 사용.
 */

import type { ChatMessage, ParseResult, SpaceCandidate, AutomationStatus, FilledSlots } from './types';

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

export interface PopupCancel {
  type: 'POPUP_CANCEL';
  conversationId: string;
}

export interface PopupGetStatus {
  type: 'POPUP_GET_STATUS';
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

export interface BgCheckAvailability {
  type: 'BG_CHECK_AVAILABILITY';
  candidate: SpaceCandidate;
  date: string;
  startHour: number;
  endHour: number;
}

export interface BgSubmitReservation {
  type: 'BG_SUBMIT_RESERVATION';
  candidate: SpaceCandidate;
  formData: ReservationFormData;
}

// ---------- content → background ----------

export interface ContentSessionState {
  type: 'CONTENT_SESSION_STATE';
  loggedIn: boolean;
}

export interface ContentAvailabilityResult {
  type: 'CONTENT_AVAILABILITY_RESULT';
  spaceCode: string;
  available: boolean;
  conflicts?: Array<{ kind: '수업' | '예약' | '대여'; timeTerm: string; info: string }>;
}

export interface ContentSubmitResult {
  type: 'CONTENT_SUBMIT_RESULT';
  ok: boolean;
  spaceCode: string;
  error?: string;
}

// ---------- 폼 데이터 (사용자가 채팅·confirm 단계에서 제공) ----------

export interface ReservationFormData {
  hangsaGbCode: string;      // 행사구분 코드 (예: "111")
  organization: string;       // 주관단체
  eventName: string;          // 행사명
  headcount: number;
  purpose: string;            // 사용목적
  // 날짜·시간·공간은 SpaceCandidate + date/start/end로 넘어옴
}

// ---------- Union ----------

export type PopupToBackground =
  | PopupChatRequest
  | PopupStartSearch
  | PopupConfirmReservation
  | PopupCancel
  | PopupGetStatus;

export type BackgroundToPopup =
  | BgChatResponse
  | BgStatusUpdate
  | BgCandidateProposal
  | BgReservationDone;

export type BackgroundToContent =
  | BgCheckSession
  | BgCheckAvailability
  | BgSubmitReservation;

export type ContentToBackground =
  | ContentSessionState
  | ContentAvailabilityResult
  | ContentSubmitResult;

export type AnyMessage =
  | PopupToBackground
  | BackgroundToPopup
  | BackgroundToContent
  | ContentToBackground;
