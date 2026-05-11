/**
 * GLS 자동화 오케스트레이터 (D-013 흐름 + D-027 탭 처리).
 *
 * 책임:
 * - GLS 탭 찾기/생성 (chrome.tabs.query → chrome.tabs.create)
 * - content script에 BG_CHECK_SESSION 보내 로그인 상태 확인
 * - 미로그인 시 popup에 LOGIN_REQUIRED 상태 푸시
 * - listSpaces로 후보 받아오기 → 후보 순회하며 BG_CHECK_AVAILABILITY 전송
 * - 가용 공간 찾으면 popup에 BG_CANDIDATE_PROPOSAL 푸시
 * - 사용자 confirm 수신 시 BG_SUBMIT_RESERVATION 전송
 * - 결과 받아 popup·notifications에 알림
 *
 * 비활성 탭에서도 자동화 시도 (D-027), 단계별 실패 시 활성화 안내로 fallback.
 *
 * TODO: 구현
 */

import type { FilledSlots, AutomationStatus } from '../shared/types';

export async function runReservationFlow(_args: {
  conversationId: string;
  slots: FilledSlots;
  onStatusChange: (s: AutomationStatus) => void;
}): Promise<void> {
  // TODO
}
