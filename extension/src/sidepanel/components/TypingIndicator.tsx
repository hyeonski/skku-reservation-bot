/** 봇 응답 대기 인디케이터 — 3 dots bounce. */
export function TypingIndicator() {
  return (
    <div className="msg bot">
      <div className="typing">
        <span className="d" />
        <span className="d" />
        <span className="d" />
      </div>
    </div>
  );
}
