/**
 * Content Script — GLS 페이지(kingoinfo.skku.edu)에 주입되는 entry.
 *
 * 책임:
 * - 페이지 로드 시 main-world 브리지 스크립트 주입 (window.nexacro 접근용)
 * - chrome.runtime.onMessage 로 background의 BG_* 명령 수신
 * - 명령을 glsAgent로 위임 → 결과를 CONTENT_* 응답으로 회신
 *
 * 아키텍처 메모 (Slice 9):
 * - content script 본체는 isolated world에서 실행 → window.nexacro 접근 불가.
 * - 페이지 최상단에서 inline <script>를 DOM에 삽입해 main world에 브리지를 띄운다.
 * - 브리지는 `window.postMessage` 로 들어오는 "GLS_AGENT_EXEC" 요청을 받아
 *   serialize된 함수 본문을 eval해 결과를 반환. glsAgent는 이 RPC 를 통해
 *   nexacroActions 헬퍼들을 main world 컨텍스트에서 실행시킨다.
 */

import type {
  BackgroundToContent,
  BgCheckAvailability,
  BgSubmitReservation,
  ContentAvailabilityResult,
  ContentSessionState,
  ContentSubmitResult,
} from '../shared/messages';
import { checkSession, checkAvailability, submitReservation } from './glsAgent';

// ---------- main-world 브리지 주입 ----------

/**
 * main world에 실행될 브리지 IIFE.
 * window.postMessage 채널로 들어오는 함수 본문 문자열을 eval하여
 * `window.nexacro` 컨텍스트에서 실행한 결과를 회신한다.
 *
 * 보안: 같은 origin/window.postMessage 만 수신. extension 외부에서 oragin이
 * kingoinfo.skku.edu로 들어와도 페이지 스크립트 권한이므로 추가 권한은 없음.
 */
