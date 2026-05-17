/**
 * GLS 자동화 오케스트레이션 (isolated world).
 *
 * 모든 nexacro 호출은 `bridgeMainWorld.ts` 에 사전 등록된 named operation 을
 * `runInPage(op, args)` RPC 로 호출. 동적 코드 실행은 GLS 페이지 CSP 가 막으므로
 * 새 동작은 항상 main-world 브리지에 op 를 등록한 뒤 여기서 호출.
 *
 * 핵심 흐름: docs/GLS_DOM_NOTES.md §5 의사코드.
 */

import { GLS_HOME_URL, LOGIN_URL_PREFIX } from '@gls/nexacroPaths';
import type { SpaceScheduleRow } from '@gls/schemas';
import type { ReservationFormData, SpaceCandidate } from '../shared/types';
import { runInPage } from './contentScript';
import { fillForm } from './formFiller';

// ---------- 세션 ----------

/**
 * 세션 유효 여부 판정.
 *
 * GLS는 ticket이 만료되었을 때 `login.skku.edu`로 redirect되는 경우와
 * **같은 URL(`kingoinfo.skku.edu`)에서 Nexacro 내부 로그인 폼을 띄우는 경우**
 * 두 가지가 있다 (검증 2026-05-13). 따라서 URL만 보면 후자를 놓친다.
 */
export function checkSession(): boolean {
  if (location.href.startsWith(LOGIN_URL_PREFIX)) return false;
  if (!location.href.startsWith(GLS_HOME_URL)) return false;

  // 로그인 폼이 가시면 미로그인.
  const loginId = document.querySelector<HTMLElement>(
    '[id$=".edtLOGIN_ID"]:not([id$=":icontext"])',
  );
  if (loginId && loginId.offsetParent !== null) return false;

  return true;
}

// ---------- 모달 오픈 ----------

/**
 * 신청/자격관리 → 공간대여신청 → btnInsert4 시퀀스.
 * 이미 모달이 열려있으면 noop. 새 탭 첫 진입 시 메뉴 렌더링 대기 포함.
 */
