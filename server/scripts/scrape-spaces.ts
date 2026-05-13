/**
 * 공간 메타데이터 시딩 스크립트 (D-015, D-020).
 *
 * 실행:
 *   GLS_COOKIE="..." pnpm scrape:spaces
 *   GLS_COOKIE="..." HEADLESS=1 pnpm scrape:spaces
 *
 * 동작:
 * 1. Playwright Chromium 띄움, 환경변수 GLS_COOKIE를 kingoinfo.skku.edu 쿠키로 주입
 * 2. https://kingoinfo.skku.edu 진입 → Nexacro app 준비 대기
 *    - login.skku.edu 리다이렉트면 abort (쿠키 만료)
 * 3. 메뉴: 신청/자격관리 → 공간대여신청 → 예약신청 모달 오픈
 * 4. page.evaluate 안에서:
 *    - dsCboCampusCd 순회 (양 캠퍼스 — D-020)
 *    - 각 캠퍼스: cboCampusCd 콤보 클릭 후 dsCboBuildCd dump
 *    - 각 건물: cboBuildCd 콤보 클릭 → dsCboSpace dump
 * 5. 각 row를 D-022 Space 모델로 Prisma upsert (glsSpaceCode unique key, 멱등)
 * 6. 이번 run에 못 본 행은 active=false로 soft-delete
 *
 * Nexacro 자동화 헬퍼 (nexClick / activePopupForm / selectCombo 등) 는
 * `HELPER_INIT_SCRIPT` raw 문자열로 인라인 정의 후 page.addInitScript 로 주입.
 * Playwright Node 호스트는 `window.nexacro` 에 직접 접근할 수 없고 TS 모듈을
 * page context 로 직접 전달할 수도 없어서, page.evaluate 안에서 동작하는
 * 헬퍼는 이 스크립트 안에서 자체 구현. 타입과 path 상수는 `@gls/schemas`,
 * `@gls/nexacroPaths` 에서 import (D-017 개정 — 2026-05-14).
 */

import { PrismaClient } from '@prisma/client';
import { chromium, type Browser, type Page } from 'playwright';

import {
  GLS_HOME_URL,
  LOGIN_URL_PREFIX,
  MENU_CODES,
  SUBMENU_SPACE_RESERVATION,
  PAGE_BUTTONS,
  MODAL_FIELDS,
  DATASETS,
} from '@gls/nexacroPaths';
import {
  toNumber,
  type CampusRow,
  type BuildingRow,
  type SpaceRow,
} from '@gls/schemas';

const prisma = new PrismaClient();

const SPACE_NM_REGEX = /^\[\d+\]\s*(.+?)\s*\/\s*\d+\s*명\s*~/;

