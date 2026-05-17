/**
 * 예약 모달 폼 채우기.
 *
 * - campus / building / date / space 는 checkAvailability 단계에서 이미 맞춰진다.
 *   여기서는 제출 직전 상태를 안정화하기 위해 코드값을 한 번 더 재커밋한다.
 * - 나머지 필드는 docs/GLS_DOM_NOTES.md PoC 순서대로 채운다.
 *   공간/시간 선택이 끝난 뒤 행사 메타를 넣어야 화면상 값이 덜 날아간다.
 *
 * 매핑 출처: docs/GLS_DOM_NOTES.md §4 / §6.
 */

import { MODAL_FIELDS } from '@gls/nexacroPaths';
import type { ReservationFormData, SpaceCandidate } from '../shared/types';
import { runInPage } from './contentScript';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface FillArgs {
  candidate: SpaceCandidate;
  date: string; // "yyyymmdd"  (빈 문자열이면 set 생략)
  startTime: string; // "HHMM"   (빈 문자열이면 set 생략)
  endTime: string; // "HHMM"
  formData: ReservationFormData;
  primed?: boolean; // checkAvailability 가 campus/build/date/row-click 까지 끝낸 상태인지
}

const HANGSA_LABELS: Record<string, string> = {
  '113': '교내단체행사(세미나/스터디)',
  '111': '교내단체행사(학생회/동아리)',
  '115': '보충수업,특강,시험',
  '112': '본부부서 주관행사',
  '114': '단과대학 주관행사',
  '116': '학과주관행사',
  '001': '교외단체행사',
  '117': '기타',
};

function digitsOnly(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
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
    await wait(180);
  }
  if (!selected) {
    if (!fallbackValue) throw new Error(`combo ${suffix} could not be selected by label: ${label}`);
    await runInPage('setComboAndFireChange', { suffix, value: fallbackValue });
  }
  await runInPage('waitForRenderedValue', { suffix, value: label, timeoutMs: 5000 });
}

async function setDateInteractionFirst(yyyymmdd: string): Promise<void> {
  const rendered = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  await runInPage('selectCalendarDate', {
    suffix: MODAL_FIELDS.예약일,
    yyyymmdd,
    timeoutMs: 6000,
  });
  await runInPage('waitForRenderedValue', {
    suffix: MODAL_FIELDS.예약일,
    value: rendered,
    timeoutMs: 4000,
    contains: true,
  });
}

