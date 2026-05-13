/**
 * Dev 전용 패널 — 채팅·LLM·서버를 모두 우회하고 자동화 스크립트만 트리거.
 *
 * 사용 흐름:
 *   1. slots(date/time/headcount) + candidate 1개 + formData 를 직접 입력
 *   2. "자동화 시작" → background SW가 runReservationFlow 를 candidates 주입한 채 실행
 *   3. 검증된 후 BG가 BG_CANDIDATE_PROPOSAL 푸시 → 상위 popup 의 CandidateCard 에서 confirm
 *
 * 의도적으로 단일 후보만 입력 가능. 여러 후보 순회 테스트는 후속 (textarea JSON paste 등)으로.
 */

import { useState } from 'react';
import type { FilledSlots, SpaceCandidate } from '../../shared/types';
import type { ReservationFormData } from '../../shared/messages';

const DEFAULTS = {
  date: '',
  startTime: '18:00',
  endTime: '20:00',
  headcount: 20,
  campusCode: '1',
  campusName: '인문사회과학캠퍼스',
  buildingNo: '161',
  buildingName: '수선관',
  glsSpaceCode: '61605',
  roomName: 'e+강의실(70명)',
  capacityMin: 10,
  capacityMax: 70,
  hangsaGbCode: '111',
  organization: '소프트웨어학과 학생회',
  eventName: '자동화 테스트 회의',
  purpose: '자동화 스크립트 검증을 위한 테스트입니다.',
};

export interface DevPanelProps {
  busy: boolean;
  onRun: (args: {
    slots: FilledSlots;
    candidates: SpaceCandidate[];
    formData: ReservationFormData;
  }) => Promise<void>;
}

export function DevPanel({ busy, onRun }: DevPanelProps) {
  const [v, setV] = useState({ ...DEFAULTS });

  function set<K extends keyof typeof DEFAULTS>(k: K, val: (typeof DEFAULTS)[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (busy) return;

    if (!v.date || !v.startTime || !v.endTime) return;

    const slots: FilledSlots = {
      date: v.date,
      start_time: v.startTime,
      end_time: v.endTime,
      duration_min: null,
      headcount: Number(v.headcount),
      building: v.buildingName,
      space: null,
    };

    const candidate: SpaceCandidate = {
      glsSpaceCode: v.glsSpaceCode,
      campusCode: v.campusCode,
      buildingNo: v.buildingNo,
      campusName: v.campusName,
      buildingName: v.buildingName,
      roomName: v.roomName,
      capacityMin: Number(v.capacityMin),
      capacityMax: Number(v.capacityMax),
      useJojikName: null,
      contents: null,
      limitTimeHHMM: null,
      isUserOrgPreferred: false,
    };

    const formData: ReservationFormData = {
      hangsaGbCode: v.hangsaGbCode,
      organization: v.organization,
      eventName: v.eventName,
      headcount: Number(v.headcount),
      purpose: v.purpose,
    };

    void onRun({ slots, candidates: [candidate], formData });
  }

  return (
    <form className="dev-panel" onSubmit={submit}>
      <div className="dev-panel__section">
        <h3 className="dev-panel__title">슬롯</h3>
        <div className="dev-panel__row">
          <label>
            날짜
            <input
              type="date"
              value={v.date}
              onChange={(e) => set('date', e.target.value)}
              required
            />
          </label>
          <label>
            인원
            <input
              type="number"
              min={1}
              value={v.headcount}
              onChange={(e) => set('headcount', Number(e.target.value))}
              required
            />
          </label>
        </div>
        <div className="dev-panel__row">
          <label>
            시작
            <input
              type="time"
              value={v.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              required
            />
          </label>
          <label>
            종료
            <input
              type="time"
              value={v.endTime}
              onChange={(e) => set('endTime', e.target.value)}
              required
            />
          </label>
        </div>
      </div>

      <div className="dev-panel__section">
        <h3 className="dev-panel__title">후보 공간</h3>
        <div className="dev-panel__row">
          <label>
            캠퍼스 코드
            <input
              value={v.campusCode}
              onChange={(e) => set('campusCode', e.target.value)}
              placeholder="1=인문, 2=자연"
              required
            />
          </label>
          <label>
            캠퍼스명
            <input
              value={v.campusName}
              onChange={(e) => set('campusName', e.target.value)}
              required
            />
          </label>
        </div>
        <div className="dev-panel__row">
          <label>
            건물번호
            <input
              value={v.buildingNo}
              onChange={(e) => set('buildingNo', e.target.value)}
              required
            />
          </label>
          <label>
            건물명
            <input
              value={v.buildingName}
              onChange={(e) => set('buildingName', e.target.value)}
              required
            />
          </label>
        </div>
        <div className="dev-panel__row">
          <label>
            공간코드
            <input
              value={v.glsSpaceCode}
              onChange={(e) => set('glsSpaceCode', e.target.value)}
              required
            />
          </label>
          <label>
            공간명
            <input
              value={v.roomName}
              onChange={(e) => set('roomName', e.target.value)}
              required
            />
          </label>
        </div>
        <div className="dev-panel__row">
          <label>
            정원 min
            <input
              type="number"
              min={1}
              value={v.capacityMin}
              onChange={(e) => set('capacityMin', Number(e.target.value))}
            />
          </label>
          <label>
            정원 max
            <input
              type="number"
              min={1}
              value={v.capacityMax}
              onChange={(e) => set('capacityMax', Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="dev-panel__section">
        <h3 className="dev-panel__title">신청서</h3>
        <label>
          행사구분 코드
          <input
            value={v.hangsaGbCode}
            onChange={(e) => set('hangsaGbCode', e.target.value)}
            placeholder="111=학생회/동아리"
            required
          />
        </label>
        <label>
          주관단체
          <input
            value={v.organization}
            onChange={(e) => set('organization', e.target.value)}
            required
          />
        </label>
        <label>
          행사명
          <input
            value={v.eventName}
            onChange={(e) => set('eventName', e.target.value)}
            required
          />
        </label>
        <label>
          사용목적
          <textarea
            value={v.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            rows={3}
            required
          />
        </label>
      </div>

      <button type="submit" className="btn btn--primary" disabled={busy}>
        자동화 시작
      </button>
    </form>
  );
}
