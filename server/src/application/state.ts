import type {
  Action,
  ApplicationField,
  ApplicationRecommendation,
  ApplicationState,
  ConfidenceLevel,
  FilledSlots,
  ReservationDraftData,
  ReservationFormData,
  Signal,
  SuggestedApplicationMemory,
} from '../schemas/parse.js';
import type { LLMApplication } from '../llm/client.js';
import { isSearchReady } from '../../../shared/reservation/slotPolicy.js';

const APPLICATION_FIELDS: ApplicationField[] = [
  'organization',
  'eventName',
  'purpose',
  'hangsaGbCode',
];

const DEFAULT_CONFIDENCE: Record<ApplicationField, ConfidenceLevel> = {
  organization: 'low',
  eventName: 'low',
  purpose: 'low',
  hangsaGbCode: 'low',
};

const LABEL_TO_CODE: Record<string, string> = {
  '학생회/동아리': '111',
  '세미나/스터디': '113',
  '보충수업/특강/시험': '115',
  본부부서주관행사: '112',
  단과대학주관행사: '114',
  학과주관행사: '116',
  교외단체행사: '001',
  기타: '117',
};

const CODE_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(LABEL_TO_CODE).map(([label, code]) => [code, label]),
);

const FREQUENCY_THRESHOLD = 3;
const RECENT_MEMORY_WINDOW = 4;
const REUSE_SIGNAL_CONFIDENCE = 0.72;
const FREQUENCY_BASE_CONFIDENCE = 0.75;
const FREQUENCY_CONFIDENCE_STEP = 0.05;
const MAX_EVENT_NAME_LENGTH = 50;
const MAX_PURPOSE_LENGTH = 500;

export interface ConversationMemoryCandidate {
  conversationId: string;
  label: string;
  formData: ReservationFormData;
}

/** 빈도 통계가 붙은 재사용 후보 — LLM context 주입과 suggested_memory 조립에 함께 쓴다. */
export interface MemoryStat extends ConversationMemoryCandidate {
  count: number;
  isFrequent: boolean;
}

export interface BuildApplicationStateArgs {
  llmApplication: LLMApplication | null | undefined;
  filledSlots: FilledSlots;
  readyToSearch: boolean;
  memoryStats: MemoryStat[];
}

export interface BuildApplicationStateResult {
  applicationState: ApplicationState;
  /** 하드 검증(길이 초과)으로 LLM 메시지를 덮어써야 할 때만 설정. 그 외엔 null(=LLM 메시지 유지). */
  assistantMessageOverride: string | null;
}

