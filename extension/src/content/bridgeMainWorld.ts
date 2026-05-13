/**
 * GLS 페이지 main world 브리지.
 *
 * manifest.json content_scripts 의 `world: "MAIN"` 으로 주입되어
 * 페이지 컨텍스트 (=`window.nexacro` 접근 가능) 에서 실행된다.
 *
 * isolated-world content script 와는 `window.postMessage` 로 통신.
 * 보안상 GLS 페이지의 CSP 가 `unsafe-eval` 을 허용하지 않으므로
 * **사전에 등록된 named operation 만 RPC 로 호출** 가능 (eval 금지).
 *
 * 새로운 자동화 step 이 필요하면 아래 `ops` 객체에 등록.
 */

// 페이지 컨텍스트에서만 존재
declare global {
  interface Window {
    nexacro?: any;
    __GLS_BRIDGE_INSTALLED__?: boolean;
  }
}

(function install() {
  if (window.__GLS_BRIDGE_INSTALLED__) return;
  window.__GLS_BRIDGE_INSTALLED__ = true;

  // ---------- DOM / Nexacro 헬퍼 ----------

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  function nexClick(el: Element): void {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const type of ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true, cancelable: true,
          clientX: x, clientY: y, button: 0, view: window,
        }),
      );
    }
  }

  function byIdSuffix(suffix: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[id$=".${suffix}"]:not([id$=":icontext"])`,
    );
  }

  function findByText(text: string): HTMLElement | null {
    const divs = document.querySelectorAll<HTMLElement>('div');
    for (const d of divs) {
      if (d.offsetParent !== null && d.innerText && d.innerText.trim() === text) return d;
    }
    return null;
  }

  function topFrame(): any | null {
    const app = window.nexacro?.getApplication?.();
    const mainframe = app?.mainframe;
    const top = mainframe?.TopFrame;
    return top ?? null;
  }

  function popupKey(): string | null {
    const top = topFrame();
    if (!top) return null;
    const keys = Object.keys(top).filter((k) => k.startsWith('popupFrame'));
    return keys.length > 0 ? keys[keys.length - 1] : null;
  }

  function popupPrefix(): string {
    const k = popupKey();
    if (!k) throw new Error('no popupFrame open');
    return `mainframe.TopFrame.${k}.`;
  }

  function activePopupForm(): any {
    const k = popupKey();
    if (!k) throw new Error('no popupFrame open');
    const top = topFrame();
    if (!top) throw new Error('TopFrame not ready');
    return top[k].form;
  }

  function activeModalDM(): any {
    return activePopupForm().divManage.form;
  }

  function readDataset(form: any, dsName: string): Record<string, unknown>[] {
    const ds = form[dsName];
    if (!ds || typeof ds.getRowCount !== 'function') {
      throw new Error('dataset not found: ' + dsName);
    }
    const colCount = ds.getColCount();
    const cols: string[] = [];
    for (let c = 0; c < colCount; c++) cols.push(ds.getColID(c));
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < ds.getRowCount(); i++) {
      const r: Record<string, unknown> = {};
      for (const col of cols) r[col] = ds.getColumn(i, col);
      rows.push(r);
    }
    return rows;
  }

  // ---------- 자동화 named operations ----------

  const ops: Record<string, (args?: any) => unknown | Promise<unknown>> = {
    hasPopupFrame: () => popupKey() !== null,

    /**
     * Nexacro 앱 + 상단 메뉴(`btnM532010000`) 가 가시 상태일 때까지 대기.
     * 새 탭 첫 진입 시 페이지 렌더링이 늦어 byIdSuffix 가 null 반환하는 케이스 대비.
     */
    waitForMenuReady: async ({ timeoutMs = 15000 } = {}): Promise<true> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (topFrame()) {
            const menu = byIdSuffix('btnM532010000');
            if (menu && menu.offsetParent !== null) return true;
          }
        } catch (_) {
          /* nexacro not ready */
        }
        await wait(200);
      }
      throw new Error('Nexacro menu not visible after ' + timeoutMs + 'ms');
    },

    /**
     * 신청/자격관리 → 공간대여신청 → 예약신청 모달 오픈.
     * 이미 모달이 떠 있으면 noop.
     */
    openReservationModal: async (): Promise<true> => {
      if (popupKey()) { console.log('[GLS] modal already open'); return true; }

      // 1. 상단 메뉴
      const menu = byIdSuffix('btnM532010000');
      if (!menu) throw new Error('menu btnM532010000 not found');
      console.log('[GLS] clicking top menu (신청/자격관리)');
      nexClick(menu);
      await wait(700);

      // 2. 서브메뉴 — id suffix 가 텍스트 매칭보다 안정적
      let sub: HTMLElement | null = null;
      for (let i = 0; i < 15; i++) {
        sub = byIdSuffix('btnMenuM000011122');
        if (sub && sub.offsetParent !== null) break;
        await wait(200);
      }
      if (!sub) {
        // fallback: 텍스트 매칭
        sub = findByText('공간대여신청');
      }
      if (!sub) throw new Error('submenu (공간대여신청) not found');
      console.log('[GLS] clicking submenu', sub.id);
      nexClick(sub);
      await wait(1500);

      // 3. 예약신청 버튼 가시 대기 (최대 5s)
      let btn: HTMLElement | null = null;
      for (let i = 0; i < 25; i++) {
        btn = byIdSuffix('btnInsert4');
        if (btn && btn.offsetParent !== null) break;
        await wait(200);
      }
      if (!btn) throw new Error('btnInsert4 not visible');
      console.log('[GLS] clicking btnInsert4');
      nexClick(btn);

      // 4. popupFrame 등장 대기 (최대 5s)
      let key: string | null = null;
      for (let i = 0; i < 25; i++) {
        key = popupKey();
        if (key) break;
        await wait(200);
      }
      if (!key) throw new Error('reservation modal did not open');
      console.log('[GLS] modal popupFrame ready', key);

      // 5. 모달 내부 DOM (divManage.cboCampusCd.dropbutton) 가시 대기.
      //    popupFrame 생성 직후엔 내부 컴포넌트가 아직 lazy render 되지 않은 케이스 있음.
      const prefix = `mainframe.TopFrame.${key}.`;
      const probeSel = `div[id^="${prefix}"][id$=".cboCampusCd.dropbutton"]:not([id$=":icontext"])`;
      for (let i = 0; i < 25; i++) {
        const el = document.querySelector<HTMLElement>(probeSel);
        if (el && el.offsetParent !== null) {
          console.log('[GLS] modal internal DOM ready');
          return true;
        }
        await wait(200);
      }
      console.warn('[GLS] modal internal DOM not visible after 5s — proceeding anyway');
      return true;
    },

    /**
     * 콤보박스를 라벨 텍스트로 선택. cascade(OnChanged) 자연스럽게 발화.
     * Nexacro 가 dropdown 첫 열림에서 item text 를 lazy render 하므로 최대 3s 폴링.
     */
    selectComboByText: async (
      args: { suffix: string; label: string },
    ): Promise<true> => {
      const { suffix, label } = args;
      console.log('[GLS] selectComboByText', suffix, '←', label);
      const prefix = popupPrefix();
      const dropSel = `div[id^="${prefix}"][id$=".${suffix}.dropbutton"]:not([id$=":icontext"])`;
      // 모달 컴포넌트 DOM 이 lazy 렌더링되는 경우가 있어 dropbutton 가시까지 최대 5s 폴링.
      let drop: HTMLElement | null = null;
      const dropDeadline = Date.now() + 5000;
      while (Date.now() < dropDeadline) {
        drop = document.querySelector<HTMLElement>(dropSel);
        if (drop && drop.offsetParent !== null) break;
        await wait(200);
      }
      if (!drop) throw new Error('dropbutton not found: ' + dropSel);
      nexClick(drop);

      const itemSel = `div[id^="${prefix}"][id*=".${suffix}.combolist.item_"]`;
      const deadline = Date.now() + 3000;
      let target: HTMLElement | null = null;
      let snap: HTMLElement[] = [];
      while (Date.now() < deadline) {
        snap = Array.from(document.querySelectorAll<HTMLElement>(itemSel)).filter(
          (d) => !d.id.endsWith(':text'),
        );
        target = snap.find((it) => it.innerText.trim() === label) ?? null;
        if (target) break;
        await wait(150);
      }
      if (!target) {
        const avail = snap.map((i) => i.innerText.trim()).join(', ');
        throw new Error(`combo ${suffix} option not found: "${label}". Available: ${avail}`);
      }
      console.log('[GLS] selectComboByText ✓', suffix, '=', label);
      nexClick(target);
      return true;
    },

    /**
     * 데이터셋에 (column == value) 인 row 가 나타날 때까지 폴링.
     * 캠퍼스 → 건물 cascade 처럼 비동기 transaction 결과를 기다릴 때 사용.
     */
    waitForDatasetValue: async (args: {
      dsName: string;
      column: string;
      value: string;
      timeoutMs?: number;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 5000;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const ds = activePopupForm()[args.dsName];
          if (ds && typeof ds.getRowCount === 'function') {
            for (let i = 0; i < ds.getRowCount(); i++) {
              if (String(ds.getColumn(i, args.column)) === String(args.value)) {
                console.log('[GLS] waitForDatasetValue ✓', args.dsName, args.column, '=', args.value);
                return true;
              }
            }
          }
        } catch (_) { /* dataset not ready */ }
        await wait(200);
      }
      throw new Error(
        `dataset ${args.dsName}.${args.column} did not contain "${args.value}" within ${timeoutMs}ms`,
      );
    },

    /**
     * 콤보를 코드 값으로 set 하고 cascade OnChanged 핸들러를 명시 호출.
     *
     * dropdown 클릭 기반 selectComboByText 는 새 탭 fresh 모달에서 combolist
     * lazy render race 가 있어 (검증 2026-05-13) 불안정. 코드 값을 알고 있는
     * 케이스 (대부분의 dev/prod 흐름) 에서는 이 op 가 더 신뢰성 높다.
     */
    setComboAndFireChange: (args: { suffix: string; value: string }): true => {
      const dm = activeModalDM();
      const popupForm = activePopupForm();
      const cmp = dm[args.suffix];
      if (!cmp) throw new Error('component not found: ' + args.suffix);
      const prev = cmp.value;
      console.log('[GLS] setComboAndFireChange', args.suffix, prev, '→', args.value);
      cmp.set_value(args.value);
      const handlerName = `divManage_${args.suffix}_OnChanged`;
      const handler = popupForm[handlerName];
      if (typeof handler === 'function') {
        try {
          handler.call(popupForm, cmp, {
            fromobject: cmp,
            postvalue: args.value,
            prevalue: prev ?? '',
          });
        } catch (e) {
          console.warn('[GLS] OnChanged threw (non-fatal):', handlerName, e);
        }
      } else {
        console.warn('[GLS] no OnChanged handler:', handlerName);
      }
      return true;
    },

    /** 단일 컴포넌트 값 set (cascade 없는 단순 커밋용). */
    setComponentValue: (args: { suffix: string; value: string | number }): true => {
      const dm = activeModalDM();
      const cmp = dm[args.suffix];
      if (!cmp) throw new Error('component not found: ' + args.suffix);
      cmp.set_value(String(args.value));
      return true;
    },

    /** 여러 컴포넌트 일괄 set. */
    setManyValues: (args: { values: Record<string, string | number> }): true => {
      const dm = activeModalDM();
      for (const [k, v] of Object.entries(args.values)) {
        const cmp = dm[k];
        if (!cmp) throw new Error('component not found: ' + k);
        cmp.set_value(String(v));
      }
      return true;
    },

    /**
     * 공간 시간표 row 를 cell DOM 직접 클릭하여 dsGrdSub 로드 트리거.
     * Nexacro grdCal.selectRow 만으로는 side-effect 가 안 도는 것이 검증됐음.
     */
    clickSpaceRow: async (args: { glsSpaceCode: string }): Promise<true> => {
      const form = activePopupForm();
      const ds = form.dsGrdMainNew;
      console.log('[GLS] clickSpaceRow', args.glsSpaceCode, 'dsGrdMainNew rows:', ds.getRowCount());
      let rowIdx = -1;
      for (let i = 0; i < ds.getRowCount(); i++) {
        if (String(ds.getColumn(i, 'GU_SPACE_CD')) === String(args.glsSpaceCode)) {
          rowIdx = i;
          break;
        }
      }
      if (rowIdx === -1) {
        const avail: string[] = [];
        for (let i = 0; i < ds.getRowCount(); i++) avail.push(String(ds.getColumn(i, 'GU_SPACE_CD')));
        throw new Error(`space ${args.glsSpaceCode} not in dsGrdMainNew. Available: [${avail.join(',')}]`);
      }

      // Nexacro 그리드는 가상 스크롤이라 viewport 바깥의 row 는 DOM 에 없음.
      // 클릭 대상 row 가 보이도록 스크롤 트리거 후 cell 렌더링 대기.
      const grid = form.grdCal;
      try {
        if (typeof grid?.set_rowposition === 'function') grid.set_rowposition(rowIdx);
      } catch (e) {
        console.warn('[GLS] grdCal.set_rowposition failed', e);
      }

      const prefix = popupPrefix();
      const cellSel = `div[id^="${prefix}"][id$=".grdCal.body.gridrow_${rowIdx}.cell_${rowIdx}_0"]:not([id$=":icontext"])`;
      let cell: HTMLElement | null = null;
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        cell = document.querySelector<HTMLElement>(cellSel);
        if (cell) break;
        await wait(120);
      }
      if (!cell) throw new Error('grdCal cell not found for row ' + rowIdx + ' (virtualized, scroll failed)');
      console.log('[GLS] clickSpaceRow ✓ row', rowIdx);
      nexClick(cell);
      return true;
    },

    /** 모달 내 divNotice 영역 닫기 (best-effort). */
    dismissNoticeIfShown: (): boolean => {
      const k = popupKey();
      if (!k) return false;
      const noticeCloseSel = `div[id^="mainframe.TopFrame.${k}."][id$=".divNotice.form.btnClose"]:not([id$=":icontext"])`;
      const btn = document.querySelector<HTMLElement>(noticeCloseSel);
      if (btn && btn.offsetParent !== null) {
        nexClick(btn);
        return true;
      }
      return false;
    },

    /** dsGrdSub row 들을 dump 해서 isolated world 가 conflict 분석할 수 있게 반환. */
    readDsGrdSub: (): unknown[] => {
      return readDataset(activePopupForm(), 'dsGrdSub');
    },

    /** btnSave_OnClick 호출 — 실제 예약 제출. */
    submitReservation: (): true => {
      const pf = activePopupForm();
      if (typeof pf.btnSave_OnClick !== 'function') {
        throw new Error('btnSave_OnClick not available');
      }
      pf.btnSave_OnClick();
      return true;
    },

    /**
     * 저장 클릭 후 결과 폴링 (모달이 닫히거나 success/error 문구가 뜰 때까지 최대 5s).
     */
    waitForSubmitResult: async (
      { timeoutMs = 5000 } = {},
    ): Promise<{ ok: boolean; error?: string }> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        await wait(200);
        if (!popupKey()) return { ok: true };
        const okText =
          findByText('저장되었습니다.') ||
          findByText('정상적으로 저장되었습니다.') ||
          findByText('신청되었습니다.');
        if (okText) return { ok: true };
        const err = findByText('오류') || findByText('실패');
        if (err) {
          let p: HTMLElement | null = err.parentElement;
          let msg = '';
          while (p && !msg) {
            const t = p.innerText || '';
            if (t.length > 0 && t.length < 500) msg = t.trim();
            p = p.parentElement;
          }
          return { ok: false, error: msg || 'unknown error alert' };
        }
      }
      return { ok: false, error: 'submit result unknown (timeout)' };
    },

    /** 특정 콤보 suffix 의 DOM 구조 dump. dropdown 클릭 실패 디버깅용. */
    debugComboDom: (args: { suffix: string }): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      const k = popupKey();
      if (!k) return { err: 'no popup' };
      const prefix = `mainframe.TopFrame.${k}.`;
      const drop = document.querySelector(
        `div[id^="${prefix}"][id*=".${args.suffix}.dropbutton"]:not([id$=":icontext"])`,
      );
      out.dropbuttonFound = !!drop;
      out.dropbuttonVisible = drop ? (drop as HTMLElement).offsetParent !== null : false;
      const all = Array.from(
        document.querySelectorAll(`[id^="${prefix}"][id*=".${args.suffix}"]`),
      )
        .slice(0, 30)
        .map((el) => ({
          idTail: el.id.split(args.suffix + '.').pop() ?? el.id.slice(-40),
          visible: (el as HTMLElement).offsetParent !== null,
        }));
      out.allMatching = all;
      return out;
    },

    /** 모달의 현재 상태 디버그 dump. */
    debugModalState: (): Record<string, unknown> => {
      try {
        const dm = activeModalDM();
        return {
          campus: { v: dm.cboCampusCd?.value, t: dm.cboCampusCd?.text },
          build: { v: dm.cboBuildCd?.value, t: dm.cboBuildCd?.text },
          space: { v: dm.cboSpaceCd?.value, t: dm.cboSpaceCd?.text },
          cal: { v: dm.calUseDt?.value },
          useNum: dm.edtUseNum?.value,
          dsCboSpaceN: activePopupForm().dsCboSpace?.getRowCount?.(),
          dsGrdMainNewN: activePopupForm().dsGrdMainNew?.getRowCount?.(),
          dsGrdSubN: activePopupForm().dsGrdSub?.getRowCount?.(),
        };
      } catch (e) {
        return { err: String(e) };
      }
    },
  };

  // ---------- CustomEvent 기반 RPC 라우터 ----------
  //
  // window.postMessage 를 쓰면 Nexacro 의 __pWindow._on_default_sys_message 가
  // 모든 메시지의 data.id 에 .split() 을 호출하면서 TypeError 가 일어나고 내부
  // 상태가 깨지는 현상이 발견됐다 (검증 2026-05-13). 동일 origin 의 isolated ↔
  // main world 통신은 CustomEvent.detail 로도 충분하고, Nexacro 의 메시지 핸들러
  // 와 완전히 분리된다.

  const EVENT_EXEC = 'GLS_AGENT_EXEC';
  const EVENT_RESULT = 'GLS_AGENT_RESULT';

  window.addEventListener(EVENT_EXEC, (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { id: number; op: string; args?: unknown }
      | undefined;
    if (!detail || typeof detail.id !== 'number') return;

    const { id, op, args } = detail;
    void (async () => {
      try {
        const fn = ops[op];
        if (!fn) throw new Error('unknown op: ' + op);
        const result = await fn(args);
        window.dispatchEvent(
          new CustomEvent(EVENT_RESULT, { detail: { id, ok: true, result } }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[GLS] op failed:', op, message);
        window.dispatchEvent(
          new CustomEvent(EVENT_RESULT, { detail: { id, ok: false, error: message } }),
        );
      }
    })();
  });
})();

export {}; // 이 파일이 모듈로 취급되도록
