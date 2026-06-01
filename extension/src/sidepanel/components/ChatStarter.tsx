import { useState } from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatComposer } from './ChatComposer';

interface ChatStarterProps {
  onSendStarter: (text: string) => void;
  onBack: () => void;
}

const EXAMPLES = [
  '내일 6시 20명 학생회 회의',
  '다음 주 화요일 14시부터 2시간 동아리 연습',
  '5/27 오후 3시 200명 행사장',
];

export function ChatStarter({ onSendStarter, onBack }: ChatStarterProps) {
  const [value, setValue] = useState('');
  const send = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    onSendStarter(trimmed);
  };

  return (
    <div className="screen">
      <ChatHeader title="새 대화" onBack={onBack} />
      <div className="popup-body">
        <div className="starter-hero">
          <div className="onboard-hero">
            <div className="ring r3" />
            <div className="ring r2" />
            <div className="ring r1" />
            <div className="glyph-lg">SK</div>
          </div>
          <div>
            <h2>무엇을 예약해드릴까요?</h2>
            <p>날짜·시간·인원을 자연스럽게 알려주세요.</p>
          </div>
        </div>
        <div className="starter-examples">
          <div className="sessions-divider" style={{ padding: '8px 0 8px' }}>
            빠른 예시
          </div>
          <div className="example-list">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="example-item"
                onClick={() => onSendStarter(ex)}
              >
                <div className="text">{ex}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <ChatComposer
        value={value}
        onChange={setValue}
        onSend={send}
        placeholder="예: 7월 21일 18시 20명 회의실"
      />
    </div>
  );
}
