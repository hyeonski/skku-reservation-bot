/**
 * Popup 채팅 UI 루트 (D-006, D-025).
 *
 * 구성:
 * - Header
 * - ChatHistory (메시지 + 후보 확인 카드)
 * - StatusBar (자동화 진행 상태)
 * - ChatInput
 *
 * useConversation 훅이 background SW와의 메시지 송수신을 담당.
 */

import { useState } from 'react';
import { useConversation } from './hooks/useConversation';
import { ChatHistory } from './components/ChatHistory';
import { ChatInput } from './components/ChatInput';
import { DevPanel } from './components/DevPanel';
import type { AutomationStatus, SpaceCandidate } from '../shared/types';

function statusLabel(status: AutomationStatus): string | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'opening_gls':
      return 'GLS 페이지 여는 중…';
    case 'login_required':
      return 'GLS 로그인이 필요합니다';
    case 'searching':
      return `공간 검색 중 (${status.tried}/${status.total})`;
    case 'candidate_found':
      return `후보 발견: ${status.spaceName}`;
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

function CandidateCard({
  candidate,
  onConfirm,
  onReject,
}: {
  candidate: SpaceCandidate;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="candidate-card">
      <div className="candidate-card__title">
        {candidate.buildingName} {candidate.roomName}
      </div>
      <div className="candidate-card__meta">
        수용 {candidate.capacityMin}~{candidate.capacityMax}명
        {candidate.isUserOrgPreferred ? ' · 소속 우선' : ''}
      </div>
      {candidate.contents && (
        <div className="candidate-card__note">{candidate.contents}</div>
      )}
      {candidate.useJojikName && (
        <div className="candidate-card__warn">
          사용권한 조직: {candidate.useJojikName}
        </div>
      )}
      <div className="candidate-card__actions">
        <button type="button" className="btn btn--primary" onClick={onConfirm}>
          예, 예약합니다
        </button>
        <button type="button" className="btn" onClick={onReject}>
          아니오
        </button>
      </div>
    </div>
  );
}

export function App() {
  const {
    messages,
    status,
    candidate,
    busy,
    sendMessage,
    confirmReservation,
    cancel,
    runDevAutomation,
  } = useConversation();
  const [mode, setMode] = useState<'chat' | 'dev'>('chat');

  const label = statusLabel(status);
  const active = isActive(status);

  const handleOpenGls = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: 'https://kingoinfo.skku.edu' });
    } else {
      window.open('https://kingoinfo.skku.edu', '_blank');
    }
  };

  const footer = (
    <>
      {status.kind === 'login_required' && (
        <div className="login-cta">
          <div className="login-cta__text">GLS 로그인이 필요합니다.</div>
          <button type="button" className="btn btn--primary" onClick={handleOpenGls}>
            GLS 열기
          </button>
        </div>
      )}
      {candidate && (
        <CandidateCard
          candidate={candidate}
          onConfirm={() => void confirmReservation(true)}
          onReject={() => void confirmReservation(false)}
        />
      )}
    </>
  );

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__title">SKKU 공간예약</span>
        {active && <span className="badge badge--active">예약 진행 중…</span>}
        <button
          type="button"
          className={`app__mode-toggle ${mode === 'dev' ? 'app__mode-toggle--active' : ''}`}
          onClick={() => setMode((m) => (m === 'chat' ? 'dev' : 'chat'))}
          title="자동화만 테스트 (LLM·서버 우회)"
        >
          {mode === 'dev' ? '💬 chat' : '🛠 dev'}
        </button>
        <button
          type="button"
          className="app__reset"
          onClick={cancel}
          title="대화 초기화"
        >
          초기화
        </button>
      </header>

      <main className="app__main">
        {mode === 'chat' ? (
          <ChatHistory messages={messages} footer={footer} />
        ) : (
          <>
            <DevPanel busy={busy} onRun={runDevAutomation} />
            {/* dev 모드에서도 후보 카드 / 로그인 안내는 동일하게 사용 */}
            <div className="dev-panel__footer">{footer}</div>
          </>
        )}
      </main>

      {label && (
        <div className={`status-bar status-bar--${status.kind}`}>{label}</div>
      )}

      {mode === 'chat' && (
        <ChatInput onSubmit={(t) => void sendMessage(t)} disabled={busy} />
      )}
    </div>
  );
}
