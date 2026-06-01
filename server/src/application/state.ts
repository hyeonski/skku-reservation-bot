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
const MAX_EVENT_NAME_LENGTH = 50;
const MAX_PURPOSE_LENGTH = 500;

const APPLICATION_COLLECTOR_PROMPT =
  '신청서에는 어떤 단체의 어떤 행사로 넣을까요? 예: 소프트웨어학과 학생회 정기회의';
const APPLICATION_FIELD_LABEL_PATTERN =
  '(?:행사명|주관단체|단체|사용목적|목적|행사구분|행사인원|인원)';

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

interface ApplicationLengthIssue {
  field: Extract<ApplicationField, 'eventName' | 'purpose'>;
  label: string;
  max: number;
  actual: number;
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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanSentenceEnding(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/[.?!]+$/g, '')
      .replace(/(?:으로|로)?\s*(?:바꾸고|바꿔줘요?|바꿔|변경하고|변경해줘요?|변경|수정하고|수정해줘요?|수정)$/g, '')
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
  return /(학생회|동아리|세미나|스터디|회의|운영회의|정기회의|간담회|위원회|학회|학과|학부|전공|연구실|랩|행사|활동|모임|워크숍|특강|시험|총학생회|본부|센터|팀)/.test(
    normalized,
  );
}

function isApplicationCollectionFollowUp(text: string, previousState: ApplicationState): boolean {
  const normalized = normalizeWhitespace(text);
  if (!previousState.needs_application_collection) return false;
  if (normalized.length < 2) return false;
  if (isAffirmative(normalized) || isNegative(normalized)) return false;
  if (containsScheduleSignal(normalized)) return false;
  if (
    /(회의실|강의실|공간|예약|신청|잡아줘|잡아\b|찾아줘|찾아\s*줘|빌려줘|빌려\s*줘|비어|빈\s*시간|가능|다른\s*공간|취소|중단)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return true;
}

function stripScheduleAndReservationWords(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, ' ')
      .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*[월화수목금토일](?:요일)?)?/g, ' ')
      .replace(/(?:오늘|내일|모레|이번\s*주|다음\s*주)\s*[월화수목금토일]?(?:요일)?/g, ' ')
      .replace(/(?:오전|오후)?\s*\d{1,2}\s*시(?!간)(?:\s*\d{1,2}\s*분)?(?:부터|까지)?/g, ' ')
      .replace(/\d+\s*(?:시간|분|명)/g, ' ')
      .replace(/(?:회의실|강의실|공간|호실|예약|신청|잡아줘|잡아 줘|찾아줘|찾아 줘|빌려줘|빌려 줘|해줘|해주세요)/g, ' ')
      .replace(/[,\-/~]+/g, ' '),
  );
}

function extractInlineApplicationDescription(text: string): string | null {
  const cleaned = stripScheduleAndReservationWords(text).replace(/\s*목적으로$/g, '');
  if (cleaned.length < 3) return null;
  if (
    !/(학생회|동아리|세미나|스터디|회의|운영회의|정기회의|간담회|위원회|학과|학부|전공|연구실|랩|행사|특강|시험|총학생회|본부|센터|E2E|테스트|검증)/i.test(
      cleaned,
    )
  ) {
    return null;
  }
  return cleaned;
}

