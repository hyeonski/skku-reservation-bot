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

  function isVisible(el: Element | null): el is HTMLElement {
    return !!el
      && el instanceof HTMLElement
      && (el.offsetParent !== null || el.getClientRects().length > 0);
  }

  function hasVisibleLoginPrompt(): boolean {
    const nexacroLogin = document.querySelector<HTMLElement>(
      '[id$=".edtLOGIN_ID"]:not([id$=":icontext"])',
    );
    if (isVisible(nexacroLogin)) return true;

    const ssoLogin = document.querySelector<HTMLInputElement>(
      'input[placeholder="아이디를 입력하세요."]',
    );
    if (isVisible(ssoLogin)) return true;

    const password = document.querySelector<HTMLInputElement>(
      'input[type="password"][placeholder="비밀번호를 입력하세요."]',
    );
    return isVisible(password);
  }

  const FIELD_LABEL_META: Record<string, { label: string; occurrence?: number }> = {
    cboHangsaGb: { label: '행사구분' },
    edtSinchungGroup: { label: '주관단체' },
    edtSinchungEvent: { label: '행사명' },
    edtUseNum: { label: '행사인원' },
    cboCampusCd: { label: '캠퍼스' },
    cboBuildCd: { label: '건물' },
    calUseDt: { label: '예약날짜' },
    cboSpaceCd: { label: '공간' },
    cboResStTime: { label: '예약시간', occurrence: 0 },
    cboResEdTime: { label: '예약시간', occurrence: 1 },
    TextArea00: { label: '사용목적' },
    contact: { label: '연락처' },
  };

  function popupDomPrefix(): string {
    return popupPrefix();
  }

  function isInActivePopup(el: Element): boolean {
    const prefix = popupDomPrefix();
    let cur: HTMLElement | null = el as HTMLElement;
    while (cur) {
      if (typeof cur.id === 'string' && cur.id.startsWith(prefix)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function controlValue(el: Element | null): string {
    if (!el) return '';
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return String(el.value ?? '').trim();
    }
    return String((el as HTMLElement).innerText || (el as HTMLElement).textContent || '').trim();
  }

  function normalizeLabel(value: string): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function digitsOnly(value: string): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  function normalizeSpaceText(value: string): string {
    return String(value ?? '')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const LOADING_HINTS = [
    '조회 중',
    '로딩 중',
    '처리 중',
    '잠시만',
    'Loading',
    'loading',
  ];

  function visibleTextSnapshot(limit = 24): string {
    const texts = visibleTextNodes()
      .map((node) => String(node.innerText || node.textContent || '').trim())
      .filter(Boolean)
      .slice(0, limit);
    return texts.join('|');
  }

  function readLoadingHint(): string {
    if (String(document.body.style.cursor || '').includes('wait')) return 'cursor:wait';
    const nodes = document.querySelectorAll<HTMLElement>('div, span, p, button');
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = String(node.innerText || node.textContent || '').trim();
      if (!text) continue;
      const hit = LOADING_HINTS.find((hint) => text.includes(hint));
      if (hit) return hit;
    }
    const loadingId = Array.from(document.querySelectorAll<HTMLElement>('[id]'))
      .find((node) => isVisible(node) && /(loading|progress|wait|mask)/i.test(node.id));
    if (loadingId) return `id:${loadingId.id}`;
    return '';
  }

  function readDatasetSignature(ds: any, keyColumn?: string): string {
    if (!ds || typeof ds.getRowCount !== 'function') return 'missing';
    const rowCount = ds.getRowCount();
    const sample: string[] = [];
    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      sample.push(String(keyColumn ? ds.getColumn(i, keyColumn) : i));
    }
    for (let i = Math.max(3, rowCount - 2); i < rowCount; i++) {
      sample.push(String(keyColumn ? ds.getColumn(i, keyColumn) : i));
    }
    return `${rowCount}:${sample.join(',')}`;
  }

  function shouldKeepWaiting(
    now: number,
    softDeadline: number,
    hardDeadline: number,
    lastActivityAt: number,
    loadingHint: string,
    quietWindowMs: number,
  ): boolean {
    if (now < softDeadline) return true;
    if (now >= hardDeadline) return false;
    if (loadingHint) return true;
    return now - lastActivityAt < quietWindowMs;
  }

  function visibleFormControls(): Array<HTMLInputElement | HTMLTextAreaElement> {
    return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
      .filter((el) => isVisible(el) && isInActivePopup(el));
  }

  function findControlsNearLabel(suffix: string): Array<HTMLInputElement | HTMLTextAreaElement> {
    const meta = FIELD_LABEL_META[suffix];
    if (!meta) return [];
    const labels = Array.from(document.querySelectorAll<HTMLElement>('div, span, p'))
      .filter((el) => isVisible(el) && isInActivePopup(el))
      .filter((el) => String(el.innerText || el.textContent || '').trim() === meta.label);
    if (labels.length === 0) return [];

    const controls = visibleFormControls();
    const scored: Array<{
      control: HTMLInputElement | HTMLTextAreaElement;
      score: number;
    }> = [];

    for (const labelEl of labels) {
      const lr = labelEl.getBoundingClientRect();
      for (const control of controls) {
        const cr = control.getBoundingClientRect();
        const sameRow = cr.left >= lr.right - 30 && Math.abs(cr.top - lr.top) < 60;
        const belowLabel =
          cr.top >= lr.bottom - 10 &&
          cr.top < lr.bottom + 220 &&
          Math.abs(cr.left - lr.left) < 260;
        if (!sameRow && !belowLabel) continue;
        const dx = Math.max(0, cr.left - lr.right);
        const dy = sameRow ? Math.abs(cr.top - lr.top) : Math.abs(cr.top - lr.bottom) + 80;
        const penalty = control instanceof HTMLTextAreaElement ? 5 : 0;
        scored.push({ control, score: dy * 1000 + dx + penalty });
      }
    }

    return scored
      .sort((a, b) => a.score - b.score)
      .map((entry) => entry.control)
      .filter((control, index, arr) => arr.indexOf(control) === index);
  }

  function labeledControlForSuffix(suffix: string): HTMLInputElement | HTMLTextAreaElement | null {
    const matches = findControlsNearLabel(suffix);
    if (matches.length === 0) return null;
    const occurrence = FIELD_LABEL_META[suffix]?.occurrence ?? 0;
    return matches[occurrence] ?? matches[0] ?? null;
  }

  function rootControlForSuffix(suffix: string): HTMLInputElement | HTMLTextAreaElement | null {
    const root = byPopupSuffix(suffix);
    if (!root) return null;
    const controls = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ).filter(isVisible);
    return controls[0] ?? null;
  }

  function popupFilledTextColor(): string {
    const comboRoot = byPopupSuffix('cboCampusCd');
    const comboText =
      comboRoot?.querySelector<HTMLElement>('[id$=":text"], [id*=":text"]') ??
      null;
    const sample = comboText && isVisible(comboText) ? comboText : document.body;
    return window.getComputedStyle(sample).color || 'rgb(51, 51, 51)';
  }

  function applyFilledVisualState(
    el: HTMLElement,
    value: string,
    opts?: { multiline?: boolean },
  ): void {
    if (!String(value).trim()) return;
    const color = popupFilledTextColor();
    el.style.color = color;
    (el.style as any).webkitTextFillColor = color;
    el.style.opacity = '1';
    if (opts?.multiline) {
      el.style.textAlign = 'left';
    }
  }

  function resetFilledVisualState(el: HTMLElement): void {
    el.style.color = '';
    (el.style as any).webkitTextFillColor = '';
    el.style.opacity = '';
    el.style.textAlign = '';
  }

  function setNativeValue(
    control: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const proto =
      control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(control, value);
    } else {
      control.value = value;
    }
  }

  function clearControlValueLikeUser(
    control: HTMLInputElement | HTMLTextAreaElement,
  ): void {
    control.focus();
    control.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    control.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setNativeValue(control, '');
    control.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    control.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.blur();
    control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    resetFilledVisualState(control);
  }

  function setControlValueLikeUser(
    control: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): void {
    control.focus();
    control.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    control.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    setNativeValue(control, '');
    control.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    control.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));

    setNativeValue(control, value);
    control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Process' }));
    control.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }));
    control.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }));
    control.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Process' }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.blur();
    control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    applyFilledVisualState(control, value, {
      multiline: control instanceof HTMLTextAreaElement,
    });
  }

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

  function byVisibleIdSuffix(suffix: string): HTMLElement | null {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        `[id$=".${suffix}"]:not([id$=":icontext"])`,
      ),
    ).find(isVisible) ?? null;
  }

  function byPopupSuffix(suffix: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `div[id^="${popupPrefix()}"][id$=".${suffix}"]:not([id$=":icontext"])`,
    );
  }

  function renderedValueFromRoot(root: HTMLElement | null): string {
    if (!root) return '';
    const controls = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ).filter(isVisible);
    const rootControl = controls[0] ?? null;
    if (rootControl) {
      const value = controlValue(rootControl);
      if (value) return value;
    }
    const textNodes = Array.from(
      root.querySelectorAll<HTMLElement>('[id$=":text"], [id*=":text"]'),
    ).filter(isVisible);
    const textEl = textNodes[0] ?? null;
    if (textEl) return controlValue(textEl);
    return isVisible(root) ? controlValue(root) : '';
  }

  function renderedValueForSuffix(suffix: string): string {
    const root = byPopupSuffix(suffix);
    const rootControl = rootControlForSuffix(suffix);
    if (rootControl) {
      const value = controlValue(rootControl);
      if (value) return value;
    }
    const labeledControl = labeledControlForSuffix(suffix);
    if (labeledControl) {
      const value = controlValue(labeledControl);
      if (value) return value;
    }
    return renderedValueFromRoot(root);
  }

  function visibleRenderedValueForSuffix(suffix: string): string {
    const root = byVisibleIdSuffix(suffix);
    const rootValue = renderedValueFromRoot(root);
    if (rootValue) return rootValue;
    const labeledControl = labeledControlForSuffix(suffix);
    return labeledControl ? controlValue(labeledControl) : '';
  }

  function readVisibleFormSnapshot(): Record<string, string> {
    return {
      campusCode: '',
      campusText: visibleRenderedValueForSuffix('cboCampusCd'),
      buildingNo: '',
      buildingText: visibleRenderedValueForSuffix('cboBuildCd'),
      spaceCode: '',
      spaceText: visibleRenderedValueForSuffix('cboSpaceCd'),
      date: visibleRenderedValueForSuffix('calUseDt').replace(/\./g, '-'),
      dateRendered: visibleRenderedValueForSuffix('calUseDt'),
      startTime: '',
      startText: visibleRenderedValueForSuffix('cboResStTime'),
      startRendered: visibleRenderedValueForSuffix('cboResStTime'),
      endTime: '',
      endText: visibleRenderedValueForSuffix('cboResEdTime'),
      endRendered: visibleRenderedValueForSuffix('cboResEdTime'),
      hangsaGbCode: '',
      hangsaRendered: visibleRenderedValueForSuffix('cboHangsaGb'),
      organization: visibleRenderedValueForSuffix('edtSinchungGroup'),
      organizationRendered: visibleRenderedValueForSuffix('edtSinchungGroup'),
      eventName: visibleRenderedValueForSuffix('edtSinchungEvent'),
      eventNameRendered: visibleRenderedValueForSuffix('edtSinchungEvent'),
      headcount: visibleRenderedValueForSuffix('edtUseNum'),
      headcountRendered: visibleRenderedValueForSuffix('edtUseNum'),
      purpose: visibleRenderedValueForSuffix('TextArea00'),
      purposeRendered: visibleRenderedValueForSuffix('TextArea00'),
      contact: visibleRenderedValueForSuffix('contact'),
      contactRendered: visibleRenderedValueForSuffix('contact'),
      blockingAlert: readBlockingAlertText(),
    };
  }

  function renderedTargetsForSuffix(
    suffix: string,
  ): Array<HTMLElement | HTMLInputElement | HTMLTextAreaElement> {
    const targets: Array<HTMLElement | HTMLInputElement | HTMLTextAreaElement> = [];
    const rootControl = rootControlForSuffix(suffix);
    if (rootControl) targets.push(rootControl);
    const labeledControl = labeledControlForSuffix(suffix);
    if (labeledControl) targets.push(labeledControl);

    const root = byPopupSuffix(suffix);
    if (!root) return targets;

    const controls = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ).filter(isVisible);
    targets.push(...controls);

    const textNodes = Array.from(
      root.querySelectorAll<HTMLElement>('[id$=":text"], [id*=":text"]'),
    ).filter(isVisible);
    targets.push(...textNodes);

    if (isVisible(root)) targets.push(root);
    return targets.filter((target, index, arr) => arr.indexOf(target) === index);
  }

  function syncRenderedValueForSuffix(suffix: string, value: string): void {
    const targets = renderedTargetsForSuffix(suffix);
    for (const target of targets) {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        applyFilledVisualState(target, value, {
          multiline: target instanceof HTMLTextAreaElement,
        });
        continue;
      }
      applyFilledVisualState(target, value, {
        multiline: target.tagName === 'TEXTAREA',
      });
    }
  }

  function clearRenderedVisualStateForSuffix(suffix: string): void {
    const targets = renderedTargetsForSuffix(suffix);
    for (const target of targets) {
      resetFilledVisualState(target);
    }
  }

  function findByText(text: string): HTMLElement | null {
    const divs = document.querySelectorAll<HTMLElement>('div');
    for (const d of divs) {
      if (d.offsetParent !== null && d.innerText && d.innerText.trim() === text) return d;
    }
    return null;
  }

  function findVisibleTextInPopup(text: string): HTMLElement | null {
    const nodes = document.querySelectorAll<HTMLElement>('div, span, p, button');
    for (const node of nodes) {
      if (!isVisible(node) || !isInActivePopup(node)) continue;
      if (String(node.innerText || node.textContent || '').trim() === text) return node;
    }
    return null;
  }

  function clickNeutralPopupArea(): boolean {
    const preferredTexts = ['신청사항', '인적사항', '※ 안내사항', '공간예약신청'];
    for (const text of preferredTexts) {
      const node = findVisibleTextInPopup(text);
      if (node) {
        clickVisibleThing(node);
        return true;
      }
    }
    const prefix = popupPrefix();
    const panel = document.querySelector<HTMLElement>(
      `div[id^="${prefix}"][id$=".divData"]:not([id$=":icontext"])`,
    );
    if (panel && isVisible(panel)) {
      clickVisibleThing(panel);
      return true;
    }
    return false;
  }

  function hasVisibleTextContaining(text: string): boolean {
    const nodes = document.querySelectorAll<HTMLElement>('div, textarea, span, p');
    for (const node of nodes) {
      const value =
        node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
          ? node.value
          : '';
      const content = (node.innerText || node.textContent || value || '').trim();
      if (!content) continue;
      if (node.offsetParent === null && !content.includes(text)) continue;
      if (content.includes(text)) return true;
    }
    return false;
  }

  function readBlockingAlertText(): string {
    const nodes = document.querySelectorAll<HTMLElement>('div, textarea, span, p');
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const content = String(node.innerText || node.textContent || '').trim();
      if (!content) continue;
      if (
        content.includes('먼저 선택 하세요') ||
        content.includes('먼저 선택하세요')
      ) {
        return content;
      }
    }
    return '';
  }

  function clickVisibleThing(el: HTMLElement): void {
    nexClick(el);
  }

  function visibleTextNodes(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('div, span, p, button'))
      .filter(isVisible);
  }

  function findCalendarPopup(): { panel: HTMLElement; year: number; month: number } | null {
    const nodes = visibleTextNodes();
    const yearNodes = nodes.filter((node) => /^\d{4}\.$/.test(String(node.innerText || node.textContent || '').trim()));
    for (const yearNode of yearNodes) {
      const yearText = String(yearNode.innerText || yearNode.textContent || '').trim();
      const yearRect = yearNode.getBoundingClientRect();
      const monthNode = nodes.find((node) => {
        if (node === yearNode) return false;
        const text = String(node.innerText || node.textContent || '').trim();
        if (!/^\d{1,2}$/.test(text)) return false;
        const rect = node.getBoundingClientRect();
        return Math.abs(rect.top - yearRect.top) < 18 && rect.left > yearRect.right - 10 && rect.left < yearRect.right + 80;
      });
      if (!monthNode) continue;

      let panel: HTMLElement | null = yearNode;
      while (panel && panel !== document.body) {
        const rect = panel.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 120) {
          const dayTexts = Array.from(panel.querySelectorAll<HTMLElement>('div, span, p'))
            .map((el) => String(el.innerText || el.textContent || '').trim())
            .filter((text) => /^\d{1,2}$/.test(text));
          if (dayTexts.length >= 20) {
            return {
              panel,
              year: parseInt(yearText.replace('.', ''), 10),
              month: parseInt(String(monthNode.innerText || monthNode.textContent || '').trim(), 10),
            };
          }
        }
        panel = panel.parentElement;
      }
    }
    return null;
  }

  async function waitForCalendarPopup(timeoutMs = 3000): Promise<{ panel: HTMLElement; year: number; month: number }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const popup = findCalendarPopup();
      if (popup) return popup;
      await wait(100);
    }
    throw new Error(`calendar popup not visible within ${timeoutMs}ms`);
  }

  function findCalendarDayCell(panel: HTMLElement, day: number): HTMLElement | null {
    const panelRect = panel.getBoundingClientRect();
    const candidates = Array.from(panel.querySelectorAll<HTMLElement>('div, span, p'))
      .filter(isVisible)
      .filter((el) => {
        const text = String(el.innerText || el.textContent || '').trim();
        if (text !== String(day)) return false;
        const rect = el.getBoundingClientRect();
        return rect.top > panelRect.top + 28 && rect.left >= panelRect.left && rect.right <= panelRect.right;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.top - br.top || ar.left - br.left;
      });
    return candidates[0] ?? null;
  }

  function clickCalendarArrow(panel: HTMLElement, direction: 'prev' | 'next'): void {
    const rect = panel.getBoundingClientRect();
    const x = direction === 'prev' ? rect.left + 14 : rect.right - 18;
    const y = rect.top + 18;
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!target || !isVisible(target)) {
      throw new Error(`calendar ${direction} arrow not clickable`);
    }
    clickVisibleThing(target);
  }

  function topFrame(): any | null {
    const app = window.nexacro?.getApplication?.();
    const mainframe = app?.mainframe;
    const top = mainframe?.TopFrame;
    return top ?? null;
  }

  function popupFrameEntry(): { key: string; frame: any } | null {
    const top = topFrame();
    if (!top) return null;
    const keys = Object.keys(top).filter((k) => k.startsWith('popupFrame'));
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const frame = top[key];
      if (frame && typeof frame === 'object') {
        return { key, frame };
      }
    }
    return null;
  }

  function popupKey(): string | null {
    return popupFrameEntry()?.key ?? null;
  }

  function popupPrefix(): string {
    const entry = popupFrameEntry();
    if (!entry) throw new Error('no popupFrame open');
    return `mainframe.TopFrame.${entry.key}.`;
  }

  function activePopupForm(): any {
    const entry = popupFrameEntry();
    if (!entry) throw new Error('no popupFrame open');
    const form = entry.frame?.form;
    if (!form) throw new Error(`popupFrame ${entry.key} form not ready`);
    return form;
  }

  function activeModalDM(): any {
    const popupForm = activePopupForm();
    const divManage = popupForm?.divManage;
    const form = divManage?.form;
    if (!form) throw new Error('popup divManage form not ready');
    return form;
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

  function readGridSpaceCodes(): string[] {
    const ds = activePopupForm().dsGrdMainNew;
    if (!ds || typeof ds.getRowCount !== 'function') return [];
    const avail: string[] = [];
    for (let i = 0; i < ds.getRowCount(); i++) {
      avail.push(String(ds.getColumn(i, 'GU_SPACE_CD')));
    }
    return avail;
  }

  // ---------- 자동화 named operations ----------

  const ops: Record<string, (args?: any) => unknown | Promise<unknown>> = {
    ping: (): true => true,

    hasPopupFrame: () => popupKey() !== null,

    /**
     * Nexacro 앱 + 상단 메뉴(`btnM532010000`) 가 가시 상태일 때까지 대기.
     * 새 탭 첫 진입 시 페이지 렌더링이 늦어 byIdSuffix 가 null 반환하는 케이스 대비.
     */
    waitForMenuReady: async ({ timeoutMs = 15000, hardTimeoutMs, quietWindowMs = 1500 } = {}): Promise<true> => {
      const softDeadline = Date.now() + timeoutMs;
      const hardDeadline = Date.now() + (hardTimeoutMs ?? Math.max(timeoutMs + 10000, timeoutMs * 2));
      let lastActivityAt = Date.now();
      let lastSignature = '';
      let extendedLogged = false;
      while (true) {
        const now = Date.now();
        if (hasVisibleLoginPrompt()) {
          throw new Error('LOGIN_REQUIRED');
        }
        try {
          if (topFrame()) {
            const menu = byIdSuffix('btnM532010000');
            if (menu && menu.offsetParent !== null) return true;
          }
        } catch (_) {
          /* nexacro not ready */
        }
        const signature = `${topFrame() ? 'ready' : 'boot'}:${document.querySelectorAll('[id^="mainframe.TopFrame"]').length}:${visibleTextSnapshot(12)}`;
        if (signature !== lastSignature) {
          lastSignature = signature;
          lastActivityAt = now;
        }
        const loadingHint = readLoadingHint();
        if (now >= softDeadline && !extendedLogged && shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) {
          console.log('[GLS] waitForMenuReady soft-timeout extended', loadingHint || 'activity');
          extendedLogged = true;
        }
        if (!shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) break;
        await wait(200);
      }
      throw new Error('Nexacro menu not visible after soft/hard timeout');
    },

    /**
     * 신청/자격관리 → 공간대여신청 → 예약신청 모달 오픈.
     * 이미 모달이 떠 있으면 noop.
     */
    openReservationModal: async (): Promise<true> => {
      if (popupKey()) { console.log('[GLS] modal already open'); return true; }
      if (hasVisibleLoginPrompt()) throw new Error('LOGIN_REQUIRED');

      // 1. 상단 메뉴
      const menu = byIdSuffix('btnM532010000');
      if (!menu) throw new Error('menu btnM532010000 not found');
      console.log('[GLS] clicking top menu (신청/자격관리)');
      nexClick(menu);
      await wait(700);

      // 2. 서브메뉴 — id suffix 가 텍스트 매칭보다 안정적
      let sub: HTMLElement | null = null;
      for (let i = 0; i < 15; i++) {
        if (hasVisibleLoginPrompt()) throw new Error('LOGIN_REQUIRED');
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
        if (hasVisibleLoginPrompt()) throw new Error('LOGIN_REQUIRED');
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
      const itemSel = `div[id^="${prefix}"][id*=".${suffix}.combolist.item_"]`;
      const deadline = Date.now() + 4200;
      let target: HTMLElement | null = null;
      let snap: HTMLElement[] = [];
      while (Date.now() < deadline) {
        nexClick(drop);
        const attemptDeadline = Date.now() + 1200;
        while (Date.now() < attemptDeadline) {
          snap = Array.from(document.querySelectorAll<HTMLElement>(itemSel)).filter(
            (d) => !d.id.endsWith(':text') && isVisible(d),
          );
          const normalizedLabel = normalizeLabel(label);
          target =
            snap.find((it) => normalizeLabel(it.innerText) === normalizedLabel) ??
            snap.find((it) => normalizeLabel(it.innerText).includes(normalizedLabel)) ??
            null;
          if (target) break;
          await wait(120);
        }
        if (target) break;
        await wait(180);
      }
      if (!target) {
        const avail = snap.map((i) => normalizeLabel(i.innerText)).join(', ');
        throw new Error(`combo ${suffix} option not found: "${label}". Available: ${avail}`);
      }
      console.log('[GLS] selectComboByText ✓', suffix, '=', label);
      nexClick(target);
      return true;
    },

    /**
     * selectComboByText 의 비예외 버전.
     * 옵션이 아직 안 떴거나 렌더 race 가 있으면 false 로 돌려 fallback 경로를 탄다.
     */
    trySelectComboByText: async (
      args: { suffix: string; label: string },
    ): Promise<boolean> => {
      try {
        await ops.selectComboByText(args);
        return true;
      } catch {
        return false;
      }
    },

    /**
     * 공간 콤보는 set_value(code)만으로는 표시 텍스트가 "선택"에 머무는 케이스가 있어
     * 실제 dropdown item 클릭으로 커밋한다.
     */
    selectSpaceByCode: async (
      args: { spaceCode: string; roomName: string },
    ): Promise<true> => {
      const currentText = renderedValueForSuffix('cboSpaceCd');
      const normalizedCurrent = normalizeSpaceText(currentText);
      const normalizedRoom = normalizeSpaceText(args.roomName);
      if (
        currentText.includes(args.spaceCode) ||
        normalizedCurrent.includes(normalizedRoom)
      ) {
        console.log('[GLS] selectSpaceByCode already selected', currentText);
        return true;
      }

      const pf = activePopupForm();
      const ds = pf.dsCboSpace;
      let label = args.roomName;
      if (ds && typeof ds.getRowCount === 'function') {
        for (let i = 0; i < ds.getRowCount(); i++) {
          if (String(ds.getColumn(i, 'GU_SPACE_CD')) === String(args.spaceCode)) {
            label = String(ds.getColumn(i, 'SPACE_NM') ?? args.roomName).trim();
            break;
          }
        }
      }

      const prefix = popupPrefix();
      const dropSel = `div[id^="${prefix}"][id$=".cboSpaceCd.dropbutton"]:not([id$=":icontext"])`;
      let drop: HTMLElement | null = null;
      const dropDeadline = Date.now() + 5000;
      while (Date.now() < dropDeadline) {
        drop = document.querySelector<HTMLElement>(dropSel);
        if (drop && drop.offsetParent !== null) break;
        await wait(200);
      }
      if (!drop) throw new Error('space dropbutton not found');
      nexClick(drop);

      const itemSel = `div[id^="${prefix}"][id*=".cboSpaceCd.combolist.item_"]`;
      const deadline = Date.now() + 3000;
      let target: HTMLElement | null = null;
      let snap: HTMLElement[] = [];
      while (Date.now() < deadline) {
        snap = Array.from(document.querySelectorAll<HTMLElement>(itemSel)).filter(
          (d) => !d.id.endsWith(':text'),
        );
        target =
          snap.find((it) => it.innerText.trim() === label) ??
          snap.find((it) => it.innerText.trim().includes(args.spaceCode)) ??
          snap.find((it) => it.innerText.trim().includes(args.roomName)) ??
          null;
        if (target) break;
        await wait(150);
      }
      if (!target) {
        const avail = snap.map((i) => i.innerText.trim()).join(', ');
        throw new Error(`space option not found for ${args.spaceCode}/${args.roomName}. Available: ${avail}`);
      }
      console.log('[GLS] selectSpaceByCode ✓', args.spaceCode, label);
      nexClick(target);
      return true;
    },

    trySelectSpaceByCode: async (
      args: { spaceCode: string; roomName: string },
    ): Promise<boolean> => {
      try {
        await ops.selectSpaceByCode(args);
        return true;
      } catch {
        return false;
      }
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
      hardTimeoutMs?: number;
      quietWindowMs?: number;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 5000;
      const hardTimeoutMs = args.hardTimeoutMs ?? Math.max(timeoutMs + 5000, timeoutMs * 2);
      const quietWindowMs = args.quietWindowMs ?? 1200;
      const softDeadline = Date.now() + timeoutMs;
      const hardDeadline = Date.now() + hardTimeoutMs;
      let lastActivityAt = Date.now();
      let lastSignature = '';
      let extendedLogged = false;
      while (true) {
        const now = Date.now();
        try {
          const ds = activePopupForm()[args.dsName];
          if (ds && typeof ds.getRowCount === 'function') {
            for (let i = 0; i < ds.getRowCount(); i++) {
              if (String(ds.getColumn(i, args.column)) === String(args.value)) {
                console.log('[GLS] waitForDatasetValue ✓', args.dsName, args.column, '=', args.value);
                return true;
              }
            }
            const signature = readDatasetSignature(ds, args.column);
            if (signature !== lastSignature) {
              lastSignature = signature;
              lastActivityAt = now;
            }
          }
        } catch (_) { /* dataset not ready */ }
        const loadingHint = readLoadingHint();
        if (now >= softDeadline && !extendedLogged && shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) {
          console.log('[GLS] waitForDatasetValue soft-timeout extended', args.dsName, loadingHint || 'activity');
          extendedLogged = true;
        }
        if (!shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) break;
        await wait(200);
      }
      throw new Error(
        `dataset ${args.dsName}.${args.column} did not contain "${args.value}" within soft=${timeoutMs}ms hard=${hardTimeoutMs}ms`,
      );
    },

    waitForGridSpaceCode: async (args: {
      spaceCode: string;
      timeoutMs?: number;
      hardTimeoutMs?: number;
      quietWindowMs?: number;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 5000;
      const hardTimeoutMs = args.hardTimeoutMs ?? Math.max(timeoutMs + 5000, timeoutMs * 2);
      const quietWindowMs = args.quietWindowMs ?? 1200;
      const softDeadline = Date.now() + timeoutMs;
      const hardDeadline = Date.now() + hardTimeoutMs;
      let lastActivityAt = Date.now();
      let lastSignature = '';
      let extendedLogged = false;
      while (true) {
        const now = Date.now();
        const avail = readGridSpaceCodes();
        if (avail.includes(String(args.spaceCode))) {
          console.log('[GLS] waitForGridSpaceCode ✓', args.spaceCode);
          return true;
        }
        const signature = avail.join(',');
        if (signature !== lastSignature) {
          lastSignature = signature;
          lastActivityAt = now;
        }
        const loadingHint = readLoadingHint();
        if (now >= softDeadline && !extendedLogged && shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) {
          console.log('[GLS] waitForGridSpaceCode soft-timeout extended', args.spaceCode, loadingHint || 'activity');
          extendedLogged = true;
        }
        if (!shouldKeepWaiting(now, softDeadline, hardDeadline, lastActivityAt, loadingHint, quietWindowMs)) break;
        await wait(150);
      }
      const avail = readGridSpaceCodes();
      throw new Error(
        `space ${args.spaceCode} not in dsGrdMainNew after soft=${timeoutMs}ms hard=${hardTimeoutMs}ms. Available: [${avail.join(',')}]`,
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
      const handlerName =
        args.suffix === 'cboHangsaGb'
          ? 'fn_cboHangsaGb_onChanged'
          : `divManage_${args.suffix}_OnChanged`;
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
      const value = String(args.value);
      cmp.set_value(value);
      syncRenderedValueForSuffix(args.suffix, value);
      return true;
    },

    /**
     * 값 set 후 change handler 가 있으면 best-effort로 호출.
     * 행사구분은 예외적으로 `fn_cboHangsaGb_onChanged` 이름을 사용한다.
     */
    setComponentValueAndFireChange: (
      args: { suffix: string; value: string | number },
    ): true => {
      const dm = activeModalDM();
      const popupForm = activePopupForm();
      const cmp = dm[args.suffix];
      if (!cmp) throw new Error('component not found: ' + args.suffix);
      const prev = cmp.value;
      const value = String(args.value);
      cmp.set_value(value);
      syncRenderedValueForSuffix(args.suffix, value);
      const handlerName =
        args.suffix === 'cboHangsaGb'
          ? 'fn_cboHangsaGb_onChanged'
          : `divManage_${args.suffix}_OnChanged`;
      const handler = popupForm[handlerName];
      if (typeof handler === 'function') {
        try {
          handler.call(popupForm, cmp, {
            fromobject: cmp,
            postvalue: String(args.value),
            prevalue: prev ?? '',
          });
        } catch (e) {
          console.warn('[GLS] change handler threw (non-fatal):', handlerName, e);
        }
      }
      return true;
    },

    syncRenderedValue: (args: { suffix: string; value: string }): true => {
      syncRenderedValueForSuffix(args.suffix, args.value);
      return true;
    },

    /**
     * 렌더된 필드 값이 기대값으로 바뀔 때까지 대기.
     * 폼 상호작용의 성공 판정을 dataset 대신 실제 화면 값으로 옮긴다.
     */
    waitForRenderedValue: async (args: {
      suffix: string;
      value: string;
      timeoutMs?: number;
      contains?: boolean;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 5000;
      const contains = args.contains ?? true;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const actual = renderedValueForSuffix(args.suffix);
        const matched =
          args.suffix === 'calUseDt'
            ? digitsOnly(actual) === digitsOnly(args.value)
            : contains
              ? actual.includes(args.value)
              : actual === args.value;
        if (matched) {
          console.log('[GLS] waitForRenderedValue ✓', args.suffix, actual);
          return true;
        }
        await wait(120);
      }
      throw new Error(
        `rendered value for ${args.suffix} did not match "${args.value}" within ${timeoutMs}ms`,
      );
    },

    /**
     * 달력 아이콘을 실제 클릭해서 popup 을 열고, 월 이동 후 일자를 클릭한다.
     * 실사용 경로와 동일하게 동작하도록 date는 interaction-only 로 처리한다.
     */
    selectCalendarDate: async (args: {
      suffix: string;
      yyyymmdd: string;
      timeoutMs?: number;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 6000;
      const targetYear = parseInt(args.yyyymmdd.slice(0, 4), 10);
      const targetMonth = parseInt(args.yyyymmdd.slice(4, 6), 10);
      const targetDay = parseInt(args.yyyymmdd.slice(6, 8), 10);
      const root = byPopupSuffix(args.suffix);
      if (!root) throw new Error('calendar root not found: ' + args.suffix);

      const rootRect = root.getBoundingClientRect();
      const triggerX = rootRect.right - 12;
      const triggerY = rootRect.top + rootRect.height / 2;
      const trigger = document.elementFromPoint(triggerX, triggerY) as HTMLElement | null;
      if (!trigger || !isVisible(trigger)) {
        throw new Error('calendar trigger not clickable');
      }
      clickVisibleThing(trigger);

      let popup = await waitForCalendarPopup(Math.min(timeoutMs, 3000));
      let monthDelta = (targetYear - popup.year) * 12 + (targetMonth - popup.month);
      const navDeadline = Date.now() + timeoutMs;
      while (monthDelta !== 0) {
        if (Date.now() > navDeadline) {
          throw new Error(`calendar navigation timed out for ${args.yyyymmdd}`);
        }
        const beforeKey = `${popup.year}-${popup.month}`;
        clickCalendarArrow(popup.panel, monthDelta > 0 ? 'next' : 'prev');
        await wait(150);
        popup = await waitForCalendarPopup(Math.min(timeoutMs, 2000));
        const afterKey = `${popup.year}-${popup.month}`;
        if (afterKey === beforeKey) {
          await wait(150);
          popup = await waitForCalendarPopup(Math.min(timeoutMs, 2000));
        }
        monthDelta = (targetYear - popup.year) * 12 + (targetMonth - popup.month);
      }

      const dayCell = findCalendarDayCell(popup.panel, targetDay);
      if (!dayCell) {
        throw new Error(`calendar day ${targetDay} not found for ${args.yyyymmdd}`);
      }
      clickVisibleThing(dayCell);
      return true;
    },

    /**
     * row 클릭 후 공간 필드가 실제로 바뀌는지 대기.
     */
    waitForSpaceFieldSelection: async (args: {
      spaceCode: string;
      roomName: string;
      timeoutMs?: number;
    }): Promise<true> => {
      const timeoutMs = args.timeoutMs ?? 5000;
      const deadline = Date.now() + timeoutMs;
      const expectedRoom = normalizeSpaceText(args.roomName);
      while (Date.now() < deadline) {
        const dm = activeModalDM();
        const actual = renderedValueForSuffix('cboSpaceCd');
        const normalizedActual = normalizeSpaceText(actual);
        const internalValue = String(dm.cboSpaceCd?.value ?? '');
        const internalText = String(dm.cboSpaceCd?.text ?? '');
        const normalizedInternalText = normalizeSpaceText(internalText);
        if (
          actual.includes(args.spaceCode) ||
          normalizedActual.includes(expectedRoom) ||
          internalValue === String(args.spaceCode) ||
          internalText.includes(args.spaceCode) ||
          normalizedInternalText.includes(expectedRoom)
        ) {
          console.log('[GLS] waitForSpaceFieldSelection ✓', {
            rendered: actual,
            internalValue,
            internalText,
          });
          return true;
        }
        await wait(120);
      }
      const dm = activeModalDM();
      throw new Error(
        `space field did not reflect ${args.spaceCode}/${args.roomName} within ${timeoutMs}ms (rendered="${renderedValueForSuffix('cboSpaceCd')}" internalValue="${String(dm.cboSpaceCd?.value ?? '')}" internalText="${String(dm.cboSpaceCd?.text ?? '')}")`,
      );
    },

    /**
     * preview/재입력 전에 사용자 입력 필드들을 비운다.
     * 탐색 문맥인 캠퍼스/건물/날짜는 유지하고, 행사 메타와 시간 선택만 리셋한다.
     */
    clearManagedFormFields: (): true => {
      const dm = activeModalDM();
      const clearTextSuffixes = [
        'edtSinchungGroup',
        'edtSinchungEvent',
        'edtUseNum',
        'TextArea00',
      ] as const;
      for (const suffix of clearTextSuffixes) {
        const directControl = rootControlForSuffix(suffix);
        if (directControl) {
          clearControlValueLikeUser(directControl);
        } else {
          const labeledControl = labeledControlForSuffix(suffix);
          if (labeledControl) {
            clearControlValueLikeUser(labeledControl);
          } else {
            const root = byPopupSuffix(suffix);
            const control = root?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
            if (control && isVisible(control)) {
              clearControlValueLikeUser(control);
            }
          }
        }
        const cmp = dm[suffix];
        if (cmp && typeof cmp.set_value === 'function') {
          cmp.set_value('');
        }
        clearRenderedVisualStateForSuffix(suffix);
      }

      const clearComboSuffixes = [
        'cboHangsaGb',
        'cboResStTime',
        'cboResEdTime',
      ] as const;
      for (const suffix of clearComboSuffixes) {
        const cmp = dm[suffix];
        if (cmp && typeof cmp.set_value === 'function') {
          cmp.set_value('');
        }
        clearRenderedVisualStateForSuffix(suffix);
      }

      return true;
    },

    /**
     * 보이는 input / textarea 를 실제 사용자 입력처럼 채운다.
     * Nexacro 내부 값도 best-effort로 동기화하되, 행동의 시작점은 DOM 컨트롤이다.
     */
    setRenderedControlValue: (args: { suffix: string; value: string | number }): true => {
      const value = String(args.value);
      const directControl = rootControlForSuffix(args.suffix);
      if (directControl) {
        setControlValueLikeUser(directControl, value);
      } else {
        const labeledControl = labeledControlForSuffix(args.suffix);
        if (labeledControl) {
          setControlValueLikeUser(labeledControl, value);
        } else {
          const root = byPopupSuffix(args.suffix);
          if (!root) throw new Error('component root not found: ' + args.suffix);
          const controls = Array.from(
            root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
          ).filter(isVisible);
          const control = controls[0] ?? null;
          if (!control) throw new Error('visible control not found: ' + args.suffix);
          setControlValueLikeUser(control, value);
        }
      }
      syncRenderedValueForSuffix(args.suffix, value);
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
      const immediateCell = document.querySelector<HTMLElement>(cellSel);
      if (immediateCell) {
        console.log('[GLS] clickSpaceRow ✓ visible row', rowIdx);
        nexClick(immediateCell);
        return true;
      }

      // viewport 밖 row 는 DOM 렌더를 오래 기다리기보다 Nexacro handler를 직접
      // 호출하는 편이 훨씬 빠르다. 예약현황 가상 스크롤 때문에 offscreen row 에서
      // 2~3초 이상 멈추는 현상을 줄이기 위한 fast path.
      const handler = form.grdCal_OnCellClick;
      if (typeof handler === 'function') {
        try {
          await wait(80);
          handler.call(form, grid, {
            fromobject: grid,
            row: rowIdx,
            cell: 0,
            col: 0,
          });
          console.log('[GLS] clickSpaceRow ✓ handler fast-path row', rowIdx);
          return true;
        } catch (handlerErr) {
          console.warn('[GLS] grdCal_OnCellClick fast-path failed', handlerErr);
        }
      }

      let cell: HTMLElement | null = null;
      const deadline = Date.now() + 700;
      while (Date.now() < deadline) {
        cell = document.querySelector<HTMLElement>(cellSel);
        if (cell) break;
        await wait(120);
      }
      if (!cell) {
        throw new Error('grdCal cell not found for row ' + rowIdx + ' (virtualized, handler unavailable)');
      }
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
      const title = findVisibleTextInPopup('공지사항');
      if (title) {
        let panel: HTMLElement | null = title;
        while (panel && panel !== document.body) {
          const rect = panel.getBoundingClientRect();
          if (rect.width >= 260 && rect.height >= 120) {
            const x = rect.right - 28;
            const y = rect.top + 24;
            const target = document.elementFromPoint(x, y) as HTMLElement | null;
            if (target && isVisible(target)) {
              clickVisibleThing(target);
              return true;
            }
            break;
          }
          panel = panel.parentElement;
        }
      }
      return false;
    },

    /** dsGrdSub row 들을 dump 해서 isolated world 가 conflict 분석할 수 있게 반환. */
    readDsGrdSub: (): unknown[] => {
      return readDataset(activePopupForm(), 'dsGrdSub');
    },

    /**
     * GLS가 공간별 dsGrdSub 외에 하단 예약현황/공지 그리드로 표시하는
     * 전체 대여불가 기간을 수집한다. 예: 국가고시 기간 09:00~22:00.
     */
    readBlockingScheduleTexts: (): Array<{ source: string; text: string }> => {
      const form = activePopupForm();
      const entries: Array<{ source: string; text: string }> = [];

      for (const key of Object.keys(form)) {
        const maybeDs = form[key];
        if (
          !maybeDs ||
          typeof maybeDs !== 'object' ||
          typeof maybeDs.getRowCount !== 'function' ||
          typeof maybeDs.getColCount !== 'function'
        ) {
          continue;
        }
        let rows: Record<string, unknown>[] = [];
        try {
          rows = readDataset(form, key);
        } catch {
          continue;
        }
        for (const row of rows) {
          const text = Object.values(row)
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .join(' ');
          if (/대여불가|예약불가|신청불가|점검|장애/.test(text)) {
            entries.push({ source: `dataset:${key}`, text });
          }
        }
      }

      const popupPrefixValue = popupPrefix();
      const seen = new Set(entries.map((entry) => entry.text));
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('div, span, p'))) {
        if (!isVisible(el)) continue;
        let cur: HTMLElement | null = el;
        let inPopup = false;
        while (cur) {
          if (cur.id?.startsWith(popupPrefixValue)) {
            inPopup = true;
            break;
          }
          cur = cur.parentElement;
        }
        if (!inPopup) continue;
        const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          text.length < 8 ||
          text.length > 800 ||
          seen.has(text) ||
          !/대여불가|예약불가|신청불가|점검|장애/.test(text)
        ) {
          continue;
        }
        seen.add(text);
        entries.push({ source: 'visible', text });
      }

      return entries;
    },

    /** visible 저장 버튼 클릭 — 실제 사용자 경로 우선. */
    clickSaveButton: (): true => {
      const save = byPopupSuffix('btnSave');
      if (save && isVisible(save)) {
        clickVisibleThing(save);
        return true;
      }
      const saveText = findVisibleTextInPopup('저장');
      if (saveText) {
        clickVisibleThing(saveText);
        return true;
      }
      throw new Error('visible save button not found');
    },

    /** 텍스트 필드 편집을 종료시켜 Nexacro 검증 대상 값으로 커밋하도록 유도. */
    commitPopupEdits: async (): Promise<true> => {
      const active = document.activeElement;
      if (
        active &&
        (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
        isInActivePopup(active)
      ) {
        active.dispatchEvent(new Event('change', { bubbles: true }));
        active.blur();
        active.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        active.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      }
      clickNeutralPopupArea();
      await wait(150);
      return true;
    },

    /** btnSave_OnClick 호출 — 실제 클릭 실패 시 fallback. */
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
          hasVisibleTextContaining('저장되었습니다.') ||
          hasVisibleTextContaining('정상적으로 저장되었습니다.') ||
          hasVisibleTextContaining('신청되었습니다.') ||
          hasVisibleTextContaining('실행되었습니다.') ||
          hasVisibleTextContaining('사용일 전일까지 담당자가 확인 후 처리할 예정이며');
        if (okText) {
          const confirmBtn = findByText('확인');
          if (confirmBtn) {
            try {
              nexClick(confirmBtn);
            } catch (_) {
              /* best-effort */
            }
          }
          return { ok: true };
        }
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

    /** 제출 직전 검증용 snapshot. popup success 문구보다 이 값을 신뢰한다. */
    readFormSnapshot: (): Record<string, string> => {
      try {
        const dm = activeModalDM();
        return {
          campusCode: String(dm.cboCampusCd?.value ?? ''),
          campusText: String(dm.cboCampusCd?.text ?? ''),
          buildingNo: String(dm.cboBuildCd?.value ?? ''),
          buildingText: String(dm.cboBuildCd?.text ?? ''),
          spaceCode: String(dm.cboSpaceCd?.value ?? ''),
          spaceText: String(dm.cboSpaceCd?.text ?? ''),
          date: String(dm.calUseDt?.value ?? ''),
          dateRendered: renderedValueForSuffix('calUseDt'),
          startTime: String(dm.cboResStTime?.value ?? ''),
          startText: String(dm.cboResStTime?.text ?? ''),
          startRendered: renderedValueForSuffix('cboResStTime'),
          endTime: String(dm.cboResEdTime?.value ?? ''),
          endText: String(dm.cboResEdTime?.text ?? ''),
          endRendered: renderedValueForSuffix('cboResEdTime'),
          hangsaGbCode: String(dm.cboHangsaGb?.value ?? ''),
          hangsaRendered: renderedValueForSuffix('cboHangsaGb'),
          organization: String(dm.edtSinchungGroup?.value ?? ''),
          organizationRendered: renderedValueForSuffix('edtSinchungGroup'),
          eventName: String(dm.edtSinchungEvent?.value ?? ''),
          eventNameRendered: renderedValueForSuffix('edtSinchungEvent'),
          headcount: String(dm.edtUseNum?.value ?? ''),
          headcountRendered: renderedValueForSuffix('edtUseNum'),
          purpose: String(dm.TextArea00?.value ?? ''),
          purposeRendered: renderedValueForSuffix('TextArea00'),
          contact: renderedValueForSuffix('contact'),
          contactRendered: renderedValueForSuffix('contact'),
          blockingAlert: readBlockingAlertText(),
        };
      } catch (_) {
        return readVisibleFormSnapshot();
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
