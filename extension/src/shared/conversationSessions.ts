import type {
  ApplicationState,
  ChatMessage,
  ConversationSessionSummary,
  ConversationStatus,
  FilledSlots,
} from './types';

export const ACTIVE_CONVERSATION_ID_KEY = 'gls_active_conversation_id_v1';
export const LEGACY_CONVERSATION_ID_KEY = 'gls_conversation_id_v1';
export const MAX_CONVERSATION_INDEX_ITEMS = 10;
export const MAX_CONVERSATION_TITLE_LENGTH = 36;

interface SummarySeed {
  id: string;
  status: ConversationStatus;
  title?: string | null;
  updatedAt?: string | null;
  lastFilledSlots?: FilledSlots | null;
  confirmedReservationLabel?: string | null;
  confirmedSpaceCode?: string | null;
  confirmedSpaceLabel?: string | null;
  messages?: ChatMessage[];
  firstUserMessage?: string | null;
  lastMessagePreview?: string | null;
}

interface SessionActivitySeed {
  status: ConversationStatus;
  messages?: ChatMessage[];
  lastFilledSlots?: FilledSlots | null;
  applicationState?: ApplicationState | null;
  confirmedReservationLabel?: string | null;
  lastMessagePreview?: string | null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max = 42): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function summarizeSlots(lastFilledSlots?: FilledSlots | null): string {
  if (!lastFilledSlots) return '';
  const parts: string[] = [];
  if (lastFilledSlots.date) parts.push(lastFilledSlots.date);
  if (lastFilledSlots.start_time) parts.push(lastFilledSlots.start_time);
  if (lastFilledSlots.headcount) parts.push(`${lastFilledSlots.headcount}명`);
  if (lastFilledSlots.building) parts.push(lastFilledSlots.building);
  return parts.join(' / ');
}

export function getFirstUserMessage(messages?: ChatMessage[]): string {
  const first = messages?.find((message) => message.role === 'user')?.content ?? '';
  return normalizeWhitespace(first);
}

export function getLastMessagePreview(messages?: ChatMessage[]): string {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i -= 1) {
    const content = messages?.[i]?.content;
    if (!content) continue;
    const normalized = normalizeWhitespace(content);
    if (normalized) return truncate(normalized, 60);
  }
  return '';
}

export function buildConversationTitle(seed: Omit<SummarySeed, 'id' | 'updatedAt'>): string {
  const cachedTitle = normalizeWhitespace(seed.title ?? '');
  if (cachedTitle) return truncate(cachedTitle, MAX_CONVERSATION_TITLE_LENGTH);

  const confirmedLabel = normalizeWhitespace(seed.confirmedReservationLabel ?? '');
  if (confirmedLabel && seed.status === 'completed') {
    return truncate(confirmedLabel, MAX_CONVERSATION_TITLE_LENGTH);
  }

  const firstUserMessage = normalizeWhitespace(
    seed.firstUserMessage ?? getFirstUserMessage(seed.messages),
  );
  if (firstUserMessage) return truncate(firstUserMessage, MAX_CONVERSATION_TITLE_LENGTH);

  const slotSummary = summarizeSlots(seed.lastFilledSlots);
  if (slotSummary) return truncate(slotSummary, MAX_CONVERSATION_TITLE_LENGTH);

  return '새 대화';
}

export function shouldAppearInConversationHistory(seed: SessionActivitySeed): boolean {
  const hasMessages = (seed.messages?.length ?? 0) > 0;
  const hasSlots = Boolean(seed.lastFilledSlots);
  const hasApplicationState = Boolean(seed.applicationState);
  const hasConfirmedLabel = normalizeWhitespace(seed.confirmedReservationLabel ?? '').length > 0;
  const hasPreview = normalizeWhitespace(seed.lastMessagePreview ?? '').length > 0;

  return hasMessages || hasSlots || hasApplicationState || hasConfirmedLabel || hasPreview;
}

export function makeConversationSessionSummary(
  seed: SummarySeed,
): ConversationSessionSummary {
  return {
    id: seed.id,
    title: buildConversationTitle(seed),
    status: seed.status,
    updatedAt: seed.updatedAt ?? new Date().toISOString(),
    lastMessagePreview:
      normalizeWhitespace(
        seed.lastMessagePreview ?? getLastMessagePreview(seed.messages),
      ) || '',
    confirmedReservationLabel: seed.confirmedReservationLabel ?? null,
    confirmedSpaceCode: seed.confirmedSpaceCode ?? null,
    confirmedSpaceLabel: seed.confirmedSpaceLabel ?? null,
  };
}

