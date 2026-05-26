import type {
  ApplicationField,
  ApplicationRecommendation,
  ApplicationState,
  ChatMessage,
  ConfidenceLevel,
  FilledSlots,
  Intent,
  ReservationFormData,
  SuggestedApplicationMemory,
} from '../schemas/parse.js';
import { ReservationFormData as ReservationFormDataSchema } from '../schemas/parse.js';
import { normalizeWhitespace } from './text.js';

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
  '본부부서주관행사': '112',
  '단과대학주관행사': '114',
  '학과주관행사': '116',
  '교외단체행사': '001',
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

const APPLICATION_COLLECTOR_PROMPT =
  '신청서에는 어떤 단체의 어떤 행사로 넣을까요? 예: 소프트웨어학과 학생회 정기회의';

export interface ConversationMemoryCandidate {
  conversationId: string;
  label: string;
  formData: ReservationFormData;
}

export interface BuildApplicationStateArgs {
  history: ChatMessage[];
  latestUserMessage: string;
  baseIntent: Intent;
  baseAssistantMessage: string;
  filledSlots: FilledSlots;
  readyToSearch: boolean;
  previousState: ApplicationState | null;
  memories: ConversationMemoryCandidate[];
}

export interface BuildApplicationStateResult {
  intent: Intent;
  assistantMessage: string;
  applicationState: ApplicationState;
}

interface DraftUpdateResult {
  draft: ReservationFormData;
  confidence: Record<ApplicationField, ConfidenceLevel>;
  source: ApplicationState['source'];
  touchedFields: Set<ApplicationField>;
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

function makeEmptyState(): ApplicationState {
  return {
    draft: null,
    missing_application: [...APPLICATION_FIELDS],
    needs_application_collection: true,
    suggested_memory: null,
    recommendation: null,
    confidence: { ...DEFAULT_CONFIDENCE },
    source: null,
  };
}

function cleanSentenceEnding(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/[.?!]+$/g, '')
      .replace(/(?:으로|로)?\s*바꿔줘요?$/g, '')
      .replace(/(?:으로|로)?\s*변경해줘요?$/g, '')
      .replace(/(?:으로|로)?\s*부탁해요?$/g, '')
      .replace(/(?:으로|로)?\s*해주세요?$/g, ''),
  );
}

function lastAssistantMessage(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'assistant') return history[i]!.content;
  }
  return '';
}

function containsScheduleSignal(text: string): boolean {
  return /(?:오늘|내일|모레|다음\s*주|이번\s*주|오전|오후|\d{1,2}\s*시|\d+\s*명|\d+\s*시간|\d+\s*분|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/.test(
    text,
  );
}

function hasReuseSignal(text: string): boolean {
  return /(지난번|저번|예전|같은 걸로|같은걸로|전에처럼|지난번처럼|저번처럼)/.test(text);
}

function isAffirmative(text: string): boolean {
  return /^(?:응|네|예|좋아|좋아요|맞아|맞아요|그래|그래요|사용할게|그걸로|그걸로 할게|추천 정보 사용)$/i.test(
    normalizeWhitespace(text),
  );
}

function isNegative(text: string): boolean {
  return /^(?:아니|아니요|말고|새로|새로 할게|직접 설명할게|새로 설명하기)$/i.test(
    normalizeWhitespace(text),
  );
}

function isLikelyApplicationDescription(text: string, history: ChatMessage[]): boolean {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 2) return false;
  const previousAssistant = lastAssistantMessage(history);
  if (previousAssistant.includes(APPLICATION_COLLECTOR_PROMPT)) return true;
  if (containsScheduleSignal(normalized)) return false;
  if (/(회의실|강의실|공간|예약|잡아줘|잡아\b)/.test(normalized)) return false;
  return /(학생회|동아리|세미나|스터디|회의|운영회의|정기회의|간담회|위원회|학과|학부|전공|연구실|랩|행사|특강|시험|총학생회|본부|센터)/.test(
    normalized,
  );
}

function baseDraft(headcount: number | null): ReservationFormData {
  return {
    hangsaGbCode: '',
    organization: '',
    eventName: '',
    headcount: headcount ?? 0,
    purpose: '',
  };
}

function withHeadcount(
  draft: ReservationFormData,
  headcount: number | null,
): ReservationFormData {
  return {
    ...draft,
    headcount: headcount ?? draft.headcount,
  };
}

