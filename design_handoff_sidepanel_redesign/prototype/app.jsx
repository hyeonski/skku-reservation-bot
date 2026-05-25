// ===== Main App + Chat State Machine =====
const { useState, useEffect, useRef, useCallback, Fragment } = React;
const { Icon, BotMsg, UserMsg, Typing, SearchCard, RecCard, DraftCard, NoSpaceCard, P2Suggest, GLSLoginCard } = window.UI;
const { Onboarding, SessionsList, ChatStarter, ChatHeader } = window.SCREENS;
const D = window.MOCK_DATA;

// ===== Chat Scene =====
function ChatScene({ initialPrompt, onBackToList, glsState, setGlsState, scenario, onComplete }) {
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState("starter");
  const [slots, setSlots] = useState({ count: null, date: null, start: null, end: null });
  const [draft, setDraft] = useState({});
  const [suggested, setSuggested] = useState({}); // which fields were filled by P2 suggestion
  const [searchIdx, setSearchIdx] = useState(0);
  const [searchFound, setSearchFound] = useState(false);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [hints, setHints] = useState([]);
  const [pendingAlt, setPendingAlt] = useState(false);
  const [reloggingIn, setReloggingIn] = useState(false);
  const bodyRef = useRef(null);
  const tRef = useRef([]);

  // Scenario flags
  const isFailScenario = scenario === "fail";
  const isLoginNeededScenario = scenario === "login-needed";
  const isSessionExpiredScenario = scenario === "session-expired";

  const candidates = isFailScenario
    ? [
        { code: "230501", name: "대강당", building: "학생회관", capa: "최대 300명", floor: "5층", result: "fail", why: "예약됨" },
        { code: "260203", name: "사회과학관 대강의실", building: "사회과학관", capa: "최대 250명", floor: "2층", result: "fail", why: "수업 충돌" },
        { code: "240101", name: "반도체관 대강의실", building: "반도체관", capa: "최대 220명", floor: "1층", result: "fail", why: "행사 예약" },
        { code: "270301", name: "법학관 대강당", building: "법학관", capa: "최대 280명", floor: "3층", result: "fail", why: "수업 충돌" },
      ]
    : D.CANDIDATE_SPACES;

  // Track timers so we can clean up on unmount
  const sched = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    tRef.current.push(id);
    return id;
  }, []);

  useEffect(() => () => tRef.current.forEach(clearTimeout), []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, typing]);

  // Push message
  const pushMsg = useCallback((m) => {
    setMessages(prev => [...prev, m]);
  }, []);

  // Push bot message after typing delay
  const botSay = useCallback((content, delay = 800, type = "text", payload = null) => {
    setTyping(true);
    return new Promise(resolve => {
      sched(() => {
        setTyping(false);
        pushMsg({ role: "bot", type, content, payload, ts: nowTs() });
        resolve();
      }, delay);
    });
  }, [pushMsg, sched]);

  // Initial prompt
  useEffect(() => {
    if (initialPrompt && phase === "starter" && messages.length === 0) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  // ====== Phase handlers ======
  async function handleSend(text) {
    const userText = text.trim();
    if (!userText) return;
    pushMsg({ role: "user", content: userText, ts: nowTs() });
    setInput("");
    setHints([]);

    if (phase === "starter") return handleStarter(userText);
    if (phase === "slots-end") return handleSlotsEnd(userText);
    if (phase === "meta-collect") return handleMetaCollect(userText);
    if (phase === "draft") return handleDraftCmd(userText);
    if (phase === "failed-retry") return handleFailRetry(userText);
    if (phase === "done") return handleEnded(userText);
  }

  async function handleStarter(text) {
    // Simulate parse: extract slots from text
    const parsed = parsePrompt(text);
    setSlots(parsed.slots);

    if (parsed.missing.length === 0 || (parsed.slots.start && (parsed.slots.end || parsed.slots.duration))) {
      // All slots filled — go straight to search
      await botSay(buildParsedSummary(parsed.slots) + " 빈 공간 찾아볼게요.", 900);
      startSearch();
    } else if (parsed.missing.includes("end_time")) {
      // Need end time
      await botSay(buildParsedSummary(parsed.slots) + " 몇 시까지 사용하시나요?", 900);
      setPhase("slots-end");
      setHints(["20시까지", "2시간", "한 시간만"]);
    } else if (parsed.missing.includes("count")) {
      await botSay("몇 명이서 사용하시나요?", 700);
      setPhase("slots-count");
      setHints(["10명", "20명", "30명"]);
    }
  }

  async function handleSlotsEnd(text) {
    let end = parseEnd(text, slots.start);
    const newSlots = { ...slots, end };
    setSlots(newSlots);
    await botSay(buildSlotsConfirm(newSlots) + " 빈 공간 찾아볼게요.", 800);
    startSearch();
  }

  // ===== Search simulation =====
  async function startSearch() {
    // Intercept for login-needed scenario (only at first search attempt)
    if (isLoginNeededScenario && !glsLoggedInLocally.current) {
      await botSay("GLS 세션 확인 중…", 500);
      await sleep(500);
      setGlsState({ phase: "logged-out" });
      await botSay("GLS 로그인이 풀려있어요. 새 탭에서 잠깐 로그인해주시면 이어서 진행할게요.", 800);
      pushMsg({ role: "bot", type: "gls-login-card", payload: { variant: "needed" }, ts: nowTs() });
      setPhase("awaiting-login");
      return;
    }
    setPhase("searching");
    setSearchIdx(0);
    setSearchFound(false);
    // Show search card as a "message"
    pushMsg({ role: "bot", type: "search-card", content: "", ts: nowTs() });
    setGlsState({ phase: "searching", currentCode: candidates[0].code });

    // Iterate through candidates with delay
    iterateSearch(0);
  }

  // Tracks whether the user has completed a login in *this* scene (so we
  // don't re-intercept after they've logged in once).
  const glsLoggedInLocally = useRef(false);

  function iterateSearch(i) {
    if (i >= candidates.length) {
      // Exhausted — fail
      sched(() => {
        setGlsState({ phase: "idle" });
        showFailure();
      }, 600);
      return;
    }
    setSearchIdx(i);
    setGlsState({ phase: "searching", currentCode: candidates[i].code });
    sched(() => {
      // Session expired scenario: drop the session mid-search
      if (isSessionExpiredScenario && i === 1 && !sessionExpiredHandled.current) {
        sessionExpiredHandled.current = true;
        setGlsState({ phase: "logged-out" });
        pushMsg({ role: "bot", type: "gls-login-card", payload: { variant: "expired", resumeIdx: i }, ts: nowTs() });
        setPhase("awaiting-relogin");
        return;
      }
      const c = candidates[i];
      if (c.result === "found") {
        setSearchFound(true);
        setGlsState({ phase: "found", currentCode: c.code });
        sched(() => {
          showRecommendation(c);
        }, 700);
      } else {
        iterateSearch(i + 1);
      }
    }, 1200);
  }

  // Tracks one-shot for session-expired interrupt
  const sessionExpiredHandled = useRef(false);

  async function doLogin(variant, resumeIdx) {
    setReloggingIn(true);
    setGlsState({ phase: "logging-in" });
    await sleep(1800);
    setGlsState({ phase: "idle" });
    glsLoggedInLocally.current = true;
    setReloggingIn(false);
    if (variant === "expired") {
      await botSay("✓ 다시 로그인됐어요. 멈췄던 지점부터 이어서 진행할게요.", 800);
      // Resume search from where we stopped
      setPhase("searching");
      iterateSearch(resumeIdx);
    } else {
      await botSay("✓ 로그인 확인했어요. 빈 공간 찾아볼게요.", 800);
      startSearch();
    }
  }

  async function showFailure() {
    setPhase("failed-retry");
    pushMsg({ role: "bot", type: "fail-card", content: "", ts: nowTs() });
    await sleep(400);
    const headcount = slots.count || 200;
    const smaller = Math.max(50, Math.floor(headcount * 0.5 / 10) * 10);
    await botSay(`조건을 조정해서 다시 찾아볼까요? 아래 옵션을 누르거나 직접 알려주셔도 돼요.`, 900);
    setHints([
      `${smaller}명으로 줄여서 다시`,
      "시간대 19–21시로",
      "다음 주 같은 요일로",
    ]);
  }

  async function handleFailRetry(text) {
    const t = text.trim();
    let newSlots = { ...slots };
    let summary = "";

    // Try to parse adjustments
    const countMatch = t.match(/(\d+)\s*명/);
    const timeMatch = t.match(/(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*시|(\d{1,2})\s*시(?:대)?/);
    if (countMatch) {
      newSlots.count = parseInt(countMatch[1]);
      summary = `${newSlots.count}명으로 다시 찾아볼게요.`;
    } else if (/다음\s*주/.test(t)) {
      newSlots.date = "5/27(수)";
      summary = "다음 주 같은 요일로 다시 찾아볼게요.";
    } else if (timeMatch) {
      if (timeMatch[1] && timeMatch[2]) {
        newSlots.start = `${String(timeMatch[1]).padStart(2,"0")}:00`;
        newSlots.end = `${String(timeMatch[2]).padStart(2,"0")}:00`;
      }
      summary = `${newSlots.start}–${newSlots.end}로 다시 찾아볼게요.`;
    } else {
      summary = "조건을 조정해서 다시 찾아볼게요.";
    }

    setSlots(newSlots);
    setHints([]);
    await botSay(summary, 800);
    // Retry with happy candidates — adjusted constraints should now match
    retrySearch();
  }

  function retrySearch() {
    setPhase("searching");
    setSearchIdx(0);
    setSearchFound(false);
    sessionExpiredHandled.current = true; // don't re-trigger expiry
    pushMsg({ role: "bot", type: "search-card", content: "", ts: nowTs(), retry: true });
    setGlsState({ phase: "searching", currentCode: D.CANDIDATE_SPACES[0].code });
    iterateRetrySearch(0);
  }

  function iterateRetrySearch(i) {
    const retryCandidates = D.CANDIDATE_SPACES; // happy candidates
    if (i >= retryCandidates.length) {
      sched(() => { setGlsState({ phase: "idle" }); showFailure(); }, 600);
      return;
    }
    setSearchIdx(i);
    setGlsState({ phase: "searching", currentCode: retryCandidates[i].code });
    sched(() => {
      const c = retryCandidates[i];
      if (c.result === "found") {
        setSearchFound(true);
        setGlsState({ phase: "found", currentCode: c.code });
        sched(() => showRecommendation(c), 700);
      } else {
        iterateRetrySearch(i + 1);
      }
    }, 1000);
  }

  async function showRecommendation(space) {
    setPhase("recommended");
    pushMsg({ role: "bot", type: "rec-card", payload: space, content: "", ts: nowTs() });
    await sleep(500);
    if (scenario === "happy") {
      // P2 inline suggestion
      pushMsg({ role: "bot", type: "p2-suggest", content: "", ts: nowTs() });
      setPhase("meta-p2");
    } else {
      await botSay("이 공간으로 진행할까요? 신청서에는 어떤 단체의 어떤 행사로 넣을까요?", 900);
      setPhase("meta-collect");
      setHints(["SW학생회 운영회의", "동아리 연습", "학회 세미나"]);
    }
  }

  // ===== P2 actions =====
  function acceptP2() {
    pushMsg({ role: "user", content: "네, 같게요", ts: nowTs() });
    const newDraft = {
      category: D.PREV_RESERVATION.category,
      group: D.PREV_RESERVATION.group,
      event: D.PREV_RESERVATION.event,
      purpose: D.PREV_RESERVATION.purpose,
      headcount: `${slots.count || 20}명`,
    };
    setDraft(newDraft);
    setSuggested({ category: true, group: true, event: true, purpose: true });
    sched(async () => {
      await botSay("좋아요. 지난번 내용 그대로 채웠어요. 확인하고 제출해주세요.", 800);
      pushMsg({ role: "bot", type: "draft-card", content: "", ts: nowTs() });
      setPhase("draft");
      setHints(["제출", "행사명만 바꾸기", "다른 공간"]);
    }, 200);
  }

  function declineP2() {
    pushMsg({ role: "user", content: "다른 행사예요", ts: nowTs() });
    sched(async () => {
      await botSay("그럼 단체와 행사명을 알려주세요. (예: \"동아리 SAFE에서 정기 코딩 세션\")", 900);
      setPhase("meta-collect");
      setHints(["SW학생회 운영회의", "동아리 연습", "학회 세미나"]);
    }, 200);
  }

  async function handleMetaCollect(text) {
    // Simulated extraction
    const extracted = extractMeta(text, slots);
    const newDraft = { ...draft, ...extracted, headcount: `${slots.count || 20}명` };
    setDraft(newDraft);
    setSuggested({});
    await botSay("입력하신 내용으로 신청서 초안을 만들었어요.", 800);
    pushMsg({ role: "bot", type: "draft-card", content: "", ts: nowTs() });
    setPhase("draft");
    setHints(["제출", "행사명만 바꾸기", "다른 공간"]);
  }

  async function handleDraftCmd(text) {
    // Modification commands
    const m = parseModification(text);
    if (m.intent === "submit") return doSubmit();
    if (m.intent === "alternative") return doAlternative();
    if (m.intent === "cancel") {
      await botSay("취소했어요. 다음에 다시 도와드릴게요.", 600);
      setPhase("done");
      setHints([]);
      return;
    }
    if (m.intent === "edit") {
      const fieldNames = { event: "행사명", group: "주관단체", purpose: "사용목적", headcount: "인원" };
      const newDraft = { ...draft, [m.field]: m.value };
      setDraft(newDraft);
      setSuggested({ ...suggested, [m.field]: false });
      await botSay(`${fieldNames[m.field]}을 \"${m.value}\"(으)로 바꿨어요.`, 700);
      // Show updated draft
      pushMsg({ role: "bot", type: "draft-card", content: "", ts: nowTs() });
      setHints(["제출", "다른 곳 수정", "다른 공간"]);
      return;
    }
    // Fallback
    await botSay("초안을 확인해주세요. 제출하시려면 \"제출\"이라고 말씀해주세요.", 700);
    setHints(["제출", "행사명만 바꾸기", "취소"]);
  }

  async function doAlternative() {
    await botSay("다른 공간을 찾아볼게요.", 700);
    // Mock: just say no alternative for simplicity
    sched(async () => {
      await botSay("이 시간대에는 이 공간이 유일한 가용 옵션이에요. 시간을 조금 옮겨보시겠어요?", 1000);
      setHints(["시간 조정", "이 공간으로 진행", "취소"]);
      setPhase("draft");
    }, 200);
  }

  async function doSubmit() {
    setPhase("submitting");
    setGlsState({ phase: "filling", currentCode: "230401" });
    pushMsg({ role: "bot", type: "submit-progress", content: "", ts: nowTs() });
    await sleep(1200);
    setGlsState({ phase: "saving" });
    await sleep(1400);
    setGlsState({ phase: "saved" });
    await sleep(800);
    await botSay("✓ GLS 예약 신청을 완료했어요.", 600);
    setPhase("done");
    setHints(["새 대화 시작"]);
    onComplete && onComplete({
      title: buildSessionTitle(slots, draft),
      preview: `예약 완료 · 학생회관 401호`,
    });
  }

  async function handleEnded(text) {
    await botSay("이 대화는 종료되었어요. 새 대화를 시작해주세요.", 500);
  }

  // ===== Render messages =====
  const messageNodes = messages.map((m, i) => {
    if (m.role === "user") return <UserMsg key={i} ts={m.ts}>{m.content}</UserMsg>;
    if (m.type === "search-card") {
      const cards = m.retry ? D.CANDIDATE_SPACES : candidates;
      // If there's a NEWER search card (retry), freeze this one as fully scanned
      const isLatest = i === messages.findLastIndex(x => x.type === "search-card");
      if (!isLatest) {
        return <SearchCard key={i} candidates={cards} currentIdx={cards.length} found={false}/>;
      }
      return <SearchCard key={i} candidates={cards} currentIdx={searchIdx} found={searchFound}/>;
    }
    if (m.type === "rec-card") {
      return <RecCard key={i} space={m.payload}/>;
    }
    if (m.type === "draft-card") {
      // Render the *latest* draft card view at the position of the last draft-card msg
      const isLatest = i === messages.findLastIndex(x => x.type === "draft-card");
      if (!isLatest) {
        // Render as static snapshot (collapsed)
        return (
          <div key={i} className="card" style={{opacity: 0.55}}>
            <div className="card-head">
              <div className="title">이전 초안</div>
              <div className="tag muted">교체됨</div>
            </div>
          </div>
        );
      }
      return (
        <DraftCard
          key={i}
          draft={draft}
          suggested={suggested}
          submitting={phase === "submitting"}
          onSubmit={() => handleSend("제출")}
          onEdit={() => setHints(["행사명을 정기회의로", "주관단체는 총학생회로", "인원은 25명으로"])}
        />
      );
    }
    if (m.type === "p2-suggest") {
      return <P2Suggest key={i} onAccept={acceptP2} onDecline={declineP2}/>;
    }
    if (m.type === "gls-login-card") {
      // Only the LATEST login card is interactive
      const isLatest = i === messages.findLastIndex(x => x.type === "gls-login-card");
      return (
        <GLSLoginCard
          key={i}
          variant={m.payload.variant}
          loggingIn={isLatest && reloggingIn}
          onOpenLogin={isLatest && !reloggingIn && (phase === "awaiting-login" || phase === "awaiting-relogin")
            ? () => doLogin(m.payload.variant, m.payload.resumeIdx)
            : () => {}}
        />
      );
    }
    if (m.type === "fail-card") {
      return <NoSpaceCard key={i} summary={`${slots.date || ""} ${slots.start || ""}–${slots.end || ""}, ${slots.count || ""}명 조건으로 자연·명륜 캠퍼스 ${candidates.length}곳을 확인했지만 모두 점유 중이었습니다.`}/>;
    }
    if (m.type === "submit-progress") {
      return (
        <div key={i} className="card">
          <div className="card-head">
            <div className="title">GLS 제출 중</div>
            <div className="tag accent">자동화</div>
          </div>
          <div className="card-body">
            <SubmitProgress glsState={glsState}/>
          </div>
        </div>
      );
    }
    return <BotMsg key={i} ts={m.ts}>{m.content}</BotMsg>;
  });

  return (
    <div className="screen">
      <ChatHeader
        title={buildSessionTitle(slots, draft) || "새 대화"}
        sessionLabel={phaseLabel(phase)}
        onBack={onBackToList}
      />
      <div className="popup-body" ref={bodyRef}>
        <div className="thread">
          {messageNodes}
          {typing && <Typing/>}
        </div>
      </div>
      <div className="popup-foot">
        {hints.length > 0 && (
          <div className="composer-hints" style={{paddingTop: 0, paddingBottom: 8}}>
            {hints.map((h, i) => (
              <button key={i} className="hint-chip" onClick={() => handleSend(h)}>{h}</button>
            ))}
          </div>
        )}
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => handleSend(input)}
          placeholder={phasePlaceholder(phase)}
          disabled={["searching", "submitting", "awaiting-login", "awaiting-relogin"].includes(phase)}
        />
      </div>
    </div>
  );
}

// ===== Composer =====
function Composer({ value, onChange, onSend, placeholder, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 90) + "px";
    }
  }, [value]);
  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button className="send-btn" onClick={onSend} disabled={!value.trim() || disabled}>
        <Icon name="send"/>
      </button>
    </div>
  );
}

