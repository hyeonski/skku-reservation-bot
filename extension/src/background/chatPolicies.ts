import type {
  ApplicationState,
  FilledSlots,
  ParseResult,
  ReservationFormData,
} from '../shared/types';
import { emptyFilledSlots } from '../../../shared/reservation/slotPolicy';

const REPEAT_SCHEDULE_PATTERN = /매주|매달|매월|매일|격주|정기적으로|이번\s*달.*(?:매주|매일)/;
const REPEAT_RESERVATION_PATTERN = /(?:반복|정기)\s*(?:예약|신청|대여|사용|일정|패턴)/;
const RESERVATION_REPEAT_PATTERN =
  /(?:예약|신청|대여|사용|빌리|잡아|잡아줘|잡아\s*줘).{0,12}(?:반복|정기)|(?:반복|정기).{0,12}(?:예약|신청|대여|사용|빌리|잡아|잡아줘|잡아\s*줘)/;
const APPLICATION_FIELD_LABEL_PATTERN =
  '(?:주관단체|단체|행사명|행사구분|사용목적|목적|행사인원|인원)';

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function repeatPolicyText(text: string): string {
  const lineFiltered = text
    .split('\n')
    .filter((line) => !/^\s*(?:주관단체|행사명|행사구분|사용목적)\s*:/.test(line))
    .join('\n');

  return lineFiltered.replace(
    new RegExp(
      `${APPLICATION_FIELD_LABEL_PATTERN}(?:만|은|는|을|를)?(?=\\s|[:：]|$)\\s*[:：]?\\s*.*?(?=\\s*(?:그리고|,|;)?\\s*${APPLICATION_FIELD_LABEL_PATTERN}(?:만|은|는|을|를)?(?=\\s|[:：]|$)\\s*[:：]?|$)`,
      'g',
    ),
    ' ',
  );
}

function hasRepeatReservationCondition(text: string): boolean {
  const normalized = normalizeWhitespace(repeatPolicyText(text));
  if (!normalized) return false;
  if (REPEAT_SCHEDULE_PATTERN.test(normalized)) return true;
  if (REPEAT_RESERVATION_PATTERN.test(normalized)) return true;
  return RESERVATION_REPEAT_PATTERN.test(normalized);
}

export function emptyApplicationState(): ApplicationState {
  // 기본값은 "아직 수집할 신청서 없음" — 슬롯도 없는 첫 턴/취소/오류 폴백에서
  // 신청서 수집 단계로 잘못 빠지지 않도록 needs=false. (수집 시작 여부는 서버 LLM 이 결정)
  return {
    draft: null,
    missing_application: [],
    needs_application_collection: false,
    suggested_memory: null,
    recommendation: null,
    confidence: {
      organization: 'low',
      eventName: 'low',
      purpose: 'low',
      hangsaGbCode: 'low',
    },
    source: null,
  };
}

function mostlyEnglishReservationRequest(text: string): boolean {
  const latinLetters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const hangulLetters = text.match(/\p{Script=Hangul}/gu)?.length ?? 0;
  if (latinLetters < 8) return false;
  if (hangulLetters === 0) return true;
  return /\b(?:book|reserve|reservation|room|meeting|people|person|pm|am)\b/i.test(text) &&
    latinLetters > hangulLetters;
}

function hasUnsupportedFacilityCondition(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  const hasFacilityKeyword =
    /빔\s*프로젝터|프로젝터|화이트\s*보드|칠판|마이크|스피커|모니터|컴퓨터|\bpc\b|콘센트|hdmi|음향|장비/i.test(
      normalized,
    );
  if (!hasFacilityKeyword) return false;

  return !/(?:시설|장비|프로젝터|화이트\s*보드|칠판|마이크|스피커|모니터|컴퓨터|\bpc\b|콘센트|hdmi|음향).{0,12}(?:필수(?:는)?\s*아니|필요\s*없|상관\s*없|없어도)|(?:필수(?:는)?\s*아니|필요\s*없|상관\s*없|없어도).{0,12}(?:시설|장비|프로젝터|화이트\s*보드|칠판|마이크|스피커|모니터|컴퓨터|\bpc\b|콘센트|hdmi|음향)/i.test(
    normalized,
  );
}

