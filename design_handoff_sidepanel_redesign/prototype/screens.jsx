// ===== Screens =====
const { Icon, BotMsg, UserMsg, Typing, SearchCard, RecCard, DraftCard, NoSpaceCard, P2Suggest } = window.UI;

// =============== Onboarding ===============
function Onboarding({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);

  const next = () => {
    if (step === 1) onComplete();
    else setStep(step + 1);
  };

  const stepData = [
    {
      hero: (
        <div className="onboard-hero">
          <div className="ring r3"/><div className="ring r2"/><div className="ring r1"/>
          <div className="glyph-lg">SKKU</div>
        </div>
      ),
      title: "공간예약, 채팅 한 번이면 끝나요",
      body: "건물별로 시간표 열어보지 마세요. \"다음 주 화요일 6시 20명 회의실\" 한마디면 빈 공간 찾고 신청서까지 자동으로 채워드려요.",
      cta: "다음",
    },
    {
      hero: null,
      title: "이렇게 말해보세요",
      body: "정확히 안 적어도 돼요. 누락된 정보는 에이전트가 다시 물어봐요.",
      examples: [
        "내일 6시 20명 학생회 회의",
        "다음 주 화요일 14시부터 2시간",
        "5/27 오후 3시 50명 행사장",
        "이번 주 금요일 빈 회의실",
      ],
      cta: "시작하기",
    },
  ];

  const cur = stepData[step];

  return (
    <div className="onboard">
      <div className="onboard-head">
        <div className="onboard-dots">
          {[0, 1].map(i => (
            <div key={i} className={`onboard-dot ${i === step ? "active" : i < step ? "done" : ""}`}/>
          ))}
        </div>
        <button className="btn ghost small onboard-skip" onClick={onSkip}>건너뛰기</button>
      </div>

      <div className="onboard-body">
        {cur.hero}
        <h1>{cur.title}</h1>
        <p>{cur.body}</p>

        {cur.examples && (
          <div className="example-list">
            {cur.examples.map((ex, i) => (
              <div className="example-item" key={i}>
                <div className="text">{ex}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="onboard-foot">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)} style={{flex: "0 0 auto"}}>
            <Icon name="back" size={14}/>
          </button>
        )}
        <button className="btn primary" onClick={next}>{cur.cta}</button>
      </div>
    </div>
  );
}

// =============== Sessions list ===============
function SessionsList({ sessions, onPick, onNew, onDismissReminder, onAcceptReminder, reminder }) {
  return (
    <div className="screen">
      <div className="popup-head">
        <div className="popup-title">
          <div className="glyph">SK</div>
          최근 대화
        </div>
        <button className="icon-btn" title="새 대화" onClick={onNew}>
          <Icon name="plus"/>
        </button>
      </div>
      <div className="popup-body">
        {reminder && (
          <div className="reminder-banner">
            <div className="label">
              <Icon name="sparkles" size={11}/> 패턴 알림 · Phase 3
            </div>
            <div className="text">{reminder.title}</div>
            <div className="meta">{reminder.pattern}</div>
            <div style={{marginBottom: 10}}>
              <span className="pattern-pill"><Icon name="calendar" size={11}/>{reminder.proposed.date}</span>
              <span className="pattern-pill"><Icon name="clock" size={11}/>{reminder.proposed.time}</span>
              <span className="pattern-pill"><Icon name="building" size={11}/>{reminder.proposed.space}</span>
            </div>
            <div className="actions">
              <button className="btn primary small" onClick={onAcceptReminder}>네, 예약할게요</button>
              <button className="btn small" onClick={onDismissReminder}>나중에</button>
            </div>
          </div>
        )}

        <div className="sessions-divider">진행 중 · 완료된 대화</div>
        <div className="sessions-list">
          {sessions.map(s => (
            <SessionItem key={s.id} session={s} onPick={onPick}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionItem({ session, onPick }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="session-item" onClick={() => onPick(session)}>
      <div className="row1">
        <div className={`status-pill ${session.status}`}/>
        <div className="title">{session.title}</div>
        <div className="when">{session.when}</div>
      </div>
      <div className="preview">{session.preview}</div>
      <button
        className="menu"
        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 1500); }}
        title="삭제"
      >
        {confirmDelete ? <Icon name="check" size={13}/> : <Icon name="trash" size={13}/>}
      </button>
    </div>
  );
}

// =============== Empty chat (composer with example chips) ===============
function ChatStarter({ onSendStarter, onBack }) {
  return (
    <div className="screen">
      <ChatHeader title="새 대화" onBack={onBack}/>
      <div className="popup-body">
        <div style={{padding: "40px 20px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16}}>
          <div className="onboard-hero" style={{height: 120, width: "100%"}}>
            <div className="ring r3"/><div className="ring r2"/><div className="ring r1"/>
            <div className="glyph-lg" style={{width: 48, height: 48, fontSize: 16, borderRadius: 12}}>SK</div>
          </div>
          <div style={{textAlign: "center"}}>
            <h2 style={{margin: "0 0 6px", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em"}}>무엇을 예약해드릴까요?</h2>
            <p style={{margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5}}>
              날짜·시간·인원을 자연스럽게 알려주세요.
            </p>
          </div>
        </div>
        <div style={{padding: "0 14px 14px"}}>
          <div className="sessions-divider" style={{padding: "8px 0 8px"}}>빠른 예시</div>
          <div className="example-list">
            {[
              "내일 6시 20명 학생회 회의",
              "다음 주 화요일 14시부터 2시간 동아리 연습",
              "5/27 오후 3시 200명 행사장",
            ].map((ex, i) => (
              <button
                key={i}
                className="example-item"
                onClick={() => onSendStarter(ex)}
                style={{textAlign: "left", border: "1px solid var(--border)", background: "var(--bg-subtle)", cursor: "pointer"}}
              >
                <div className="text">{ex}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatHeader({ title, onBack, sessionLabel }) {
  return (
    <div className="popup-head">
      <button className="icon-btn" onClick={onBack} title="대화 목록">
        <Icon name="menu"/>
      </button>
      <div className="popup-title">
        <div className="glyph">SK</div>
        <span>{title}</span>
        {sessionLabel && <span className="session-label">· {sessionLabel}</span>}
      </div>
      <button className="icon-btn" title="새 대화">
        <Icon name="plus"/>
      </button>
    </div>
  );
}

window.SCREENS = { Onboarding, SessionsList, ChatStarter, ChatHeader };
