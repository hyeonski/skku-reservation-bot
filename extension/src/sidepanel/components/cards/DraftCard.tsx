import type { DraftFields, DraftSuggestedFlags } from '../../types';

interface DraftCardProps {
  draft: DraftFields;
  /** 어느 필드가 P2 추천으로 채워졌는지. */
  suggested?: DraftSuggestedFlags;
  submitting?: boolean;
  submitLocked?: boolean;
  canSubmit?: boolean;
  onSubmit: () => void;
  onEdit: () => void;
  /** true 면 이전 draft 카드 (대체됨) — 흐림 처리, 본문 collapse, 액션 숨김. */
  superseded?: boolean;
}

const FIELDS: Array<[label: string, key: keyof DraftFields]> = [
  ['행사구분', 'category'],
  ['주관단체', 'group'],
  ['행사명', 'event'],
  ['행사인원', 'headcount'],
  ['사용목적', 'purpose'],
];

export function DraftCard({
  draft,
  suggested = {},
  submitting = false,
  submitLocked = false,
  canSubmit = true,
  onSubmit,
  onEdit,
  superseded = false,
}: DraftCardProps) {
  const cardStyle = superseded ? { opacity: 0.55 } : undefined;

  return (
    <div className="card" style={cardStyle}>
      <div className="card-head">
        <div className="title">신청서 미리보기</div>
        <div className={`tag ${superseded ? 'muted' : 'muted'}`}>
          {superseded ? '교체됨' : '초안'}
        </div>
      </div>
      {!superseded && (
        <div className="card-body">
          <div className="draft-list">
            {FIELDS.map(([label, key]) => {
              const value = draft[key];
              const isSuggested = !!suggested[key];
              const classes = ['v'];
              if (!value) classes.push('muted');
              else if (isSuggested) classes.push('suggested');
              return (
                <div className="draft-row" key={key}>
                  <div className="k">{label}</div>
                  <div className={classes.join(' ')}>{value || '미입력'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!superseded && (
        <div className="card-actions">
          <button
            type="button"
            className="btn primary small"
            onClick={onSubmit}
            disabled={submitting || submitLocked || !canSubmit}
          >
            {submitting ? '신청 저장 중…' : submitLocked ? '신청 저장 완료' : 'GLS 신청 저장'}
          </button>
          <button type="button" className="btn small" onClick={onEdit}>
            수정
          </button>
        </div>
      )}
    </div>
  );
}