interface ApplicationLengthIssue {
  field: Extract<ApplicationField, 'eventName' | 'purpose'>;
  label: string;
  max: number;
  actual: number;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cloneConfidence(
  confidence: Partial<Record<ApplicationField, ConfidenceLevel>> | undefined,
): Record<ApplicationField, ConfidenceLevel> {
  return {
    organization: confidence?.organization ?? 'low',
    eventName: confidence?.eventName ?? 'low',
    purpose: confidence?.purpose ?? 'low',
    hangsaGbCode: confidence?.hangsaGbCode ?? 'low',
  };
}

function computeMissingApplication(
  draft: ReservationDraftData | null,
  confidence: Record<ApplicationField, ConfidenceLevel>,
): ApplicationField[] {
  if (!draft) return [...APPLICATION_FIELDS];
  const missing: ApplicationField[] = [];
  if (!draft.organization.trim()) missing.push('organization');
  if (!draft.eventName.trim()) missing.push('eventName');
  if (!draft.purpose.trim()) missing.push('purpose');
  if (!draft.hangsaGbCode.trim() || confidence.hangsaGbCode === 'low') {
    missing.push('hangsaGbCode');
  }
  return missing;
}

function findApplicationLengthIssue(
  draft: ReservationDraftData | null,
): ApplicationLengthIssue | null {
  if (!draft) return null;
  const eventNameLength = normalizeWhitespace(draft.eventName).length;
  if (eventNameLength > MAX_EVENT_NAME_LENGTH) {
    return { field: 'eventName', label: '행사명', max: MAX_EVENT_NAME_LENGTH, actual: eventNameLength };
  }
  const purposeLength = normalizeWhitespace(draft.purpose).length;
  if (purposeLength > MAX_PURPOSE_LENGTH) {
    return { field: 'purpose', label: '사용목적', max: MAX_PURPOSE_LENGTH, actual: purposeLength };
  }
  return null;
}

function memoryGroupKey(formData: ReservationFormData): string {
  const org = normalizeWhitespace(formData.organization).toLowerCase();
  const event = normalizeWhitespace(formData.eventName).toLowerCase();
  return `${org}::${event}`;
}

/**
 * 재사용 후보별 빈도 통계 계산(deterministic). 같은 (주관단체, 행사명) 그룹의 크기를
 * 세고 FREQUENCY_THRESHOLD 이상이면 isFrequent. 재사용 제안 여부·문구는 LLM 이 결정한다.
 */
export function computeMemoryStats(memories: ConversationMemoryCandidate[]): MemoryStat[] {
  const groupCounts = new Map<string, number>();
  for (const memory of memories) {
    if (!memory.formData.organization.trim() || !memory.formData.eventName.trim()) continue;
    const key = memoryGroupKey(memory.formData);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }
  return memories.map((memory) => {
    const hasGroup =
      memory.formData.organization.trim() && memory.formData.eventName.trim();
    const count = hasGroup ? groupCounts.get(memoryGroupKey(memory.formData)) ?? 1 : 1;
    return { ...memory, count, isFrequent: hasGroup ? count >= FREQUENCY_THRESHOLD : false };
  });
}

function frequencyConfidence(count: number): number {
  return Math.min(
    0.95,
    FREQUENCY_BASE_CONFIDENCE + (count - FREQUENCY_THRESHOLD) * FREQUENCY_CONFIDENCE_STEP,
  );
}

/** LLM 이 고른 재사용 메모리 id 를 deterministic 통계로 SuggestedApplicationMemory 로 조립. */
function buildSuggestedMemoryFromId(
  id: string,
  memoryStats: MemoryStat[],
): SuggestedApplicationMemory | null {
  const stat = memoryStats.find((m) => m.conversationId === id);
  if (!stat) return null;
  if (stat.isFrequent) {
    return {
      conversationId: stat.conversationId,
      label: `최근 ${stat.count}회 같은 행사로 신청`,
      formData: stat.formData,
      reason: 'frequency',
      count: stat.count,
      frequency: `${stat.count}_in_recent_${RECENT_MEMORY_WINDOW}`,
      confidence: frequencyConfidence(stat.count),
    };
  }
  return {
    conversationId: stat.conversationId,
    label: stat.label,
    formData: stat.formData,
    reason: 'reuse_signal',
    count: null,
    frequency: 'reuse_signal',
    confidence: REUSE_SIGNAL_CONFIDENCE,
  };
}

function buildRecommendation(
  memory: SuggestedApplicationMemory | null,
): ApplicationRecommendation | null {
  if (!memory) return null;
  return {
    from_conversation_id: memory.conversationId,
    group: memory.formData.organization,
    event: memory.formData.eventName,
    category: hangsaLabelFromCode(memory.formData.hangsaGbCode),
    purpose: memory.formData.purpose,
    confidence: memory.confidence,
    frequency: memory.frequency,
  };
}

function normalizeSuggestedMemory(value: unknown): SuggestedApplicationMemory | null {
  if (!value || typeof value !== 'object') return null;
  const memory = value as Partial<SuggestedApplicationMemory>;
  if (
    typeof memory.conversationId !== 'string' ||
    typeof memory.label !== 'string' ||
    !memory.formData
  ) {
    return null;
  }

  const count = Number.parseInt(memory.label.match(/최근\s*(\d+)회/)?.[1] ?? '', 10);
  const hasFrequencyCount = Number.isFinite(count) && count > 0;
  const reason = memory.reason ?? (hasFrequencyCount ? 'frequency' : 'reuse_signal');
  const normalizedCount = memory.count ?? (hasFrequencyCount ? count : null);
  const frequency =
    memory.frequency ??
    (normalizedCount ? `${normalizedCount}_in_recent_${RECENT_MEMORY_WINDOW}` : 'reuse_signal');
  const confidence =
    memory.confidence ??
    (normalizedCount ? frequencyConfidence(normalizedCount) : REUSE_SIGNAL_CONFIDENCE);

  return {
    conversationId: memory.conversationId,
    label: memory.label,
    formData: memory.formData,
    reason,
    count: normalizedCount,
    frequency,
    confidence,
  };
}

export function hasCompleteReservationForm(
  draft: ReservationFormData | null,
): draft is ReservationFormData {
  return Boolean(
    draft &&
      draft.hangsaGbCode.trim() &&
      draft.organization.trim() &&
      draft.eventName.trim() &&
      draft.purpose.trim() &&
      draft.headcount > 0,
  );
}

export function summarizeReservationLabel(formData: ReservationFormData): string {
  const eventName = normalizeWhitespace(formData.eventName);
  const organization = normalizeWhitespace(formData.organization);
  if (!eventName) return organization || '예약 신청';
  if (!organization || eventName.includes(organization)) return eventName;
  return `${organization} ${eventName}`;
}

function draftFromLLM(
  llmDraft: LLMApplication['draft'],
  headcount: number | null,
): ReservationDraftData | null {
  if (!llmDraft) return null;
  const organization = (llmDraft.organization ?? '').trim();
  const eventName = (llmDraft.eventName ?? '').trim();
  const purpose = (llmDraft.purpose ?? '').trim();
  const hangsaGbCode = (llmDraft.hangsaGbCode ?? '').trim();
  // 전부 비어 있으면 draft 없음으로 취급(LLM 이 빈 객체를 넘기는 경우 방어).
  if (!organization && !eventName && !purpose && !hangsaGbCode) return null;
  return {
    organization,
    eventName,
    purpose,
    hangsaGbCode,
    headcount: headcount ?? 1,
  };
}

/**
 * LLM 의 application 결정을 ApplicationState 로 정규화한다(추출·분류는 하지 않는다).
 * - draft/confidence 는 LLM 출력 그대로 매핑.
 * - missing_application·길이 초과는 deterministic 검증(가드)으로 계산.
 * - suggested_memory 는 LLM 이 고른 id 를 서버 통계로 조립(표시 판단=LLM, 통계=서버).
 * - needs_application_collection 은 검색 준비됐거나 draft 가 있을 때만 true →
 *   슬롯이 비어 draft 도 없는 첫 턴엔 신청서 수집 단계로 빠지지 않는다.
 */
export function buildApplicationState(
  args: BuildApplicationStateArgs,
): BuildApplicationStateResult {
  const app = args.llmApplication ?? null;

  let suggestedMemory: SuggestedApplicationMemory | null = null;
  if (app?.suggest_reuse_memory_id) {
    suggestedMemory = buildSuggestedMemoryFromId(app.suggest_reuse_memory_id, args.memoryStats);
  }

  const draft = draftFromLLM(app?.draft ?? null, args.filledSlots.headcount);
  const confidence = draft ? cloneConfidence(app?.confidence) : { ...DEFAULT_CONFIDENCE };

  const missing = computeMissingApplication(draft, confidence);
  const lengthIssue = findApplicationLengthIssue(draft);
  if (lengthIssue && !missing.includes(lengthIssue.field)) {
    missing.unshift(lengthIssue.field);
  }

  const needsCollection = missing.length > 0 && (args.readyToSearch || draft != null);

  const applicationState: ApplicationState = {
    draft,
    missing_application: missing,
    needs_application_collection: needsCollection,
    suggested_memory: suggestedMemory,
    recommendation: buildRecommendation(suggestedMemory),
    confidence,
    source: draft ? 'conversation' : null,
  };

  const assistantMessageOverride = lengthIssue
    ? `${lengthIssue.label}이 너무 길어요. 현재 ${lengthIssue.actual}자라서 GLS 저장 전에 실패할 수 있어요. ${lengthIssue.max}자 이내로 줄여서 다시 알려주세요.`
    : null;

  return { applicationState, assistantMessageOverride };
}

export function parseStoredApplicationState(value: unknown): ApplicationState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ApplicationState>;
  if (!('missing_application' in candidate) || !('needs_application_collection' in candidate)) {
    return null;
  }
  return {
    draft: (candidate.draft as ReservationDraftData | null) ?? null,
    missing_application: Array.isArray(candidate.missing_application)
      ? (candidate.missing_application as ApplicationField[])
      : [...APPLICATION_FIELDS],
    needs_application_collection: Boolean(candidate.needs_application_collection),
    suggested_memory: normalizeSuggestedMemory(candidate.suggested_memory),
    recommendation:
      (candidate.recommendation as ApplicationRecommendation | null) ??
      buildRecommendation(normalizeSuggestedMemory(candidate.suggested_memory)),
    confidence: cloneConfidence(candidate.confidence as Record<ApplicationField, ConfidenceLevel>),
    source: (candidate.source as ApplicationState['source']) ?? null,
  };
}

