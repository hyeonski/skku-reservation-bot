/**
 * 슬롯 검증 가드의 단일 출처 — 메시지 문구, 제한 상수, 공용 술어.
 *
 * 이전에는 server/src/routes/parse.ts 와 extension/src/background/chatResultOverrides.ts
 * 가 동일한 한국어 안내 문구를 각자 복붙해 두 곳이 갈라질 위험이 있었다. 여기서
 * 한 번만 정의하고 양쪽이 import 한다. (가드별 outcome 형태 — intent/슬롯 정리 —
 * 는 서버/클라가 의미가 달라 각 측 어댑터에 남겨 둔다.)
 */

import {
  type ReservationSlots,
  clearTimeSlots,
  crossesMidnight,
  emptyFilledSlots,
  isBeyondFutureBookingWindow,
  isLikelyOutsideGeneralReservationHours,
  timeToMinutes,
  usesUnsupportedReservationMinute,
} from './slotPolicy';

/** 한 번에 예약 가능한 최대 길이(분). 초과 시 분할 안내. */
export const MAX_RESERVATION_DURATION_MIN = 8 * 60;

export const SLOT_GUARD_MESSAGES = {
  past_slot:
    '지난 날짜나 이미 지난 시간으로는 예약할 수 없어요. 오늘 이후의 날짜와 시간을 다시 알려주세요.',
  beyond_window:
    '너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.',
  crosses_midnight:
    '자정을 넘기는 예약은 지원하지 않아요. 같은 날짜 안에서 시작·종료 시간이 끝나도록 다시 알려주세요.',
  unsupported_minute:
    'GLS 공간예약은 30분 단위 시간만 안정적으로 처리할 수 있어요. 예: 18:00 또는 18:30처럼 다시 알려주세요.',
  outside_hours:
    '새벽이나 심야 시간대는 일반 GLS 공간예약 가능 시간 밖으로 보여요. 예: 09:00부터 22:00 사이처럼 다시 알려주세요.',
  ambiguous_meridiem:
    '오전/오후가 빠진 시간은 헷갈릴 수 있어요. 예: 오전 6시 또는 오후 6시처럼 다시 알려주세요.',
} as const;

export function overDurationMessage(hours: number): string {
  return `한 번에 ${hours}시간 예약은 제한을 넘을 수 있어요. 안전하게 진행하려면 최대 8시간 이내로 나누거나 시간을 줄여서 요청해 주세요.`;
}

/** 슬롯에서 예약 길이(분)를 도출. duration_min 우선, 없으면 시작·종료로 계산. */
export function getSlotDurationMinutes(
  slots: ReservationSlots | null | undefined,
): number | null {
  if (!slots) return null;
  if (slots.duration_min != null) return slots.duration_min;
  const startMin = timeToMinutes(slots.start_time);
  const endMin = timeToMinutes(slots.end_time);
  if (startMin == null || endMin == null) return null;
  const delta = endMin >= startMin ? endMin - startMin : endMin + 24 * 60 - startMin;
  return delta > 0 ? delta : null;
}

/**
 * 직전 슬롯에 시작시간이 있고, 사용자가 오전/오후 없이 "N시"로 시간만 바꾸는
 * 맥락 편집인지 판별. true 면 직전 오전/오후 맥락을 이어받으므로 모호-meridiem
 * 가드를 적용하지 않는다.
 */
export function hasContextualBareTimeEdit(
  text: string,
  previousSlots: ReservationSlots | null | undefined,
): boolean {
  if (!previousSlots?.start_time) return false;
  if (!/(바꾸|변경|수정|아니|시간(?:은|을|는)?)/.test(text)) return false;
  if (/오전|오후|새벽|심야|밤/.test(text)) return false;
  return /\d{1,2}\s*시(?!간)/.test(text);
}

// ----- 위치(캠퍼스) 입력 명확화 가드 -----
// LLM 이 "학생회관"만 보고 캠퍼스를 임의로 추정하는 경우가 있어, 캠퍼스 명시가
// 없으면 되묻도록 강제한다. 탐지 규칙·문구는 서버/클라가 공유하고, 슬롯 정리
// 방식(building 유지 여부 등)만 각 측 호출부에 남긴다.

export const STUDENT_CENTER_CAMPUS_MESSAGE =
  '학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.';

const STUDENT_CENTER_CAMPUS_PATTERN =
  /(율전|자과캠|자연과학캠퍼스|자연과학\s*캠퍼스|명륜|인사캠|인문사회과학캠퍼스|인문사회\s*캠퍼스)/;

/** 메시지에 캠퍼스가 명시돼 있는지(학생회관 명확화 억제 조건). */
export function hasExplicitStudentCenterCampus(text: string): boolean {
  return STUDENT_CENTER_CAMPUS_PATTERN.test(text);
}

/** "학생회관" 언급 여부. */
export function mentionsStudentCenter(text: string): boolean {
  return /학생\s*회관/.test(text);
}

export type SlotStateGuardReason =
  | 'beyond_window'
  | 'crosses_midnight'
  | 'unsupported_minute'
  | 'outside_hours'
  | 'over_duration';

export interface SlotGuardOutcome<T extends ReservationSlots> {
  reason: SlotStateGuardReason;
  message: string;
  /** 가드 적용 후 슬롯. 시간 가드는 시간만, beyond_window 는 전체 초기화, over_duration 은 유지. */
  filledSlots: T;
  missingRequired: string[];
}

/**
 * 슬롯 상태 기반 가드를 고정 우선순위로 1회 평가한다(첫 위반만 반환).
 * intent 매핑(서버 out_of_scope ↔ 클라 new_reservation)은 다운스트림 의미가
 * 달라 각 측 어댑터에 남긴다 — 여기서는 reason·문구·슬롯·missing 만 정한다.
 */
export function evaluateSlotStateGuards<T extends ReservationSlots>(
  slots: T,
  now: string,
): SlotGuardOutcome<T> | null {
  if (isBeyondFutureBookingWindow(slots, now)) {
    return {
      reason: 'beyond_window',
      message: SLOT_GUARD_MESSAGES.beyond_window,
      filledSlots: emptyFilledSlots<T>(),
      missingRequired: ['date'],
    };
  }
  if (crossesMidnight(slots)) {
    return {
      reason: 'crosses_midnight',
      message: SLOT_GUARD_MESSAGES.crosses_midnight,
      filledSlots: clearTimeSlots(slots),
      missingRequired: ['start_time', 'end_time'],
    };
  }
  if (usesUnsupportedReservationMinute(slots)) {
    return {
      reason: 'unsupported_minute',
      message: SLOT_GUARD_MESSAGES.unsupported_minute,
      filledSlots: clearTimeSlots(slots),
      missingRequired: ['start_time', 'end_time'],
    };
  }
  if (isLikelyOutsideGeneralReservationHours(slots)) {
    return {
      reason: 'outside_hours',
      message: SLOT_GUARD_MESSAGES.outside_hours,
      filledSlots: clearTimeSlots(slots),
      missingRequired: ['start_time', 'end_time'],
    };
  }
  const durationMin = getSlotDurationMinutes(slots);
  if (durationMin != null && durationMin > MAX_RESERVATION_DURATION_MIN) {
    const hours = Math.round((durationMin / 60) * 10) / 10;
    return {
      reason: 'over_duration',
      message: overDurationMessage(hours),
      filledSlots: slots,
      missingRequired: [],
    };
  }
  return null;
}
