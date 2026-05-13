/**
 * 예약 모달 폼 채우기.
 *
 * - campus / building 은 이미 checkAvailability 단계에서 selectComboByText 로
 *   cascade 트리거됨. 여기서는 set_value 로 안전 재커밋만.
 * - 나머지 필드(행사구분/단체/이름/인원/공간코드/날짜/시간/사용목적) 는 모두
 *   `setManyValues` op (main world 브리지에서 일괄 set_value) 로 커밋.
 *
 * 매핑 출처: docs/GLS_DOM_NOTES.md §4 / §6.
 */

import { MODAL_FIELDS } from '@gls/nexacroPaths';
import type { ReservationFormData } from '../shared/messages';
import type { SpaceCandidate } from '../shared/types';
import { runInPage } from './contentScript';

export interface FillArgs {
  candidate: SpaceCandidate;
  date: string; // "yyyymmdd"  (빈 문자열이면 set 생략)
  startTime: string; // "HHMM"   (빈 문자열이면 set 생략)
  endTime: string; // "HHMM"
  formData: ReservationFormData;
}

export async function fillForm(args: FillArgs): Promise<void> {
  const { candidate, date, startTime, endTime, formData } = args;

  const values: Record<string, string> = {
    [MODAL_FIELDS.행사구분]: formData.hangsaGbCode,
    [MODAL_FIELDS.주관단체]: formData.organization,
    [MODAL_FIELDS.행사명]: formData.eventName,
    [MODAL_FIELDS.행사인원]: String(formData.headcount),
    [MODAL_FIELDS.사용목적]: formData.purpose,
    [MODAL_FIELDS.공간]: candidate.glsSpaceCode,
    // campus/build 도 안전을 위해 코드값 재커밋 (cascade 는 이미 발화됐다고 가정)
    [MODAL_FIELDS.캠퍼스]: candidate.campusCode,
    [MODAL_FIELDS.건물]: candidate.buildingNo,
  };
  if (date) values[MODAL_FIELDS.예약일] = date;
  if (startTime) values[MODAL_FIELDS.시작시간] = startTime;
  if (endTime) values[MODAL_FIELDS.종료시간] = endTime;

  await runInPage('setManyValues', { values });
}