const BRIDGE_SOURCE = String.raw`
(function () {
  if (window.__GLS_AGENT_BRIDGE__) return;
  window.__GLS_AGENT_BRIDGE__ = true;

  // ---------- main-world 헬퍼 라이브러리 (window.__GLS__) ----------
  // shared/gls/nexacroActions.ts 의 main-world 안전 부분을 그대로 옮긴 미러.
  // 이 파일에서만 직접 수정. 진실의 원천은 shared/gls/nexacroActions.ts 이며
  // 시그니처를 바꿀 경우 양쪽을 함께 갱신할 것 (slice 9 한계).
  var G = {};
  window.__GLS__ = G;

  G.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  G.nexClick = function (el) {
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var types = ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'];
    for (var i = 0; i < types.length; i++) {
      el.dispatchEvent(new MouseEvent(types[i], {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y, button: 0, view: window,
      }));
    }
  };

  G.byIdSuffix = function (suffix) {
    return document.querySelector(
      '[id$=".' + suffix + '"]:not([id$=":icontext"])',
    );
  };

  G.findByText = function (text) {
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      if (d.offsetParent !== null && d.innerText && d.innerText.trim() === text) return d;
    }
    return null;
  };

  G.activePopupForm = function () {
    var app = window.nexacro.getApplication();
    var top = app.mainframe.TopFrame;
    var keys = Object.keys(top).filter(function (k) { return k.indexOf('popupFrame') === 0; });
    if (keys.length === 0) throw new Error('no popupFrame open');
    return top[keys[keys.length - 1]].form;
  };

  G.activeModalDM = function () { return G.activePopupForm().divManage.form; };

  G.hasPopupFrame = function () {
    try {
      var app = window.nexacro.getApplication();
      var top = app.mainframe.TopFrame;
      return Object.keys(top).some(function (k) { return k.indexOf('popupFrame') === 0; });
    } catch (_) { return false; }
  };

  G.selectComboByText = function (dm, comboSuffix, label) {
    // Nexacro 컴포넌트의 .id는 short name만 줘서 풀패스 매칭 불가.
    // 같은 suffix가 divSearch(페이지)와 divManage(모달) 양쪽에 있으므로
    // 현재 popupFrame prefix로 좁힌 suffix 매칭으로 모달 콤보만 잡는다.
    var combo = dm[comboSuffix];
    if (!combo) throw new Error('combo not found: ' + comboSuffix);
    var app = window.nexacro.getApplication();
    var top = app.mainframe.TopFrame;
    var popupKeys = Object.keys(top).filter(function (k) { return k.indexOf('popupFrame') === 0; });
    if (popupKeys.length === 0) throw new Error('no popupFrame open');
    var popupPrefix = 'mainframe.TopFrame.' + popupKeys[popupKeys.length - 1] + '.';

    var dropSel = 'div[id^="' + popupPrefix + '"][id$=".' + comboSuffix + '.dropbutton"]:not([id$=":icontext"])';
    var drop = document.querySelector(dropSel);
    if (!drop) throw new Error('dropbutton not found: ' + dropSel);
    G.nexClick(drop);

    var itemSel = 'div[id^="' + popupPrefix + '"][id*=".' + comboSuffix + '.combolist.item_"]';
    var items = Array.prototype.slice
      .call(document.querySelectorAll(itemSel))
      .filter(function (d) { return !d.id.endsWith(':text'); });
    var target = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].innerText.trim() === label) { target = items[i]; break; }
    }
    if (!target) {
      var avail = items.map(function (i) { return i.innerText.trim(); }).join(', ');
      throw new Error('combo ' + comboSuffix + ' option not found: "' + label + '". Available: ' + avail);
    }
    G.nexClick(target);
  };

  G.readDataset = function (form, dsName) {
    var ds = form[dsName];
    if (!ds || typeof ds.getRowCount !== 'function') throw new Error('dataset not found: ' + dsName);
    var colCount = ds.getColCount();
    var cols = [];
    for (var c = 0; c < colCount; c++) cols.push(ds.getColID(c));
    var rows = [];
    for (var i = 0; i < ds.getRowCount(); i++) {
      var r = {};
      for (var j = 0; j < cols.length; j++) r[cols[j]] = ds.getColumn(i, cols[j]);
      rows.push(r);
    }
    return rows;
  };

  G.dismissNoticeIfShown = function () {
    var header = G.findByText('공지사항');
    if (!header) return;
    var parent = header.parentElement;
    while (parent) {
      var btn = parent.querySelector(
        '[id$=".btnClose"]:not([id$=":icontext"]), [id$=".btnX"]:not([id$=":icontext"])',
      );
      if (btn && btn.offsetParent !== null) { G.nexClick(btn); return; }
      parent = parent.parentElement;
    }
    // 폴백 — 확인 텍스트 버튼
    var ok = G.findByText('확인');
    if (ok) { G.nexClick(ok); return; }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };

  G.clickSpaceRow = function (glsSpaceCode) {
    var form = G.activePopupForm();
    var ds = form.dsGrdMainNew;
    var rowIdx = -1;
    for (var i = 0; i < ds.getRowCount(); i++) {
      if (String(ds.getColumn(i, 'GU_SPACE_CD')) === String(glsSpaceCode)) { rowIdx = i; break; }
    }
    if (rowIdx === -1) throw new Error('space ' + glsSpaceCode + ' not in dsGrdMainNew');
    var grd = form.grdCal;
    if (grd && typeof grd.selectRow === 'function') {
      grd.selectRow(rowIdx);
      try { if (typeof form.grdCal_OnCellClick === 'function') form.grdCal_OnCellClick(grd, { row: rowIdx, cell: 0 }); } catch (_) {}
    }
    // 좌표 기반 폴백 — grdCal DOM의 가시 row 영역을 클릭
    try {
      var body = document.getElementById(grd.id + '.body');
      if (body) {
        var rect = body.getBoundingClientRect();
        // row 높이를 추정 (rowCount > 0 가정) — 1행 클릭이면 dsGrdSub 갱신
        var rowH = rect.height / Math.max(1, ds.getRowCount());
        var x = rect.left + 30;
        var y = rect.top + rowH * rowIdx + rowH / 2;
        var el = document.elementFromPoint(x, y);
        if (el) G.nexClick(el);
      }
    } catch (_) { /* 좌표 클릭 실패 시 selectRow만으로 진행 */ }
  };

  G.setFormValues = function (dm, values) {
    for (var k in values) if (Object.prototype.hasOwnProperty.call(values, k)) {
      var cmp = dm[k];
      if (!cmp) throw new Error('component not found: ' + k);
      cmp.set_value(String(values[k]));
    }
  };

  G.submitReservation = function () {
    var pf = G.activePopupForm();
    if (typeof pf.btnSave_OnClick !== 'function') throw new Error('btnSave_OnClick not available');
    pf.btnSave_OnClick();
  };

  G.parseTimeTerm = function (term) {
    var m = String(term || '').match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return [parseInt(m[1], 10) * 60 + parseInt(m[2], 10), parseInt(m[3], 10) * 60 + parseInt(m[4], 10)];
  };

  G.dayOfWeek = function (yyyymmdd) {
    var y = parseInt(yyyymmdd.slice(0, 4), 10);
    var mo = parseInt(yyyymmdd.slice(4, 6), 10);
    var d = parseInt(yyyymmdd.slice(6, 8), 10);
    return new Date(y, mo - 1, d).getDay();
  };

  G.coversDate = function (row, date) {
    if (row.GANGJWA_START_DATE === date) return true;
    var m = (row.INFO2 || '').match(/(\d{4})\/(\d{2})\/(\d{2})\s*~\s*(\d{4})\/(\d{2})\/(\d{2})/);
    if (!m) return false;
    var rs = m[1] + m[2] + m[3], re = m[4] + m[5] + m[6];
    if (date < rs || date > re) return false;
    return G.dayOfWeek(row.GANGJWA_START_DATE || date) === G.dayOfWeek(date);
  };

  G.computeConflicts = function (schedule, date, startHour, endHour) {
    var wantS = startHour * 60, wantE = endHour * 60;
    var conflicts = [];
    for (var i = 0; i < schedule.length; i++) {
      var row = schedule[i];
      if (!G.coversDate(row, date)) continue;
      var range = G.parseTimeTerm(row.TM_TERM);
      if (!range) continue;
      if (range[0] < wantE && range[1] > wantS) {
        conflicts.push({ kind: row.GUBUN, timeTerm: row.TM_TERM, info: (row.INFO1 || '') + ' ' + (row.INFO2 || '') });
      }
    }
    return conflicts;
  };

  // ---------- 메시지 라우터 ----------

  window.addEventListener('message', async function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.type !== 'GLS_AGENT_EXEC' || !data.id) return;
    var id = data.id;
    try {
      // body 는 (async function() { ... })() 형태가 들어옴
      var result = await (0, eval)(data.body);
      window.postMessage(
        { type: 'GLS_AGENT_RESULT', id: id, ok: true, result: result },
        '*',
      );
    } catch (err) {
      window.postMessage(
        {
          type: 'GLS_AGENT_RESULT',
          id: id,
          ok: false,
          error: (err && err.message) || String(err),
        },
        '*',
      );
    }
  });
})();
`;

