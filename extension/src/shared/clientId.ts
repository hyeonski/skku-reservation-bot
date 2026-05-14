/**
 * 사용자 식별자 UUID 관리 (D-009, D-019).
 *
 * 확장 최초 실행 시 UUID v4 생성 → chrome.storage.local에 저장.
 * 이후 모든 서버 요청에 X-Client-Id 헤더로 사용.
 */

const STORAGE_KEY = 'client_id';

let cached: string | null = null;
let pending: Promise<string> | null = null;

export async function getOrCreateClientId(): Promise<string> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const existing = await chrome.storage.local.get(STORAGE_KEY);
    const fromStorage = existing?.[STORAGE_KEY];
    if (typeof fromStorage === 'string' && fromStorage.length > 0) {
      cached = fromStorage;
      return fromStorage;
    }

    // Chrome's crypto.randomUUID() returns RFC 4122 v4 UUID.
    const fresh = crypto.randomUUID();
    await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
    cached = fresh;
    return fresh;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}