export async function openReservationModal(): Promise<void> {
  const alreadyOpen = await runInPage<boolean>('hasPopupFrame');
  if (alreadyOpen) return;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await runInPage('waitForMenuReady', { timeoutMs: 15000 + attempt * 5000 });
    } catch (e) {
      // GLS는 같은 kingoinfo URL 내부에서 로그인 폼을 띄우는 케이스가 있다.
      // 이 경우 menu timeout은 사실상 세션 만료이므로 명시적 sentinel로 변환.
      if (!checkSession()) {
        throw new Error('LOGIN_REQUIRED');
      }
      lastError = e;
      if (attempt === 0) {
        console.warn('[GLS-iso] waitForMenuReady timed out; retrying once');
        await sleep(1200);
        continue;
      }
      throw e;
    }

    try {
      await runInPage('openReservationModal', undefined, 20000);
      return;
    } catch (e) {
      lastError = e;
      const opened = await runInPage<boolean>('hasPopupFrame');
      if (opened) return;
      if (attempt === 0) {
        console.warn('[GLS-iso] reservation modal open failed; retrying once');
        await sleep(1000);
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function clearPreviewFormState(): Promise<void> {
  const hasPopup = await runInPage<boolean>('hasPopupFrame');
  if (!hasPopup) return;
  await runInPage('clearManagedFormFields');
  await runInPage('dismissNoticeIfShown');
}

export async function previewReservationForm(
  candidate: SpaceCandidate,
  formData: ReservationFormData,
  date: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await openReservationModal();
    await clearPreviewFormState();
    await fillForm({
      candidate,
      date: date ? toYyyymmdd(date) : '',
      startTime: startTime ? toHHMM(startTime) : '',
      endTime: endTime ? toHHMM(endTime) : '',
      formData,
      primed: false,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- 가용성 확인 ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeExclusionConflict(info: string): Array<{ kind: string; timeTerm: string; info: string }> {
  return [{ kind: '제외', timeTerm: '', info }];
}

async function chooseComboInteractionFirst(
  suffix: string,
  label: string,
  fallbackValue?: string,
): Promise<void> {
  let selected = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    selected = await runInPage<boolean>('trySelectComboByText', { suffix, label });
    if (selected) break;
    await sleep(180);
  }
  if (!selected) {
    if (!fallbackValue) throw new Error(`combo ${suffix} could not be selected by label: ${label}`);
    console.log('[GLS-iso] combo label select unavailable; falling back to internal set', suffix, label);
    await runInPage('setComboAndFireChange', { suffix, value: fallbackValue });
  }
  await runInPage('waitForRenderedValue', { suffix, value: label, timeoutMs: 5000 });
}

async function setDateInteractionFirst(yyyymmdd: string): Promise<void> {
  const rendered = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  await runInPage('selectCalendarDate', {
    suffix: 'calUseDt',
    yyyymmdd,
    timeoutMs: 6000,
  });
  await runInPage('waitForRenderedValue', {
    suffix: 'calUseDt',
    value: rendered,
    timeoutMs: 4000,
    contains: true,
  });
}

async function alignCandidateContext(
  candidate: SpaceCandidate,
  yyyymmdd: string,
  attempt: number,
): Promise<void> {
  console.log('[GLS-iso] step: choose campus', candidate.campusCode, `(${candidate.campusName})`);
  await chooseComboInteractionFirst('cboCampusCd', candidate.campusName, candidate.campusCode);

  console.log('[GLS-iso] step: choose building', candidate.buildingNo, `(${candidate.buildingName})`);
  await chooseComboInteractionFirst('cboBuildCd', candidate.buildingName, candidate.buildingNo);

  console.log('[GLS-iso] step: set rendered date', yyyymmdd);
  await setDateInteractionFirst(yyyymmdd);
  await sleep(attempt === 0 ? 250 : 500);

  if (attempt > 0) {
    // 간헐적으로 date 반영 직후 건물 기준 공간 목록이 늦게 갱신된다.
    // 같은 상호작용을 한 번 더 수행해 cascaded dataset refresh를 유도한다.
    console.warn('[GLS-iso] re-aligning building after slow dsCboSpace refresh');
    await chooseComboInteractionFirst('cboBuildCd', candidate.buildingName, candidate.buildingNo);
    await sleep(350);
  }
}

export async function checkAvailability(
  candidate: SpaceCandidate,
  date: string,
  startHour: number,
  endHour: number,
  options?: {
    formData?: ReservationFormData;
    startTime?: string;
    endTime?: string;
    strictPreview?: boolean;
  },
): Promise<{
  available: boolean;
  conflicts: Array<{ kind: string; timeTerm: string; info: string }>;
}> {
  console.log('[GLS-iso] checkAvailability start', candidate.glsSpaceCode, date, startHour, endHour);
  try {
    await openReservationModal();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('reservation modal did not open')) {
      console.warn('[GLS-iso] reservation modal did not open; retrying once');
      await sleep(700);
      await openReservationModal();
    } else {
      throw e;
    }
  }
  if (!options?.strictPreview) {
    await clearPreviewFormState();
  }
  const yyyymmdd = toYyyymmdd(date);

  let datasetMessage = '';
  let datasetReady = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    await alignCandidateContext(candidate, yyyymmdd, attempt);
    try {
      await runInPage('waitForDatasetValue', {
        dsName: 'dsCboSpace',
        column: 'GU_SPACE_CD',
        value: candidate.glsSpaceCode,
        timeoutMs: attempt === 0 ? 4000 : 7000,
      });
      datasetReady = true;
      break;
    } catch (datasetErr) {
      datasetMessage = datasetErr instanceof Error ? datasetErr.message : String(datasetErr);
      if (attempt === 0) {
        console.warn('[GLS-iso] dsCboSpace did not contain candidate after first pass; retrying context sync');
        await runInPage('dismissNoticeIfShown');
        await sleep(500);
        continue;
      }
    }
  }
  if (!datasetReady) {
    return {
      available: false,
      conflicts: makeExclusionConflict(
        `공간 옵션 로드 실패: 후보 공간 코드가 공간 목록(dsCboSpace)에 나타나지 않았습니다. 캠퍼스/건물/날짜 문맥이 아직 맞지 않았을 수 있습니다. (${datasetMessage})`,
      ),
    };
  }

  try {
    await runInPage('waitForGridSpaceCode', {
      spaceCode: candidate.glsSpaceCode,
      timeoutMs: 5000,
    });
  } catch (gridErr) {
    const gridMessage = gridErr instanceof Error ? gridErr.message : String(gridErr);
    return {
      available: false,
      conflicts: makeExclusionConflict(
        `시간표 미노출: 후보 공간 코드가 현재 시간표(dsGrdMainNew)에 나타나지 않았습니다. 건물/날짜 변경 반영이 늦었거나 다른 건물 데이터가 남아 있을 수 있습니다. (${gridMessage})`,
      ),
    };
  }

  // 공간 row 클릭 → dsGrdSub 갱신 + cboSpaceCd auto-set
  console.log('[GLS-iso] step: click space row', candidate.glsSpaceCode);
  try {
    await runInPage('clickSpaceRow', { glsSpaceCode: candidate.glsSpaceCode });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('grdCal cell not found')) {
      return {
        available: false,
        conflicts: makeExclusionConflict(
          `시간표 렌더 실패: 공간 행은 찾았지만 클릭할 셀 DOM이 렌더되지 않았습니다. 가상 스크롤 상태일 수 있습니다. (${message})`,
        ),
      };
    }
    if (message.includes('not in dsGrdMainNew')) {
      return {
        available: false,
        conflicts: makeExclusionConflict(
          `시간표 미노출: 후보 공간 행이 시간표(dsGrdMainNew)에 나타나지 않았습니다. (${message})`,
        ),
      };
    }
    throw e;
  }
  try {
    await runInPage('waitForSpaceFieldSelection', {
      spaceCode: candidate.glsSpaceCode,
      roomName: candidate.roomName,
      timeoutMs: 1800,
    });
  } catch (err) {
    console.warn('[GLS-iso] space field did not reflect after row click; continuing with dsGrdSub read', err);
  }
  await sleep(800);

  // 공지 영역이 떠 있으면 닫기 (best-effort)
  await runInPage('dismissNoticeIfShown');
  await sleep(150);

  console.log('[GLS-iso] step: read dsGrdSub');
  const schedule = await runInPage<SpaceScheduleRow[]>('readDsGrdSub');
  const conflicts = computeConflicts(schedule, yyyymmdd, startHour, endHour);
  console.log('[GLS-iso] checkAvailability done — conflicts:', conflicts.length);

  // Preview: formData 가 미리 제공된 경우 (dev panel / 행사메타 collector) 폼 전체를
  // 채워서 사용자가 GLS 탭에서 시각적으로 검증할 수 있게 한다. 저장은 별도 단계.
  if (options?.formData && conflicts.length === 0) {
    console.log('[GLS-iso] step: fillForm preview');
    try {
      await fillForm({
        candidate,
        date: yyyymmdd,
        startTime: options.startTime ? toHHMM(options.startTime) : '',
        endTime: options.endTime ? toHHMM(options.endTime) : '',
        formData: options.formData,
        primed: true,
      });
    } catch (e) {
      if (options.strictPreview) throw e;
      console.warn('[GLS-iso] fillForm preview failed (non-fatal):', e);
    }
  }

  return { available: conflicts.length === 0, conflicts };
}

// ---------- 가용성 분석 (isolated world에서 순수 함수) ----------

function parseTimeTerm(term: string): [number, number] | null {
  const m = String(term ?? '').match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [
    parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10),
    parseInt(m[3]!, 10) * 60 + parseInt(m[4]!, 10),
  ];
}

function isCompactDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{8}$/.test(value);
}

function dayOfWeek(yyyymmdd: string): number {
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  return new Date(y, m - 1, d).getDay();
}

function coversDate(row: SpaceScheduleRow, date: string): boolean {
  if (row.GANGJWA_START_DATE === date) return true;

  const m = (row.INFO2 || '').match(
    /(\d{4})\/(\d{2})\/(\d{2})\s*~\s*(\d{4})\/(\d{2})\/(\d{2})/,
  );
  if (m) {
    const rs = m[1]! + m[2]! + m[3]!;
    const re = m[4]! + m[5]! + m[6]!;
    if (date < rs || date > re) return false;
    // 수업 행의 INFO2 기간은 "현재 표시 주간"에 해당하는 경우가 있어,
    // GANGJWA_START_DATE 의 요일까지 다시 비교하면 실제로 보이는 수업이 누락된다.
    // 기간 안에만 들어오면 현재 날짜 문맥의 충돌로 본다.
    return true;
  }

  // 예약/대여는 INFO2 가 "(승인)" 같은 상태 문자열인 경우가 많다.
  // 이때는 GANGJWA_START_DATE 가 요청일과 정확히 일치할 때 충돌로 본다.
  if ((row.GUBUN === '예약' || row.GUBUN === '대여') && isCompactDate(row.GANGJWA_START_DATE)) {
    return row.GANGJWA_START_DATE === date;
  }

  // 형식을 해석할 수 없더라도 현재 dsGrdSub 문맥에 실린 점유 행이면
  // 보수적으로 충돌로 간주한다.
  return true;
}

