import type { SearchCandidate } from '../../types';

interface SearchProgressCardProps {
  candidates: SearchCandidate[];
  /** 검증 중인 후보의 인덱스. 모든 후보 끝나면 candidates.length 사용. */
  currentIdx: number;
  /** 현재 후보가 found 인지. */
  found: boolean;
  /** 더 이상 활성 아님 (재시도로 새 카드로 교체된 경우). 모든 항목을 결과 상태로 그림. */
  frozen?: boolean;
  /** 후보를 받기 전의 준비 상태 텍스트. */
  pendingLabel?: string;
}

export function SearchProgressCard({
  candidates,
  currentIdx,
  found,
  frozen = false,
  pendingLabel,
}: SearchProgressCardProps) {
  const total = candidates.length;
  const safeIdx = Math.min(currentIdx, total);
  const progress = frozen
    ? 1
    : ((safeIdx + (found ? 1 : 0.5)) / Math.max(total, 1));
  const isPreparing = total === 0;

  return (
    <div className="card">
      <div className="card-head">
        <div className="title">빈 공간 찾는 중</div>
        <div className="tag accent">
          {isPreparing ? '준비 중' : `검증 ${Math.min(safeIdx + 1, total)}/${total}`}
        </div>
      </div>
      <div className="card-body">
        <div className="search-progress">
          <div className="progress-bar">
            <div className="fill" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
          </div>
          <div className="search-list">
            {isPreparing && (
              <div className="search-item preparing active">
                <span className="marker" />
                <span>{pendingLabel ?? 'GLS 세션을 확인하고 탐색 준비 중이에요.'}</span>
              </div>
            )}
            {candidates.map((c, i) => {
              let cls: 'pending' | 'active' | 'done' | 'found' = 'pending';
              if (frozen) {
                cls = c.result === 'found' ? 'found' : 'done';
              } else if (i < currentIdx) {
                cls = c.result === 'found' ? 'found' : 'done';
              } else if (i === currentIdx) {
                cls = found && c.result === 'found' ? 'found' : 'active';
              }
              const showWhy = cls === 'done' || cls === 'found';
              return (
                <div key={c.code} className={`search-item ${cls}`}>
                  <span className="marker" />
                  <span>
                    {c.building} · {c.name}
                  </span>
                  {showWhy && c.why && <span className="why">{c.why}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
