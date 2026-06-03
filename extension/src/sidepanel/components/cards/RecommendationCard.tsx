import { Icon } from '../../icons';
import type { RecommendationSlots, SpaceSummary } from '../../types';

interface RecommendationCardProps {
  space: SpaceSummary;
  slots: RecommendationSlots;
  onAlternative?: () => void;
}

function formatLimitTime(limitTimeHHMM?: string | null): string | null {
  if (!limitTimeHHMM || limitTimeHHMM.length !== 4) return null;
  return `${limitTimeHHMM.slice(0, 2)}:${limitTimeHHMM.slice(2, 4)}`;
}

export function RecommendationCard({
  space,
  slots,
  onAlternative,
}: RecommendationCardProps) {
  const limitTime = formatLimitTime(space.limitTimeHHMM);
  const buildingLabel = space.buildingNo
    ? `${space.building}(${space.buildingNo}동)`
    : space.building;
  const locationLabel = space.floor
    ? `${buildingLabel} · ${space.floor}`
    : buildingLabel;

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
            <div className="name">{space.name}({space.code})</div>
            <div className="building">{locationLabel}</div>
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
              {limitTime && (
                <div className="pair">
                  <span>운영시간</span>
                  <span className="v">~{limitTime}</span>
                </div>
              )}
            </div>
            {space.personalizationReason && (
              <div className="rec-reason">
                <span>추천 이유</span>
                <span>{space.personalizationReason}</span>
              </div>
            )}
            {space.contents && <div className="rec-note">{space.contents}</div>}
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
