import { Icon } from '../../icons';

interface GLSLoginCardProps {
  variant: 'needed' | 'expired';
  loggingIn?: boolean;
  onOpenLogin: () => void;
}

export function GLSLoginCard({
  variant,
  loggingIn = false,
  onOpenLogin,
}: GLSLoginCardProps) {
  const isExpired = variant === 'expired';
  return (
    <div className="card gls-login-card">
      <div className="card-head">
        <div className="title">
          <span className="login-icon">
            <Icon name="lock" size={13} />
          </span>
          {isExpired ? 'GLS 세션이 만료됐어요' : 'GLS 로그인이 필요해요'}
        </div>
        <div className="tag warning">{isExpired ? '재로그인' : '필요'}</div>
      </div>
      <div className="card-body">
        <div className="login-body">
          {isExpired
            ? '검증 도중에 GLS 로그인이 풀렸어요. 다시 로그인하시면 멈춘 지점부터 이어서 진행할게요.'
            : '예약은 사용자님의 GLS 계정으로 직접 진행돼요. 새 탭에서 로그인하시면 이어서 진행할게요.'}
          <div className="login-domain">
            <Icon name="lock" size={11} />
            <span>kingoinfo.skku.edu</span>
          </div>
        </div>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="btn primary small"
          onClick={onOpenLogin}
          disabled={loggingIn}
        >
          {loggingIn
            ? '로그인 확인 중…'
            : isExpired
              ? '다시 로그인'
              : 'GLS 로그인 열기'}
        </button>
      </div>
    </div>
  );
}