function classifyHangsa(
  text: string,
): { code: string; confidence: ConfidenceLevel; clarification?: string } {
  const normalized = text.toLowerCase();
  if (/(학생회|동아리|총학생회|자치)/.test(normalized)) {
    return { code: '111', confidence: 'high' };
  }
  if (/(보충수업|특강|시험|고사|퀴즈|강연)/.test(normalized)) {
    return { code: '115', confidence: 'high' };
  }
  if (/(교외|외부|기업|협력사)/.test(normalized)) {
    return { code: '001', confidence: 'medium' };
  }
  if (/(단과대|대학 학생회|대학 행사)/.test(normalized)) {
    return { code: '114', confidence: 'medium' };
  }
  if (/(본부|행정실|입학처|교무|학생지원|센터)/.test(normalized)) {
    return { code: '112', confidence: 'medium' };
  }
  if (/(학과|학부|전공|연구실|랩)/.test(normalized)) {
    return { code: '116', confidence: 'medium' };
  }
  if (/(세미나|스터디|회의|미팅|간담회|워크숍|정기회의|운영회의)/.test(normalized)) {
    return {
      code: '113',
      confidence: 'low',
      clarification:
        '이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?',
    };
  }
  return {
    code: '117',
    confidence: 'low',
    clarification:
      '이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?',
  };
}

function extractOrganization(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const suffixPriority = [
    '총학생회',
    '학생회',
    '동아리',
    '위원회',
    '연구실',
    '행정실',
    '센터',
    '본부',
    '팀',
    '학과',
    '학부',
    '전공',
    '랩',
  ];

  for (const suffix of suffixPriority) {
    const index = normalized.indexOf(suffix);
    if (index < 0) continue;
    return normalizeWhitespace(normalized.slice(0, index + suffix.length));
  }

  return null;
}

function extractExplicitField(
  text: string,
  label: string,
): string | null {
  const nextField =
    '(?:주관단체|단체|행사명|사용목적|목적|행사구분)(?:만|은|는)?\\s*[:：]?';
  const match = text.match(
    new RegExp(`${label}(?:만|은|는)?\\s*[:：]?\\s*(.+?)(?=\\s*${nextField}|$)`),
  );
  if (!match?.[1]) return null;
  return cleanSentenceEnding(match[1]);
}

function extractFieldUpdates(
  text: string,
  currentDraft: ReservationFormData | null,
  filledSlots: FilledSlots,
): DraftUpdateResult | null {
  const normalized = normalizeWhitespace(text);
  const nextDraft = withHeadcount(
    currentDraft ?? baseDraft(filledSlots.headcount),
    filledSlots.headcount,
  );
  const nextConfidence = cloneConfidence(undefined);
  if (currentDraft) {
    nextConfidence.organization = 'medium';
    nextConfidence.eventName = 'medium';
    nextConfidence.purpose = 'medium';
    nextConfidence.hangsaGbCode = 'medium';
  }
  const touchedFields = new Set<ApplicationField>();

  const organization = extractExplicitField(normalized, '(?:주관단체|단체)');
  if (organization) {
    nextDraft.organization = organization;
    nextConfidence.organization = 'high';
    touchedFields.add('organization');
  }

  const eventName = extractExplicitField(normalized, '행사명');
  if (eventName) {
    nextDraft.eventName = eventName;
    nextConfidence.eventName = 'high';
    touchedFields.add('eventName');
  }

  const purpose = extractExplicitField(normalized, '(?:사용목적|목적)');
  if (purpose) {
    nextDraft.purpose = purpose;
    nextConfidence.purpose = 'high';
    touchedFields.add('purpose');
  }

  if (/행사구분/.test(normalized)) {
    const hangsa = classifyHangsa(normalized);
    nextDraft.hangsaGbCode = hangsa.code;
    nextConfidence.hangsaGbCode = hangsa.confidence;
    touchedFields.add('hangsaGbCode');
  }

  if (touchedFields.size === 0) return null;

  if (touchedFields.has('eventName') && !touchedFields.has('purpose')) {
    nextDraft.purpose = `${nextDraft.eventName} 진행`;
    nextConfidence.purpose = 'medium';
  }

  return {
    draft: nextDraft,
    confidence: nextConfidence,
    source: 'user_modified',
    touchedFields,
  };
}

function deriveDraftFromDescription(
  text: string,
  filledSlots: FilledSlots,
  currentDraft: ReservationFormData | null,
): DraftUpdateResult | null {
  const normalized = cleanSentenceEnding(text);
  if (!normalized) return null;

  const organization = extractOrganization(normalized);
  const hangsa = classifyHangsa(normalized);
  const draft = withHeadcount(
    currentDraft ?? baseDraft(filledSlots.headcount),
    filledSlots.headcount,
  );
  const confidence = cloneConfidence(undefined);

  if (organization) {
    draft.organization = organization;
    confidence.organization = 'high';
  }

  draft.eventName = normalized;
  confidence.eventName = 'medium';

  draft.purpose =
    extractExplicitField(normalized, '(?:사용목적|목적)') ??
    `${normalized} 진행`;
  confidence.purpose = /(?:사용목적|목적)/.test(normalized) ? 'high' : 'medium';

  draft.hangsaGbCode = hangsa.code;
  confidence.hangsaGbCode = hangsa.confidence;

  return {
    draft,
    confidence,
    source: currentDraft ? 'user_modified' : 'conversation',
    touchedFields: new Set<ApplicationField>(APPLICATION_FIELDS),
  };
}

