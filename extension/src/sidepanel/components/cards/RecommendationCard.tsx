import { Icon } from '../../icons';
import type { RecommendationSlots, SpaceSummary } from '../../types';

interface RecommendationCardProps {
  space: SpaceSummary;
  slots: RecommendationSlots;
  onAlternative?: () => void;
}

// GLS LIMIT_TIME은 마감 시각이 아니라 1회 예약 최대 이용 시간이다.
// HHMM 형식의 duration: "0800" = 최대 8시간, "0830" = 최대 8시간 30분.
function formatLimitDuration(limitTimeHHMM?: string | null): string | null {
  if (!limitTimeHHMM || limitTimeHHMM.length !== 4) return null;
  const hours = parseInt(limitTimeHHMM.slice(0, 2), 10);
  const minutes = parseInt(limitTimeHHMM.slice(2, 4), 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  return parts.length ? `최대 ${parts.join(' ')}` : null;
}

export function RecommendationCard({
  space,
  slots,
  onAlternative,
}: RecommendationCardProps) {
  const limitDuration = formatLimitDuration(space.limitTimeHHMM);
  const locationLabel = `${space.building} · ${space.code}`;

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
              {limitDuration && (
                <div className="pair">
                  <span>최대 이용시간</span>
                  <span className="v">{limitDuration}</span>
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