export function parseStoredReservationForm(value: unknown): ReservationFormData | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReservationFormData>;
  if (
    typeof candidate.hangsaGbCode !== 'string' ||
    typeof candidate.organization !== 'string' ||
    typeof candidate.eventName !== 'string' ||
    typeof candidate.headcount !== 'number' ||
    typeof candidate.purpose !== 'string'
  ) {
    return null;
  }
  return {
    hangsaGbCode: candidate.hangsaGbCode,
    organization: candidate.organization,
    eventName: candidate.eventName,
    headcount: candidate.headcount,
    purpose: candidate.purpose,
  };
}

export function hangsaLabelFromCode(code: string): string {
  return CODE_TO_LABEL[code] ?? code;
}

// ────────────────────────────────────────────────────────────────────────────
// 전이 reducer — 화행(signal) + 값 diff 에서 action 을 결정론적으로 파생.
// (전환기: signal 은 당분간 intent 에서 매핑. P6 에서 LLM 직접 출력으로 대체.)
// ────────────────────────────────────────────────────────────────────────────

const SLOT_KEYS: (keyof FilledSlots)[] = [
  'date',
  'start_time',
  'end_time',
  'duration_min',
  'headcount',
  'campus',
  'building',
  'space',
];

function slotsEqual(a: FilledSlots | null, b: FilledSlots | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return SLOT_KEYS.every((k) => a[k] === b[k]);
}

