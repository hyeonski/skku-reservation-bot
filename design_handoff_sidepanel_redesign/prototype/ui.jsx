// ===== Reusable UI bits =====
const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

// SVG icons (inline, small)
const Icon = ({ name, size = 16 }) => {
  const s = { width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "send": return <svg viewBox="0 0 16 16" {...s}><path d="M2 8L14 2L8 14L7 9L2 8Z" fill="currentColor" stroke="none"/></svg>;
    case "back": return <svg viewBox="0 0 16 16" {...s}><path d="M10 13L5 8L10 3"/></svg>;
    case "forward": return <svg viewBox="0 0 16 16" {...s}><path d="M6 3L11 8L6 13"/></svg>;
    case "history": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="6"/><path d="M8 5V8L10 9.5"/></svg>;
    case "plus": return <svg viewBox="0 0 16 16" {...s}><path d="M8 3V13M3 8H13"/></svg>;
    case "close": return <svg viewBox="0 0 16 16" {...s}><path d="M4 4L12 12M12 4L4 12"/></svg>;
    case "more": return <svg viewBox="0 0 16 16" {...s}><circle cx="4" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="8" r="1" fill="currentColor"/></svg>;
    case "trash": return <svg viewBox="0 0 16 16" {...s}><path d="M3 4H13M6 4V3C6 2.4 6.4 2 7 2H9C9.6 2 10 2.4 10 3V4M5 4L5.5 13C5.5 13.5 6 14 6.5 14H9.5C10 14 10.5 13.5 10.5 13L11 4"/></svg>;
    case "bell": return <svg viewBox="0 0 16 16" {...s}><path d="M5 10L4 12H12L11 10V7C11 5 9.5 3.5 8 3.5C6.5 3.5 5 5 5 7V10Z"/><path d="M7 13.5C7 14 7.5 14.5 8 14.5C8.5 14.5 9 14 9 13.5"/></svg>;
    case "calendar": return <svg viewBox="0 0 16 16" {...s}><rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M5 2V5M11 2V5M2.5 6.5H13.5"/></svg>;
    case "users": return <svg viewBox="0 0 16 16" {...s}><circle cx="6" cy="6.5" r="2.5"/><path d="M2 13C2 11 4 9.5 6 9.5C8 9.5 10 11 10 13"/><circle cx="11" cy="7" r="1.8"/><path d="M10.5 9.5C12.5 9.5 14 11 14 13"/></svg>;
    case "clock": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="6"/><path d="M8 5V8L10 9.5"/></svg>;
    case "building": return <svg viewBox="0 0 16 16" {...s}><rect x="3" y="2.5" width="10" height="11"/><path d="M5.5 5H6.5M9.5 5H10.5M5.5 7.5H6.5M9.5 7.5H10.5M5.5 10H6.5M9.5 10H10.5"/></svg>;
    case "info": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="6"/><path d="M8 7.5V11M8 5.5V5.6"/></svg>;
    case "sparkles": return <svg viewBox="0 0 16 16" {...s}><path d="M6 2L7 5L10 6L7 7L6 10L5 7L2 6L5 5L6 2Z" fill="currentColor"/><path d="M12 9L12.7 10.3L14 11L12.7 11.7L12 13L11.3 11.7L10 11L11.3 10.3L12 9Z" fill="currentColor"/></svg>;
    case "edit": return <svg viewBox="0 0 16 16" {...s}><path d="M11.5 2.5L13.5 4.5L5 13L2 14L3 11L11.5 2.5Z"/></svg>;
    case "search": return <svg viewBox="0 0 16 16" {...s}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>;
    case "lock": return <svg viewBox="0 0 16 16" {...s}><rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5C5.5 3.5 6.5 2.5 8 2.5C9.5 2.5 10.5 3.5 10.5 5V7"/></svg>;
    case "pin": return <svg viewBox="0 0 16 16" {...s}><path d="M8 2L11 5L9 7L9 10L7 8L4 11L5 8L3 7L5 5L8 2Z"/></svg>;
    case "menu": return <svg viewBox="0 0 16 16" {...s}><path d="M3 5H13M3 8H13M3 11H13"/></svg>;
    case "check": return <svg viewBox="0 0 16 16" {...s}><path d="M3 8.5L6.5 12L13 4.5"/></svg>;
    case "x-circle": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="6"/><path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"/></svg>;
    case "alert": return <svg viewBox="0 0 16 16" {...s}><path d="M8 2L14 13H2L8 2Z"/><path d="M8 7V10M8 11.5V11.6"/></svg>;
    case "refresh": return <svg viewBox="0 0 16 16" {...s}><path d="M3 8C3 5.2 5.2 3 8 3C10.2 3 12 4.4 12.8 6.5M13 8C13 10.8 10.8 13 8 13C5.8 13 4 11.6 3.2 9.5"/><path d="M13 3.5V6.5H10M3 12.5V9.5H6"/></svg>;
    case "settings": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="2"/><path d="M8 2V3.5M8 12.5V14M3.5 8H2M14 8H12.5M4.5 4.5L3.5 3.5M12.5 12.5L11.5 11.5M11.5 4.5L12.5 3.5M3.5 12.5L4.5 11.5"/></svg>;
    case "sun": return <svg viewBox="0 0 16 16" {...s}><circle cx="8" cy="8" r="3"/><path d="M8 1V3M8 13V15M1 8H3M13 8H15M3.5 3.5L5 5M11 11L12.5 12.5M12.5 3.5L11 5M5 11L3.5 12.5"/></svg>;
    default: return <span style={{display: "inline-block", width: size, height: size}}/>;
  }
};

