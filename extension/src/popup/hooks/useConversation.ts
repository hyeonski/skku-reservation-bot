/**
 * 대화 상태 훅 (D-018: 클라가 진실의 원천).
 *
 * 책임:
 * - activeConversationId 발급·유지
 * - 최근 대화 인덱스 보유 및 세션 전환
 * - messages 배열 보유
 * - sendMessage(text): popup → BG (POPUP_CHAT_REQUEST) → BG 응답 받아 messages에 추가
 * - 자동화 진행 상태 (AutomationStatus) 구독
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ApplicationState,
  AutomationStatus,
  ChatMessage,
  ConversationSessionSummary,
  ConversationStatus,
  FilledSlots,
  ReservationFormData,
  SpaceCandidate,
} from '../../shared/types';
import type {
  ApplicationStateResponse,
  BackgroundToPopup,
  BgChatResponse,
  ConversationListResponse,
  PopupToBackground,
} from '../../shared/messages';
import {
  ACTIVE_CONVERSATION_ID_KEY,
  CONVERSATION_INDEX_KEY,
  isPlaceholderConversationSummary,
  LEGACY_CONVERSATION_ID_KEY,
  MAX_CONVERSATION_INDEX_ITEMS,
  SNAPSHOT_PREFIX,
  makeConversationSessionSummary,
  mergeConversationSessionSummaries,
  shouldAppearInConversationHistory,
} from '../../shared/conversationSessions';

export interface UseConversationResult {
  conversationId: string;
  conversationSummaries: ConversationSessionSummary[];
  messages: ChatMessage[];
  status: AutomationStatus;
  candidate: SpaceCandidate | null;
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  draftFormData: ReservationFormData | null;
  restoring: boolean;
  busy: boolean;
  sendMessage: (text: string) => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (nextConversationId: string) => Promise<void>;
  deleteConversation: (targetConversationId: string) => Promise<void>;
  confirmNavigation: (confirmed: boolean) => Promise<void>;
  resumeAfterLogin: () => Promise<void>;
  previewReservation: (formData?: ReservationFormData) => Promise<void>;
  confirmReservation: (confirmed: boolean, formData?: ReservationFormData) => Promise<void>;
  applySuggestedMemory: () => Promise<void>;
  dismissSuggestedMemory: () => Promise<void>;
  promptApplicationEdit: () => void;
}

/** chrome.runtime.sendMessage 의 Promise 래퍼 */
function sendToBackground<TResp = unknown>(msg: PopupToBackground): Promise<TResp | undefined> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(undefined);
        return;
      }
      chrome.runtime.sendMessage(msg, (response: TResp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

function ensureOkResponse(
  response: { ok?: boolean; error?: string } | undefined,
  fallbackMessage: string,
): void {
  if (!response) return;
  if (response.ok === false) {
    throw new Error(response.error ?? fallbackMessage);
  }
}

interface PopupSnapshot {
  messages: ChatMessage[];
  status: AutomationStatus;
  candidate: SpaceCandidate | null;
  lastFilledSlots: FilledSlots | null;
  applicationState: ApplicationState | null;
  draftFormData: ReservationFormData | null;
}

const EMPTY_SNAPSHOT: PopupSnapshot = {
  messages: [],
  status: { kind: 'idle' },
  candidate: null,
  lastFilledSlots: null,
  applicationState: null,
  draftFormData: null,
};

function hasCompleteReservationForm(
  formData: ReservationFormData | null | undefined,
): formData is ReservationFormData {
  return Boolean(
    formData &&
      formData.hangsaGbCode.trim() &&
      formData.organization.trim() &&
      formData.eventName.trim() &&
      formData.purpose.trim() &&
      formData.headcount > 0,
  );
}

function summarizeReservationLabel(formData: ReservationFormData): string {
  const eventName = formData.eventName.trim();
  const organization = formData.organization.trim();
  if (!eventName) return organization || '예약 신청';
  if (!organization || eventName.includes(organization)) return eventName;
  return `${organization} ${eventName}`;
}

async function saveSnapshot(conversationId: string, snapshot: PopupSnapshot): Promise<void> {
  try {
    await chrome.storage?.local?.set({ [`${SNAPSHOT_PREFIX}${conversationId}`]: snapshot });
  } catch {
    /* non-fatal */
  }
}

async function removeSnapshot(conversationId: string): Promise<void> {
  try {
    await chrome.storage?.local?.remove(`${SNAPSHOT_PREFIX}${conversationId}`);
  } catch {
    /* non-fatal */
  }
}

async function loadConversationIndex(): Promise<ConversationSessionSummary[]> {
  try {
    const got = await chrome.storage?.local?.get(CONVERSATION_INDEX_KEY);
    const stored = got?.[CONVERSATION_INDEX_KEY];
    return Array.isArray(stored)
      ? (stored as ConversationSessionSummary[])
          .filter((summary) => !isPlaceholderConversationSummary(summary))
          .slice(0, MAX_CONVERSATION_INDEX_ITEMS)
      : [];
  } catch {
    return [];
  }
}

async function loadOrCreateActiveConversationId(): Promise<string> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const got = await chrome.storage.local.get([
        ACTIVE_CONVERSATION_ID_KEY,
        LEGACY_CONVERSATION_ID_KEY,
      ]);
      const current = got?.[ACTIVE_CONVERSATION_ID_KEY];
      if (typeof current === 'string' && current.length > 0) return current;

      const legacy = got?.[LEGACY_CONVERSATION_ID_KEY];
      if (typeof legacy === 'string' && legacy.length > 0) {
        await chrome.storage.local.set({ [ACTIVE_CONVERSATION_ID_KEY]: legacy });
        await chrome.storage.local.remove(LEGACY_CONVERSATION_ID_KEY);
        return legacy;
      }
    }
  } catch {
    /* storage unavailable — fall through to fresh */
  }

  const fresh = uuidv4();
  try {
    await chrome.storage?.local?.set({ [ACTIVE_CONVERSATION_ID_KEY]: fresh });
  } catch {
    /* non-fatal */
  }
  return fresh;
}