function applyHangsaOnlyUpdate(
  text: string,
  currentDraft: ReservationFormData,
  currentConfidence: Record<ApplicationField, ConfidenceLevel>,
): DraftUpdateResult {
  const hangsa = classifyHangsa(text);
  return {
    draft: {
      ...currentDraft,
      hangsaGbCode: hangsa.code,
    },
    confidence: {
      ...currentConfidence,
      hangsaGbCode: hangsa.confidence,
    },
    source: 'user_modified',
    touchedFields: new Set<ApplicationField>(['hangsaGbCode']),
  };
}

function computeMissingApplication(
  draft: ReservationFormData | null,
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

function extractTokens(text: string): string[] {
  return normalizeWhitespace(text)
    .replace(/[^\p{Script=Hangul}\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) =>
      token.length > 1 &&
      ![
        '예약',
        '회의실',
        '공간',
        '잡아줘',
        '잡아',
        '신청',
        '오늘',
        '내일',
        '다음',
        '오후',
        '오전',
        '지난번',
        '지난번처럼',
        '저번',
        '저번처럼',
        '예전',
        '예전처럼',
      ].includes(token),
    );
}

function memoryGroupKey(formData: ReservationFormData): string {
  const org = normalizeWhitespace(formData.organization).toLowerCase();
  const event = normalizeWhitespace(formData.eventName).toLowerCase();
  return `${org}::${event}`;
}

function pickSuggestedMemory(
  text: string,
  memories: ConversationMemoryCandidate[],
): SuggestedApplicationMemory | null {
  if (memories.length === 0) return null;

  // An explicit "지난번처럼 ..." request should beat aggregate frequency.
  // Otherwise a user's dominant recurring pattern can override a clearly named
  // but less frequent prior reservation.
  const reuseSuggestion = pickReuseSignalMemory(text, memories);
  if (reuseSuggestion) return reuseSuggestion;

  // Path 1: frequency-based — same (organization, eventName) combo ≥ FREQUENCY_THRESHOLD
  const groups = new Map<string, ConversationMemoryCandidate[]>();
  for (const memory of memories) {
    if (!memory.formData.organization.trim() || !memory.formData.eventName.trim()) continue;
    const key = memoryGroupKey(memory.formData);
    const group = groups.get(key);
    if (group) {
      group.push(memory);
    } else {
      groups.set(key, [memory]);
    }
  }

  let bestGroup: { candidates: ConversationMemoryCandidate[]; count: number } | null = null;
  for (const candidates of groups.values()) {
    if (candidates.length >= FREQUENCY_THRESHOLD) {
      if (!bestGroup || candidates.length > bestGroup.count) {
        bestGroup = { candidates, count: candidates.length };
      }
    }
  }

  if (bestGroup) {
    const mostRecent = bestGroup.candidates[0]!;
    const count = bestGroup.count;
    return {
      conversationId: mostRecent.conversationId,
      label: `최근 ${count}회 같은 행사로 신청`,
      formData: mostRecent.formData,
      reason: 'frequency',
      count,
      frequency: `${count}_in_recent_${RECENT_MEMORY_WINDOW}`,
      confidence: Math.min(
        0.95,
        FREQUENCY_BASE_CONFIDENCE + (count - FREQUENCY_THRESHOLD) * FREQUENCY_CONFIDENCE_STEP,
      ),
    };
  }

  return null;
}

function pickReuseSignalMemory(
  text: string,
  memories: ConversationMemoryCandidate[],
): SuggestedApplicationMemory | null {
  if (!hasReuseSignal(text)) return null;

  const tokens = extractTokens(text);
  let best: { memory: ConversationMemoryCandidate; score: number } | null = null;
  for (const memory of memories) {
    const haystack = `${memory.label} ${memory.formData.organization} ${memory.formData.eventName}`.toLowerCase();
    const overlap = tokens.reduce(
      (count, token) => count + (haystack.includes(token) ? 1 : 0),
      0,
    );
    const score = overlap * 10 + 40;
    if (!best || score > best.score) {
      best = { memory, score };
    }
  }

  if (!best) return null;
  if (tokens.length > 0 && best.score <= 40) return null;

  return {
    conversationId: best.memory.conversationId,
    label: best.memory.label,
    formData: best.memory.formData,
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
    (normalizedCount
      ? Math.min(
          0.95,
          FREQUENCY_BASE_CONFIDENCE +
            (normalizedCount - FREQUENCY_THRESHOLD) * FREQUENCY_CONFIDENCE_STEP,
        )
      : REUSE_SIGNAL_CONFIDENCE);

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

export function buildApplicationState(
  args: BuildApplicationStateArgs,
): BuildApplicationStateResult {
  const latestUser = normalizeWhitespace(args.latestUserMessage);
  const previousState = args.previousState ?? makeEmptyState();
  let nextIntent = args.baseIntent;
  let draft = previousState.draft ? withHeadcount(previousState.draft, args.filledSlots.headcount) : null;
  let confidence = cloneConfidence(previousState.confidence);
  let source = previousState.source;
  let suggestedMemory = previousState.suggested_memory;
  let assistantMessage = args.baseAssistantMessage;

  if (suggestedMemory && isAffirmative(latestUser)) {
    draft = withHeadcount(suggestedMemory.formData, args.filledSlots.headcount);
    confidence = {
      organization: 'high',
      eventName: 'high',
      purpose: 'high',
      hangsaGbCode: 'high',
    };
    source = 'memory';
    suggestedMemory = null;
    nextIntent = 'modify_application';
    assistantMessage = '지난번 신청 정보를 불러왔어요. 아래 카드에서 확인해 주세요.';
  } else if (suggestedMemory && isNegative(latestUser)) {
    suggestedMemory = null;
    draft = null;
    confidence = { ...DEFAULT_CONFIDENCE };
    source = null;
    nextIntent = 'modify_application';
    assistantMessage = APPLICATION_COLLECTOR_PROMPT;
  } else {
    const updates = extractFieldUpdates(latestUser, draft, args.filledSlots);
    if (updates) {
      draft = updates.draft;
      confidence = updates.confidence;
      source = updates.source;
      nextIntent = 'modify_application';
      assistantMessage = '신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.';
    } else if (
      draft &&
      previousState.missing_application.includes('hangsaGbCode') &&
      /(학생회|동아리|학과|학부|전공|세미나|스터디)/.test(latestUser)
    ) {
      const hangsaOnly = applyHangsaOnlyUpdate(latestUser, draft, confidence);
      draft = hangsaOnly.draft;
      confidence = hangsaOnly.confidence;
      source = hangsaOnly.source;
      nextIntent = 'modify_application';
      assistantMessage = '행사구분을 반영했어요. 아래 카드에서 확인해 주세요.';
    } else if (isLikelyApplicationDescription(latestUser, args.history)) {
      const derived = deriveDraftFromDescription(latestUser, args.filledSlots, draft);
      if (derived) {
        draft = derived.draft;
        confidence = derived.confidence;
        source = derived.source;
        nextIntent = 'modify_application';
        assistantMessage = '신청 정보를 이렇게 채울게요. 아래 카드에서 확인해 주세요.';
      }
    }
  }

  if (!draft && !suggestedMemory) {
    suggestedMemory = pickSuggestedMemory(latestUser, args.memories);
    if (suggestedMemory) {
      assistantMessage = suggestedMemory.label.startsWith('최근')
        ? `${suggestedMemory.label}했어요. 같은 정보로 작성할까요?`
        : `지난번 ${suggestedMemory.label} 정보를 추천할게요. 카드에서 선택하거나 새로 설명해 주세요.`;
    }
  }

  const missing = computeMissingApplication(draft, confidence);
  const needsCollection = missing.length > 0;

  if (needsCollection && draft && missing.length === 1 && missing[0] === 'hangsaGbCode') {
    assistantMessage =
      '이 일정은 학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?';
  } else if (!draft && !suggestedMemory && nextIntent === 'modify_application') {
    assistantMessage = APPLICATION_COLLECTOR_PROMPT;
  }

  const applicationState: ApplicationState = {
    draft,
    missing_application: missing,
    needs_application_collection: needsCollection,
    suggested_memory: suggestedMemory,
    recommendation: buildRecommendation(suggestedMemory),
    confidence,
    source,
  };

  return {
    intent: nextIntent,
    assistantMessage,
    applicationState,
  };
}

export function parseStoredApplicationState(value: unknown): ApplicationState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ApplicationState>;
  if (!('missing_application' in candidate) || !('needs_application_collection' in candidate)) {
    return null;
  }
  return {
    draft: (candidate.draft as ReservationFormData | null) ?? null,
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
  const parsed = ReservationFormDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function hangsaLabelFromCode(code: string): string {
  return CODE_TO_LABEL[code] ?? code;
}