// Bot message bubble
const BotMsg = ({ children, ts }) => (
  <div className="msg bot">
    <div className="bubble">{children}</div>
    {ts && <div className="ts">{ts}</div>}
  </div>
);

const UserMsg = ({ children, ts }) => (
  <div className="msg user">
    <div className="bubble">{children}</div>
    {ts && <div className="ts">{ts}</div>}
  </div>
);

const Typing = () => (
  <div className="msg bot">
    <div className="typing"><span className="d"/><span className="d"/><span className="d"/></div>
  </div>
);

// Search progress card
const SearchCard = ({ candidates, currentIdx, found, foundCode }) => (
  <div className="card">
    <div className="card-head">
      <div className="title">빈 공간 찾는 중</div>
      <div className="tag accent">검증 {Math.min(currentIdx + 1, candidates.length)}/{candidates.length}</div>
    </div>
    <div className="card-body">
      <div className="search-progress">
        <div className="progress-bar">
          <div className="fill" style={{ width: `${((currentIdx + (found ? 1 : 0.5)) / candidates.length) * 100}%` }}/>
        </div>
        <div className="search-list">
          {candidates.map((c, i) => {
            let cls = "pending";
            if (i < currentIdx) cls = c.result === "found" ? "found" : "done";
            else if (i === currentIdx) cls = found && c.result === "found" ? "found" : "active";
            return (
              <div key={c.code} className={`search-item ${cls}`}>
                <span className="marker"/>
                <span>{c.building} · {c.name}</span>
                {(cls === "done" || cls === "found") && <span className="why">{c.why}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

// Recommendation card
const RecCard = ({ space, onAlternative, dense = false }) => (
  <div className="card">
    <div className="card-head">
      <div className="title">추천 공간</div>
      <div className="tag success">예약 가능</div>
    </div>
    <div className="card-body">
      <div className="rec-space">
        <div className="ph">
          <Icon name="building" size={22}/>
        </div>
        <div className="info">
          <div className="name">{space.name}</div>
          <div className="building">{space.building} · {space.floor}</div>
          {!dense && (
            <div className="rec-meta">
              <div className="pair"><span>정원</span><span className="v">{space.capa}</span></div>
              <div className="pair"><span>시간</span><span className="v">18:00–20:00</span></div>
              <div className="pair"><span>날짜</span><span className="v">5/21(목)</span></div>
            </div>
          )}
        </div>
      </div>
      {!dense && (
        <div className="dept-warn">
          <span className="icon">ⓘ</span>
          <span><b>소프트웨어융합대학 행정실</b> 우선 공간 — 신청 시 학생회 명의 권장</span>
        </div>
      )}
    </div>
    {onAlternative && (
      <div className="card-actions">
        <button className="btn small" onClick={onAlternative}>다른 공간 찾기</button>
      </div>
    )}
  </div>
);

// Draft summary card
const DraftCard = ({ draft, onSubmit, onEdit, suggested = {}, submitting = false }) => (
  <div className="card">
    <div className="card-head">
      <div className="title">신청서 미리보기</div>
      <div className="tag muted">초안</div>
    </div>
    <div className="card-body">
      <div className="draft-list">
        {[
          ["행사구분", "category"],
          ["주관단체", "group"],
          ["행사명", "event"],
          ["행사인원", "headcount"],
          ["사용목적", "purpose"],
        ].map(([label, key]) => (
          <div className="draft-row" key={key}>
            <div className="k">{label}</div>
            <div className={`v ${draft[key] ? (suggested[key] ? "suggested" : "") : "muted"}`}>
              {draft[key] || "미입력"}
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="card-actions">
      <button
        className="btn primary small"
        onClick={onSubmit}
        disabled={submitting || !draft.group || !draft.event}
      >
        {submitting ? "제출 중…" : "GLS 제출"}
      </button>
      <button className="btn small" onClick={onEdit}>수정</button>
    </div>
  </div>
);

// Failed (no space) card
const NoSpaceCard = ({ summary }) => (
  <div className="card failed-card">
    <div className="title">
      <Icon name="alert" size={14}/>
      조건에 맞는 공간이 없어요
    </div>
    <div className="body">
      {summary || "자연·명륜 양 캠퍼스를 모두 확인했지만 해당 조건을 만족하는 공간을 찾지 못했습니다."}
    </div>
  </div>
);

// P2 inline suggestion
const P2Suggest = ({ onAccept, onDecline }) => (
  <div className="msg bot">
    <div className="p2-suggest">
      <div className="icon"><Icon name="sparkles" size={16}/></div>
      <div className="content">
        지난주(5/14)처럼 <b>SW학생회 운영회의</b>로 작성할까요?
        <div className="src">최근 4회 같은 행사로 신청</div>
        <div className="actions">
          <button className="btn primary small" onClick={onAccept}>네, 같게요</button>
          <button className="btn small" onClick={onDecline}>다른 행사예요</button>
        </div>
      </div>
    </div>
  </div>
);

// GLS Login required card — used for both initial login + mid-flow session expiry
const GLSLoginCard = ({ variant = "needed", onOpenLogin, loggingIn = false }) => {
  const isExpired = variant === "expired";
  return (
    <div className="card gls-login-card">
      <div className="card-head">
        <div className="title">
          <span className="login-icon"><Icon name="lock" size={13}/></span>
          {isExpired ? "GLS 세션이 만료됐어요" : "GLS 로그인이 필요해요"}
        </div>
        <div className="tag warning">{isExpired ? "재로그인" : "필요"}</div>
      </div>
      <div className="card-body">
        <div className="login-body">
          {isExpired
            ? "검증 도중에 GLS 로그인이 풀렸어요. 다시 로그인하시면 멈춘 지점부터 이어서 진행할게요."
            : "예약은 사용자님의 GLS 계정으로 직접 진행돼요. 새 탭에서 로그인하시면 이어서 진행할게요."}
          <div className="login-domain">
            <Icon name="lock" size={11}/>
            <span>kingoinfo.skku.edu</span>
          </div>
        </div>
      </div>
      <div className="card-actions">
        <button className="btn primary small" onClick={onOpenLogin} disabled={loggingIn}>
          {loggingIn ? "로그인 확인 중…" : (isExpired ? "다시 로그인" : "GLS 로그인 열기")}
        </button>
      </div>
    </div>
  );
};

window.UI = { Icon, BotMsg, UserMsg, Typing, SearchCard, RecCard, DraftCard, NoSpaceCard, P2Suggest, GLSLoginCard };
