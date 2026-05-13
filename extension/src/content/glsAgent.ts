/**
 * GLS 자동화 오케스트레이션 (페이지 컨텍스트).
 *
 * 이 모듈은 content-script isolated world 에서 실행되며,
 * 모든 nexacro 호출은 contentScript.ts 의 `runInPage` RPC 를 통해
 * main world 의 `window.__GLS__` 헬퍼로 위임된다.
 *
 * 핵심 흐름: docs/GLS_DOM_NOTES.md §5 의사코드.
 */

import {
  GLS_HOME_URL,
  LOGIN_URL_PREFIX,
  MENU_CODES,
  PAGE_BUTTONS,
} from '@gls/nexacroPaths';
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
 *
 * 시그널을 셋 결합:
 *   1. URL이 login.skku.edu 면 false
 *   2. URL이 kingoinfo.skku.edu 가 아니면 false
 *   3. 페이지에 로그인 폼(`edtLOGIN_ID`)이 가시 상태로 떠있으면 false
 *      (또는 로그인 후에만 나타나는 메뉴 `btnM532010000` 이 없으면 false)
 */
export function checkSession(): boolean {
  if (location.href.startsWith(LOGIN_URL_PREFIX)) return false;
  if (!location.href.startsWith(GLS_HOME_URL)) return false;

  // 로그인 폼이 가시면 미로그인.
  const loginId = document.querySelector<HTMLElement>(
    '[id$=".edtLOGIN_ID"]:not([id$=":icontext"])',
  );
  if (loginId && loginId.offsetParent !== null) return false;

  // 메뉴(btnM532010000)가 보이면 로그인됨. Nexacro 로딩 중이라 아직 안 보일 수도
  // 있으니, 로그인 폼 없음 + 메뉴 없음의 경우는 일단 true (호출자가 timeout 처리).
  return true;
}

// ---------- 모달 오픈 ----------

/**
 * 신청/자격관리 → 공간대여신청 → btnInsert4 시퀀스.
 * 이미 모달이 열려있으면 (popupFrame 존재) skip — idempotent.
 */
export async function openReservationModal(): Promise<void> {
  const alreadyOpen = await runInPage<boolean>(
    `(async () => { try { return !!window.__GLS__.hasPopupFrame(); } catch (e) { return false; } })()`,
  );
  if (alreadyOpen) return;

  const menuCode = MENU_CODES.신청자격관리;
  const reserveBtn = PAGE_BUTTONS.예약신청;

  const body = `(async () => {
    var G = window.__GLS__;
    var wait = G.wait;

    // 1. 신청/자격관리 메뉴 클릭
    var menu = G.byIdSuffix(${JSON.stringify(menuCode)});
    if (!menu) throw new Error('menu not found: ${menuCode}');
    G.nexClick(menu);
    await wait(500);

    // 2. 서브메뉴 "공간대여신청" 텍스트 매칭 클릭
    var sub = G.findByText('공간대여신청');
    if (!sub) throw new Error('submenu not found: 공간대여신청');
    G.nexClick(sub);
    await wait(1500);

    // 3. 예약신청 버튼 클릭 → 모달 오픈
    // btnInsert4 가 보일 때까지 최대 5s 대기
    var btn = null;
    for (var i = 0; i < 25; i++) {
      btn = G.byIdSuffix(${JSON.stringify(reserveBtn)});
      if (btn && btn.offsetParent !== null) break;
      await wait(200);
    }
    if (!btn) throw new Error('btnInsert4 not visible after page load');
    G.nexClick(btn);

    // 4. popupFrame 생성 대기
    for (var k = 0; k < 25; k++) {
      if (G.hasPopupFrame()) return true;
      await wait(200);
    }
    throw new Error('reservation modal did not open');
  })()`;

  await runInPage(body, 20000);
}

// ---------- 가용성 확인 ----------

