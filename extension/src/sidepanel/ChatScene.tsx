/**
 * 실 데이터 기반 채팅 화면 — useConversation 의 state 를 직접 렌더.
 *
 * 카드 분기:
 *   automationStatus.kind          | 카드
 *   --------------------------------|--------------------------
 *   login_required                  | GLSLoginCard variant=needed
 *   searching                       | SearchProgressCard (현재 진행)
 *   candidate_found                 | SearchProgressCard frozen + RecommendationCard
 *   submitting / submitStep != null | SubmitProgressCard
 *   no_candidate                    | SearchProgressCard frozen + NoSpaceCard
 *
 * 추가:
 *   applicationState.draft 완성 + proposedCandidate 있음 → DraftCard
 *   applicationState.suggested_memory 있음 + draft 아직 없음 → P2SuggestCard
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { HANGSA_LABELS } from '@gls/nexacroPaths';
import { useChatStateMachine } from './hooks/useChatStateMachine';
import type { UseConversation } from './hooks/useConversation';
import { ChatComposer } from './components/ChatComposer';
import { ChatHeader } from './components/ChatHeader';
import { ChatMessage } from './components/ChatMessage';
import { ChatThread } from './components/ChatThread';
import { HintChips } from './components/HintChips';
import { TypingIndicator } from './components/TypingIndicator';
import { DraftCard } from './components/cards/DraftCard';
import { GLSLoginCard } from './components/cards/GLSLoginCard';
import { NoSpaceCard } from './components/cards/NoSpaceCard';
import { P2SuggestCard } from './components/cards/P2SuggestCard';
import { RecommendationCard } from './components/cards/RecommendationCard';
import { SearchProgressCard } from './components/cards/SearchProgressCard';
import { SubmitProgressCard } from './components/cards/SubmitProgressCard';
import type {
  ReservationFormData,
  SpaceCandidate,
} from '../shared/types';
import type {
  DraftFields,
  DraftSuggestedFlags,
  RecommendationSlots,
  SearchCandidate,
  SpaceSummary,
} from './types';

interface ChatSceneProps {
  conv: UseConversation;
  onBack: () => void;
  onNew: () => void;
}

interface SearchCardSnapshot {
  id: string;
  candidates: SearchCandidate[];
  currentIdx: number;
  found: boolean;
  frozen: boolean;
}

interface DraftCardSnapshot {
  id: string;
  draft: DraftFields;
  suggested: DraftSuggestedFlags;
  superseded: boolean;
}

// ---- adapters: SpaceCandidate / draft / etc. → UI shape -----------------

function adaptCandidates(
  candidates: SpaceCandidate[],
  results: Map<string, { available: boolean | null; why?: string }>,
): SearchCandidate[] {
  return candidates.map((c) => {
    const r = results.get(c.glsSpaceCode);
    let result: SearchCandidate['result'] = 'pending';
    if (r?.available === true) result = 'found';
    else if (r?.available === false) result = 'fail';
    return {
      code: c.glsSpaceCode,
      name: c.roomName,
      building: c.buildingName,
      result,
      ...(r?.why ? { why: r.why } : {}),
    };
  });
}

function adaptSpaceSummary(c: SpaceCandidate): SpaceSummary {
  return {
    code: c.glsSpaceCode,
    name: c.roomName,
    building: c.buildingName,
    floor: deriveFloorLabel(c.roomName, c.glsSpaceCode),
    capa: `최대 ${c.capacityMax}명`,
    ...(c.useJojikName ? { useJojikName: c.useJojikName } : {}),
    contents: c.contents,
    limitTimeHHMM: c.limitTimeHHMM,
  };
}

function deriveFloorLabel(roomName: string, code: string): string | undefined {
  const roomMatch = roomName.match(/(\d{3,4})\s*호/);
  const raw = roomMatch?.[1] ?? (code.match(/^(\d{3,4})/)?.[1]);
  if (!raw) return undefined;
  const floor = raw.length >= 4 ? raw.slice(0, 2) : raw.slice(0, 1);
  const parsed = Number.parseInt(floor, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return `${parsed}층`;
}

function adaptSlots(slots: import('../shared/types').FilledSlots | null): RecommendationSlots {
  if (!slots) return { date: '', start: '', end: '' };
  return {
    date: slots.date ?? '',
    start: slots.start_time ?? '',
    end: slots.end_time ?? '',
  };
}

function draftToFields(
  draft: import('../shared/types').ReservationFormData | null,
): DraftFields {
  if (!draft) return {};
  const categoryLabel =
    HANGSA_LABELS[draft.hangsaGbCode as keyof typeof HANGSA_LABELS] ??
    draft.hangsaGbCode;
  return {
    category: categoryLabel || undefined,
    group: draft.organization || undefined,
    event: draft.eventName || undefined,
    headcount: draft.headcount > 0 ? `${draft.headcount}명` : undefined,
    purpose: draft.purpose || undefined,
  };
}

/** ApplicationState.source==='memory' 이면 모든 필드를 P2 추천으로 표시. */
function suggestedFlags(
  app: import('../shared/types').ApplicationState | null,
): DraftSuggestedFlags {
  if (!app || app.source !== 'memory') return {};
  return { category: true, group: true, event: true, purpose: true };
}