function parseRoomName(spaceNm: string): string {
  const m = spaceNm.match(SPACE_NM_REGEX);
  if (m && m[1]) return m[1].trim();
  // fallback: 첫 슬래시 이전, 코드 prefix 제거
  const stripped = spaceNm.replace(/^\[\d+\]\s*/, '');
  return stripped.split('/')[0]!.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Browser context 내부에서 사용할 헬퍼들의 소스 문자열.
 * page.addInitScript로 모든 frame에 주입하여 window.__gls 로 노출.
 */
const HELPER_INIT_SCRIPT = `
(() => {
  if (window.__gls) return;
  function nexClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    for (const type of ['mouseover','mousemove','mousedown','mouseup','click']) {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y, button: 0, view: window,
      }));
    }
  }
  function byIdSuffix(suffix) {
    return document.querySelector('[id$=".' + suffix + '"]:not([id$=":icontext"])');
  }
  function findByText(text) {
    const divs = Array.from(document.querySelectorAll('div'));
    return divs.find(d => d.offsetParent !== null && d.innerText && d.innerText.trim() === text) || null;
  }
  function activePopupForm() {
    const app = window.nexacro && window.nexacro.getApplication();
    if (!app) throw new Error('nexacro app not ready');
    const top = app.mainframe.TopFrame;
    const names = Object.keys(top).filter(k => k.startsWith('popupFrame'));
    if (names.length === 0) throw new Error('no popupFrame open');
    return top[names[names.length - 1]].form;
  }
  function activeModalDM() {
    return activePopupForm().divManage.form;
  }
  function selectComboByText(dm, comboSuffix, label) {
    // popupFrame UUID 부분이 가변이라 component.id가 정확한 풀패스를 안 줄 수 있음 →
    // DOM 측 suffix 매칭으로 dropbutton과 item을 찾는다. popupFrame 한정으로 좁히기 위해
    // 가장 최근 popupFrame 접두사를 prefix로 사용.
    const app = window.nexacro.getApplication();
    const top = app.mainframe.TopFrame;
    const popupKeys = Object.keys(top).filter(function (k) { return k.indexOf('popupFrame') === 0; });
    if (popupKeys.length === 0) throw new Error('no popupFrame open');
    const popupKey = popupKeys[popupKeys.length - 1];
    const popupPrefix = 'mainframe.TopFrame.' + popupKey + '.';

    const dropSel = 'div[id^="' + popupPrefix + '"][id$=".' + comboSuffix + '.dropbutton"]:not([id$=":icontext"])';
    const drop = document.querySelector(dropSel);
    if (!drop) throw new Error('dropbutton not found for: ' + comboSuffix);
    nexClick(drop);

    const itemSel = 'div[id^="' + popupPrefix + '"][id*=".' + comboSuffix + '.combolist.item_"]';
    const items = Array.from(document.querySelectorAll(itemSel)).filter(function (d) {
      return !d.id.endsWith(':text');
    });
    const target = items.find(function (it) { return it.innerText.trim() === label; });
    if (!target) {
      const avail = items.map(function (i) { return i.innerText.trim(); }).join(', ');
      throw new Error('combo ' + comboSuffix + ' option not found: "' + label + '". Available: ' + avail);
    }
    nexClick(target);
  }
  function readDataset(form, dsName) {
    const ds = form[dsName];
    if (!ds || typeof ds.getRowCount !== 'function') {
      throw new Error('dataset not found: ' + dsName);
    }
    const colCount = ds.getColCount();
    const cols = [];
    for (let c = 0; c < colCount; c++) cols.push(ds.getColID(c));
    const rows = [];
    for (let i = 0; i < ds.getRowCount(); i++) {
      const r = {};
      for (const col of cols) r[col] = ds.getColumn(i, col);
      rows.push(r);
    }
    return rows;
  }
  window.__gls = {
    nexClick, byIdSuffix, findByText,
    activePopupForm, activeModalDM,
    selectComboByText, readDataset,
  };
})();
`;

async function ensureNexacroReady(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as any).nexacro !== 'undefined' && !!(window as any).nexacro.getApplication?.(),
    null,
    { timeout: timeoutMs },
  );
}

async function detectLoggedOut(page: Page): Promise<boolean> {
  const url = page.url();
  return url.startsWith(LOGIN_URL_PREFIX);
}

async function openReservationModal(page: Page): Promise<void> {
  // 신청/자격관리
  await page.evaluate(({ suffix }) => {
    const el = (window as any).__gls.byIdSuffix(suffix);
    if (!el) throw new Error('top menu not found: ' + suffix);
    (window as any).__gls.nexClick(el);
  }, { suffix: MENU_CODES.신청자격관리 });
  await sleep(700);

  // 공간대여신청 서브메뉴 — id suffix가 안정, 텍스트는 fallback
  await page.evaluate(({ suffix }) => {
    const g = (window as any).__gls;
    let el = g.byIdSuffix(suffix);
    if (!el) el = g.findByText('공간대여신청');
    if (!el) throw new Error('submenu 공간대여신청 not found');
    g.nexClick(el);
  }, { suffix: SUBMENU_SPACE_RESERVATION });
  await sleep(1800);

  // 예약신청 버튼 → 모달 오픈
  await page.evaluate(({ suffix }) => {
    const g = (window as any).__gls;
    const el = g.byIdSuffix(suffix);
    if (!el) throw new Error('btnInsert4 not found');
    g.nexClick(el);
  }, { suffix: PAGE_BUTTONS.예약신청 });
  await sleep(1200);

  // popupFrame 등장 대기
  await page.waitForFunction(() => {
    try {
      const top = (window as any).nexacro.getApplication().mainframe.TopFrame;
      return Object.keys(top).some((k) => k.startsWith('popupFrame'));
    } catch {
      return false;
    }
  }, null, { timeout: 15000 });
}

