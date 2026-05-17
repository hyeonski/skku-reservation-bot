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

import { useConversation } from './hooks/useConversation';
import { ChatHistory } from './components/ChatHistory';
import { ChatInput } from './components/ChatInput';
import { ConversationPicker } from './components/ConversationPicker';
import { ReservationReviewPanel } from './components/ReservationReviewPanel';
import type { AutomationStatus, SearchLogEntry } from '../shared/types';

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
  } = useConversation();
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
          onCreateConversation={createConversation}
          onSelectConversation={async (nextConversationId) => {
            await switchConversation(nextConversationId);
          }}
          onDeleteConversation={deleteConversation}
        />
      </header>

      <main className="app__main">
        {restoring ? (
          <div className="chat-history">
            <div className="chat-history__empty">이전 대화와 예약 상태를 불러오는 중…</div>
          </div>
        ) : (
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
        )}
      </main>

      {label && (
        <div className={`status-bar status-bar--${status.kind}`}>{label}</div>
      )}

      {!restoring && (
        <ChatInput onSubmit={(t) => void sendMessage(t)} disabled={busy} />
      )}
    </div>
  );
}
