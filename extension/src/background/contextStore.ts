import type {
  ApplicationState,
  AutomationStatus,
  ChatMessage,
  ConversationStatus,
  FilledSlots,
  Intent,
  ReservationFormData,
  SpaceCandidate,
} from '../shared/types';

export interface PendingStartRequest {
  conversationId: string;
  slots: FilledSlots;
  candidates?: SpaceCandidate[];
  pendingFormData?: ReservationFormData;
}

export interface ConversationContext {
  conversationId: string;
  title: string | null;
  history: ChatMessage[];
  lastIntent: Intent | null;
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  conversationStatus: ConversationStatus;
  confirmedReservationLabel: string | null;
  confirmedSpaceCode: string | null;
  confirmedSpaceLabel: string | null;
  updatedAt: string;
  lastStatus: AutomationStatus;
  pendingStart: PendingStartRequest | null;
  lastProposed: SpaceCandidate | null;
  loginPrompt:
    | {
        variant: 'needed' | 'expired';
        tabId: number | null;
      }
    | null;
}

const SESSION_KEY = 'sw_contexts_v1';

export const contexts = new Map<string, ConversationContext>();
export const pendingStarts = new Map<string, PendingStartRequest>();

export async function persistContexts(): Promise<void> {
  try {
    const obj: Record<string, ConversationContext> = {};
    for (const [k, v] of contexts) obj[k] = v;
    await chrome.storage.session.set({ [SESSION_KEY]: obj });
  } catch {
    // session storage may not be available — non-fatal.
  }
}

export async function rehydrateContexts(): Promise<void> {
  try {
    const got = await chrome.storage.session.get(SESSION_KEY);
    const obj = got?.[SESSION_KEY] as Record<string, ConversationContext> | undefined;
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) contexts.set(k, v);
  } catch {
    // ignore
  }
}

export function getOrCreateContext(conversationId: string): ConversationContext {
  let ctx = contexts.get(conversationId);
  if (!ctx) {
    ctx = {
      conversationId,
      title: null,
      history: [],
      lastIntent: null,
      lastFilledSlots: null,
      applicationState: null,
      conversationStatus: 'active',
      confirmedReservationLabel: null,
      confirmedSpaceCode: null,
      confirmedSpaceLabel: null,
      updatedAt: new Date().toISOString(),
      lastStatus: { kind: 'idle' },
      pendingStart: null,
      lastProposed: null,
      loginPrompt: null,
    };
    contexts.set(conversationId, ctx);
  } else {
    ctx.conversationStatus ??= 'active';
    ctx.title ??= null;
    ctx.confirmedReservationLabel ??= null;
    ctx.confirmedSpaceCode ??= null;
    ctx.confirmedSpaceLabel ??= null;
    ctx.updatedAt ??= new Date().toISOString();
    ctx.loginPrompt ??= null;
  }
  return ctx;
}

export function isLoginCompleteUrl(url?: string): boolean {
  return !!url && url.startsWith('https://kingoinfo.skku.edu/');
}

export function setLoginPrompt(
  conversationId: string,
  prompt:
    | {
        variant: 'needed' | 'expired';
        tabId: number | null;
      }
    | null,
): void {
  const ctx = getOrCreateContext(conversationId);
  ctx.loginPrompt = prompt;
  void persistContexts();
}

export function clearLoginPrompt(conversationId: string): void {
  setLoginPrompt(conversationId, null);
}