async function readCampuses(page: Page): Promise<CampusRow[]> {
  return page.evaluate(({ ds }) => {
    const g = (window as any).__gls;
    const pf = g.activePopupForm();
    return g.readDataset(pf, ds);
  }, { ds: DATASETS.campus });
}

/**
 * 모달의 `calUseDt`를 미래 날짜로 1회 세팅한다 (`set_value`만 — OnChanged는 호출하지 않음).
 *
 * GLS는 **날짜가 비어있으면 건물 cascade로 `dsCboSpace`가 로드되지 않도록** 동작이 바뀌었고,
 * 캠퍼스 변경 시에도 `calUseDt`가 reset된다 (검증 2026-05-13). 따라서 openModal 직후 + 매
 * selectCampus 직후 다시 호출해야 한다.
 *
 * 주의: `divManage_calUseDt_OnChanged` 핸들러는 내부에서 건물 선택 여부를 검사해
 * "건물을 먼저 선택 하세요!" alert를 띄운다. set_value 만 호출하면 값은 input에 그대로
 * 커밋되고, 이후 selectBuilding 시 cboBuildCd의 OnChanged → 내부 fncSpaceSearch 가
 * 현재 채워진 calUseDt 를 함께 사용해 dsCboSpace를 로드한다. (시딩은 가용성을 보지
 * 않고 메타만 dump 하므로 날짜 자체는 7일 후로 고정.)
 */
async function primeReservationDate(page: Page): Promise<void> {
  const yyyymmdd = (() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  })();

  await page.evaluate(
    ({ ymd, dateSuffix }) => {
      const g = (window as any).__gls;
      const dm = g.activeModalDM();
      const cal = dm[dateSuffix];
      if (!cal) throw new Error('calUseDt component not found');
      cal.set_value(ymd);
    },
    { ymd: yyyymmdd, dateSuffix: MODAL_FIELDS.예약일 },
  );

  await sleep(200);
  console.log(`[scrape] primed calUseDt = ${yyyymmdd}`);
}

/**
 * 만약 GLS 의 alert popup (예: "건물을 먼저 선택 하세요!")이 떠 있으면 닫는다.
 * 알림창 우상단 X 버튼 (`.btnX`)을 클릭하는 휴리스틱. 닫지 못해도 비치명적 — best-effort.
 */
async function dismissAlertIfShown(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Nexacro alert 는 보통 mainframe.TopFrame 하위에 별도 frame으로 뜨고,
      // 우상단에 `.btnX` 가 있다. 텍스트 "알림" 헤더가 있는 frame 내부에서 찾는다.
      const candidates = Array.from(
        document.querySelectorAll('[id$=".btnX"]:not([id$=":icontext"]), [id$=".btnClose"]:not([id$=":icontext"])'),
      );
      for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.offsetParent === null) continue;
        // alert 관련 컨테이너인지 부모 텍스트로 빠르게 거른다.
        let p: HTMLElement | null = el;
        for (let i = 0; i < 6 && p; i++) {
          if (p.innerText && /알림|건물을 먼저/.test(p.innerText)) {
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            for (const t of ['mouseover','mousemove','mousedown','mouseup','click']) {
              el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window }));
            }
            return;
          }
          p = p.parentElement;
        }
      }
    });
  } catch (_) {
    /* best-effort */
  }
}