async function setTimeComboInteractionFirst(
  suffix: string,
  hhmm: string,
): Promise<void> {
  const label = `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
  let selected = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    selected = await runInPage<boolean>('trySelectComboByText', { suffix, label });
    if (selected) break;
    await wait(180);
  }
  if (!selected) {
    // 실제 GLS preview 검증에서 시간 combolist 가 빈 상태로 뜨는 케이스가 있어
    // 시간대는 코드값(HHMM) 커밋 fallback 을 허용한다.
    await runInPage('setComboAndFireChange', { suffix, value: hhmm });
  }
  await runInPage('waitForRenderedValue', { suffix, value: label, timeoutMs: 5000 });
}

async function setTextFieldWithCommit(
  suffix: string,
  value: string,
): Promise<void> {
  await runInPage('setComponentValueAndFireChange', {
    suffix,
    value,
  });
  await runInPage('setRenderedControlValue', {
    suffix,
    value,
  });
}

export async function fillForm(args: FillArgs): Promise<void> {
  const { candidate, date, startTime, endTime, formData, primed = false } = args;

  if (!primed) {
    await chooseComboInteractionFirst(MODAL_FIELDS.캠퍼스, candidate.campusName, candidate.campusCode);
    await chooseComboInteractionFirst(MODAL_FIELDS.건물, candidate.buildingName, candidate.buildingNo);
    if (date) {
      await setDateInteractionFirst(date);
    }
    // preview/submit 경로는 checkAvailability의 문맥을 재사용하지 않고 모달을
    // 다시 맞추므로, 느린 건물/공간 cascade 에서 후보 코드가 dsCboSpace 및
    // 예약현황 그리드에 실제로 나타날 때까지 한 번 더 확인한 뒤 진행한다.
    await runInPage('waitForDatasetValue', {
      dsName: 'dsCboSpace',
      column: 'GU_SPACE_CD',
      value: candidate.glsSpaceCode,
      timeoutMs: 5000,
    });
    await runInPage('waitForGridSpaceCode', {
      spaceCode: candidate.glsSpaceCode,
      timeoutMs: 5000,
    });
  }

  // 이전 preview/후보에서 남은 사용자 입력값이 다음 fill에 섞이지 않도록
  // 행사 메타/시간 필드를 먼저 비우고 다시 채운다.
  await runInPage('clearManagedFormFields');
  await wait(180);

  // 사람처럼 먼저 공간 row를 다시 클릭해 현재 문맥을 맞춘다.
  await runInPage('clickSpaceRow', { glsSpaceCode: candidate.glsSpaceCode });
  let rowCommitted = false;
  try {
    await runInPage('waitForSpaceFieldSelection', {
      spaceCode: candidate.glsSpaceCode,
      roomName: candidate.roomName,
      timeoutMs: 5000,
    });
    rowCommitted = true;
  } catch {
    // row click은 dsGrdSub / 공지 갱신 트리거 역할이 더 중요하다.
    // 실제 space 필드 커밋은 아래 selectSpaceByCode에서 다시 확인한다.
  }
  await new Promise((r) => setTimeout(r, 300));
  await runInPage('dismissNoticeIfShown');

  // 공간/시간/행사구분은 DOM dropdown 선택 우선.
  if (!rowCommitted) {
    const spaceSelected = await runInPage<boolean>('trySelectSpaceByCode', {
      spaceCode: candidate.glsSpaceCode,
      roomName: candidate.roomName,
    });
    let spaceSelectionCommitted = false;
    if (spaceSelected) {
      try {
        await runInPage('waitForSpaceFieldSelection', {
          spaceCode: candidate.glsSpaceCode,
          roomName: candidate.roomName,
          timeoutMs: 1500,
        });
        spaceSelectionCommitted = true;
      } catch {
        // dropdown item 클릭이 성공으로 끝나도 간헐적으로 실제 combo 값이
        // 이전 공간/선택 상태로 남는다. 이 경우 아래 강제 커밋 fallback 사용.
      }
    }
    if (!spaceSelectionCommitted) {
      // preview/demo 경로에서는 row 클릭이 핵심 상호작용이지만,
      // 끝내 공간 필드가 안 맞을 때는 코드값 + onChanged를 강제로 커밋한다.
      try {
        await runInPage('setComponentValueAndFireChange', {
          suffix: MODAL_FIELDS.공간,
          value: candidate.glsSpaceCode,
        });
      } catch {
        // final snapshot 검증에서 실제 미반영이면 다시 걸러진다.
      }
    }
  }
  await runInPage('waitForSpaceFieldSelection', {
    spaceCode: candidate.glsSpaceCode,
    roomName: candidate.roomName,
    timeoutMs: 5000,
  });
  if (startTime) {
    await setTimeComboInteractionFirst(MODAL_FIELDS.시작시간, startTime);
  }
  if (endTime) {
    await setTimeComboInteractionFirst(MODAL_FIELDS.종료시간, endTime);
  }
  await chooseComboInteractionFirst(
    MODAL_FIELDS.행사구분,
    HANGSA_LABELS[formData.hangsaGbCode] ?? formData.hangsaGbCode,
    formData.hangsaGbCode,
  );

  // 텍스트류는 내부값을 먼저 맞춘 뒤, 실제 사용자 입력+blur가 마지막으로 오게 한다.
  await setTextFieldWithCommit(MODAL_FIELDS.주관단체, formData.organization);
  await setTextFieldWithCommit(MODAL_FIELDS.행사명, formData.eventName);
  await setTextFieldWithCommit(MODAL_FIELDS.행사인원, String(formData.headcount));
  await setTextFieldWithCommit(MODAL_FIELDS.사용목적, formData.purpose);
  await runInPage('commitPopupEdits');

  // Nexacro 내부 후속 처리(cascade / repaint)가 늦게 따라오는 케이스를 기다린다.
  await wait(700);

  let snapshot = await runInPage<Record<string, string>>('readFormSnapshot');
  const textFallbacks: Array<[string, string]> = [];
  const maybeQueueTextFallback = (
    suffix: string,
    snapshotKey: string,
    expectedValue: string,
  ): void => {
    const internalValue = String(snapshot[snapshotKey] ?? '');
    const renderedValue = String(snapshot[`${snapshotKey}Rendered`] ?? '');
    if (internalValue === expectedValue) return;
    if (!renderedValue.includes(expectedValue)) return;
    textFallbacks.push([suffix, expectedValue]);
  };
  maybeQueueTextFallback(MODAL_FIELDS.주관단체, 'organization', formData.organization);
  maybeQueueTextFallback(MODAL_FIELDS.행사명, 'eventName', formData.eventName);
  maybeQueueTextFallback(MODAL_FIELDS.행사인원, 'headcount', String(formData.headcount));
  maybeQueueTextFallback(MODAL_FIELDS.사용목적, 'purpose', formData.purpose);
  for (const [suffix, value] of textFallbacks) {
    await runInPage('setComponentValue', { suffix, value });
  }
  if (textFallbacks.length > 0) {
    await wait(300);
    snapshot = await runInPage<Record<string, string>>('readFormSnapshot');
  }

  const expected: Array<[string, string]> = [
    ['campusCode', candidate.campusCode],
    ['campusText', candidate.campusName],
    ['buildingNo', candidate.buildingNo],
    ['buildingText', candidate.buildingName],
    ['spaceCode', candidate.glsSpaceCode],
    ['hangsaGbCode', formData.hangsaGbCode],
    ['hangsaRendered', HANGSA_LABELS[formData.hangsaGbCode] ?? formData.hangsaGbCode],
    ['organization', formData.organization],
    ['organizationRendered', formData.organization],
    ['eventName', formData.eventName],
    ['eventNameRendered', formData.eventName],
    ['headcount', String(formData.headcount)],
    ['headcountRendered', String(formData.headcount)],
    ['purpose', formData.purpose],
    ['purposeRendered', formData.purpose],
  ];
  if (date) {
    expected.push(['date', date]);
    expected.push(['dateRendered', `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`]);
  }
  if (startTime) {
    expected.push(['startTime', startTime]);
    expected.push(['startText', `${startTime.slice(0, 2)}:${startTime.slice(2, 4)}`]);
    expected.push(['startRendered', `${startTime.slice(0, 2)}:${startTime.slice(2, 4)}`]);
  }
  if (endTime) {
    expected.push(['endTime', endTime]);
    expected.push(['endText', `${endTime.slice(0, 2)}:${endTime.slice(2, 4)}`]);
    expected.push(['endRendered', `${endTime.slice(0, 2)}:${endTime.slice(2, 4)}`]);
  }

  const mismatches = expected.filter(([key, value]) => {
    const actual = String(snapshot[key] ?? '');
    if (key === 'dateRendered') {
      return digitsOnly(actual) !== digitsOnly(value);
    }
    if (
      key === 'campusText' ||
      key === 'buildingText' ||
      key.endsWith('Rendered') ||
      key === 'startText' ||
      key === 'endText'
    ) {
      return !actual.includes(value);
    }
    return actual !== String(value);
  });
  if (
    !String(snapshot.spaceText ?? '').includes(candidate.roomName) &&
    !String(snapshot.spaceText ?? '').includes(candidate.glsSpaceCode)
  ) {
    mismatches.push(['spaceText', candidate.roomName]);
  }
  if (mismatches.length > 0) {
    const detail = mismatches
      .map(([key, value]) => `${key}: expected=${value} actual=${snapshot[key] ?? ''}`)
      .join(', ');
    throw new Error(`form snapshot mismatch: ${detail}`);
  }
  if (String(snapshot.blockingAlert ?? '').trim()) {
    throw new Error(`form snapshot blocked by alert: ${snapshot.blockingAlert}`);
  }
}
