/**
 * 사이드패널 루트 — Phase 1c (실 데이터 채팅 + GLS 자동화 통합).
 *
 * view 라우팅:
 *   - onboarding         : Onboarding 컴포넌트 (mock)
 *   - sessions           : SessionList (mock — 다음 phase 에서 서버 연결)
 *   - chat-start         : 빈 채팅 + 예시 칩
 *   - chat               : 실 ConversationState 기반 ChatScene
 *
 * 채팅은 useConversation 단일 인스턴스로 운영. "새 대화" 버튼 → newConversation()
 * 으로 state 리셋 + 새 conversationId.
 *
 * 세션 목록의 항목 클릭 시 현재는 새 대화로 진입 — 서버 GET /conversations/:id
 * 로 이력 복원하는 작업은 Phase 1d 로.
 *
 * DevNavigator 는 onboarding / sessions / chat-start 화면 점프 용도로만 유지.
 * 채팅 phase 점프는 더 이상 의미가 없어 (실 state 에서 derive) 메뉴에서 제거.
 */

import { useCallback, useState } from 'react';
import { ChatScene } from './ChatScene';
import { ChatStarter } from './components/ChatStarter';
import { DevNavigator } from './DevNavigator';
import { MOCK_REMINDER, MOCK_SESSIONS } from './mockData';
import { Onboarding } from './components/Onboarding';
import { SessionList } from './components/SessionList';
import { useConversation } from './hooks/useConversation';

export type View =
  | 'onboarding'
  | 'sessions'
  | 'sessions-with-reminder'
  | 'chat-start'
  | 'chat';

export function App() {
  const [view, setView] = useState<View>('sessions');
  const conv = useConversation();

  const goSessions = useCallback(() => setView('sessions'), []);
  const goChatStart = useCallback(() => setView('chat-start'), []);
  const goChat = useCallback(() => setView('chat'), []);

  const handleStartFromExample = useCallback(
    (text: string) => {
      // 새 대화로 리셋한 뒤 예시 텍스트를 첫 메시지로 송신.
      conv.newConversation();
      // newConversation 직후 sendMessage 는 비어있는 history 로 시작하는 게 맞음.
      // 단일 microtask 안에서 호출하므로 setState 가 아직 반영되지 않았어도
      // stateRef.current 가 빈 messages 라 OK.
      void conv.sendMessage(text);
      setView('chat');
    },
    [conv],
  );

  const handleNewFromHeader = useCallback(() => {
    conv.newConversation();
    setView('chat-start');
  }, [conv]);

  let screen: React.ReactNode;
  switch (view) {
    case 'onboarding':
      screen = <Onboarding onComplete={goSessions} onSkip={goSessions} />;
      break;

    case 'sessions':
    case 'sessions-with-reminder':
      screen = (
        <SessionList
          sessions={MOCK_SESSIONS}
          reminder={view === 'sessions-with-reminder' ? MOCK_REMINDER : null}
          onPick={() => {
            // Phase 1d 에서 서버 GET /conversations/:id 로 복원. 지금은 새 대화로 진입.
            conv.newConversation();
            goChat();
          }}
          onNew={() => {
            conv.newConversation();
            goChatStart();
          }}
          onAcceptReminder={() => {
            conv.newConversation();
            goChat();
          }}
          onDismissReminder={() => setView('sessions')}
        />
      );
      break;

    case 'chat-start':
      screen = (
        <ChatStarter onSendStarter={handleStartFromExample} onBack={goSessions} />
      );
      break;

    case 'chat':
      screen = (
        <ChatScene conv={conv} onBack={goSessions} onNew={handleNewFromHeader} />
      );
      break;
  }

  return (
    <div className="sidepanel-root">
      {screen}
      <DevNavigator view={view} onView={setView} />
    </div>
  );
}
