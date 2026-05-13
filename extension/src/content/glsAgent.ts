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
import type { ReservationFormData } from '../shared/messages';
import type { SpaceCandidate } from '../shared/types';
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

  await runInPage('waitForMenuReady', { timeoutMs: 15000 });
  await runInPage('openReservationModal', undefined, 20000);
}

// ---------- 가용성 확인 ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function checkAvailability(
  candidate: SpaceCandidate,
  date: string,
  startHour: number,
  endHour: number,
  options?: {
    formData?: ReservationFormData;
    startTime?: string;
    endTime?: string;
  },
): Promise<{
  available: boolean;
  conflicts: Array<{ kind: string; timeTerm: string; info: string }>;
}> {
  console.log('[GLS-iso] checkAvailability start', candidate.glsSpaceCode, date, startHour, endHour);
  await openReservationModal();
  const yyyymmdd = toYyyymmdd(date);

  // 캠퍼스 / 건물 cascade — code 값을 직접 set 하고 OnChanged 명시 호출.
  console.log('[GLS-iso] step: set campus', candidate.campusCode, `(${candidate.campusName})`);
  await runInPage('setComboAndFireChange', {
    suffix: 'cboCampusCd',
    value: candidate.campusCode,
  });

  // 캠퍼스 cascade transaction 이 끝나서 dsCboBuildCd 에 target buildingNo row 가
  // 나타날 때까지 대기. set_value 가 dataset 매칭 row 를 찾지 못하면 text 가 빈칸으로
  // 표시되는 현상이 있어 (검증 2026-05-13), 폴링 필수.
  console.log('[GLS-iso] waiting for dsCboBuildCd to load', candidate.buildingNo);
  await runInPage('waitForDatasetValue', {
    dsName: 'dsCboBuildCd',
    column: 'BUILD_NO',
    value: candidate.buildingNo,
    timeoutMs: 5000,
  });

  console.log('[GLS-iso] step: prime calUseDt', yyyymmdd);
  await runInPage('setComponentValue', { suffix: 'calUseDt', value: yyyymmdd });
  await sleep(200);

  console.log('[GLS-iso] step: set building', candidate.buildingNo, `(${candidate.buildingName})`);
  await runInPage('setComboAndFireChange', {
    suffix: 'cboBuildCd',
    value: candidate.buildingNo,
  });

  // 건물 cascade 후 dsCboSpace 에 target glsSpaceCode 가 들어올 때까지 대기.
  console.log('[GLS-iso] waiting for dsCboSpace to load', candidate.glsSpaceCode);
  await runInPage('waitForDatasetValue', {
    dsName: 'dsCboSpace',
    column: 'GU_SPACE_CD',
    value: candidate.glsSpaceCode,
    timeoutMs: 5000,
  });

  // 공간 row 클릭 → dsGrdSub 갱신 + cboSpaceCd auto-set
  console.log('[GLS-iso] step: click space row', candidate.glsSpaceCode);
  await runInPage('clickSpaceRow', { glsSpaceCode: candidate.glsSpaceCode });
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
      });
    } catch (e) {
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
  if (!m) return false;
  const rs = m[1]! + m[2]! + m[3]!;
  const re = m[4]! + m[5]! + m[6]!;
  if (date < rs || date > re) return false;
  return dayOfWeek(row.GANGJWA_START_DATE || date) === dayOfWeek(date);
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
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    await runInPage('submitReservation');
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
