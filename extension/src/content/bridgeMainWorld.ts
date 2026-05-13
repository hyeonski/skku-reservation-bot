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

  function popupKey(): string | null {
    const app = window.nexacro?.getApplication?.();
    if (!app) return null;
    const top = app.mainframe.TopFrame;
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
    return window.nexacro.getApplication().mainframe.TopFrame[k].form;
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
          if (window.nexacro?.getApplication?.()) {
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
      if (popupKey()) return true;

      // 1. 상단 메뉴
      const menu = byIdSuffix('btnM532010000');
      if (!menu) throw new Error('menu btnM532010000 not found');
      nexClick(menu);
      await wait(500);

      // 2. 서브메뉴 (텍스트 매칭이 가장 안전)
      const sub = findByText('공간대여신청');
      if (!sub) throw new Error('submenu "공간대여신청" not found');
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
      nexClick(btn);

      // 4. popupFrame 등장 대기 (최대 5s)
      for (let i = 0; i < 25; i++) {
        if (popupKey()) return true;
        await wait(200);
      }
      throw new Error('reservation modal did not open');
    },

    /**
     * 콤보박스를 라벨 텍스트로 선택. cascade(OnChanged) 자연스럽게 발화.
     * Nexacro 가 dropdown 첫 열림에서 item text 를 lazy render 하므로 최대 3s 폴링.
     */
    selectComboByText: async (
      args: { suffix: string; label: string },
    ): Promise<true> => {
      const { suffix, label } = args;
      const prefix = popupPrefix();
      const dropSel = `div[id^="${prefix}"][id$=".${suffix}.dropbutton"]:not([id$=":icontext"])`;
      const drop = document.querySelector<HTMLElement>(dropSel);
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
      nexClick(target);
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
    clickSpaceRow: (args: { glsSpaceCode: string }): true => {
      const form = activePopupForm();
      const ds = form.dsGrdMainNew;
      let rowIdx = -1;
      for (let i = 0; i < ds.getRowCount(); i++) {
        if (String(ds.getColumn(i, 'GU_SPACE_CD')) === String(args.glsSpaceCode)) {
          rowIdx = i;
          break;
        }
      }
      if (rowIdx === -1) {
        throw new Error('space ' + args.glsSpaceCode + ' not in dsGrdMainNew');
      }
      const prefix = popupPrefix();
      const cellSel = `div[id^="${prefix}"][id$=".grdCal.body.gridrow_${rowIdx}.cell_${rowIdx}_0"]:not([id$=":icontext"])`;
      const cell = document.querySelector<HTMLElement>(cellSel);
      if (!cell) throw new Error('grdCal cell not found for row ' + rowIdx);
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

  // ---------- postMessage RPC 라우터 ----------

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as
      | { type: 'GLS_AGENT_EXEC'; id: number; op: string; args?: unknown }
      | undefined;
    if (!data || data.type !== 'GLS_AGENT_EXEC' || typeof data.id !== 'number') return;

    const { id, op, args } = data;
    void (async () => {
      try {
        const fn = ops[op];
        if (!fn) throw new Error('unknown op: ' + op);
        const result = await fn(args);
        window.postMessage(
          { type: 'GLS_AGENT_RESULT', id, ok: true, result },
          '*',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.postMessage(
          { type: 'GLS_AGENT_RESULT', id, ok: false, error: message },
          '*',
        );
      }
    })();
  });
})();

export {}; // 이 파일이 모듈로 취급되도록
