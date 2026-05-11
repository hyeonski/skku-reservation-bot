/**
 * GLS 자동화 오케스트레이션 (페이지 컨텍스트).
 * 핵심 흐름은 docs/GLS_DOM_NOTES.md §5 의사코드.
 *
 * @gls/nexacroPaths, @gls/nexacroActions, @gls/schemas 사용.
 *
 * TODO:
 * - checkSession(): URL이 login.skku.edu면 false
 * - openReservationModal(): 신청/자격관리 → 공간대여신청 → btnInsert4 클릭 시퀀스
 * - checkAvailability(candidate, date, startHour, endHour): 모달 띄운 상태에서
 *   campus/building 설정 → 공간 row 클릭 → dsGrdSub 읽어 conflict 검사
 * - submitReservation(candidate, formData): 폼 채우고 btnSave_OnClick 호출 + 결과 캡처
 */

import type { ReservationFormData } from '../shared/messages';
import type { SpaceCandidate } from '../shared/types';

export function checkSession(): boolean {
  // TODO
  return false;
}

export async function openReservationModal(): Promise<void> {
  // TODO
}

export async function checkAvailability(
  _candidate: SpaceCandidate,
  _date: string,
  _startHour: number,
  _endHour: number,
): Promise<{ available: boolean; conflicts: Array<{ kind: string; timeTerm: string; info: string }> }> {
  // TODO
  throw new Error('not implemented');
}

export async function submitReservation(
  _candidate: SpaceCandidate,
  _formData: ReservationFormData,
  _date: string,
  _startTime: string,
  _endTime: string,
): Promise<{ ok: boolean; error?: string }> {
  // TODO
  throw new Error('not implemented');
}
