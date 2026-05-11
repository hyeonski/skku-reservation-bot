/**
 * Background Service Worker — MV3 entry (D-026, D-027).
 *
 * 책임:
 * - popup ↔ content ↔ server 메시지 라우팅
 * - 자동화 오케스트레이션 (chat 응답 → 후보 조회 → content 통신 → confirm → submit)
 * - 진행 중 상태를 chrome.storage.session에 mirror (SW idle 종료 대비)
 *
 * TODO:
 * - chrome.runtime.onMessage 리스너 등록 → glsCoordinator로 위임
 * - 진행 상태 푸시: chrome.runtime.sendMessage(BG_STATUS_UPDATE) 또는 long-lived port
 * - chrome.notifications로 완료 알림
 */

import type { PopupToBackground, ContentToBackground } from '../shared/messages';

chrome.runtime.onInstalled.addListener(() => {
  // TODO: clientId 초기화
});

chrome.runtime.onMessage.addListener((_msg: PopupToBackground | ContentToBackground, _sender, _sendResponse) => {
  // TODO: 메시지 종류별 라우팅 — glsCoordinator 호출
  return false; // async response 사용 시 true 반환 + sendResponse 비동기 호출
});