function SubmitProgress({ glsState }) {
  const steps = [
    { key: "filling", label: "신청서 자동 작성" },
    { key: "saving", label: "GLS 저장 클릭" },
    { key: "saved", label: "응답 확인" },
  ];
  const idx = steps.findIndex(s => s.key === glsState.phase);
  return (
    <div className="search-progress">
      <div className="search-list">
        {steps.map((s, i) => {
          let cls = "pending";
          if (i < idx || glsState.phase === "saved") cls = "found";
          else if (i === idx) cls = "active";
          return (
            <div key={s.key} className={`search-item ${cls}`}>
              <span className="marker"/>
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Helpers (mock parse) =====
function nowTs() {
  const d = new Date();
  d.setHours(14, 32 + Math.floor(Math.random() * 3));
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parsePrompt(text) {
  const slots = { count: null, date: null, start: null, end: null };
  // Numbers
  const countMatch = text.match(/(\d+)\s*명/);
  if (countMatch) slots.count = parseInt(countMatch[1]);
  // Date
  if (/내일/.test(text)) slots.date = D.tomorrowLabel;
  else if (/오늘/.test(text)) slots.date = D.todayLabel;
  else if (/다음\s*주\s*화/.test(text)) slots.date = "5/26(화)";
  else if (/이번\s*주\s*금/.test(text)) slots.date = "5/22(금)";
  else if (/5\/(\d+)/.test(text)) {
    const m = text.match(/5\/(\d+)/);
    slots.date = `5/${m[1]}`;
  } else {
    slots.date = D.tomorrowLabel;
  }
  // Time
  const startMatch = text.match(/(\d{1,2})\s*시/);
  if (startMatch) {
    let h = parseInt(startMatch[1]);
    if (h < 9 && /오후|저녁|6|7|8/.test(text)) h += 12;
    slots.start = `${String(h).padStart(2,"0")}:00`;
  } else if (/14시/.test(text)) {
    slots.start = "14:00";
  }
  // Duration / end
  const durMatch = text.match(/(\d+)\s*시간/);
  if (durMatch && slots.start) {
    const dur = parseInt(durMatch[1]);
    const [sh, sm] = slots.start.split(":").map(Number);
    slots.end = `${String(sh + dur).padStart(2,"0")}:00`;
  }

  const missing = [];
  if (!slots.count) missing.push("count");
  if (!slots.start) missing.push("start_time");
  if (!slots.end && !slots.duration) missing.push("end_time");
  return { slots, missing };
}

function parseEnd(text, start) {
  const m = text.match(/(\d{1,2})\s*시/);
  if (m) {
    let h = parseInt(m[1]);
    if (h < 9) h += 12;
    return `${String(h).padStart(2,"0")}:00`;
  }
  const dur = text.match(/(\d+)\s*시간/) || text.match(/한\s*시간/);
  if (dur && start) {
    const n = text.match(/한\s*시간/) ? 1 : parseInt(dur[1]);
    const [sh] = start.split(":").map(Number);
    return `${String(sh + n).padStart(2,"0")}:00`;
  }
  return "20:00";
}

function buildParsedSummary(slots) {
  const parts = [];
  if (slots.date) parts.push(slots.date);
  if (slots.start) parts.push(slots.start);
  if (slots.count) parts.push(`${slots.count}명`);
  return parts.join(" · ") + ",";
}

function buildSlotsConfirm(slots) {
  return `${slots.date} ${slots.start}–${slots.end}, ${slots.count}명 확인했어요.`;
}

function buildSessionTitle(slots, draft) {
  if (!slots.date) return null;
  const event = draft.event || "공간 예약";
  return `${slots.date} ${event}`;
}

function phaseLabel(phase) {
  switch (phase) {
    case "starter": return "시작";
    case "slots-end": return "정보 확인";
    case "slots-count": return "정보 확인";
    case "searching": return "탐색 중";
    case "awaiting-login": return "로그인 대기";
    case "awaiting-relogin": return "재로그인 대기";
    case "recommended": return "후보 확인";
    case "meta-p2": return "신청 메타";
    case "meta-collect": return "신청 메타";
    case "draft": return "검토";
    case "submitting": return "제출 중";
    case "done": return "완료";
    case "failed": return "실패";
    case "failed-retry": return "재시도";
    default: return "";
  }
}

function phasePlaceholder(phase) {
  switch (phase) {
    case "starter": return "예: 내일 6시 20명 회의실";
    case "slots-end": return "예: 20시까지 / 2시간";
    case "slots-count": return "몇 명이서 사용하세요?";
    case "meta-collect": return "단체와 행사명을 알려주세요";
    case "draft": return "수정 사항이나 \"제출\"이라고 입력하세요";
    case "failed-retry": return "조정할 조건을 알려주세요 (인원/시간/날짜)";
    case "searching": return "탐색 중…";
    case "awaiting-login":
    case "awaiting-relogin": return "GLS 로그인 후 진행됩니다";
    case "submitting": return "제출 중…";
    case "done":
    case "failed": return "대화가 종료되었어요";
    default: return "메시지 입력…";
  }
}

function extractMeta(text, slots) {
  // Heuristic extraction
  const result = { headcount: `${slots.count || 20}명` };
  if (/학생회/.test(text)) { result.group = "SW학생회"; result.category = "회의/학회"; }
  else if (/동아리/.test(text)) { result.group = text.match(/[가-힣A-Za-z0-9]+\s*동아리/)?.[0] || "동아리"; result.category = "동아리 활동"; }
  else if (/학회/.test(text)) { result.group = "학회"; result.category = "회의/학회"; }
  else { result.group = "소프트웨어학과"; result.category = "회의/학회"; }

  if (/회의/.test(text)) result.event = "운영회의";
  else if (/연습/.test(text)) result.event = "정기 연습";
  else if (/세미나/.test(text)) result.event = "세미나";
  else result.event = text.length > 30 ? text.slice(0, 30) : text;

  result.purpose = text;
  return result;
}

function parseModification(text) {
  const t = text.trim();
  if (/^(제출|예약|신청|보내|진행)/.test(t)) return { intent: "submit" };
  if (/취소|그만/.test(t)) return { intent: "cancel" };
  if (/다른\s*(공간|곳)|대안/.test(t)) return { intent: "alternative" };
  // Field edits: "행사명은 X", "행사명을 X로", "X로 바꿔"
  const eventMatch = t.match(/행사명[은을]?\s*[\"']?(.+?)[\"']?(으로|로|입니다|이에요|예요|$)/);
  if (eventMatch) return { intent: "edit", field: "event", value: eventMatch[1].trim() };
  const groupMatch = t.match(/(주관)?단체[는은을]?\s*(.+?)(으로|로|입니다|이에요|예요|$)/);
  if (groupMatch) return { intent: "edit", field: "group", value: groupMatch[2].trim() };
  const purposeMatch = t.match(/(사용)?목적[은을]?\s*(.+?)(으로|로|$)/);
  if (purposeMatch) return { intent: "edit", field: "purpose", value: purposeMatch[2].trim() };
  const countMatch = t.match(/인원[은을]?\s*(\d+)\s*명/);
  if (countMatch) return { intent: "edit", field: "headcount", value: `${countMatch[1]}명` };
  return { intent: "unknown" };
}

// =============== App Shell ===============
function App() {
  // Use Tweaks defaults
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "showOnboarding": false,
    "scenario": "happy",
    "showReminder": true
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // App view state
  const [view, setView] = useState(tweaks.showOnboarding ? "onboarding" : "sessions");
  const [activeChat, setActiveChat] = useState(null); // {initialPrompt, scenario}
  const [glsState, setGlsState] = useState({ phase: "idle" });
  const [showNotif, setShowNotif] = useState(false);
  const [sessions, setSessions] = useState(D.MOCK_SESSIONS);
  const [showReminder, setShowReminder] = useState(true);

  // Sync reminder visibility
  useEffect(() => setShowReminder(tweaks.showReminder), [tweaks.showReminder]);

  function startNewChat(prompt, scenario = tweaks.scenario || "happy") {
    setActiveChat({ initialPrompt: prompt, scenario });
    setView("chat");
  }

  function onChatComplete(info) {
    // Add to sessions
    setSessions(prev => [
      { id: `c-new-${Date.now()}`, title: info.title, preview: info.preview, when: "방금 전", status: "completed" },
      ...prev,
    ]);
    // Trigger chrome notification
    setShowNotif(true);
    setTimeout(() => setShowNotif(false), 4500);
  }

  function goSessions() {
    setView("sessions");
    setActiveChat(null);
    setGlsState({ phase: "idle" });
  }

  function acceptReminder() {
    setShowReminder(false);
    startNewChat(`다음 주 화요일 18시 ${D.P3_REMINDER.proposed.space} 학생회 운영회의`, "happy");
  }

  return (
    <div className="stage">
      <div className="chrome-window">
        {/* Title bar */}
        <div className="chrome-titlebar">
          <div className="chrome-traffic">
            <span className="dot red"/><span className="dot yellow"/><span className="dot green"/>
          </div>
          <div className="chrome-tabs">
            <div className="chrome-tab active">
              <span className="favicon">G</span>
              <span>GLS · 공간대여신청</span>
              <span className="tab-close">×</span>
            </div>
            <div className="chrome-tab">
              <span className="favicon" style={{background: "#ea4335"}}>m</span>
              <span>Gmail</span>
            </div>
          </div>
          <div style={{display: "flex", gap: 4, color: "#5a5a60", fontSize: 14}}>
            <span>−</span><span>□</span><span>×</span>
          </div>
        </div>

        {/* Address bar */}
        <div className="chrome-addrbar">
          <button className="nav-btn" title="뒤로"><Icon name="back" size={14}/></button>
          <button className="nav-btn disabled" title="앞으로"><Icon name="forward" size={14}/></button>
          <button className="nav-btn" title="새로고침"><Icon name="refresh" size={13}/></button>
          <div className="chrome-url">
            <span className="lock">🔒</span>
            <span className="url-text">
              <span className="url-domain">kingoinfo.skku.edu</span>
              <span className="url-path">/gaia/nxui/index.html</span>
            </span>
          </div>
          <div className="chrome-actions">
            <div className="chrome-ext-icon" title="기타 확장">
              <span style={{fontSize: 12, color: "#666"}}>⊞</span>
            </div>
            <div className="chrome-ext-icon ours" title="SKKU 예약 봇">
              SK
            </div>
            <div className="chrome-avatar">현</div>
          </div>
        </div>

        {/* Browser content */}
        <div className="browser-stage">
          <div className="gls-viewport-wrap">
            <GLSPage state={glsState}/>
            {/* OS notification */}
            {showNotif && (
              <div className="os-notif">
                <div className="nicon">SK</div>
                <div className="ncontent">
                  <div className="ntitle">예약 완료</div>
                  <div className="nbody">학생회관 401호 · 5/21(목) 18:00–20:00 예약 신청이 완료되었어요.</div>
                  <div className="ntime">방금 전 · SKKU 예약 봇</div>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div className="sidepanel">
            <div className="sidepanel-chrome">
              <div className="picker">
                <div className="ico">SK</div>
                <span className="name">SKKU 예약 봇</span>
                <span className="chev">▾</span>
              </div>
              <button className="chrome-btn" title="설정"><Icon name="settings" size={13}/></button>
              <button className="chrome-btn" title="닫기"><Icon name="close" size={13}/></button>
            </div>

            {view === "onboarding" && (
              <Onboarding
                onComplete={() => setView("sessions")}
                onSkip={() => setView("sessions")}
              />
            )}
            {view === "sessions" && (
              <SessionsList
                sessions={sessions}
                onPick={(s) => {
                  // For demo: just go to a "completed" view via starter
                  startNewChat(null, "happy");
                }}
                onNew={() => { setActiveChat({ initialPrompt: null, scenario: tweaks.scenario || "happy" }); setView("chat-start"); }}
                onDismissReminder={() => setShowReminder(false)}
                onAcceptReminder={acceptReminder}
                reminder={showReminder ? D.P3_REMINDER : null}
              />
            )}
            {view === "chat-start" && (
              <ChatStarter
                onSendStarter={(prompt) => {
                  const isFail = /200명|300명|대강당/.test(prompt);
                  startNewChat(prompt, isFail ? "fail" : "happy");
                }}
                onBack={goSessions}
              />
            )}
            {view === "chat" && activeChat && (
              <ChatScene
                key={JSON.stringify(activeChat)}
                initialPrompt={activeChat.initialPrompt}
                scenario={activeChat.scenario}
                glsState={glsState}
                setGlsState={setGlsState}
                onBackToList={goSessions}
                onComplete={onChatComplete}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tweaks panel */}
      <TweakUI
        tweaks={tweaks}
        setTweak={setTweak}
        onGoOnboarding={() => { setView("onboarding"); setActiveChat(null); }}
        onGoSessions={() => { setView("sessions"); setActiveChat(null); }}
        onStartHappy={() => startNewChat("내일 6시 20명 학생회 회의", "happy")}
        onStartFail={() => startNewChat("다음 주 화요일 6시 200명 행사장", "fail")}
        onStartLoginNeeded={() => startNewChat("내일 6시 20명 학생회 회의", "login-needed")}
        onStartSessionExpired={() => startNewChat("내일 6시 20명 학생회 회의", "session-expired")}
      />
    </div>
  );
}

// =============== GLS Page (the page under the panel) ===============
function GLSPage({ state }) {
  const isHighlight = (code) => state.phase === "searching" && state.currentCode === code;
  const isFound = (code) => state.phase === "found" && state.currentCode === code;
  const formActive = state.phase === "filling" || state.phase === "saving" || state.phase === "saved";

  const fakeRooms = [
    { code: "230101", building: "학생회관", room: "101 다목적실", capa: "30~80" },
    { code: "230304", building: "학생회관", room: "304 회의실 A", capa: "8~30", busy: [9, 18] },
    { code: "230307", building: "학생회관", room: "307 회의실 B", capa: "10~25", busy: [10, 14] },
    { code: "230401", building: "학생회관", room: "401호", capa: "10~25", busy: [] },
    { code: "230412", building: "학생회관", room: "412 세미나실", capa: "15~40", busy: [13, 15] },
  ];
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  return (
    <div className="gls-page">
      <div className="gls-header">
        <div className="logo">성균관대학교 GLS</div>
        <div className="nav-item">학사일정</div>
        <div className="nav-item active">신청/자격관리</div>
        <div className="nav-item">학적/개인영역</div>
        <div className="nav-item">수업영역</div>
        <div className="nav-item">학업영역</div>
        <div style={{marginLeft: "auto", fontSize: 12, opacity: 0.85}}>
          {state.phase === "logged-out" ? "세션 만료" : state.phase === "logging-in" ? "로그인 중…" : state.phase === "idle" ? "로그인됨" : "자동화 진행 중"}
        </div>
      </div>
      <div className="gls-subheader">
        <span className="crumb">신청/자격관리</span>
        <span>›</span>
        <span className="crumb current">공간대여신청</span>
      </div>
      <div className="gls-content">
        {/* Top form */}
        <div className="gls-card">
          <h3>공간대여신청</h3>
          <div className="gls-row">
            <div className="label">캠퍼스</div>
            <div className={`field combo ${formActive ? "highlight" : ""}`}>자연과학캠퍼스</div>
            <div className="label">건물</div>
            <div className={`field combo ${formActive ? "highlight" : ""}`}>학생회관</div>
            <div className="label">예약일</div>
            <div className={`field ${formActive ? "highlight" : ""}`}>2026-05-21</div>
          </div>
          <div className="gls-row">
            <div className="label">행사구분</div>
            <div className={`field combo ${formActive ? "highlight" : ""}`}>{formActive ? "회의/학회" : ""}</div>
            <div className="label">주관단체</div>
            <div className={`field ${formActive ? "highlight" : ""}`}>{formActive ? "SW학생회" : ""}</div>
            <div className="label">행사인원</div>
            <div className={`field ${formActive ? "highlight" : ""}`}>{formActive ? "20" : ""}</div>
          </div>
          <div className="gls-row">
            <div className="label">행사명</div>
            <div className={`field ${formActive ? "highlight" : ""}`} style={{gridColumn: "span 3"}}>{formActive ? "운영회의" : ""}</div>
            <div className="label">시간</div>
            <div className={`field ${formActive ? "highlight" : ""}`}>{formActive ? "18:00 – 20:00" : ""}</div>
          </div>
        </div>

        {/* Grid */}
        <div className="gls-grid">
          <div className="gls-grid-head">
            <span>예약 현황 — 학생회관 (2026-05-21)</span>
            <span style={{fontSize: 11, fontWeight: 400, opacity: 0.85}}>
              {state.phase === "searching" && `검증 중: ${state.currentCode}`}
              {state.phase === "found" && `가용 발견: ${state.currentCode}`}
              {state.phase === "saved" && "저장 완료"}
            </span>
          </div>
          <div className="gls-grid-body">
            <table>
              <thead>
                <tr>
                  <th style={{width: 140, textAlign: "left", paddingLeft: 12}}>공간</th>
                  <th style={{width: 70}}>정원</th>
                  {hours.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {fakeRooms.map(r => (
                  <tr key={r.code} className={(isHighlight(r.code) || isFound(r.code)) ? "scanning" : ""}>
                    <td style={{textAlign: "left", paddingLeft: 12, fontWeight: 500}}>{r.room}</td>
                    <td style={{color: "#888"}}>{r.capa}</td>
                    {hours.map(h => {
                      const busy = r.busy && r.busy.includes(h);
                      const inTarget = h >= 18 && h < 20;
                      let cls = "free";
                      if (busy) cls = "occupied";
                      if (inTarget && isHighlight(r.code)) cls = "checking";
                      if (inTarget && isFound(r.code) && r.code === "230401") cls = "checking";
                      if (formActive && r.code === "230401" && inTarget) cls = "checking";
                      return <td key={h} className={cls}>{busy ? "■" : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Floating overlay badge showing automation activity */}
      {(state.phase === "searching" || state.phase === "found" || formActive) && (
        <div className="gls-overlay-badge">
          <span className="pulse"/>
          <span>
            {state.phase === "searching" && "공간 가용성 검증 중"}
            {state.phase === "found" && "가용 공간 확정"}
            {state.phase === "filling" && "신청서 자동 작성"}
            {state.phase === "saving" && "GLS 저장 클릭"}
            {state.phase === "saved" && "응답 확인 중"}
          </span>
        </div>
      )}

      {/* Login required overlay */}
      {(state.phase === "logged-out" || state.phase === "logging-in") && (
        <div className="gls-login-overlay">
          <div className="login-modal">
            <div className="login-modal-head">
              <div className="skku-logo">SKKU</div>
              <div className="skku-label">킹고로그인</div>
            </div>
            <div className="login-modal-body">
              <input type="text" placeholder="아이디를 입력하세요." defaultValue={state.phase === "logging-in" ? "swku2024" : ""} disabled={state.phase === "logging-in"}/>
              <input type="password" placeholder="비밀번호를 입력하세요." defaultValue={state.phase === "logging-in" ? "********" : ""} disabled={state.phase === "logging-in"}/>
              <button className="login-modal-submit" disabled>
                {state.phase === "logging-in" ? "로그인 중…" : "로그인"}
              </button>
            </div>
            <div className="login-modal-foot">login.skku.edu</div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============== Tweaks UI ===============
function TweakUI({ tweaks, setTweak, onGoOnboarding, onGoSessions, onStartHappy, onStartFail, onStartLoginNeeded, onStartSessionExpired }) {
  const { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakButton } = window;
  if (!TweaksPanel) return null;
  return (
    <TweaksPanel>
      <TweakSection label="시나리오 점프"/>
      <TweakButton label="온보딩 처음부터" onClick={onGoOnboarding}/>
      <TweakButton label="세션 목록 + P3 알림" onClick={onGoSessions}/>
      <TweakButton label="예약 성공 플로우" onClick={onStartHappy}/>
      <TweakButton label="예약 실패 (공간 없음)" onClick={onStartFail}/>
      <TweakButton label="GLS 로그인 필요" onClick={onStartLoginNeeded}/>
      <TweakButton label="GLS 세션 만료 (검증 도중)" onClick={onStartSessionExpired}/>

      <TweakSection label="UI 옵션"/>
      <TweakToggle
        label="P3 리마인드 배너"
        value={tweaks.showReminder}
        onChange={(v) => setTweak("showReminder", v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