function baseDraft(headcount: number | null): ReservationFormData {
  return {
    hangsaGbCode: '',
    organization: '',
    eventName: '',
    headcount: headcount ?? 1,
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
  if (/(세미나|스터디)/.test(normalized)) {
    return { code: '113', confidence: 'high' };
  }
  if (/(회의|미팅|간담회|워크숍|정기회의|운영회의)/.test(normalized)) {
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
  const match =
    normalized.match(/(.+?(?:학생회|동아리|총학생회|학회|연구실|랩|센터|본부|행정실|팀))/) ??
    normalized.match(/(.+?(?:학과|학부|전공|위원회))/);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function extractExplicitField(
  text: string,
  label: string,
): string | null {
  const match = text.match(
    new RegExp(
      `${label}(?:만|은|는|을|를)?(?=\\s|[:：]|$)\\s*[:：]?\\s*(.+?)(?=\\s*(?:그리고|,|;)?\\s*${APPLICATION_FIELD_LABEL_PATTERN}(?:만|은|는|을|를)?(?=\\s|[:：]|$)\\s*[:：]?|$)`,
    ),
  );
  if (!match?.[1]) return null;
  return cleanSentenceEnding(match[1]);
}

function extractHeadcountUpdate(text: string): number | null {
  const match = text.match(
    /^(?:아니(?:요)?\s*)?(?:행사\s*)?(?:인원(?:은|을|는)?\s*)?(\d+)\s*명(?:으로)?\s*(?:(?:바꿔?|변경|수정)(?:해줘|해주세요)?)?$/,
  );
  if (!match?.[1]) return null;
  const headcount = Number.parseInt(match[1], 10);
  return Number.isFinite(headcount) && headcount > 0 ? headcount : null;
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
  let changed =
    currentDraft != null &&
    filledSlots.headcount != null &&
    currentDraft.headcount !== filledSlots.headcount;

  const organization = extractExplicitField(normalized, '(?:주관단체|단체)');
  if (organization) {
    nextDraft.organization = organization;
    nextConfidence.organization = 'high';
    touchedFields.add('organization');
    changed = true;
  }

  const eventName = extractExplicitField(normalized, '행사명');
  if (eventName) {
    nextDraft.eventName = eventName;
    nextConfidence.eventName = 'high';
    touchedFields.add('eventName');
    changed = true;
  }

  const purpose = extractExplicitField(normalized, '(?:사용목적|목적)');
  if (purpose) {
    nextDraft.purpose = purpose;
    nextConfidence.purpose = 'high';
    touchedFields.add('purpose');
    changed = true;
  }

  if (/행사구분/.test(normalized)) {
    const hangsa = classifyHangsa(normalized);
    nextDraft.hangsaGbCode = hangsa.code;
    nextConfidence.hangsaGbCode = hangsa.confidence;
    touchedFields.add('hangsaGbCode');
    changed = true;
  }

  const headcount = extractHeadcountUpdate(normalized);
  if (headcount && headcount !== nextDraft.headcount) {
    nextDraft.headcount = headcount;
    changed = true;
  }

  if (!changed) return null;

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

function findApplicationLengthIssue(
  draft: ReservationFormData | null,
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

  // Path 2: reuse-signal fallback — "지난번처럼" etc.
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
  const draftHeadcountChanged =
    previousState.draft != null &&
    args.filledSlots.headcount != null &&
    previousState.draft.headcount !== args.filledSlots.headcount;
  let draft = previousState.draft ? withHeadcount(previousState.draft, args.filledSlots.headcount) : null;
  let confidence = cloneConfidence(previousState.confidence);
  let source: ApplicationState['source'] = draftHeadcountChanged
    ? 'user_modified'
    : previousState.source;
  let suggestedMemory = previousState.suggested_memory;
  let assistantMessage = args.baseAssistantMessage;
  if (draftHeadcountChanged) {
    nextIntent = 'modify_application';
    suggestedMemory = null;
  }
  const onlyMissingHangsa =
    previousState.missing_application.length === 1 &&
    previousState.missing_application[0] === 'hangsaGbCode';

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
      onlyMissingHangsa &&
      /(학생회|동아리|학과|학부|전공|세미나|스터디)/.test(latestUser)
    ) {
      const hangsaOnly = applyHangsaOnlyUpdate(latestUser, draft, confidence);
      draft = hangsaOnly.draft;
      confidence = hangsaOnly.confidence;
      source = hangsaOnly.source;
      nextIntent = 'modify_application';
      assistantMessage = '행사구분을 반영했어요. 아래 카드에서 확인해 주세요.';
    } else if (
      isLikelyApplicationDescription(latestUser, args.history) ||
      isApplicationCollectionFollowUp(latestUser, previousState)
    ) {
      const derived = deriveDraftFromDescription(latestUser, args.filledSlots, draft);
      if (derived) {
        draft = derived.draft;
        confidence = derived.confidence;
        source = derived.source;
        nextIntent = 'modify_application';
        assistantMessage = '신청 정보를 이렇게 채울게요. 아래 카드에서 확인해 주세요.';
      }
    } else if (args.readyToSearch && !draft) {
      const inlineDescription = extractInlineApplicationDescription(latestUser);
      const derived = inlineDescription
        ? deriveDraftFromDescription(inlineDescription, args.filledSlots, draft)
        : null;
      if (derived) {
        draft = derived.draft;
        confidence = derived.confidence;
        source = derived.source;
        nextIntent = 'modify_application';
        assistantMessage = '요청에 포함된 행사 정보를 신청서 초안에 반영했어요. 아래 카드에서 확인해 주세요.';
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

  const lengthIssue = findApplicationLengthIssue(draft);
  const missing = computeMissingApplication(draft, confidence);
  if (lengthIssue && !missing.includes(lengthIssue.field)) {
    missing.unshift(lengthIssue.field);
  }
  const needsCollection = missing.length > 0;

  if (lengthIssue) {
    assistantMessage = `${lengthIssue.label}이 너무 길어요. 현재 ${lengthIssue.actual}자라서 GLS 저장 전에 실패할 수 있어요. ${lengthIssue.max}자 이내로 줄여서 다시 알려주세요.`;
  } else if (needsCollection && draft && missing.length === 1 && missing[0] === 'hangsaGbCode') {
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
