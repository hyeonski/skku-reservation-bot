/**
 * Popup 채팅 UI 루트 (D-006, D-025).
 *
 * 구성:
 * - ChatHistory: 메시지 리스트
 * - ChatInput: 입력창
 * - StatusBar: 자동화 진행 상태 (옵션)
 *
 * useConversation 훅이 background SW와의 메시지 송수신을 담당.
 *
 * TODO: 컴포넌트 조립
 */

export function App() {
  return (
    <div className="app">
      <header>SKKU 공간예약</header>
      <main>{/* TODO: <ChatHistory /> + <ChatInput /> */}</main>
    </div>
  );
}