export async function checkAvailability(
  candidate: SpaceCandidate,
  date: string,
  startHour: number,
  endHour: number,
): Promise<{
  available: boolean;
  conflicts: Array<{ kind: string; timeTerm: string; info: string }>;
}> {
  await openReservationModal();

  const yyyymmdd = toYyyymmdd(date);

  const body = `(async () => {
    var G = window.__GLS__;
    var wait = G.wait;
    var dm = G.activeModalDM();

    // 캠퍼스 / 건물: cascade 트리거 필요 → DOM 클릭 (selectComboByText). async polling이라 await.
    await G.selectComboByText(dm, 'cboCampusCd', ${JSON.stringify(candidate.campusName)});
    await wait(700);
    // 캠퍼스 변경은 calUseDt를 reset하므로 cboBuildCd OnChanged 가 dsCboSpace 를
    // 로드하려면 날짜를 다시 채워둬야 한다 (시딩 스크립트와 동일 패턴).
    dm.calUseDt.set_value(${JSON.stringify(yyyymmdd)});
    await wait(200);
    await G.selectComboByText(dm, 'cboBuildCd', ${JSON.stringify(candidate.buildingName)});
    await wait(1500); // dsCboSpace + dsGrdMainNew 로드 대기

    // 날짜 set
    dm.calUseDt.set_value(${JSON.stringify(yyyymmdd)});
    if (typeof G.activePopupForm().divManage_calUseDt_OnChanged === 'function') {
      try { G.activePopupForm().divManage_calUseDt_OnChanged(dm.calUseDt, {}); } catch (_) {}
    }
    await wait(300);

    // 공간 row 클릭 → dsGrdSub 갱신
    G.clickSpaceRow(${JSON.stringify(candidate.glsSpaceCode)});
    await wait(800);

    // 공지사항 alert 닫기 (있을 경우)
    G.dismissNoticeIfShown();
    await wait(200);

    var form = G.activePopupForm();
    var schedule = G.readDataset(form, 'dsGrdSub');
    var conflicts = G.computeConflicts(schedule, ${JSON.stringify(yyyymmdd)}, ${startHour}, ${endHour});
    return { available: conflicts.length === 0, conflicts: conflicts, scheduleCount: schedule.length };
  })()`;

  const result = await runInPage<{
    available: boolean;
    conflicts: Array<{ kind: string; timeTerm: string; info: string }>;
  }>(body, 20000);

  // SpaceScheduleRow 타입은 main world에서 직렬화돼 전달됨 — 형태만 검증.
  void ({} as SpaceScheduleRow);

  return {
    available: result.available,
    conflicts: result.conflicts,
  };
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

  // 시간 정보는 message에서 비어있을 수도 있음 — 비어있으면 모달의 현재 값 유지.
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

  // 저장 클릭 → 성공 시 보통 popupFrame이 닫힘. 실패 시 alert 텍스트가 떠있음.
  const body = `(async () => {
    var G = window.__GLS__;
    var wait = G.wait;

    // 저장 호출
    try { G.submitReservation(); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }

    // 결과 폴링: 최대 5s
    for (var i = 0; i < 25; i++) {
      await wait(200);
      // 성공 휴리스틱: popupFrame 이 닫혔거나, "정상" / "저장되었습니다" 텍스트 가시
      if (!G.hasPopupFrame()) return { ok: true };
      var ok1 = G.findByText('저장되었습니다.') || G.findByText('정상적으로 저장되었습니다.') || G.findByText('신청되었습니다.');
      if (ok1) return { ok: true };
      // 실패 휴리스틱: 에러 alert 텍스트
      var err = G.findByText('오류') || G.findByText('실패');
      if (err) {
        // 같은 alert 컨테이너에서 메시지 텍스트 추출 시도
        var parent = err.parentElement;
        var msg = '';
        while (parent && !msg) {
          var t = parent.innerText || '';
          if (t.length > 0 && t.length < 500) msg = t.trim();
          parent = parent.parentElement;
        }
        return { ok: false, error: msg || 'unknown error alert' };
      }
    }
    // 타임아웃 — 모달이 여전히 살아있고 success/failure 알 수 없음
    return { ok: false, error: 'submit result unknown (timeout)' };
  })()`;

  return await runInPage<{ ok: boolean; error?: string }>(body, 15000);
}

// ---------- 포맷 유틸 ----------

function toYyyymmdd(date: string): string {
  // "YYYY-MM-DD" → "YYYYMMDD". 이미 8자리면 그대로.
  if (/^\d{8}$/.test(date)) return date;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`invalid date format: ${date}`);
  return `${m[1]}${m[2]}${m[3]}`;
}

function toHHMM(time: string): string {
  // "HH:MM" → "HHMM". 이미 4자리면 그대로.
  if (/^\d{4}$/.test(time)) return time;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`invalid time format: ${time}`);
  return m[1]!.padStart(2, '0') + m[2];
}
