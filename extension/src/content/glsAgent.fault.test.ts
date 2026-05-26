import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReservationFormData, SpaceCandidate } from '../shared/types';

type BridgeResponder = (op: string, args: unknown) => unknown | Promise<unknown>;

class FakeWindow extends EventTarget {
  setTimeout = globalThis.setTimeout.bind(globalThis);
  clearTimeout = globalThis.clearTimeout.bind(globalThis);
}

const fakeWindow = new FakeWindow();
let responder: BridgeResponder = () => true;

if (!globalThis.CustomEvent) {
  class NodeCustomEvent<T = unknown> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }

    initCustomEvent(): void {
      // Deprecated browser API; present only to satisfy the CustomEvent shape.
    }
  }
  globalThis.CustomEvent = NodeCustomEvent as unknown as typeof CustomEvent;
}

Object.assign(globalThis, {
  window: fakeWindow,
  location: { href: 'https://kingoinfo.skku.edu/gaia/nxui/index.html' },
  document: {
    querySelector: () => null,
  },
  chrome: {
    runtime: {
      onMessage: {
        addListener: () => undefined,
      },
    },
  },
});

fakeWindow.addEventListener('GLS_AGENT_EXEC', (event) => {
  const detail = (event as CustomEvent<{ id: number; op: string; args: unknown }>).detail;
  void (async () => {
    try {
      const result = await responder(detail.op, detail.args);
      fakeWindow.dispatchEvent(
        new CustomEvent('GLS_AGENT_RESULT', {
          detail: { id: detail.id, ok: true, result },
        }),
      );
    } catch (error) {
      fakeWindow.dispatchEvent(
        new CustomEvent('GLS_AGENT_RESULT', {
          detail: {
            id: detail.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  })();
});

const gls = await import('./glsAgent');

const candidate: SpaceCandidate = {
  glsSpaceCode: '26314B',
  campusCode: '2',
  buildingNo: '226',
  campusName: '자연과학캠퍼스',
  buildingName: '제2공학관26동',
  roomName: '[26314B] 이동통신공학과세미나실',
  capacityMin: 8,
  capacityMax: 14,
  useJojikName: '정보통신/소프트웨어융합/공과대학행정실',
  contents: null,
  limitTimeHHMM: '0800',
  isUserOrgPreferred: false,
};

const formData: ReservationFormData = {
  hangsaGbCode: '111',
  organization: '소프트웨어학과 학생회',
  eventName: '정기회의',
  headcount: 10,
  purpose: '정기회의 진행',
};

function setResponder(next: BridgeResponder): void {
  responder = next;
}

function defaultSuccess(op: string): unknown {
  if (op === 'hasPopupFrame') return true;
  if (op === 'readDsGrdSub') return [];
  if (op === 'readFormSnapshot') {
    return {
      campusCode: candidate.campusCode,
      campusText: candidate.campusName,
      buildingNo: candidate.buildingNo,
      buildingText: candidate.buildingName,
      spaceCode: candidate.glsSpaceCode,
      spaceText: candidate.roomName,
      date: '20260714',
      dateRendered: '2026-07-14',
      startTime: '1000',
      startText: '10:00',
      startRendered: '10:00',
      endTime: '1200',
      endText: '12:00',
      endRendered: '12:00',
      hangsaGbCode: formData.hangsaGbCode,
      hangsaRendered: '교내단체행사(학생회/동아리)',
      organization: formData.organization,
      organizationRendered: formData.organization,
      eventName: formData.eventName,
      eventNameRendered: formData.eventName,
      headcount: String(formData.headcount),
      headcountRendered: String(formData.headcount),
      purpose: formData.purpose,
      purposeRendered: formData.purpose,
      blockingAlert: '',
    };
  }
  return true;
}

test('checkAvailability degrades to unavailable when space dataset selector breaks', async () => {
  setResponder((op) => {
    if (op === 'waitForDatasetValue') {
      throw new Error('selector broken: dsCboSpace missing');
    }
    return defaultSuccess(op);
  });

  const result = await gls.checkAvailability(candidate, '2026-07-14', 10, 12);

  assert.equal(result.available, false);
  assert.match(result.conflicts[0]?.info ?? '', /공간 옵션 로드 실패/);
  assert.match(result.conflicts[0]?.info ?? '', /selector broken/);
});

test('checkAvailability degrades to unavailable when schedule grid selector breaks', async () => {
  setResponder((op) => {
    if (op === 'waitForGridSpaceCode') {
      throw new Error('selector broken: dsGrdMainNew missing');
    }
    return defaultSuccess(op);
  });

  const result = await gls.checkAvailability(candidate, '2026-07-14', 10, 12);

  assert.equal(result.available, false);
  assert.match(result.conflicts[0]?.info ?? '', /시간표 미노출/);
  assert.match(result.conflicts[0]?.info ?? '', /selector broken/);
});

test('previewReservationForm reports selector-driven form snapshot mismatch', async () => {
  setResponder((op) => {
    if (op === 'readFormSnapshot') {
      return { ...defaultSuccess(op) as Record<string, string>, spaceCode: 'WRONG' };
    }
    return defaultSuccess(op);
  });

  const result = await gls.previewReservationForm(
    candidate,
    formData,
    '2026-07-14',
    '10:00',
    '12:00',
  );

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /form snapshot mismatch/);
  assert.match(result.error ?? '', /spaceCode/);
});
