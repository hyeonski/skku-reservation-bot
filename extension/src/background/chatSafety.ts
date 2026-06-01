import type { ReservationFormData } from '../shared/types';

const MAX_EVENT_NAME_LENGTH = 50;
const MAX_PURPOSE_LENGTH = 500;

const REPEAT_SCHEDULE_PATTERN = /매주|매달|매월|매일|격주|정기적으로|이번\s*달.*(?:매주|매일)/;
const REPEAT_RESERVATION_PATTERN = /(?:반복|정기)\s*(?:예약|신청|대여|사용|일정|패턴)/;
const RESERVATION_REPEAT_PATTERN =
  /(?:예약|신청|대여|사용|빌리|잡아|잡아줘|잡아\s*줘).{0,12}(?:반복|정기)|(?:반복|정기).{0,12}(?:예약|신청|대여|사용|빌리|잡아|잡아줘|잡아\s*줘)/;

export type ApplicationLengthIssue = {
  field: 'eventName' | 'purpose';
  label: string;
  max: number;
  actual: number;
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function hasRepeatReservationCondition(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (REPEAT_SCHEDULE_PATTERN.test(normalized)) return true;
  if (REPEAT_RESERVATION_PATTERN.test(normalized)) return true;
  return RESERVATION_REPEAT_PATTERN.test(normalized);
}

export function findApplicationLengthIssue(
  draft: ReservationFormData | null | undefined,
): ApplicationLengthIssue | null {
  if (!draft) return null;

  const eventNameLength = normalizeWhitespace(draft.eventName).length;
  if (eventNameLength > MAX_EVENT_NAME_LENGTH) {
    return {
      field: 'eventName',
      label: '행사명',
      max: MAX_EVENT_NAME_LENGTH,
      actual: eventNameLength,
    };
  }

  const purposeLength = normalizeWhitespace(draft.purpose).length;
  if (purposeLength > MAX_PURPOSE_LENGTH) {
    return {
      field: 'purpose',
      label: '사용목적',
      max: MAX_PURPOSE_LENGTH,
      actual: purposeLength,
    };
  }

  return null;
}

export function applicationLengthIssueMessage(issue: ApplicationLengthIssue): string {
  return `${issue.label}이 너무 길어요. 현재 ${issue.actual}자라서 GLS 저장 전에 실패할 수 있어요. ${issue.max}자 이내로 줄여서 다시 알려주세요.`;
}
