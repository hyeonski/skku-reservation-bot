/**
 * Popup 채팅 UI 루트 (D-006, D-025).
 *
 * 구성:
 * - Header
 * - ChatHistory (메시지)
 * - ReservationReviewPanel (후보 카드 / 진행 요약)
 * - StatusBar (자동화 진행 상태)
 * - ChatInput
 *
 * useConversation 훅이 background SW와의 메시지 송수신을 담당.
 */

import { useEffect, useState } from 'react';
import { useConversation } from './hooks/useConversation';
import { ChatHistory } from './components/ChatHistory';
import { ChatInput } from './components/ChatInput';
import { ConversationPicker } from './components/ConversationPicker';
import { DevPanel, type DevPanelState } from './components/DevPanel';
import { ReservationReviewPanel } from './components/ReservationReviewPanel';
import type { AutomationStatus, SearchLogEntry } from '../shared/types';

const POPUP_MODE_KEY = 'gls_popup_mode_v1';
const DEV_PANEL_SNAPSHOT_PREFIX = 'gls_dev_panel_snapshot_v1_';

function statusLabel(status: AutomationStatus): string | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'navigation_required':
      return null;
    case 'opening_gls':
      return 'GLS 페이지 여는 중…';
    case 'login_required':
      return null;
    case 'searching':
      return `공간 검색 중 (${status.tried}/${status.total})`;
    case 'candidate_found':
      return null;
    case 'submitting':
      return '예약 제출 중…';
    case 'done':
      return `예약 완료 (${status.spaceCode})`;
    case 'no_candidate':
      return '조건에 맞는 공간 없음';
    case 'error':
      return `오류: ${status.message}`;
  }
}

function isActive(status: AutomationStatus): boolean {
  return (
    status.kind === 'opening_gls' ||
    status.kind === 'searching' ||
    status.kind === 'candidate_found' ||
    status.kind === 'submitting'
  );
}

function getSearchLog(status: AutomationStatus): SearchLogEntry[] {
  if (status.kind === 'searching' || status.kind === 'candidate_found' || status.kind === 'no_candidate') {
    return status.log;
  }
  return [];
}

export function App() {
  const {
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
    confirmReservation,
    applySuggestedMemory,
    dismissSuggestedMemory,
    promptApplicationEdit,
    listDevSpaces,
    runDevAutomation,
  } = useConversation();
  const [mode, setMode] = useState<'chat' | 'dev'>('chat');
  const [devPanelState, setDevPanelState] = useState<DevPanelState | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const got = await chrome.storage?.local?.get(POPUP_MODE_KEY);
        const savedMode = got?.[POPUP_MODE_KEY];
        if (savedMode === 'chat' || savedMode === 'dev') {
          setMode(savedMode);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void (async () => {
      try {
        const got = await chrome.storage?.local?.get(`${DEV_PANEL_SNAPSHOT_PREFIX}${conversationId}`);
        const saved = got?.[`${DEV_PANEL_SNAPSHOT_PREFIX}${conversationId}`] as DevPanelState | undefined;
        if (saved) setDevPanelState(saved);
      } catch {
        /* non-fatal */
      }
    })();
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !devPanelState) return;
    const localStorageApi = chrome.storage?.local;
    if (!localStorageApi) return;
    void localStorageApi
      .set({ [`${DEV_PANEL_SNAPSHOT_PREFIX}${conversationId}`]: devPanelState })
      .catch(() => {});
  }, [conversationId, devPanelState]);

  function updateMode(nextMode: 'chat' | 'dev') {
    setMode(nextMode);
    const localStorageApi = chrome.storage?.local;
    if (!localStorageApi) return;
    void localStorageApi.set({ [POPUP_MODE_KEY]: nextMode }).catch(() => {});
  }

  const label = statusLabel(status);
  const active = isActive(status);
  const searchLog = getSearchLog(status);
  const candidateCardKey = candidate
    ? [
        candidate.glsSpaceCode,
        draftFormData?.hangsaGbCode ?? '',
        draftFormData?.organization ?? '',
        draftFormData?.eventName ?? '',
        String(draftFormData?.headcount ?? ''),
        draftFormData?.purpose ?? '',
      ].join('|')
    : '';

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">SKKU 공간예약</span>
        {active && <span className="badge badge--active">예약 진행 중…</span>}
        <ConversationPicker
          currentConversationId={conversationId}
          conversations={conversationSummaries}
          onCreateConversation={async () => {
            setDevPanelState(null);
            await createConversation();
          }}
          onSelectConversation={async (nextConversationId) => {
            if (nextConversationId !== conversationId) {
              setDevPanelState(null);
            }
            await switchConversation(nextConversationId);
          }}
          onDeleteConversation={async (targetConversationId) => {
            if (targetConversationId === conversationId) {
              setDevPanelState(null);
            }
            await deleteConversation(targetConversationId);
          }}
        />
        <button
          type="button"
          className={`app__mode-toggle ${mode === 'dev' ? 'app__mode-toggle--active' : ''}`}
          onClick={() => updateMode(mode === 'chat' ? 'dev' : 'chat')}
          title="자동화만 테스트 (LLM·서버 우회)"
        >
          {mode === 'dev' ? '💬 chat' : '🛠 dev'}
        </button>
      </header>

      <main className="app__main">
        {restoring ? (
          <div className="chat-history">
            <div className="chat-history__empty">이전 대화와 예약 상태를 불러오는 중…</div>
          </div>
        ) : mode === 'chat' ? (
          <>
            <ChatHistory messages={messages} />
            <ReservationReviewPanel
              status={status}
              candidate={candidate}
              searchLog={searchLog}
              lastFilledSlots={lastFilledSlots}
              applicationState={applicationState}
              draftFormData={draftFormData}
              candidateCardKey={candidateCardKey}
              onConfirmNavigation={(confirmed) => void confirmNavigation(confirmed)}
              onResumeAfterLogin={() => void resumeAfterLogin()}
              onApplySuggestedMemory={() => void applySuggestedMemory()}
              onDismissSuggestedMemory={() => void dismissSuggestedMemory()}
              onRequestApplicationEdit={promptApplicationEdit}
              onConfirmReservation={() => void confirmReservation(true, draftFormData ?? undefined)}
              onRejectCandidate={() => void confirmReservation(false)}
            />
          </>
        ) : (
          <>
            <DevPanel
              busy={busy}
              initialState={devPanelState}
              onStateChange={setDevPanelState}
              onListSpaces={listDevSpaces}
              onRun={runDevAutomation}
            />
            <div className="dev-panel__footer">
              <ReservationReviewPanel
                status={status}
                candidate={candidate}
                searchLog={searchLog}
                lastFilledSlots={lastFilledSlots}
                applicationState={applicationState}
                draftFormData={draftFormData}
                candidateCardKey={candidateCardKey}
                onConfirmNavigation={(confirmed) => void confirmNavigation(confirmed)}
                onResumeAfterLogin={() => void resumeAfterLogin()}
                onApplySuggestedMemory={() => void applySuggestedMemory()}
                onDismissSuggestedMemory={() => void dismissSuggestedMemory()}
                onRequestApplicationEdit={promptApplicationEdit}
                onConfirmReservation={() => void confirmReservation(true, draftFormData ?? undefined)}
                onRejectCandidate={() => void confirmReservation(false)}
              />
            </div>
          </>
        )}
      </main>

      {label && (
        <div className={`status-bar status-bar--${status.kind}`}>{label}</div>
      )}

      {mode === 'chat' && !restoring && (
        <ChatInput onSubmit={(t) => void sendMessage(t)} disabled={busy} />
      )}
    </div>
  );
}
