/**
 * 사이드패널의 대화 상태 + background 메시지 통합 훅.
 *
 * 책임:
 * - 메시지/슬롯/applicationState/automationStatus 로컬 state 관리 (클라이언트 권위 — D-018)
 * - 사용자 입력 시 POPUP_CHAT_REQUEST 송신, BG_CHAT_RESPONSE 의 ParseResult 반영
 * - ready_to_search 이면 자동으로 POPUP_START_SEARCH 송신 (결정 #1 — 별도 확인 단계 없음)
 * - BG_STATUS_UPDATE, BG_SEARCH_STARTED, BG_CANDIDATE_RESULT, BG_CANDIDATE_PROPOSAL,
 *   BG_SUBMIT_STATUS, BG_RESERVATION_DONE 구독
 * - 사용자 액션:
 *   · confirmReservation(formData)   → POPUP_CONFIRM_RESERVATION (decision #2 — 후보 confirm + 제출 통합)
 *   · findAlternative()             → POPUP_REJECT_CANDIDATE
 *   · cancel()                       → POPUP_CANCEL
 *   · newConversation()              → 기존 자동화 취소 + conversationId 갱신 + state reset
 *
 * Phase 1c 단계 — onboarding/session 복원, 만료/재로그인 재개 등은 다음 라운드.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AutomationStatus,
  ApplicationState,
  ChatMessage,
  FilledSlots,
  ReservationFormData,
  SpaceCandidate,
} from '../../shared/types';
import type {
  BackgroundToPopup,
  PopupChatRequest,
  PopupStartSearch,
  PopupConfirmReservation,
  PopupRejectCandidate,
  PopupCancel,
  PopupOpenLoginTab,
  PopupGetStatus,
} from '../../shared/messages';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  isoTs?: string;
}

export interface CandidateProgress {
  spaceCode: string;
  available: boolean | null;   // null = pending, true = found, false = fail
  why?: string;
}

export interface ConversationState {
  conversationId: string;
  messages: UiMessage[];
  /** 마지막 /parse 결과의 슬롯 (LLM 추출). */
  slots: FilledSlots | null;
  applicationState: ApplicationState | null;
  /** 사용자 메시지 송신 직후 ~ BG_CHAT_RESPONSE 도착 전까지 true (TypingIndicator). */
  parsing: boolean;
  /** 마지막 AutomationStatus — 카드 렌더 분기에 사용. */
  automationStatus: AutomationStatus;
  /** 검증 대상 후보 전체 (BG_SEARCH_STARTED 로 받음). */
  candidates: SpaceCandidate[];
  /** 후보 단위 결과 — currentIdx 위치 / 진행 marker 계산. */
  candidateResults: Map<string, CandidateProgress>;
  currentIdx: number;
  /** 가용으로 확정된 후보 (BG_CANDIDATE_PROPOSAL). 사용자가 메타 입력 → 제출 시 사용. */
  proposedCandidate: SpaceCandidate | null;
  /** 제출 진행 단계 — null 이면 SubmitProgressCard 숨김. */
  submitStep: 'filling' | 'saving' | 'saved' | null;
  /** 마지막 에러 (오류 토스트/배지용). */
  lastError: string | null;
  /** 현재 표시 중인 로그인 카드 상태. */
  loginPrompt:
    | {
        variant: 'needed' | 'expired';
        loggingIn: boolean;
      }
    | null;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatHHMM(value?: string): string {
  if (!value) return nowHHMM();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return nowHHMM();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function emptyState(conversationId: string): ConversationState {
  return {
    conversationId,
    messages: [],
    slots: null,
    applicationState: null,
    parsing: false,
    automationStatus: { kind: 'idle' },
    candidates: [],
    candidateResults: new Map(),
    currentIdx: -1,
    proposedCandidate: null,
    submitStep: null,
    lastError: null,
    loginPrompt: null,
  };
}

function freshConversationId(): string {
  // crypto.randomUUID 는 사이드패널 컨텍스트에서도 사용 가능 (Chrome 110+).
  return crypto.randomUUID();
}

function hasSearchReadySlots(slots: FilledSlots | null | undefined): boolean {
  if (!slots) return false;
  return Boolean(
    slots.date &&
      slots.start_time &&
      (slots.end_time || slots.duration_min != null) &&
      slots.headcount != null,
  );
}

function hasSlotSearchCue(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return /(?:바꾸|변경|수정|정정|다시|아니|말고|대신|시간|시부터|까지|내일|모레|다음|월|일|캠퍼스|율전|명륜|건물|공간|명으로)/.test(normalized);
}

/** ParseResult.filled_slots → shared FilledSlots 캐스팅 (구조 동일). */
async function sendRuntime<T>(msg: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

function nowMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeAssistantMessage(content: string): UiMessage {
  const isoTs = new Date().toISOString();
  return {
    id: nowMessageId('m-a'),
    role: 'assistant',
    content,
    ts: formatHHMM(isoTs),
    isoTs,
  };
}

export function useConversation() {
  const [state, setState] = useState<ConversationState>(() =>
    emptyState(freshConversationId()),
  );

  // 콜백에서 최신 state 를 참조하기 위한 ref.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------- background → sidepanel 메시지 구독 ----------
  useEffect(() => {
    const listener = (rawMsg: unknown) => {
      const msg = rawMsg as BackgroundToPopup;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      switch (msg.type) {
        case 'BG_STATUS_UPDATE': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => {
            const next: Partial<ConversationState> = { automationStatus: msg.status };
            if (msg.status.kind === 'error') {
              next.lastError = msg.status.message;
              next.submitStep = null;
            }
            if (msg.status.kind === 'done') next.submitStep = 'saved';
            if (msg.status.kind !== 'login_required') {
              next.loginPrompt = null;
            }
            return { ...s, ...next };
          });
          break;
        }

        case 'LOGIN_NEEDED': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => ({
            ...s,
            automationStatus: { kind: 'login_required', reason: 'needed' },
            loginPrompt: { variant: 'needed', loggingIn: false },
            messages: [
              ...s.messages,
              makeAssistantMessage(
                'GLS 로그인이 풀려있어요. 새 탭에서 잠깐 로그인해주시면 이어서 진행할게요.',
              ),
            ],
          }));
          break;
        }

        case 'SESSION_EXPIRED': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => ({
            ...s,
            automationStatus: {
              kind: 'login_required',
              reason: 'expired',
              resumeIdx: msg.resumeIdx,
            },
            loginPrompt: { variant: 'expired', loggingIn: false },
            messages: [
              ...s.messages,
              makeAssistantMessage(
                '검증 도중에 GLS 로그인이 풀렸어요. 다시 로그인하시면 멈춘 지점부터 이어서 진행할게요.',
              ),
            ],
          }));
          break;
        }

        case 'LOGIN_COMPLETE': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => ({
            ...s,
            automationStatus: { kind: 'opening_gls' },
            loginPrompt: null,
            messages: [
              ...s.messages,
              makeAssistantMessage(
                msg.reason === 'expired'
                  ? '✓ 다시 로그인됐어요. 멈췄던 지점부터 이어서 진행할게요.'
                  : '✓ 로그인 확인했어요. 빈 공간 찾아볼게요.',
              ),
            ],
          }));
          break;
        }

        case 'BG_SEARCH_STARTED': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          // 새 검증 시작 — 후보 리스트와 marker 초기화.
          const results = new Map<string, CandidateProgress>();
          for (const c of msg.candidates) {
            results.set(c.glsSpaceCode, { spaceCode: c.glsSpaceCode, available: null });
          }
          setState((s) => ({
            ...s,
            candidates: msg.candidates,
            candidateResults: results,
            currentIdx: 0,
            proposedCandidate: null,
            submitStep: null,
            loginPrompt: null,
          }));
          break;
        }

        case 'BG_CANDIDATE_RESULT': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => {
            if (!s.candidateResults.has(msg.spaceCode)) return s;
            const results = new Map(s.candidateResults);
            results.set(msg.spaceCode, {
              spaceCode: msg.spaceCode,
              available: msg.available,
              why: msg.why,
            });
            // 다음 후보로 marker 위치 이동. found 면 그 위치에 머무름.
            const nextIdx = msg.available ? msg.currentIdx : Math.min(msg.currentIdx + 1, msg.total);
            return { ...s, candidateResults: results, currentIdx: nextIdx };
          });
          break;
        }

        case 'BG_CANDIDATE_PROPOSAL': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => {
            if (!s.candidates.some((candidate) => candidate.glsSpaceCode === msg.candidate.glsSpaceCode)) {
              return s;
            }
            return { ...s, proposedCandidate: msg.candidate };
          });
          break;
        }

        case 'BG_SUBMIT_STATUS': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          setState((s) => ({ ...s, submitStep: msg.step }));
          break;
        }

        case 'BG_RESERVATION_DONE': {
          if (msg.conversationId !== stateRef.current.conversationId) return;
          // automationStatus 도 곧 done 으로 들어옴 (BG_STATUS_UPDATE).
          setState((s) => ({ ...s, submitStep: 'saved' }));
          break;
        }

        default:
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ---------- 사용자 액션 ----------

  /**
   * 사용자가 채팅 입력 → POPUP_CHAT_REQUEST → BG_CHAT_RESPONSE 받아 봇 메시지 / slots /
   * applicationState 업데이트. ready_to_search 이면 자동 POPUP_START_SEARCH.
   */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const conversationId = stateRef.current.conversationId;
    const previousState = stateRef.current;

    const userMessageTs = new Date().toISOString();
    const userMsg: UiMessage = {
      id: nowMessageId('m-u'),
      role: 'user',
      content: trimmed,
      ts: formatHHMM(userMessageTs),
      isoTs: userMessageTs,
    };
    const historyForServer: ChatMessage[] = [
      ...stateRef.current.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.isoTs ? { ts: m.isoTs } : {}),
      })),
      { role: 'user', content: trimmed, ts: userMessageTs },
    ];
    setState((s) => ({
      ...s,
      messages: [...s.messages, userMsg],
      parsing: true,
      lastError: null,
    }));

    let res: { type: 'BG_CHAT_RESPONSE'; result: import('../../shared/types').ParseResult } | { error: string };
    try {
      const req: PopupChatRequest = {
        type: 'POPUP_CHAT_REQUEST',
        conversationId,
        history: historyForServer,
        latestMessage: trimmed,
      };
      res = await sendRuntime(req);
    } catch (e) {
      setState((s) => ({ ...s, parsing: false, lastError: (e as Error).message }));
      return;
    }

    if ('error' in res) {
      setState((s) => ({ ...s, parsing: false, lastError: res.error as string }));
      return;
    }

    const parsed = res.result;
    const assistantMessageTs = new Date().toISOString();
    const botMsg: UiMessage = {
      id: nowMessageId('m-a'),
      role: 'assistant',
      content: parsed.assistant_message,
      ts: formatHHMM(assistantMessageTs),
      isoTs: assistantMessageTs,
    };
    setState((s) => ({
      ...s,
      messages: [...s.messages, botMsg],
      parsing: false,
      slots:
        parsed.intent === 'cancel'
          ? null
          : parsed.intent === 'request_alternative'
            ? s.slots
            : parsed.filled_slots,
      applicationState:
        parsed.intent === 'cancel'
          ? null
          : parsed.intent === 'request_alternative'
            ? s.applicationState
            : parsed.application_state,
      ...(parsed.intent === 'cancel'
        ? {
            automationStatus: { kind: 'idle' as const },
            candidates: [],
            candidateResults: new Map<string, CandidateProgress>(),
            currentIdx: -1,
            proposedCandidate: null,
            submitStep: null,
            loginPrompt: null,
          }
        : {}),
    }));

    const hasAlternativeContext =
      previousState.proposedCandidate !== null ||
      previousState.automationStatus.kind === 'candidate_found' ||
      previousState.candidates.length > 0;
    if (parsed.intent === 'request_alternative' && hasAlternativeContext) {
      const altMsg: PopupRejectCandidate = {
        type: 'POPUP_REJECT_CANDIDATE',
        conversationId,
      };
      try {
        await sendRuntime(altMsg);
      } catch (e) {
        setState((s) => ({ ...s, lastError: (e as Error).message }));
      }
      return;
    }

    const shouldStartSearch =
      (parsed.ready_to_search && (!previousState.proposedCandidate || hasSlotSearchCue(trimmed))) ||
      (parsed.intent === 'modify_slot' && hasSearchReadySlots(parsed.filled_slots) && hasSlotSearchCue(trimmed));
    if (shouldStartSearch) {
      // 곧바로 background 에 검색 시작 요청. 결과는 BG_STATUS_UPDATE /
      // BG_SEARCH_STARTED / BG_CANDIDATE_RESULT 로 스트리밍.
      const startMsg: PopupStartSearch = {
        type: 'POPUP_START_SEARCH',
        conversationId,
        slots: parsed.filled_slots,
      };
      try {
        await sendRuntime(startMsg);
      } catch (e) {
        setState((s) => ({ ...s, lastError: (e as Error).message }));
      }
    }
  }, []);

  /**
   * draft 가 완성된 상태에서 사용자가 "GLS 제출" 클릭 — 결정 #2 에 따라 후보
   * confirm + 신청서 제출이 한 액션. background 는 POPUP_CONFIRM_RESERVATION
   * 을 받아 submitConfirmedReservation 실행.
   */
  const confirmReservation = useCallback(async (formData: ReservationFormData) => {
    const { conversationId, proposedCandidate } = stateRef.current;
    if (!proposedCandidate) {
      setState((s) => ({ ...s, lastError: '확정할 후보가 없습니다.' }));
      return;
    }
    const msg: PopupConfirmReservation = {
      type: 'POPUP_CONFIRM_RESERVATION',
      conversationId,
      spaceCode: proposedCandidate.glsSpaceCode,
      confirmed: true,
      formData,
    };
    setState((s) => ({ ...s, submitStep: 'filling' }));
    try {
      await sendRuntime(msg);
    } catch (e) {
      setState((s) => ({ ...s, submitStep: null, lastError: (e as Error).message }));
    }
  }, []);

  const findAlternative = useCallback(async () => {
    const { conversationId } = stateRef.current;
    const msg: PopupRejectCandidate = {
      type: 'POPUP_REJECT_CANDIDATE',
      conversationId,
    };
    setState((s) => ({
      ...s,
      proposedCandidate: null,
      lastError: null,
    }));
    try {
      await sendRuntime(msg);
    } catch (e) {
      setState((s) => ({ ...s, lastError: (e as Error).message }));
    }
  }, []);

  const openLoginTab = useCallback(async () => {
    const currentPrompt = stateRef.current.loginPrompt;
    if (!currentPrompt) return;
    const msg: PopupOpenLoginTab = {
      type: 'POPUP_OPEN_LOGIN_TAB',
      conversationId: stateRef.current.conversationId,
      variant: currentPrompt.variant,
    };
    setState((s) => ({
      ...s,
      loginPrompt: s.loginPrompt
        ? { ...s.loginPrompt, loggingIn: true }
        : { variant: currentPrompt.variant, loggingIn: true },
      lastError: null,
    }));
    try {
      await sendRuntime(msg);
    } catch (e) {
      setState((s) => ({
        ...s,
        loginPrompt: s.loginPrompt
          ? { ...s.loginPrompt, loggingIn: false }
          : null,
        lastError: (e as Error).message,
      }));
    }
  }, []);

  const applySuggestedMemory = useCallback(async () => {
    const conversationId = stateRef.current.conversationId;
    try {
      const res = await sendRuntime<{
        ok: boolean;
        applicationState?: ApplicationState;
        error?: string;
      }>({
        type: 'POPUP_APPLY_SUGGESTED_MEMORY',
        conversationId,
      });
      if (!res.ok || !res.applicationState) {
        throw new Error(res.error ?? '추천 신청 정보를 적용하지 못했습니다.');
      }
      setState((s) => ({ ...s, applicationState: res.applicationState ?? null }));
    } catch (e) {
      setState((s) => ({ ...s, lastError: (e as Error).message }));
    }
  }, []);

  const dismissSuggestedMemory = useCallback(async () => {
    const conversationId = stateRef.current.conversationId;
    try {
      const res = await sendRuntime<{
        ok: boolean;
        applicationState?: ApplicationState;
        error?: string;
      }>({
        type: 'POPUP_DISMISS_SUGGESTED_MEMORY',
        conversationId,
      });
      if (!res.ok || !res.applicationState) {
        throw new Error(res.error ?? '추천 신청 정보를 갱신하지 못했습니다.');
      }
      setState((s) => ({ ...s, applicationState: res.applicationState ?? null }));
    } catch (e) {
      setState((s) => ({ ...s, lastError: (e as Error).message }));
    }
  }, []);

  const restoreConversation = useCallback(async (conversationId: string) => {
    const msg: PopupGetStatus = {
      type: 'POPUP_GET_STATUS',
      conversationId,
    };
    const res = await sendRuntime<{
      status?: AutomationStatus;
      lastFilledSlots?: FilledSlots | null;
      history?: ChatMessage[];
      lastProposed?: SpaceCandidate | null;
      applicationState?: ApplicationState | null;
      conversationStatus?: import('../../shared/types').ConversationStatus;
      error?: string;
    }>(msg);
    if (res.error) throw new Error(res.error);

    const restoredStatus = res.status ?? { kind: 'idle' as const };
    const restored: ConversationState = {
      ...emptyState(conversationId),
      messages: (res.history ?? []).map((m, index) => ({
        id: `m-r-${index}-${Date.now()}`,
        role: m.role,
        content: m.content,
        ts: formatHHMM(m.ts),
        isoTs: m.ts,
      })),
      slots: res.lastFilledSlots ?? null,
      applicationState: res.applicationState ?? null,
      automationStatus: restoredStatus,
      proposedCandidate: res.lastProposed ?? null,
      submitStep:
        restoredStatus.kind === 'done' || res.conversationStatus === 'completed'
          ? 'saved'
          : null,
    };
    stateRef.current = restored;
    setState(restored);
  }, []);

  const cancel = useCallback(async () => {
    const { conversationId } = stateRef.current;
    const msg: PopupCancel = { type: 'POPUP_CANCEL', conversationId };
    try {
      await sendRuntime(msg);
    } catch {
      /* swallow */
    }
  }, []);

  /** 새 대화 시작 — 모든 state 리셋 + conversationId 갱신. */
  const newConversation = useCallback(() => {
    const current = stateRef.current;
    const hasConversationWork =
      current.messages.length > 0 ||
      current.automationStatus.kind !== 'idle' ||
      current.candidates.length > 0 ||
      current.proposedCandidate !== null;
    if (hasConversationWork) {
      const msg: PopupCancel = { type: 'POPUP_CANCEL', conversationId: current.conversationId };
      void sendRuntime(msg).catch(() => {
        /* best-effort: local reset should still happen */
      });
    }
    const next = emptyState(freshConversationId());
    stateRef.current = next;
    setState(next);
    return next.conversationId;
  }, []);

  return {
    state,
    sendMessage,
    confirmReservation,
    findAlternative,
    openLoginTab,
    applySuggestedMemory,
    dismissSuggestedMemory,
    restoreConversation,
    cancel,
    newConversation,
  };
}

export type UseConversation = ReturnType<typeof useConversation>;
