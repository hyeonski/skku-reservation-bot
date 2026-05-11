/**
 * Content Script — GLS 페이지(kingoinfo.skku.edu)에 주입되는 entry.
 *
 * 책임:
 * - chrome.runtime.onMessage로 background의 BG_* 명령 수신
 * - 각 명령을 glsAgent의 함수로 위임
 * - 결과를 CONTENT_* 메시지로 응답
 *
 * 주의: 이 스크립트는 GLS 페이지 컨텍스트에서 실행되므로 window.nexacro 접근 가능.
 *
 * TODO:
 * - onMessage 리스너 등록
 * - BG_CHECK_SESSION → checkSession()
 * - BG_CHECK_AVAILABILITY → glsAgent.checkAvailability(...)
 * - BG_SUBMIT_RESERVATION → glsAgent.submitReservation(...)
 */

import type { BackgroundToContent } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (_msg: BackgroundToContent, _sender, _sendResponse) => {
    // TODO
    return false;
  },
);