async function selectCampus(
  page: Page,
  campusName: string,
  campusCode: string,
): Promise<void> {
  await nativeSelectCombo(page, MODAL_FIELDS.캠퍼스, campusName);
  // dsCboBuildCd 가 새 캠퍼스 row 들로 갱신될 때까지 폴링 (sleep(1500) 단독은
  // 느린 네트워크에서 race). distinctCampus mismatch 재시도는 호출부에서 유지.
  await page
    .waitForFunction(
      ({ ds, code }) => {
        try {
          const g = (window as any).__gls;
          const d = g.activePopupForm()[ds];
          if (!d || typeof d.getRowCount !== 'function') return false;
          for (let i = 0; i < d.getRowCount(); i++) {
            const c = d.getColumn(i, 'CAMPUS_CD');
            if (c && String(c) === String(code)) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      { ds: DATASETS.building, code: campusCode },
      { timeout: 5000 },
    )
    .catch(() => {
      /* mismatch fallback 은 호출부에서 처리 */
    });
  await sleep(300);
}

/**
 * Playwright native click 으로 콤보를 선택.
 * 1. dropbutton 의 DOM selector를 popupFrame 한정해 찾는다.
 * 2. page.click() 으로 native 클릭 (Nexacro 의 mouse 이벤트 핸들러를 안정적으로 발화).
 * 3. 옵션 텍스트로 item 클릭.
 */
async function nativeSelectCombo(
  page: Page,
  comboSuffix: string,
  label: string,
): Promise<void> {
  // 가장 최근 popupFrame prefix 추출
  const popupPrefix = await page.evaluate(() => {
    const app = (window as any).nexacro.getApplication();
    const top = app.mainframe.TopFrame;
    const keys = Object.keys(top).filter((k: string) => k.startsWith('popupFrame'));
    if (keys.length === 0) throw new Error('no popupFrame');
    return 'mainframe.TopFrame.' + keys[keys.length - 1] + '.';
  });

  const dropSelector = `div[id^="${popupPrefix}"][id$=".${comboSuffix}.dropbutton"]:not([id$=":icontext"])`;
  await page.locator(dropSelector).first().click();

  // 옵션 등장 대기 (선택 placeholder 외 1개 이상)
  await page.waitForFunction(
    ({ prefix, suffix }) => {
      const items = document.querySelectorAll(
        `div[id^="${prefix}"][id*=".${suffix}.combolist.item_"]`,
      );
      let count = 0;
      items.forEach((d) => {
        if (!d.id.endsWith(':text')) count++;
      });
      return count >= 2;
    },
    { prefix: popupPrefix, suffix: comboSuffix },
    { timeout: 5000 },
  );

  // 라벨 매칭 item 찾기
  const itemSelector = `div[id^="${popupPrefix}"][id*=".${comboSuffix}.combolist.item_"]:not([id$=":text"])`;
  const items = page.locator(itemSelector);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const el = items.nth(i);
    const text = (await el.innerText()).trim();
    if (text === label) {
      await el.click();
      return;
    }
  }
  const available: string[] = [];
  for (let i = 0; i < count; i++) {
    available.push((await items.nth(i).innerText()).trim());
  }
  throw new Error(
    `combo ${comboSuffix} option "${label}" not found. Available: ${available.join(', ')}`,
  );
}

async function readBuildings(page: Page): Promise<BuildingRow[]> {
  return page.evaluate(({ ds }) => {
    const g = (window as any).__gls;
    const pf = g.activePopupForm();
    return g.readDataset(pf, ds);
  }, { ds: DATASETS.building });
}

async function selectBuilding(
  page: Page,
  buildingName: string,
  expectedBuildNo: string,
): Promise<void> {
  await nativeSelectCombo(page, MODAL_FIELDS.건물, buildingName);
  // cascade가 자동으로 안 도는 경우가 있어 fncSpaceSearch 명시 호출
  await page.evaluate(() => {
    const g = (window as any).__gls;
    const pf = g.activePopupForm();
    if (typeof pf.fncSpaceSearch === 'function') {
      try { pf.fncSpaceSearch(); } catch (e) { /* swallow */ }
    }
  });
  // dsCboSpace의 첫 실 row가 expectedBuildNo와 일치할 때까지 폴링.
  // rowCount >= 2 만으로는 이전 건물의 stale 데이터가 통과해서 잘못된 매핑이 들어갈 수 있음
  // (cascade가 페이지 단위로 비동기라 직전 건물의 dsCboSpace가 캠퍼스 변경 후에도 유지되는 케이스 확인됨).
  await page
    .waitForFunction(
      ({ dsName, buildNo }) => {
        try {
          const g = (window as any).__gls;
          const ds = g.activePopupForm()[dsName];
          if (!ds) return false;
          const n = ds.getRowCount();
          if (n < 2) return false;
          // row 0은 "선택" placeholder. 첫 실 데이터 row 의 BUILD_NO 매칭 검사.
          for (let i = 0; i < n; i++) {
            const b = ds.getColumn(i, 'BUILD_NO');
            if (b) return b === buildNo;
          }
          return false;
        } catch {
          return false;
        }
      },
      { dsName: DATASETS.space, buildNo: expectedBuildNo },
      { timeout: 8000 },
    )
    .catch(() => {
      /* 진짜로 공간이 없거나 cascade가 stale로 남는 경우 — readSpaces 단에서 BUILD_NO mismatch row를 skip하므로 안전 실패 */
    });
  // 추가 settle
  await sleep(300);
}

async function readSpaces(page: Page): Promise<SpaceRow[]> {
  return page.evaluate(({ ds }) => {
    const g = (window as any).__gls;
    const pf = g.activePopupForm();
    return g.readDataset(pf, ds);
  }, { ds: DATASETS.space });
}

async function debugDatasets(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const g = (window as any).__gls;
    const pf = g.activePopupForm();
    const dm = g.activeModalDM();
    const out: any = {};
    const dsNames = ['dsCboSpace', 'dsCboBuildCd', 'dsGrdMainNew'];
    for (const n of dsNames) {
      try {
        const ds = pf[n];
        out[n + '_rowCount'] = ds?.getRowCount?.();
      } catch (e) { out[n + '_err'] = String(e); }
    }
    try { out['cboBuildCd_value'] = dm.cboBuildCd?.value; } catch {}
    try { out['cboBuildCd_text'] = dm.cboBuildCd?.text; } catch {}
    try { out['cboCampusCd_value'] = dm.cboCampusCd?.value; } catch {}
    return out;
  });
}

