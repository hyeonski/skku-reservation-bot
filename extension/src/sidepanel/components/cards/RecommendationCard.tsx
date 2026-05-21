import { Icon } from '../../icons';
import type { RecommendationSlots, SpaceSummary } from '../../types';

interface RecommendationCardProps {
  space: SpaceSummary;
  slots: RecommendationSlots;
  onAlternative?: () => void;
}

export function RecommendationCard({
  space,
  slots,
  onAlternative,
}: RecommendationCardProps) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="title">추천 공간</div>
        <div className="tag success">예약 가능</div>
      </div>
      <div className="card-body">
        <div className="rec-space">
          <div className="ph">
            <Icon name="building" size={22} />
          </div>
          <div className="info">
            <div className="name">{space.name}</div>
            <div className="building">
              {space.building} · {space.floor}
            </div>
            <div className="rec-meta">
              <div className="pair">
                <span>정원</span>
                <span className="v">{space.capa}</span>
              </div>
              <div className="pair">
                <span>시간</span>
                <span className="v">
                  {slots.start}–{slots.end}
                </span>
              </div>
              <div className="pair">
                <span>날짜</span>
                <span className="v">{slots.date}</span>
              </div>
            </div>
          </div>
        </div>
        {space.useJojikName && (
          <div className="dept-warn">
            <span className="icon">ⓘ</span>
            <span>
              <b>{space.useJojikName}</b> 우선 공간 — 신청 시 학생회 명의 권장
            </span>
          </div>
        )}
      </div>
      {onAlternative && (
        <div className="card-actions">
          <button type="button" className="btn small" onClick={onAlternative}>
            다른 공간 찾기
          </button>
        </div>
      )}
    </div>
  );
}
