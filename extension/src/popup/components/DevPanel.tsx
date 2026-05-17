/**
 * Dev 전용 패널 — 채팅·LLM 우회하고 자동화 스크립트만 검증.
 *
 * 2단계 UX:
 *   1) 슬롯(날짜/시간/인원) + 선택 필터(캠퍼스/건물) + 신청서 입력 → "공간 조회"
 *      → 서버 /spaces 호출 (BG 가 대행) → 후보 공간 리스트 화면으로 전환
 *   2) 후보 공간 리스트에서 하나 선택 → POPUP_DEV_RUN_AUTOMATION 으로 자동화 트리거
 *      ("← 조건 수정" 으로 1단계 복귀 가능)
 *
 * 후보 공간 form 을 직접 입력하지 않고 DB 에서 받아 골라야 더 실제 production 흐름에
 * 가깝다 — 자동화 + 서버 /spaces 통합 검증 동시에 됨.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FilledSlots, ReservationFormData, SpaceCandidate } from '../../shared/types';

function nextWeekThursday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 4=Thu
  const daysUntilThisThursday = (4 - day + 7) % 7;
  const daysToNextWeekThursday = daysUntilThisThursday + 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysToNextWeekThursday);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SLOT_DEFAULTS = {
  date: nextWeekThursday(),
  startTime: '18:00',
  endTime: '20:00',
  headcount: 20,
};

const FILTER_DEFAULTS = {
  campusCode: '', // '' | '1' | '2'
  buildingNo: '',
};

const FORM_DEFAULTS = {
  hangsaGbCode: '111',
  organization: '소프트웨어학과 학생회',
  eventName: '자동화 테스트 회의',
  purpose: '자동화 스크립트 검증을 위한 테스트입니다.',
};

export interface DevPanelProps {
  busy: boolean;
  initialState?: DevPanelState | null;
  onStateChange?: (state: DevPanelState) => void;
  onListSpaces: (args: {
    headcount: number;
    campusCode?: string;
    buildingNo?: string;
  }) => Promise<SpaceCandidate[]>;
  onRun: (args: {
    slots: FilledSlots;
    candidates: SpaceCandidate[];
    formData: ReservationFormData;
  }) => Promise<void>;
}

type Step = 'form' | 'list';

export interface DevPanelState {
  step: Step;
  slots: typeof SLOT_DEFAULTS;
  filters: typeof FILTER_DEFAULTS;
  form: typeof FORM_DEFAULTS;
  candidates: SpaceCandidate[];
  error: string | null;
}

export function DevPanel({ busy, initialState, onStateChange, onListSpaces, onRun }: DevPanelProps) {
  const [step, setStep] = useState<Step>(initialState?.step ?? 'form');
  const [slots, setSlots] = useState(initialState?.slots ?? { ...SLOT_DEFAULTS });
  const [filters, setFilters] = useState(initialState?.filters ?? { ...FILTER_DEFAULTS });
  const [form, setForm] = useState(initialState?.form ?? { ...FORM_DEFAULTS });
  const [candidates, setCandidates] = useState<SpaceCandidate[]>(initialState?.candidates ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialState?.error ?? null);

  useEffect(() => {
    if (!initialState) return;
    setStep(initialState.step);
    setSlots(initialState.slots);
    setFilters(initialState.filters);
    setForm(initialState.form);
    setCandidates(initialState.candidates);
    setError(initialState.error);
  }, [initialState]);

  useEffect(() => {
    onStateChange?.({
      step,
      slots,
      filters,
      form,
      candidates,
      error,
    });
  }, [step, slots, filters, form, candidates, error, onStateChange]);

  const setSlot = <K extends keyof typeof SLOT_DEFAULTS>(k: K, v: (typeof SLOT_DEFAULTS)[K]) =>
    setSlots((p) => ({ ...p, [k]: v }));
  const setFilter = <K extends keyof typeof FILTER_DEFAULTS>(k: K, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));
  const setF = <K extends keyof typeof FORM_DEFAULTS>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const fetchCandidates = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loading || busy) return;
      if (!slots.date || !slots.startTime || !slots.endTime) return;

      setLoading(true);
      setError(null);
      try {
        const list = await onListSpaces({
          headcount: Number(slots.headcount),
          ...(filters.campusCode ? { campusCode: filters.campusCode } : {}),
          ...(filters.buildingNo ? { buildingNo: filters.buildingNo } : {}),
        });
        setCandidates(list);
        setStep('list');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loading, busy, slots, filters, onListSpaces],
  );

  const runWith = useCallback(
    (candidate: SpaceCandidate) => {
      const prioritizedCandidates = [
        candidate,
        ...candidates.filter((c) => c.glsSpaceCode !== candidate.glsSpaceCode),
      ];
      const filledSlots: FilledSlots = {
        date: slots.date,
        start_time: slots.startTime,
        end_time: slots.endTime,
        duration_min: null,
        headcount: Number(slots.headcount),
        campus: null,
        building: candidate.buildingName,
        space: candidate.roomName,
      };
      const formData: ReservationFormData = {
        hangsaGbCode: form.hangsaGbCode,
        organization: form.organization,
        eventName: form.eventName,
        headcount: Number(slots.headcount),
        purpose: form.purpose,
      };
      void onRun({ slots: filledSlots, candidates: prioritizedCandidates, formData });
    },
    [slots, form, candidates, onRun],
  );

  // ---------- Step: form ----------

  if (step === 'form') {
    return (
      <form className="dev-panel" onSubmit={fetchCandidates}>
        <div className="dev-panel__section">
          <h3 className="dev-panel__title">슬롯</h3>
          <div className="dev-panel__row">
            <label>
              날짜
              <input
                type="date"
                value={slots.date}
                onChange={(e) => setSlot('date', e.target.value)}
                required
              />
            </label>
            <label>
              인원
              <input
                type="number"
                min={1}
                value={slots.headcount}
                onChange={(e) => setSlot('headcount', Number(e.target.value))}
                required
              />
            </label>
          </div>
          <div className="dev-panel__row">
            <label>
              시작
              <input
                type="time"
                value={slots.startTime}
                onChange={(e) => setSlot('startTime', e.target.value)}
                required
              />
            </label>
            <label>
              종료
              <input
                type="time"
                value={slots.endTime}
                onChange={(e) => setSlot('endTime', e.target.value)}
                required
              />
            </label>
          </div>
        </div>

        <div className="dev-panel__section">
          <h3 className="dev-panel__title">필터 (선택)</h3>
          <div className="dev-panel__row">
            <label>
              캠퍼스
              <select
                value={filters.campusCode}
                onChange={(e) => setFilter('campusCode', e.target.value)}
              >
                <option value="">전체</option>
                <option value="1">인문사회과학</option>
                <option value="2">자연과학</option>
              </select>
            </label>
            <label>
              건물번호
              <input
                value={filters.buildingNo}
                onChange={(e) => setFilter('buildingNo', e.target.value)}
                placeholder="예: 161"
              />
            </label>
          </div>
        </div>

        <div className="dev-panel__section">
          <h3 className="dev-panel__title">신청서</h3>
          <label>
            행사구분 코드
            <input
              value={form.hangsaGbCode}
              onChange={(e) => setF('hangsaGbCode', e.target.value)}
              placeholder="111=학생회/동아리"
              required
            />
          </label>
          <label>
            주관단체
            <input
              value={form.organization}
              onChange={(e) => setF('organization', e.target.value)}
              required
            />
          </label>
          <label>
            행사명
            <input
              value={form.eventName}
              onChange={(e) => setF('eventName', e.target.value)}
              required
            />
          </label>
          <label>
            사용목적
            <textarea
              value={form.purpose}
              onChange={(e) => setF('purpose', e.target.value)}
              rows={3}
              required
            />
          </label>
        </div>

        {error && <div className="dev-panel__error">{error}</div>}

        <button type="submit" className="btn btn--primary" disabled={loading || busy}>
          {loading ? '조회 중…' : '공간 조회'}
        </button>
      </form>
    );
  }

  // ---------- Step: list ----------

  return (
    <div className="dev-panel">
      <div className="dev-panel__list-header">
        <button
          type="button"
          className="btn"
          onClick={() => setStep('form')}
          disabled={busy}
        >
          ← 조건 수정
        </button>
        <span className="dev-panel__list-count">
          {slots.date} {slots.startTime}-{slots.endTime} · {slots.headcount}명
          {' · '}
          후보 {candidates.length}개
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="dev-panel__empty">
          조건에 맞는 공간이 없습니다. 인원/필터를 조정해 다시 조회해보세요.
        </div>
      ) : (
        <ul className="dev-panel__candidates">
          {candidates.map((c) => (
            <li key={c.glsSpaceCode} className="dev-panel__candidate">
              <div className="dev-panel__candidate-main">
                <div className="dev-panel__candidate-title">
                  {c.buildingName} {c.roomName}{' '}
                  <span className="dev-panel__candidate-code">[{c.glsSpaceCode}]</span>
                </div>
                <div className="dev-panel__candidate-meta">
                  {c.campusName} · 수용 {c.capacityMin}~{c.capacityMax}명
                  {c.isUserOrgPreferred ? ' · 소속 우선' : ''}
                </div>
                {c.useJojikName && (
                  <div className="dev-panel__candidate-org">권한: {c.useJojikName}</div>
                )}
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => runWith(c)}
                disabled={busy}
              >
                선택
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
