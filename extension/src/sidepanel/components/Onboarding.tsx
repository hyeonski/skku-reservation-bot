import { useState } from 'react';
import { Icon } from '../icons';
import { getReservationExamples } from '../utils/reservationExamples';

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface StepData {
  hero: 'rings' | null;
  title: string;
  body: string;
  examples?: string[];
  cta: string;
}

const STEPS: StepData[] = [
  {
    hero: 'rings',
    title: '공간예약, 채팅 한 번이면 끝나요',
    body:
      '건물별로 시간표 열어보지 마세요. "다음 주 화요일 6시 20명 율전 회의실" 한마디면 빈 공간 찾고 신청서까지 자동으로 채워드려요.',
    cta: '다음',
  },
  {
    hero: null,
    title: '이렇게 말해보세요',
    body: '정확히 안 적어도 돼요. 누락된 정보는 에이전트가 다시 물어봐요.',
    examples: getReservationExamples(),
    cta: '시작하기',
  },
];

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const cur = STEPS[step]!;

  const next = () => {
    if (step === STEPS.length - 1) onComplete();
    else setStep(step + 1);
  };

  return (
    <div className="onboard">
      <div className="onboard-head">
        <div className="onboard-dots">
          {STEPS.map((_, i) => {
            const cls =
              i === step ? 'onboard-dot active' : i < step ? 'onboard-dot done' : 'onboard-dot';
            return <div key={i} className={cls} />;
          })}
        </div>
        <button type="button" className="btn ghost small onboard-skip" onClick={onSkip}>
          건너뛰기
        </button>
      </div>

      <div className="onboard-body">
        {cur.hero === 'rings' && (
          <div className="onboard-hero">
            <div className="ring r3" />
            <div className="ring r2" />
            <div className="ring r1" />
            <div className="glyph-lg">SKKU</div>
          </div>
        )}
        <h1>{cur.title}</h1>
        <p>{cur.body}</p>

        {cur.examples && (
          <div className="example-list">
            {cur.examples.map((ex) => (
              <div className="example-item" key={ex}>
                <div className="text">{ex}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="onboard-foot">
        {step > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => setStep(step - 1)}
            style={{ flex: '0 0 auto' }}
            aria-label="이전 스텝"
          >
            <Icon name="back" size={14} />
          </button>
        )}
        <button type="button" className="btn primary" onClick={next}>
          {cur.cta}
        </button>
      </div>
    </div>
  );
}
