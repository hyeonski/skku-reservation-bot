/**
 * Content Script — GLS 페이지 (isolated world).
 *
 * 책임:
 *  - background SW 로부터 받은 BG_* 명령을 glsAgent 로 위임
 *  - main-world 브리지(`bridgeMainWorld.ts`)에 named op RPC 송신 (postMessage)
 *
 * 아키텍처 메모:
 *  - GLS 페이지의 CSP 가 `unsafe-inline` / `unsafe-eval` 모두 금지하므로,
 *    main-world 브리지는 manifest.json `world: "MAIN"` 으로 별도 주입되고
 *    이쪽은 그 브리지에 **사전 등록된 named operation 만** 호출한다.
 *  - 따라서 RPC 페이로드는 `{op: string, args?: unknown}` 형태. 동적 코드 실행 없음.
 */

import type {
  BackgroundToContent,
  BgCheckBridge,
  BgCheckAvailability,
  BgClearPreviewForm,
  BgPreviewReservation,
  BgSubmitReservation,
  ContentAvailabilityResult,
  ContentBridgeState,
  ContentFormSnapshotResult,
  ContentPreviewResult,
  ContentSessionState,
  ContentSubmitResult,
} from '../shared/messages';
import {
  checkSession,
  checkAvailability,
  clearPreviewFormState,
  previewReservationForm,
  submitReservation,
} from './glsAgent';

// ---------- main-world RPC (CustomEvent 기반) ----------
//
// window.postMessage 를 쓰면 Nexacro 의 __pWindow._on_default_sys_message 가
// data.id 에 .split() 을 시도하면서 TypeError 가 나고 내부 상태가 깨진다.
// 같은 window 내 isolated ↔ main world 통신은 CustomEvent.detail 로 충분.

const EVENT_EXEC = 'GLS_AGENT_EXEC';
const EVENT_RESULT = 'GLS_AGENT_RESULT';

let rpcSeq = 0;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

window.addEventListener(EVENT_RESULT, (event: Event) => {
  const detail = (event as CustomEvent).detail as
    | { id: number; ok: boolean; result?: unknown; error?: string }
    | undefined;
  if (!detail || typeof detail.id !== 'number') return;
  const entry = pending.get(detail.id);
  if (!entry) return;
  pending.delete(detail.id);
  if (detail.ok) entry.resolve(detail.result);
  else entry.reject(new Error(detail.error || 'bridge error'));
});

/**
 * Main world 브리지에 등록된 named op 호출.
 *
 * `op` 는 `bridgeMainWorld.ts` 의 `ops` 객체 key 와 정확히 일치해야 함.
 * 새로운 동작이 필요하면 거기에 추가 (CSP 가 동적 코드를 막아 inline body 패턴은 불가).
 */
export async function runInPage<T = unknown>(
  op: string,
  args?: unknown,
  timeoutMs = 20000,
): Promise<T> {
  const id = ++rpcSeq;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`runInPage(${op}) timeout after ${timeoutMs}ms`));
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
    window.dispatchEvent(new CustomEvent(EVENT_EXEC, { detail: { id, op, args } }));
  });
}

// ---------- chrome.runtime 메시지 라우터 ----------

chrome.runtime.onMessage.addListener(
  (msg: BackgroundToContent, _sender, sendResponse) => {
    void (async () => {
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
          case 'BG_CHECK_BRIDGE': {
            await runInPage('ping', undefined, 3000);
            const reply: ContentBridgeState = {
              type: 'CONTENT_BRIDGE_STATE',
              ready: true,
            };
            sendResponse(reply);
            break;
          }
          case 'BG_READ_FORM_SNAPSHOT': {
            const snapshot = await runInPage<Record<string, string>>('readFormSnapshot', undefined, 3000);
            const reply: ContentFormSnapshotResult = {
              type: 'CONTENT_FORM_SNAPSHOT_RESULT',
              ok: true,
              snapshot,
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
              {
                formData: m.formData,
                startTime: m.startTime,
                endTime: m.endTime,
                strictPreview: m.strictPreview,
              },
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
            const r = await submitReservation(
              m.candidate,
              m.formData,
              m.date,
              m.startTime,
              m.endTime,
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
          case 'BG_PREVIEW_RESERVATION': {
            const m = msg as BgPreviewReservation;
            const r = await previewReservationForm(
              m.candidate,
              m.formData,
              m.date,
              m.startTime,
              m.endTime,
            );
            const reply: ContentPreviewResult = {
              type: 'CONTENT_PREVIEW_RESULT',
              ok: r.ok,
              spaceCode: m.candidate.glsSpaceCode,
              error: r.error,
            };
            sendResponse(reply);
            break;
          }
          case 'BG_CLEAR_PREVIEW_FORM': {
            await clearPreviewFormState();
            sendResponse({ ok: true } as never);
            break;
          }
          default: {
            sendResponse(undefined as never);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if ((msg as BackgroundToContent).type === 'BG_CHECK_AVAILABILITY') {
          const m = msg as BgCheckAvailability;
          const loginRequired = message === 'LOGIN_REQUIRED' || !checkSession();
          const hiddenInGrid = message.includes('not in dsGrdMainNew');
          const reply: ContentAvailabilityResult = {
            type: 'CONTENT_AVAILABILITY_RESULT',
            spaceCode: m.candidate.glsSpaceCode,
            available: false,
            loginRequired,
            conflicts: [
              {
                kind: hiddenInGrid ? ('제외' as const) : ('예약' as const),
                timeTerm: '',
                info: loginRequired
                  ? '로그인이 필요합니다. GLS 탭에서 로그인한 뒤 다시 시도해주세요.'
                  : hiddenInGrid
                    ? `시간표 미노출: 후보 공간 행을 GLS 시간표에서 찾지 못했습니다. (${message})`
                  : `error: ${message}`,
              },
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
        } else if ((msg as BackgroundToContent).type === 'BG_PREVIEW_RESERVATION') {
          const m = msg as BgPreviewReservation;
          const reply: ContentPreviewResult = {
            type: 'CONTENT_PREVIEW_RESULT',
            ok: false,
            spaceCode: m.candidate.glsSpaceCode,
            loginRequired: message === 'LOGIN_REQUIRED' || !checkSession(),
            error: message,
          };
          sendResponse(reply);
        } else if ((msg as BackgroundToContent).type === 'BG_CHECK_BRIDGE') {
          const reply: ContentBridgeState = {
            type: 'CONTENT_BRIDGE_STATE',
            ready: false,
            error: message,
          };
          sendResponse(reply);
        } else if ((msg as BackgroundToContent).type === 'BG_READ_FORM_SNAPSHOT') {
          const reply: ContentFormSnapshotResult = {
            type: 'CONTENT_FORM_SNAPSHOT_RESULT',
            ok: false,
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
    return true;
  },
);
