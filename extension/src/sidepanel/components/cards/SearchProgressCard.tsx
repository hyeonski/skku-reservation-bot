import { useState } from 'react';
import type { SearchCandidate } from '../../types';
import { Icon } from '../../icons';

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
  /** 활성 탐색을 사용자가 중단할 때 호출. */
  onCancel?: () => void;
}

/**
 * 탐색 풀이 커도(예: 30곳) 카드가 채팅을 밀어내지 않도록 상태별 3분할로 접는다.
 *  - 위 collapse: 이미 확인한 불가 후보 전부 (위치 무관)
 *  - 가운데: 가용(✓) 후보 + 현재 검증 중(●) 후보 + 대기 일부(○)
 *  - 아래 collapse: 아직 안 본 대기 후보
 * 가용을 넘기고 계속 탐색해도, 가용 후보와 현재 검증 중 후보는 항상 가운데에 남는다.
 * 접힌 줄을 누르면 전체를 펼쳤다 접을 수 있다.
 */
const CONTEXT_AFTER = 3; // 현재 검증 중 후보 아래로 미리 보여줄 대기 후보 수
const COLLAPSE_MIN = 2; // 이만큼 미만이면 접지 않고 그냥 노출 (요약 줄이 더 거추장스러움)

export function SearchProgressCard({
  candidates,
  currentIdx,
  found,
  frozen = false,
  pendingLabel,
  onCancel,
}: SearchProgressCardProps) {
  const [expanded, setExpanded] = useState(false);
  const total = candidates.length;
  const safeIdx = Math.min(currentIdx, total);
  const progress = frozen
    ? 1
    : ((safeIdx + (found ? 1 : 0.5)) / Math.max(total, 1));
  const isPreparing = total === 0;

  const classify = (i: number): 'pending' | 'active' | 'done' | 'found' => {
    const c = candidates[i]!;
    if (frozen) return c.result === 'found' ? 'found' : 'done';
    if (i < currentIdx) return c.result === 'found' ? 'found' : 'done';
    if (i === currentIdx) return found && c.result === 'found' ? 'found' : 'active';
    return 'pending';
  };

  // 현재 검증 중 후보(있다면). 이미 found 로 확정된 후보는 active 가 아니다.
  const activeIdx =
    !frozen && currentIdx < total && candidates[currentIdx]?.result !== 'found'
      ? currentIdx
      : -1;

  // 상태별 분류 (active 제외).
  const foundIdxs: number[] = [];
  const failIdxs: number[] = [];
  const pendingIdxs: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i === activeIdx) continue;
    const r = candidates[i]?.result;
    if (r === 'found') foundIdxs.push(i);
    else if (r === 'fail') failIdxs.push(i);
    else pendingIdxs.push(i);
  }

  // frozen(탐색 종료)에서는 "다음에 볼 대기" 개념이 없으니 미리보기 0개.
  const effectiveAfter = frozen ? 0 : CONTEXT_AFTER;
  const collapseFails = !expanded && failIdxs.length >= COLLAPSE_MIN;
  const hidePending = !expanded && pendingIdxs.length - effectiveAfter >= COLLAPSE_MIN;
  const shownPending = hidePending ? pendingIdxs.slice(0, effectiveAfter) : pendingIdxs;
  const hiddenPendingCount = hidePending ? pendingIdxs.length - effectiveAfter : 0;

  // 가운데: 가용 + 진행 중 + 대기 일부 (+ 접지 않은 소수의 불가) — 인덱스 순.
  const middle = [
    ...foundIdxs,
    ...(activeIdx >= 0 ? [activeIdx] : []),
    ...shownPending,
    ...(collapseFails ? [] : failIdxs),
  ].sort((a, b) => a - b);

  const renderItem = (i: number) => {
    const c = candidates[i]!;
    const cls = classify(i);
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
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="title">빈 공간 찾는 중</div>
        <div className="card-actions">
          <div className="tag accent">
            {isPreparing ? '준비 중' : `검증 ${Math.min(safeIdx + 1, total)}/${total}`}
          </div>
          {onCancel && !frozen && (
            <button
              type="button"
              className="btn ghost small"
              onClick={onCancel}
              title="탐색 중단"
            >
              <Icon name="x-circle" size={13} />
              중단
            </button>
          )}
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
            {expanded && (
              <button
                type="button"
                className="search-item summary tail"
                onClick={() => setExpanded(false)}
              >
                <span className="marker" />
                <span>전체 {total}곳</span>
                <span className="why">접기</span>
              </button>
            )}
            {expanded
              ? candidates.map((_, i) => renderItem(i))
              : (
                <>
                  {collapseFails && (
                    <button
                      type="button"
                      className="search-item summary lead"
                      onClick={() => setExpanded(true)}
                    >
                      <span className="marker" />
                      <span>이미 확인한 {failIdxs.length}곳 불가</span>
                      <span className="why">펼치기</span>
                    </button>
                  )}
                  {middle.map((i) => renderItem(i))}
                  {hidePending && (
                    <button
                      type="button"
                      className="search-item summary tail"
                      onClick={() => setExpanded(true)}
                    >
                      <span className="marker" />
                      <span>
                        {frozen
                          ? `${hiddenPendingCount}곳 미확인`
                          : `${hiddenPendingCount}곳 더 확인 예정`}
                      </span>
                      <span className="why">펼치기</span>
                    </button>
                  )}
                </>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