function injectBridge(): void {
  if ((window as any).__GLS_BRIDGE_INJECTED__) return;
  (window as any).__GLS_BRIDGE_INJECTED__ = true;
  const script = document.createElement('script');
  script.textContent = BRIDGE_SOURCE;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

injectBridge();

// ---------- isolated world ↔ main world RPC ----------

let rpcSeq = 0;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== 'GLS_AGENT_RESULT') return;
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  if (data.ok) entry.resolve(data.result);
  else entry.reject(new Error(data.error || 'bridge error'));
});

/**
 * main world에서 async 함수 본문을 실행하고 결과를 받아온다.
 * `body`는 IIFE 문자열 — 예: `(async () => { ... })()`
 *
 * glsAgent / formFiller 가 이 함수를 통해 모든 nexacro 호출을 main world로 위임.
 */
export async function runInPage<T = unknown>(body: string, timeoutMs = 15000): Promise<T> {
  const id = ++rpcSeq;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`runInPage timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        window.clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    });
    window.postMessage({ type: 'GLS_AGENT_EXEC', id, body }, '*');
  });
}

// ---------- chrome.runtime 메시지 라우터 ----------

chrome.runtime.onMessage.addListener(
  (msg: BackgroundToContent, _sender, sendResponse) => {
    // async 응답을 위해 true를 반환하고 sendResponse를 비동기 호출.
    (async () => {
      try {
        switch (msg.type) {
          case 'BG_CHECK_SESSION': {
            const loggedIn = checkSession();
            const reply: ContentSessionState = {
              type: 'CONTENT_SESSION_STATE',
              loggedIn,
            };
            sendResponse(reply);
            break;
          }
          case 'BG_CHECK_AVAILABILITY': {
            const m = msg as BgCheckAvailability;
            const r = await checkAvailability(
              m.candidate,
              m.date,
              m.startHour,
              m.endHour,
            );
            const reply: ContentAvailabilityResult = {
              type: 'CONTENT_AVAILABILITY_RESULT',
              spaceCode: m.candidate.glsSpaceCode,
              available: r.available,
              conflicts: r.conflicts as ContentAvailabilityResult['conflicts'],
            };
            sendResponse(reply);
            break;
          }
          case 'BG_SUBMIT_RESERVATION': {
            const m = msg as BgSubmitReservation;
            // background → content 메시지 타입엔 date/startTime/endTime 이 없음.
            // formData 는 신청자 본인 정보만 들고 있고 시간 정보는 직전 check 단계에서
            // 모달에 세팅됨 — 안전을 위해 candidate + 빈 시간으로 호출.
            // (배경 SW가 시간 정보를 별도 보내도록 메시지 확장은 다른 slice에서 처리.)
            const r = await submitReservation(
              m.candidate,
              m.formData,
              '',
              '',
              '',
            );
            const reply: ContentSubmitResult = {
              type: 'CONTENT_SUBMIT_RESULT',
              ok: r.ok,
              spaceCode: m.candidate.glsSpaceCode,
              error: r.error,
            };
            sendResponse(reply);
            break;
          }
          default: {
            // unknown — 무응답
            sendResponse(undefined as never);
          }
        }
      } catch (err) {
        // 어떤 단계라도 throw → 에러 응답으로 변환
        const message = err instanceof Error ? err.message : String(err);
        if ((msg as BackgroundToContent).type === 'BG_CHECK_AVAILABILITY') {
          const m = msg as BgCheckAvailability;
          const reply: ContentAvailabilityResult = {
            type: 'CONTENT_AVAILABILITY_RESULT',
            spaceCode: m.candidate.glsSpaceCode,
            available: false,
            conflicts: [
              { kind: '예약' as const, timeTerm: '', info: `error: ${message}` },
            ],
          };
          sendResponse(reply);
        } else if ((msg as BackgroundToContent).type === 'BG_SUBMIT_RESERVATION') {
          const m = msg as BgSubmitReservation;
          const reply: ContentSubmitResult = {
            type: 'CONTENT_SUBMIT_RESULT',
            ok: false,
            spaceCode: m.candidate.glsSpaceCode,
            error: message,
          };
          sendResponse(reply);
        } else {
          const reply: ContentSessionState = {
            type: 'CONTENT_SESSION_STATE',
            loggedIn: false,
          };
          sendResponse(reply);
        }
      }
    })();
    return true; // async
  },
);