function fieldsAreComplete(d: DraftFields): boolean {
  return !!(d.category && d.group && d.event && d.purpose);
}

// -------------------------------------------------------------------------

export function ChatScene({ conv, onBack, onNew }: ChatSceneProps) {
  const { state } = conv;
  const view = useChatStateMachine(state);
  const [composerValue, setComposerValue] = useState('');
  const [manualHints, setManualHints] = useState<string[] | null>(null);
  const [searchSnapshots, setSearchSnapshots] = useState<SearchCardSnapshot[]>([]);
  const [draftSnapshots, setDraftSnapshots] = useState<DraftCardSnapshot[]>([]);
  const lastCandidatesRef = useRef<SpaceCandidate[] | null>(null);

  // 검증 / 추천 / 실패 카드 분기 데이터 준비.
  const uiCandidates = useMemo(
    () => adaptCandidates(state.candidates, state.candidateResults),
    [state.candidates, state.candidateResults],
  );
  const proposed = state.proposedCandidate;
  const draft = state.applicationState?.draft ?? null;
  const recommendation = state.applicationState?.recommendation ?? null;
  const suggestedMemory = state.applicationState?.suggested_memory ?? null;
  const draftFields = useMemo(() => draftToFields(draft), [draft]);
  const draftFlags = useMemo(
    () => suggestedFlags(state.applicationState),
    [state.applicationState],
  );

  const showSearchCard =
    state.candidates.length > 0 &&
    (state.automationStatus.kind === 'searching' ||
      state.automationStatus.kind === 'candidate_found' ||
      state.automationStatus.kind === 'no_candidate' ||
      state.automationStatus.kind === 'opening_gls');
  const searchFrozen =
    state.automationStatus.kind === 'candidate_found' ||
    state.automationStatus.kind === 'no_candidate' ||
    state.submitStep !== null ||
    state.automationStatus.kind === 'done';
  const foundCurrent = state.automationStatus.kind === 'candidate_found';

  const showRecommendation = !!proposed;
  const showDraft =
    !!proposed &&
    fieldsAreComplete(draftFields) &&
    state.submitStep === null &&
    state.automationStatus.kind !== 'done';
  const showP2 =
    view.phase === 'meta-p2' && !!suggestedMemory;
  const showLogin = !!state.loginPrompt;
  const showNoSpace = state.automationStatus.kind === 'no_candidate';
  const submitStep = state.submitStep;
  const showPreparingSearchCard =
    state.automationStatus.kind === 'opening_gls' && state.candidates.length === 0;
  const visibleHints = manualHints ?? view.hints;
  const noSpaceSummary = useMemo(() => {
    const date = state.slots?.date ?? '';
    const start = state.slots?.start_time ?? '';
    const end = state.slots?.end_time ?? '';
    const headcount = state.slots?.headcount != null ? `${state.slots.headcount}명` : '';
    if (!date && !start && !headcount) return undefined;
    return `${date} ${start}${end ? `–${end}` : ''}, ${headcount} 조건으로 확인했지만 지금은 맞는 공간이 없었습니다.`;
  }, [state.slots]);

  useEffect(() => {
    setManualHints(null);
    setSearchSnapshots([]);
    setDraftSnapshots([]);
    lastCandidatesRef.current = null;
  }, [state.conversationId]);

  useEffect(() => {
    if (state.candidates.length === 0) return;

    const isNewSearch = lastCandidatesRef.current !== state.candidates;
    lastCandidatesRef.current = state.candidates;

    setSearchSnapshots((prev) => {
      const nextSnapshot: SearchCardSnapshot = {
        id: isNewSearch ? `search-${Date.now()}` : (prev.at(-1)?.id ?? `search-${Date.now()}`),
        candidates: uiCandidates,
        currentIdx: state.currentIdx,
        found: foundCurrent,
        frozen: searchFrozen,
      };

      if (isNewSearch || prev.length === 0) {
        return [
          ...prev.map((item, index) =>
            index === prev.length - 1 ? { ...item, frozen: true } : item,
          ),
          nextSnapshot,
        ];
      }

      return prev.map((item, index) =>
        index === prev.length - 1 ? nextSnapshot : item,
      );
    });
  }, [
    state.candidates,
    state.currentIdx,
    uiCandidates,
    foundCurrent,
    searchFrozen,
  ]);

  useEffect(() => {
    if (!showDraft) return;

    setDraftSnapshots((prev) => {
      const latest = prev.at(-1);
      const sameAsLatest =
        latest &&
        JSON.stringify(latest.draft) === JSON.stringify(draftFields) &&
        JSON.stringify(latest.suggested) === JSON.stringify(draftFlags);
      if (sameAsLatest) return prev;

      return [
        ...prev.map((item, index) =>
          index === prev.length - 1 ? { ...item, superseded: true } : item,
        ),
        {
          id: `draft-${Date.now()}`,
          draft: draftFields,
          suggested: draftFlags,
          superseded: false,
        },
      ];
    });
  }, [showDraft, draftFields, draftFlags]);

  const onSend = () => {
    const text = composerValue;
    setComposerValue('');
    setManualHints(null);
    void conv.sendMessage(text);
  };

  const onHintClick = (chip: string) => {
    setComposerValue('');
    setManualHints(null);
    void conv.sendMessage(chip);
  };

  const onSubmitDraft = () => {
    if (!draft) return;
    const formData: ReservationFormData = draft;
    void conv.confirmReservation(formData);
  };

  const onEditDraft = () => {
    setComposerValue('');
    setManualHints([
      '행사명을 정기회의로',
      '주관단체는 총학생회로',
      '인원은 25명으로',
    ]);
  };

  const onAlternative = () => {
    setManualHints(null);
    void conv.findAlternative();
  };

  const onOpenLogin = () => {
    void conv.openLoginTab();
  };

  return (
    <div className="screen">
      <ChatHeader
        title={view.title}
        sessionLabel={view.label}
        onBack={onBack}
        onNew={onNew}
      />
      <ChatThread>
        {state.messages.map((m) => (
          <ChatMessage key={m.id} role={m.role} ts={m.ts}>
            {m.content}
          </ChatMessage>
        ))}
        {state.parsing && <TypingIndicator />}

        {showLogin && state.loginPrompt && (
          <GLSLoginCard
            variant={state.loginPrompt.variant}
            loggingIn={state.loginPrompt.loggingIn}
            onOpenLogin={onOpenLogin}
          />
        )}

        {showSearchCard &&
          searchSnapshots.map((snapshot) => (
            <SearchProgressCard
              key={snapshot.id}
              candidates={snapshot.candidates}
              currentIdx={snapshot.currentIdx}
              found={snapshot.found}
              frozen={snapshot.frozen}
            />
          ))}

        {showPreparingSearchCard && (
          <SearchProgressCard
            candidates={[]}
            currentIdx={0}
            found={false}
            pendingLabel="GLS 세션을 확인하고 후보 공간을 불러오는 중이에요."
          />
        )}

        {showSearchCard === false && searchSnapshots.length > 0 && (
          <SearchProgressCard
            candidates={searchSnapshots[searchSnapshots.length - 1]!.candidates}
            currentIdx={searchSnapshots[searchSnapshots.length - 1]!.currentIdx}
            found={searchSnapshots[searchSnapshots.length - 1]!.found}
            frozen
          />
        )}

        {showNoSpace && <NoSpaceCard summary={noSpaceSummary} />}

        {showRecommendation && proposed && (
          <RecommendationCard
            space={adaptSpaceSummary(proposed)}
            slots={adaptSlots(state.slots)}
            onAlternative={onAlternative}
          />
        )}

        {showP2 && suggestedMemory && (
          <P2SuggestCard
            prev={{
              when: state.slots?.date ?? '',
              group: recommendation?.group ?? suggestedMemory.formData.organization,
              event: recommendation?.event ?? suggestedMemory.formData.eventName,
              frequencyHint: suggestedMemory.label,
            }}
            onAccept={() => {
              void conv.applySuggestedMemory();
            }}
            onDecline={() => {
              void conv.dismissSuggestedMemory();
            }}
          />
        )}

        {draftSnapshots.map((snapshot) => (
          <DraftCard
            key={snapshot.id}
            draft={snapshot.draft}
            suggested={snapshot.suggested}
            superseded={snapshot.superseded}
            submitting={!snapshot.superseded && (submitStep === 'filling' || submitStep === 'saving')}
            onSubmit={onSubmitDraft}
            onEdit={onEditDraft}
          />
        ))}

        {submitStep && (
          <SubmitProgressCard step={submitStep} />
        )}

        {state.lastError && (
          <ChatMessage role="assistant">⚠ {state.lastError}</ChatMessage>
        )}
      </ChatThread>

      <div className="popup-foot">
        <HintChips chips={visibleHints} onClick={onHintClick} />
        <ChatComposer
          value={composerValue}
          onChange={setComposerValue}
          onSend={onSend}
          placeholder={view.placeholder}
          disabled={view.composerDisabled}
        />
      </div>
    </div>
  );
}
