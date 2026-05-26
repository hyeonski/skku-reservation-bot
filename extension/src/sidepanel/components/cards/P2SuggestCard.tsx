import { Icon } from '../../icons';
import type { P2Recommendation } from '../../types';

interface P2SuggestCardProps {
  prev: P2Recommendation;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * P2 인라인 추천 — 봇 메시지 안에 배치되는 카드 형태.
 * (.msg.bot > .p2-suggest)
 */
export function P2SuggestCard({ prev, onAccept, onDecline }: P2SuggestCardProps) {
  return (
    <div className="msg bot">
      <div className="p2-suggest">
        <div className="icon">
          <Icon name="sparkles" size={16} />
        </div>
        <div className="content">
          이전 신청 정보처럼 <b>{prev.group} {prev.event}</b>로 작성할까요?
          {prev.frequencyHint && <div className="src">{prev.frequencyHint}</div>}
          <div className="actions">
            <button type="button" className="btn primary small" onClick={onAccept}>
              네, 같게요
            </button>
            <button type="button" className="btn small" onClick={onDecline}>
              다른 행사예요
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
