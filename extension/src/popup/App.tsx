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

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useConversation } from './hooks/useConversation';
import { ChatHistory } from './components/ChatHistory';
import { ChatInput } from './components/ChatInput';
import { DevPanel, type DevPanelState } from './components/DevPanel';
import type { AutomationStatus, SpaceCandidate, SearchLogEntry } from '../shared/types';
import type { ReservationFormData } from '../shared/messages';

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

function SearchLog({ entries }: { entries: SearchLogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="search-log">
      {entries.map((e, i) => (
        <div
          key={`${e.glsSpaceCode}-${i}`}
          className={`search-log__row search-log__row--${e.available ? 'ok' : 'bad'}`}
        >
          <div className="search-log__head">
            <span className="search-log__mark">{e.available ? '✓' : '✗'}</span>
            <span className="search-log__name">
              {e.buildingName} {e.roomName}
            </span>
            <span className="search-log__code">[{e.glsSpaceCode}]</span>
          </div>
          {!e.available && e.conflicts.length > 0 && (
            <ul className="search-log__conflicts">
              {e.conflicts.slice(0, 4).map((c, j) => (
                <li key={j}>
                  <span className="search-log__conflict-kind">{c.kind}</span>
                  {c.kind && ' '}
                  {c.timeTerm && <span className="search-log__conflict-time">{c.timeTerm}</span>}{' '}
                  <span className="search-log__conflict-info">{c.info.trim()}</span>
                </li>
              ))}
              {e.conflicts.length > 4 && (
                <li className="search-log__more">+{e.conflicts.length - 4}건</li>
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function CandidateCard({
  candidate,
  defaultFormData,
  onPreview,
  onConfirm,
  onReject,
}: {
  candidate: SpaceCandidate;
  defaultFormData: ReservationFormData;
  onPreview: (formData: ReservationFormData) => void;
  onConfirm: (formData: ReservationFormData) => void;
  onReject: () => void;
}) {
  const [form, setForm] = useState<ReservationFormData>(defaultFormData);
  const lastTriggerRef = useRef<Record<'preview' | 'confirm' | 'reject', number>>({
    preview: 0,
    confirm: 0,
    reject: 0,
  });

  function setField<K extends keyof ReservationFormData>(key: K, value: ReservationFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function fireAction(kind: 'preview' | 'confirm' | 'reject', action: () => void) {
    const now = Date.now();
    if (now - lastTriggerRef.current[kind] < 250) return;
    lastTriggerRef.current[kind] = now;
    action();
  }

  function actionProps(kind: 'preview' | 'confirm' | 'reject', action: () => void) {
    return {
      onMouseDown: (e: MouseEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        fireAction(kind, action);
      },
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        fireAction(kind, action);
      },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        fireAction(kind, action);
      },
    };
  }

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
      <div className="candidate-card__form">
        <label className="candidate-card__field">
          <span>행사구분 코드</span>
          <select
            value={form.hangsaGbCode}
            onChange={(e) => setField('hangsaGbCode', e.target.value)}
          >
            <option value="113">113 · 세미나/스터디</option>
            <option value="111">111 · 학생회/동아리</option>
            <option value="115">115 · 보충수업/특강/시험</option>
            <option value="112">112 · 본부부서주관행사</option>
            <option value="114">114 · 단과대학주관행사</option>
            <option value="116">116 · 학과주관행사</option>
            <option value="001">001 · 교외단체행사</option>
            <option value="117">117 · 기타</option>
          </select>
        </label>
        <label className="candidate-card__field">
          <span>주관단체</span>
          <input
            value={form.organization}
            onChange={(e) => setField('organization', e.target.value)}
          />
        </label>
        <label className="candidate-card__field">
          <span>행사명</span>
          <input
            value={form.eventName}
            onChange={(e) => setField('eventName', e.target.value)}
          />
        </label>
        <label className="candidate-card__field candidate-card__field--short">
          <span>행사인원</span>
          <input
            type="number"
            min={1}
            value={form.headcount}
            onChange={(e) => setField('headcount', Number.parseInt(e.target.value || '0', 10))}
          />
        </label>
        <label className="candidate-card__field">
          <span>사용목적</span>
          <textarea
            rows={3}
            value={form.purpose}
            onChange={(e) => setField('purpose', e.target.value)}
          />
        </label>
      </div>
      <div className="candidate-card__actions">
        <button
          type="button"
          className="btn"
          {...actionProps('preview', () => onPreview(form))}
          disabled={
            !form.hangsaGbCode.trim() ||
            !form.organization.trim() ||
            !form.eventName.trim() ||
            !form.purpose.trim() ||
            form.headcount <= 0
          }
        >
          폼만 채우기
        </button>
        <button
          type="button"
          className="btn btn--primary"
          {...actionProps('confirm', () => onConfirm(form))}
          disabled={
            !form.hangsaGbCode.trim() ||
            !form.organization.trim() ||
            !form.eventName.trim() ||
            !form.purpose.trim() ||
            form.headcount <= 0
          }
        >
          예, 예약합니다 (실제 제출)
        </button>
        <button type="button" className="btn" {...actionProps('reject', onReject)}>
          아니오
        </button>
      </div>
    </div>
  );
}

function NavigationCard({
  onConfirm,
  onReject,
}: {
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="candidate-card">
      <div className="candidate-card__title">현재 탭을 GLS로 이동할까요?</div>
      <div className="candidate-card__note">
        이동하면 지금 보고 있는 탭이 GLS 페이지로 바뀌고, 그 탭에서 예약 탐색을 계속 진행합니다.
      </div>
      <div className="candidate-card__actions">
        <button type="button" className="btn btn--primary" onClick={onConfirm}>
          예, 이동합니다
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
    conversationId,
    messages,
    status,
    candidate,
    lastFilledSlots,
    draftFormData,
    restoring,
    busy,
    sendMessage,
    confirmNavigation,
    resumeAfterLogin,
    previewReservation,
    confirmReservation,
    cancel,
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

  function resetConversation() {
    setDevPanelState(null);
    const localStorageApi = chrome.storage?.local;
    if (conversationId && localStorageApi) {
      void localStorageApi.remove(`${DEV_PANEL_SNAPSHOT_PREFIX}${conversationId}`).catch(() => {});
    }
    cancel();
  }

  const label = statusLabel(status);
  const active = isActive(status);
  const searchLog = getSearchLog(status);
  const candidateFormDefaults = {
    hangsaGbCode: draftFormData?.hangsaGbCode ?? '113',
    organization: draftFormData?.organization ?? '소프트웨어학과',
    eventName: draftFormData?.eventName ?? '회의실 예약',
    headcount: draftFormData?.headcount ?? lastFilledSlots?.headcount ?? candidate?.capacityMin ?? 1,
    purpose: draftFormData?.purpose ?? '회의',
  } satisfies ReservationFormData;
  const candidateCardKey = candidate
    ? [
        candidate.glsSpaceCode,
        candidateFormDefaults.hangsaGbCode,
        candidateFormDefaults.organization,
        candidateFormDefaults.eventName,
        String(candidateFormDefaults.headcount),
        candidateFormDefaults.purpose,
      ].join('|')
    : '';

  const footer = (
    <>
      {searchLog.length > 0 && <SearchLog entries={searchLog} />}
      {status.kind === 'navigation_required' && (
        <NavigationCard
          onConfirm={() => void confirmNavigation(true)}
          onReject={() => void confirmNavigation(false)}
        />
      )}
      {status.kind === 'login_required' && (
        <div className="login-cta">
          <div className="login-cta__text">
            현재 GLS 탭에서 로그인해 주세요. 로그인 후 아래 버튼을 누르면 같은 예약 요청으로 다시 시작합니다.
          </div>
          <button type="button" className="btn btn--primary" onClick={() => void resumeAfterLogin()}>
            로그인 완료, 다시 시도
          </button>
        </div>
      )}
      {candidate && (
        <CandidateCard
          key={candidateCardKey}
          candidate={candidate}
          defaultFormData={candidateFormDefaults}
          onPreview={(formData) => void previewReservation(formData)}
          onConfirm={(formData) => void confirmReservation(true, formData)}
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
          onClick={() => updateMode(mode === 'chat' ? 'dev' : 'chat')}
          title="자동화만 테스트 (LLM·서버 우회)"
        >
          {mode === 'dev' ? '💬 chat' : '🛠 dev'}
        </button>
        <button
          type="button"
          className="app__reset"
          onClick={resetConversation}
          title="대화 초기화"
        >
          초기화
        </button>
      </header>

      <main className="app__main">
        {restoring ? (
          <div className="chat-history">
            <div className="chat-history__empty">이전 대화와 예약 상태를 불러오는 중…</div>
          </div>
        ) : mode === 'chat' ? (
          <ChatHistory messages={messages} footer={footer} />
        ) : (
          <>
            <DevPanel
              busy={busy}
              initialState={devPanelState}
              onStateChange={setDevPanelState}
              onListSpaces={listDevSpaces}
              onRun={runDevAutomation}
            />
            {/* dev 모드에서도 후보 카드 / 로그인 안내는 동일하게 사용 */}
            <div className="dev-panel__footer">{footer}</div>
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