function ynToBool(v: string | undefined | null): boolean {
  return v === 'Y';
}

function nullIfEmpty(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseLimitDay(v: string | undefined | null): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function upsertSpace(
  row: SpaceRow,
  campusName: string,
  buildingName: string,
  runStartTime: Date,
): Promise<void> {
  const roomName = parseRoomName(row.SPACE_NM);
  const capMax = toNumber(row.CAPA_NO);
  const capMin = toNumber(row.MIN_PERSON);

  await prisma.space.upsert({
    where: { glsSpaceCode: row.GU_SPACE_CD },
    create: {
      glsSpaceCode: row.GU_SPACE_CD,
      campusCode: row.CAMPUS_CD,
      buildingNo: row.BUILD_NO,
      campusName,
      buildingName,
      roomName,
      capacityMin: capMin,
      capacityMax: capMax,
      useJojikCode: nullIfEmpty(row.USE_JOJIK_CD),
      useJojikName: nullIfEmpty(row.USE_JOJIK_CD_NM),
      adminJojikCode: nullIfEmpty(row.ADMIN_JOJIK_CD),
      adminJojikName: nullIfEmpty(row.ADMIN_JOJIK_CD_NM),
      contents: nullIfEmpty(row.CONTENTS),
      limitDayYn: ynToBool(row.LIMIT_DAY_YN),
      limitDay: parseLimitDay(row.LIMIT_DAY),
      limitTimeYn: ynToBool(row.LIMIT_TIME_YN),
      limitTimeHHMM: nullIfEmpty(row.LIMIT_TIME),
      daeyeoGb: nullIfEmpty(row.DAEYEO_GB),
      scrapedAt: runStartTime,
      active: true,
    },
    update: {
      campusCode: row.CAMPUS_CD,
      buildingNo: row.BUILD_NO,
      campusName,
      buildingName,
      roomName,
      capacityMin: capMin,
      capacityMax: capMax,
      useJojikCode: nullIfEmpty(row.USE_JOJIK_CD),
      useJojikName: nullIfEmpty(row.USE_JOJIK_CD_NM),
      adminJojikCode: nullIfEmpty(row.ADMIN_JOJIK_CD),
      adminJojikName: nullIfEmpty(row.ADMIN_JOJIK_CD_NM),
      contents: nullIfEmpty(row.CONTENTS),
      limitDayYn: ynToBool(row.LIMIT_DAY_YN),
      limitDay: parseLimitDay(row.LIMIT_DAY),
      limitTimeYn: ynToBool(row.LIMIT_TIME_YN),
      limitTimeHHMM: nullIfEmpty(row.LIMIT_TIME),
      daeyeoGb: nullIfEmpty(row.DAEYEO_GB),
      scrapedAt: runStartTime,
      active: true,
    },
  });
}

async function main(): Promise<void> {
  const cookie = process.env.GLS_COOKIE;
  if (!cookie || cookie.trim() === '') {
    console.error(
      'GLS_COOKIE 환경변수가 비어 있습니다. 브라우저에서 kingoinfo.skku.edu 로그인 후 ' +
        '쿠키 문자열을 GLS_COOKIE="..." 로 주입해 다시 실행하세요.',
    );
    process.exit(2);
  }

  const headless = process.env.HEADLESS === '1';
  const runStartTime = new Date();
  let browser: Browser | null = null;

  let totalUpserted = 0;
  let totalBuildings = 0;
  let totalCampuses = 0;
  let buildingFailures = 0;

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext();

    // 쿠키 주입: GLS_COOKIE가 "name=value; name2=value2" 형태 전체 헤더라고 가정.
    // 개별 쿠키로 분해해 kingoinfo.skku.edu 와 .skku.edu 도메인에 모두 set.
    const cookieEntries = cookie
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf('=');
        if (eq === -1) return null;
        return {
          name: pair.slice(0, eq).trim(),
          value: pair.slice(eq + 1).trim(),
        };
      })
      .filter((x): x is { name: string; value: string } => x !== null);

    const cookies = cookieEntries.flatMap((c) => [
      { ...c, domain: 'kingoinfo.skku.edu', path: '/' },
      { ...c, domain: '.skku.edu', path: '/' },
    ]);
    await context.addCookies(cookies);
    await context.addInitScript({ content: HELPER_INIT_SCRIPT });

    const page = await context.newPage();

    // Nexacro 백엔드 transaction 호출 모니터링
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('skku.edu') && !url.match(/\.(js|css|png|jpg|gif|svg|woff|woff2|ttf|ico)(\?|$)/i)) {
        console.log(`[net] ${res.status()} ${res.request().method()} ${url}`);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[page-${msg.type()}] ${msg.text()}`);
      }
    });

    console.log(`[scrape] navigating to ${GLS_HOME_URL} ...`);
    await page.goto(GLS_HOME_URL, { waitUntil: 'domcontentloaded' });

    // 로그인 페이지로 튕겨졌는지 확인
    await sleep(2000);
    if (await detectLoggedOut(page)) {
      console.error(
        '[scrape] login.skku.edu로 리다이렉트됨 — GLS_COOKIE가 만료되었거나 잘못되었습니다. ' +
          '브라우저에서 다시 로그인 후 새 쿠키로 재시도하세요.',
      );
      process.exit(3);
    }

    console.log('[scrape] waiting for Nexacro app...');
    await ensureNexacroReady(page);
    // 헬퍼 초기화 보장 (addInitScript는 새 document에 주입되지만, 안전하게 한 번 더)
    await page.evaluate(HELPER_INIT_SCRIPT);

    console.log('[scrape] opening 공간대여신청 modal...');
    await openReservationModal(page);

    // 헬퍼 재주입 (popupFrame이 별도 frame일 가능성 — 같은 page context면 무해)
    await page.evaluate(HELPER_INIT_SCRIPT);

    // 날짜를 채워야 건물 cascade로 dsCboSpace가 로드됨 (GLS 동작 변경 — 검증 2026-05-13).
    await primeReservationDate(page);
    await dismissAlertIfShown(page);

    const campuses = await readCampuses(page);
    console.log(`[scrape] dsCboCampusCd: ${campuses.length} campus(es)`);

    for (const campus of campuses) {
      totalCampuses++;
      const campusName = campus.CD_NM;
      console.log(`\n[scrape] ===== Campus: ${campusName} (${campus.COM_CD}) =====`);

      try {
        await selectCampus(page, campusName, campus.COM_CD);
      } catch (e) {
        console.error(`[scrape] failed to select campus "${campusName}":`, e);
        continue;
      }

      // 캠퍼스 변경은 `calUseDt`를 reset 한다 (검증 2026-05-13). 다시 prime 해야
      // 이후 건물 cascade로 dsCboSpace가 로드된다.
      try {
        await primeReservationDate(page);
        await dismissAlertIfShown(page);
      } catch (e) {
        console.error(`[scrape] failed to re-prime date for "${campusName}":`, e);
      }

      // cascade 검증 — dsCboBuildCd의 CAMPUS_CD가 현재 캠퍼스 코드와 일치하는지
      const buildings = await readBuildings(page);
      const mismatched = buildings.filter(
        (b) => b.CAMPUS_CD && b.CAMPUS_CD !== campus.COM_CD,
      );
      if (buildings.length === 0) {
        console.warn(`[scrape] no buildings for ${campusName} — skipping`);
        continue;
      }
      if (mismatched.length > 0) {
        console.warn(
          `[scrape] cascade 검증 실패: dsCboBuildCd에 다른 캠퍼스 row가 섞여있음. ` +
            `expected CAMPUS_CD=${campus.COM_CD}, got [${[...new Set(buildings.map((b) => b.CAMPUS_CD))].join(',')}]. ` +
            `1.5s 추가 대기 후 재시도.`,
        );
        await sleep(1500);
      }
      const buildingsRefetched = mismatched.length > 0 ? await readBuildings(page) : buildings;
      console.log(`[scrape] dsCboBuildCd: ${buildingsRefetched.length} building(s)`);

      for (const building of buildingsRefetched) {
        // 캠퍼스 cascade가 아직 자연에 머무르는 경우 등 — 코드 mismatch면 skip
        if (building.CAMPUS_CD && building.CAMPUS_CD !== campus.COM_CD) {
          console.warn(
            `[scrape] skip building ${building.BUILD_NM}: CAMPUS_CD ${building.CAMPUS_CD} != ${campus.COM_CD}`,
          );
          continue;
        }
        // "선택" placeholder skip
        if (!building.BUILD_NO || building.BUILD_NM === '선택') continue;
        totalBuildings++;
        const buildingName = building.BUILD_NM;
        try {
          await selectBuilding(page, buildingName, building.BUILD_NO);
          const dbg = await debugDatasets(page);
          console.log(`[scrape] [${campusName}/${buildingName}] debug:`, JSON.stringify(dbg));
          const spaces = await readSpaces(page);

          let upserted = 0;
          for (const sp of spaces) {
            // 안전장치 — 다른 건물의 공간이 섞여 있으면 skip
            if (sp.BUILD_NO && sp.BUILD_NO !== building.BUILD_NO) continue;
            try {
              await upsertSpace(sp, campusName, buildingName, runStartTime);
              upserted++;
            } catch (e) {
              console.error(
                `[scrape]   upsert failed for ${sp.GU_SPACE_CD} (${sp.SPACE_NM}):`,
                e,
              );
            }
          }
          totalUpserted += upserted;
          console.log(`[scrape] [${campusName}/${buildingName}] ${upserted} spaces upserted`);
        } catch (e) {
          buildingFailures++;
          console.error(
            `[scrape] building "${campusName}/${buildingName}" failed (continuing):`,
            e,
          );
        }
      }
    }

    // Soft-delete: 이번 run에 못 본 active row를 비활성화
    const softDeleted = await prisma.space.updateMany({
      where: {
        scrapedAt: { lt: runStartTime },
        active: true,
      },
      data: { active: false },
    });

    console.log('\n[scrape] ============ SUMMARY ============');
    console.log(`[scrape] campuses processed   : ${totalCampuses}`);
    console.log(`[scrape] buildings processed  : ${totalBuildings}`);
    console.log(`[scrape] buildings failed     : ${buildingFailures}`);
    console.log(`[scrape] spaces upserted      : ${totalUpserted}`);
    console.log(`[scrape] spaces soft-deleted  : ${softDeleted.count}`);
    console.log(`[scrape] run started at       : ${runStartTime.toISOString()}`);
    console.log(`[scrape] finished at          : ${new Date().toISOString()}`);
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[scrape] fatal:', e);
  process.exit(1);
});