export function useConversation(): UseConversationResult {
  const [conversationId, setConversationId] = useState<string>('');
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AutomationStatus>({ kind: 'idle' });
  const [candidate, setCandidate] = useState<SpaceCandidate | null>(null);
  const [lastFilledSlots, setLastFilledSlots] = useState<FilledSlots | null>(null);
  const [applicationState, setApplicationState] = useState<ApplicationState | null>(null);
  const [draftFormData, setDraftFormData] = useState<ReservationFormData | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const summarySyncRef = useRef<string>('');
  const deletingConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [id, localIndex] = await Promise.all([
        loadOrCreateActiveConversationId(),
        loadConversationIndex(),
      ]);
      if (cancelled) return;

      setConversationSummaries(localIndex);
      setConversationId(id);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void chrome.storage?.local?.set({ [ACTIVE_CONVERSATION_ID_KEY]: conversationId }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    void chrome.storage?.local
      ?.set({ [CONVERSATION_INDEX_KEY]: conversationSummaries.slice(0, MAX_CONVERSATION_INDEX_ITEMS) })
      .catch(() => {});
  }, [conversationSummaries]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    void (async () => {
      const resp = (await sendToBackground({
        type: 'POPUP_LIST_CONVERSATIONS',
      })) as ConversationListResponse | undefined;

      if (cancelled || !resp?.ok || !resp.conversations) return;
      setConversationSummaries((prev) => mergeConversationSessionSummaries(prev, resp.conversations ?? []));
    })().catch(() => {
      /* non-fatal */
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setRestoring(true);
    setMessages([]);
    setStatus({ kind: 'idle' });
    setCandidate(null);
    setLastFilledSlots(null);
    setApplicationState(null);
    setDraftFormData(null);

    void (async () => {
      let snapshot: PopupSnapshot | undefined;

      try {
        const snapshotKey = `${SNAPSHOT_PREFIX}${conversationId}`;
        const snap = await chrome.storage?.local?.get(snapshotKey);
        snapshot = snap?.[snapshotKey] as PopupSnapshot | undefined;
        if (!cancelled && snapshot) {
          setMessages(snapshot.messages ?? []);
          setStatus(snapshot.status ?? { kind: 'idle' });
          setCandidate(snapshot.candidate ?? null);
          setLastFilledSlots(snapshot.lastFilledSlots ?? null);
          setApplicationState(snapshot.applicationState ?? null);
          setDraftFormData(snapshot.draftFormData ?? null);
        }
      } catch {
        /* non-fatal */
      }

      try {
        const resp = (await sendToBackground({
          type: 'POPUP_GET_STATUS',
          conversationId,
        })) as
          | {
              status: AutomationStatus;
              history: ChatMessage[];
              lastProposed: SpaceCandidate | null;
              lastFilledSlots: FilledSlots | null;
              pendingFormData: ReservationFormData | null;
              applicationState: ApplicationState | null;
            }
          | undefined;

        if (cancelled || !resp) return;
        setMessages(resp.history?.length ? resp.history : snapshot?.messages ?? []);
        setStatus(resp.status ?? snapshot?.status ?? { kind: 'idle' });
        setCandidate(resp.lastProposed ?? snapshot?.candidate ?? null);
        setLastFilledSlots(resp.lastFilledSlots ?? snapshot?.lastFilledSlots ?? null);
        setApplicationState(resp.applicationState ?? snapshot?.applicationState ?? null);
        setDraftFormData(
          resp.pendingFormData ??
            resp.applicationState?.draft ??
            snapshot?.draftFormData ??
            null,
        );
      } catch {
        /* 첫 진입이거나 BG context 없음 — snapshot 그대로 */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const snapshot: PopupSnapshot = {
      messages,
      status,
      candidate,
      lastFilledSlots,
      applicationState,
      draftFormData,
    };
    void saveSnapshot(conversationId, snapshot);
  }, [conversationId, messages, status, candidate, lastFilledSlots, applicationState, draftFormData]);

  useEffect(() => {
    if (!conversationId || restoring) return;
    if (deletingConversationIdRef.current === conversationId) return;

    const completedLabel =
      status.kind === 'done' && hasCompleteReservationForm(draftFormData)
        ? summarizeReservationLabel(draftFormData)
        : null;

    const currentStatus =
      status.kind === 'done'
        ? 'completed'
        : (conversationSummaries.find((summary) => summary.id === conversationId)?.status ??
            'active');

    const signature = JSON.stringify({
      conversationId,
      currentStatus,
      completedLabel,
      lastFilledSlots,
      lastMessage: messages[messages.length - 1]?.content ?? '',
      messageCount: messages.length,
    });
    if (summarySyncRef.current === signature) return;
    summarySyncRef.current = signature;

    if (
      !shouldAppearInConversationHistory({
        status: currentStatus,
        messages,
        lastFilledSlots,
        applicationState,
        confirmedReservationLabel: completedLabel,
      })
    ) {
      setConversationSummaries((prev) => prev.filter((summary) => summary.id !== conversationId));
      return;
    }

    setConversationSummaries((prev) =>
      mergeConversationSessionSummaries(
        prev,
        [
          makeConversationSessionSummary({
            id: conversationId,
            status: currentStatus,
            updatedAt: new Date().toISOString(),
            confirmedReservationLabel: completedLabel,
            messages,
            lastFilledSlots,
          }),
        ],
      ),
    );
  }, [
    applicationState,
    candidate,
    conversationId,
    conversationSummaries,
    draftFormData,
    lastFilledSlots,
    messages,
    restoring,
    status,
  ]);

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
  }, []);

  const saveCurrentSnapshot = useCallback(async () => {
    if (!conversationId) return;
    await saveSnapshot(conversationId, {
      messages,
      status,
      candidate,
      lastFilledSlots,
      applicationState,
      draftFormData,
    });
  }, [applicationState, candidate, conversationId, draftFormData, lastFilledSlots, messages, status]);

  const switchConversation = useCallback(
    async (nextConversationId: string) => {
      if (!nextConversationId || nextConversationId === conversationId) return;

      await saveCurrentSnapshot();
      summarySyncRef.current = '';
      setConversationId(nextConversationId);
    },
    [conversationId, saveCurrentSnapshot],
  );

  const createFreshConversation = useCallback(async (skipSaveCurrent = false) => {
    const fresh = uuidv4();
    if (!skipSaveCurrent) {
      await saveCurrentSnapshot();
    }
    await saveSnapshot(fresh, EMPTY_SNAPSHOT);
    summarySyncRef.current = '';
    setConversationId(fresh);
  }, [saveCurrentSnapshot]);

  const createConversation = useCallback(async () => {
    await createFreshConversation(false);
  }, [createFreshConversation]);

  const deleteConversation = useCallback(
    async (targetConversationId: string) => {
      if (!targetConversationId) return;

      const deletingActive = targetConversationId === conversationId;
      setBusy(true);
      try {
        deletingConversationIdRef.current = targetConversationId;
        const resp = (await sendToBackground({
          type: 'POPUP_DELETE_CONVERSATION',
          conversationId: targetConversationId,
        })) as { ok?: boolean; error?: string } | undefined;
        ensureOkResponse(resp, '대화 삭제에 실패했습니다.');

        await removeSnapshot(targetConversationId);
        setConversationSummaries((prev) =>
          prev.filter((conversation) => conversation.id !== targetConversationId),
        );

        if (deletingActive) {
          setRestoring(true);
          setMessages([]);
          setStatus({ kind: 'idle' });
          setCandidate(null);
          setLastFilledSlots(null);
          setApplicationState(null);
          setDraftFormData(null);
          await createFreshConversation(true);
        }
        deletingConversationIdRef.current = null;
      } catch (error) {
        deletingConversationIdRef.current = null;
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [conversationId, createFreshConversation],
  );

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    const listener = (msg: BackgroundToPopup) => {
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
      switch (msg.type) {
        case 'BG_STATUS_UPDATE':
          if (msg.conversationId === conversationId) {
            setStatus(msg.status);
            if (msg.status.kind !== 'candidate_found' && msg.status.kind !== 'submitting') {
              setCandidate(null);
            }
          }
          break;
        case 'BG_CANDIDATE_PROPOSAL':
          if (msg.conversationId === conversationId) {
            setCandidate(msg.candidate);
            appendAssistant('가능한 공간을 찾았어요. 아래 추천 카드에서 확인해 주세요.');
          }
          break;
        case 'BG_RESERVATION_DONE':
          if (msg.conversationId === conversationId) {
            appendAssistant('예약이 완료되었습니다.');
            setCandidate(null);
          }
          break;
        default:
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [conversationId, appendAssistant]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      setBusy(true);

      try {
        const resp = await sendToBackground<BgChatResponse>({
          type: 'POPUP_CHAT_REQUEST',
          conversationId,
          history: nextHistory,
          latestMessage: trimmed,
        });

        if (resp && resp.type === 'BG_CHAT_RESPONSE') {
          const { result } = resp;
          setLastFilledSlots(result.filled_slots);
          setApplicationState(result.application_state);
          setDraftFormData(result.application_state.draft ?? null);
          if (result.assistant_message) {
            appendAssistant(result.assistant_message);
          }
          if (result.intent === 'request_alternative' && candidate) {
            await sendToBackground({
              type: 'POPUP_CONFIRM_RESERVATION',
              conversationId,
              spaceCode: candidate.glsSpaceCode,
              confirmed: false,
            });
          } else if (result.ready_to_search && result.intent !== 'modify_application') {
            await sendToBackground({
              type: 'POPUP_START_SEARCH',
              conversationId,
              slots: result.filled_slots,
            });
          }
        }
      } catch (e) {
        appendAssistant(`오류가 발생했어요: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [appendAssistant, busy, candidate, conversationId],
  );

  const confirmReservation = useCallback(
    async (confirmed: boolean, formData?: ReservationFormData) => {
      if (!candidate) return;
      const userMsg: ChatMessage = {
        role: 'user',
        content: confirmed ? '예' : '아니오',
      };
      setMessages((prev) => [...prev, userMsg]);
      if (formData) setDraftFormData(formData);
      try {
        const resp = (await sendToBackground({
          type: 'POPUP_CONFIRM_RESERVATION',
          conversationId,
          spaceCode: candidate.glsSpaceCode,
          confirmed,
          formData,
        })) as { ok?: boolean; error?: string } | undefined;
        ensureOkResponse(resp, '예약 확인 처리에 실패했습니다.');
        if (!confirmed) {
          setCandidate(null);
          appendAssistant('다른 후보 공간을 계속 찾아볼게요.');
        }
      } catch (e) {
        appendAssistant(`확인 처리 중 오류: ${(e as Error).message}`);
      }
    },
    [appendAssistant, candidate, conversationId],
  );

  const confirmNavigation = useCallback(
    async (confirmed: boolean) => {
      const userMsg: ChatMessage = {
        role: 'user',
        content: confirmed ? '예' : '아니오',
      };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const resp = (await sendToBackground({
          type: 'POPUP_CONFIRM_NAVIGATION',
          conversationId,
          confirmed,
        })) as { ok?: boolean; error?: string } | undefined;
        ensureOkResponse(resp, 'GLS 이동 확인에 실패했습니다.');
        if (confirmed) {
          appendAssistant('현재 탭을 GLS로 이동해서 계속 진행할게요.');
        } else {
          appendAssistant('이동을 취소했어요. 원하실 때 다시 시도해 주세요.');
        }
      } catch (e) {
        appendAssistant(`이동 확인 중 오류: ${(e as Error).message}`);
      }
    },
    [appendAssistant, conversationId],
  );

  const resumeAfterLogin = useCallback(async () => {
    try {
      const resp = (await sendToBackground({
        type: 'POPUP_RESUME_AFTER_LOGIN',
        conversationId,
      })) as { ok?: boolean; error?: string } | undefined;
      ensureOkResponse(resp, '로그인 후 재시작에 실패했습니다.');
      appendAssistant('로그인 완료로 보고 예약 탐색을 다시 시작할게요.');
    } catch (e) {
      appendAssistant(`재시작 중 오류: ${(e as Error).message}`);
    }
  }, [appendAssistant, conversationId]);

  const previewReservation = useCallback(
    async (formData?: ReservationFormData) => {
      if (!candidate || busy) return;
      if (formData) setDraftFormData(formData);
      setBusy(true);
      try {
        const resp = (await sendToBackground({
          type: 'POPUP_PREVIEW_RESERVATION',
          conversationId,
          spaceCode: candidate.glsSpaceCode,
          formData,
        })) as { ok?: boolean; error?: string } | undefined;
        ensureOkResponse(resp, '폼 미리보기에 실패했습니다.');
        appendAssistant('GLS 모달에 신청서를 미리 채워두었어요. 확인만 하고 실제 제출은 하지 않았습니다.');
      } catch (e) {
        appendAssistant(`폼 미리보기 중 오류: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [appendAssistant, busy, candidate, conversationId],
  );

  const applySuggestedMemory = useCallback(async () => {
    try {
      const resp = (await sendToBackground({
        type: 'POPUP_APPLY_SUGGESTED_MEMORY',
        conversationId,
      })) as ApplicationStateResponse | undefined;
      ensureOkResponse(resp, '추천 신청 정보 적용에 실패했습니다.');
      if (resp?.applicationState) {
        setApplicationState(resp.applicationState);
        setDraftFormData(resp.applicationState.draft ?? null);
      }
      appendAssistant('지난번 신청 정보를 불러왔어요. 아래 카드에서 확인해 주세요.');
    } catch (e) {
      appendAssistant(`추천 정보 적용 중 오류: ${(e as Error).message}`);
    }
  }, [appendAssistant, conversationId]);

  const dismissSuggestedMemory = useCallback(async () => {
    try {
      const resp = (await sendToBackground({
        type: 'POPUP_DISMISS_SUGGESTED_MEMORY',
        conversationId,
      })) as ApplicationStateResponse | undefined;
      ensureOkResponse(resp, '추천 신청 정보 해제에 실패했습니다.');
      if (resp?.applicationState) {
        setApplicationState(resp.applicationState);
        setDraftFormData(resp.applicationState.draft ?? null);
      }
      appendAssistant(
        '새 신청 정보를 받아 적을게요. "소프트웨어학과 학생회 정기회의"처럼 알려 주세요.',
      );
    } catch (e) {
      appendAssistant(`추천 정보 해제 중 오류: ${(e as Error).message}`);
    }
  }, [appendAssistant, conversationId]);

  const promptApplicationEdit = useCallback(() => {
    appendAssistant('어떤 항목을 바꿀까요? "행사명은 ..."처럼 말씀해 주세요.');
  }, [appendAssistant]);

  const lastNoCandidateRef = useRef(false);
  useEffect(() => {
    if (status.kind === 'no_candidate' && !lastNoCandidateRef.current) {
      lastNoCandidateRef.current = true;
      appendAssistant('조건에 맞는 공간을 찾지 못했어요. 시간이나 인원, 건물을 바꿔볼까요?');
    } else if (status.kind !== 'no_candidate') {
      lastNoCandidateRef.current = false;
    }
  }, [appendAssistant, status]);

  return {
    conversationId,
    conversationSummaries,
    messages,
    status,
    candidate,
    lastFilledSlots,
    applicationState,
    draftFormData,
    restoring,
    busy,
    sendMessage,
    createConversation,
    switchConversation,
    deleteConversation,
    confirmNavigation,
    resumeAfterLogin,
    previewReservation,
    confirmReservation,
    applySuggestedMemory,
    dismissSuggestedMemory,
    promptApplicationEdit,
  };
}