function computeConflicts(
  schedule: SpaceScheduleRow[],
  date: string,
  startHour: number,
  endHour: number,
): Array<{ kind: string; timeTerm: string; info: string }> {
  const wantS = startHour * 60;
  const wantE = endHour * 60;
  const conflicts: Array<{ kind: string; timeTerm: string; info: string }> = [];
  for (const row of schedule) {
    if (!coversDate(row, date)) continue;
    const range = parseTimeTerm(row.TM_TERM);
    if (!range) continue;
    if (range[0] < wantE && range[1] > wantS) {
      conflicts.push({
        kind: String(row.GUBUN ?? ''),
        timeTerm: String(row.TM_TERM ?? ''),
        info: `${row.INFO1 ?? ''} ${row.INFO2 ?? ''}`.trim(),
      });
    }
  }
  return conflicts;
}

// ---------- 제출 ----------

export async function submitReservation(
  candidate: SpaceCandidate,
  formData: ReservationFormData,
  date: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: boolean; error?: string }> {
  await openReservationModal();

  const yyyymmdd = date ? toYyyymmdd(date) : '';
  const startHHMM = startTime ? toHHMM(startTime) : '';
  const endHHMM = endTime ? toHHMM(endTime) : '';

  try {
    await fillForm({
      candidate,
      date: yyyymmdd,
      startTime: startHHMM,
      endTime: endHHMM,
      formData,
      primed: false,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    try {
      await runInPage('clickSaveButton');
    } catch (err) {
      console.warn('[GLS-iso] visible save click failed; falling back to btnSave_OnClick', err);
      await runInPage('submitReservation');
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return runInPage<{ ok: boolean; error?: string }>(
    'waitForSubmitResult',
    { timeoutMs: 5000 },
    8000,
  );
}

// ---------- 포맷 유틸 ----------

function toYyyymmdd(date: string): string {
  if (/^\d{8}$/.test(date)) return date;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`invalid date format: ${date}`);
  return `${m[1]}${m[2]}${m[3]}`;
}

function toHHMM(time: string): string {
  if (/^\d{4}$/.test(time)) return time;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`invalid time format: ${time}`);
  return m[1]!.padStart(2, '0') + m[2];
}
