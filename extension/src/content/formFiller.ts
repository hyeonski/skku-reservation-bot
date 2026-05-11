/**
 * 예약 모달 폼 채우기 (glsAgent.submitReservation의 하위 단계).
 *
 * Nexacro set_value 위주 + cascade 필요한 콤보는 selectComboByText.
 * 자세한 매핑은 docs/GLS_DOM_NOTES.md §4·§6.
 *
 * TODO: fillForm(dm, { campus, building, space, date, startTime, endTime, ...formData })
 */

import type { ReservationFormData } from '../shared/messages';
import type { SpaceCandidate } from '../shared/types';

export interface FillArgs {
  candidate: SpaceCandidate;
  date: string;       // "yyyymmdd"
  startTime: string;  // "HHMM"
  endTime: string;    // "HHMM"
  formData: ReservationFormData;
}

export async function fillForm(_args: FillArgs): Promise<void> {
  // TODO
}
