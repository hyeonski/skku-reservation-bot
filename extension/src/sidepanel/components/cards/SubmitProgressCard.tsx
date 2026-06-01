interface SubmitProgressCardProps {
  /** 'filling' | 'saving' | 'saved' — GLS 자동화 단계. */
  step: 'filling' | 'saving' | 'saved';
}

const LABEL: Record<SubmitProgressCardProps['step'], string> = {
  filling: '폼 자동 작성 중…',
  saving: 'GLS에 신청 저장 중…',
  saved: '신청 저장 완료 · 승인 대기',
};

const PROGRESS: Record<SubmitProgressCardProps['step'], number> = {
  filling: 0.4,
  saving: 0.8,
  saved: 1,
};

export function SubmitProgressCard({ step }: SubmitProgressCardProps) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="title">신청서 저장 진행</div>
        <div className={`tag ${step === 'saved' ? 'success' : 'accent'}`}>
          {step === 'saved' ? '승인 대기' : '진행'}
        </div>
      </div>
      <div className="card-body">
        <div className="search-progress">
          <div className="progress-bar">
            <div className="fill" style={{ width: `${PROGRESS[step] * 100}%` }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{LABEL[step]}</div>
        </div>
      </div>
    </div>
  );
}