function asksToChangeSubmittedReservation(text: string): boolean {
  if (!/(예약|신청)/.test(text)) return false;
  if (!/(취소|변경|수정)/.test(text)) return false;
  return /(방금|이미|완료|제출|저장|신청한|예약한|했던|지난번|이전)/.test(text);
}

export function asksForCandidateList(text: string): boolean {
  return /(여러\s*개|후보.*(?:목록|리스트|비교)|비교해서|같이\s*보여)/.test(text);
}

function asksForSpecificRoomAvailabilityWindow(text: string): boolean {
  const normalized = text.trim();
  if (!/(언제|몇\s*시|빈\s*(?:시간|날짜|때)|가능한\s*(?:시간|날짜|때)|비어|비는|남는|가용)/.test(normalized)) {
    return false;
  }
  return /(?:그|이|해당|원하는)\s*(?:방|공간|곳)|빈\s*시간|언제\s*비어/.test(normalized);
}

export function unsupportedAvailabilityWindowMessage(): string {
  return '특정 공간의 빈 시간대를 자동으로 훑어 제안하는 기능은 아직 지원하지 않아요. 원하는 날짜와 시간을 하나 정해서 다시 요청해 주세요. 지금 조건으로 다른 공간을 찾고 싶다면 "다른 공간"이라고 알려주세요.';
}

export function applyChatSafetyOverride(
  result: ParseResult,
  latestMessage: string,
  previousApplicationState: ApplicationState | null,
  previousSlots: FilledSlots | null,
): ParseResult {
  // 지원범위 밖 요청은 안내만 하고 누적 데이터(slots/application)는 보존한다 — self-loop.
  const preservedSlots = previousSlots ?? emptyFilledSlots();
  const preservedApplication = previousApplicationState ?? result.application_state;
  if (mostlyEnglishReservationRequest(latestMessage)) {
    return {
      ...result,
      filled_slots: preservedSlots,
      signal: 'out_of_scope',
      action: 'none',
      ready_to_search: false,
      assistant_message:
        '현재는 한국어 예약 요청만 안정적으로 처리할 수 있어요. 날짜, 시간, 인원을 한국어로 다시 알려주세요.',
      application_state: preservedApplication,
    };
  }

  if (hasRepeatReservationCondition(latestMessage)) {
    return {
      ...result,
      signal: 'out_of_scope',
      action: 'none',
      ready_to_search: false,
      assistant_message:
        '반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.',
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  if (hasUnsupportedFacilityCondition(latestMessage)) {
    return {
      ...result,
      signal: 'out_of_scope',
      action: 'none',
      ready_to_search: false,
      assistant_message:
        '빔프로젝터, 화이트보드 같은 시설·장비 조건은 아직 GLS에서 자동 확인할 수 없어요. 날짜, 시간, 인원 기준으로만 찾을 수 있습니다.',
      application_state: previousApplicationState ?? emptyApplicationState(),
    };
  }

  if (asksToChangeSubmittedReservation(latestMessage)) {
    return {
      ...result,
      signal: 'out_of_scope',
      action: 'none',
      ready_to_search: false,
      assistant_message:
        '이미 저장되거나 제출된 예약의 취소·변경은 이 확장에서 대신 처리하지 않아요. GLS 화면에서 직접 확인해 주세요.',
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  if (asksForSpecificRoomAvailabilityWindow(latestMessage)) {
    return {
      ...result,
      signal: 'out_of_scope',
      action: 'none',
      ready_to_search: false,
      assistant_message: unsupportedAvailabilityWindowMessage(),
      application_state: previousApplicationState ?? result.application_state,
    };
  }

  return result;
}