export interface DeriveActionArgs {
  previousSlots: FilledSlots | null;
  nextSlots: FilledSlots;
  signal: Signal;
  /** 직전 턴에 제안된 공간이 있나(= 후보 리스트 존재). */
  hasCandidate: boolean;
  /** 신청서(application) 4필드가 모두 채워졌나. */
  appComplete: boolean;
}

export interface DeriveActionResult {
  action: Action;
  canSubmit: boolean;
}

/**
 * transition 부수효과(action) 결정. 강제 순서는 "필수필터→탐색→제출" 하나뿐이고,
 * slots/application 트랙은 병렬이라 순서를 강제하지 않는다.
 * - search: 필수슬롯이 막 완성됐거나(첫 탐색), 완성 상태에서 슬롯이 바뀜(cascade 재탐색)
 * - next_candidate: "다른 곳"(데이터 불변) + 후보 존재
 * - fill_form: accept + 제출 가능(폼만, 제출은 버튼)
 * cascade 비대칭: 슬롯 변경만 재탐색을 부른다. 신청서 변경은 후보를 유지한다.
 */
export function deriveAction(args: DeriveActionArgs): DeriveActionResult {
  const { previousSlots, nextSlots, signal, hasCandidate, appComplete } = args;
  const slotsComplete = isSearchReady(nextSlots);
  const slotsChanged = !slotsEqual(previousSlots, nextSlots);
  const prevComplete = isSearchReady(previousSlots);
  const canSubmit = hasCandidate && appComplete;

  let action: Action = 'none';
  switch (signal) {
    case 'cancel':
    case 'out_of_scope':
      action = 'none';
      break;
    case 'request_alternative':
      action = hasCandidate ? 'next_candidate' : 'none';
      break;
    case 'accept':
      action = canSubmit ? 'fill_form' : 'none';
      break;
    case 'info':
    default:
      // 첫 완성(!prevComplete) 또는 완성 상태에서의 슬롯 변경(cascade) → 탐색.
      action = slotsComplete && (slotsChanged || !prevComplete) ? 'search' : 'none';
      break;
  }

  return { action, canSubmit };
}
