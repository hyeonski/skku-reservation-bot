/**
 * 사용자 식별자 UUID 관리 (D-009, D-019).
 *
 * 확장 최초 실행 시 UUID v4 생성 → chrome.storage.local에 저장.
 * 이후 모든 서버 요청에 X-Client-Id 헤더로 사용.
 *
 * TODO: getOrCreateClientId() 구현
 */

const STORAGE_KEY = 'client_id';

export async function getOrCreateClientId(): Promise<string> {
  // TODO: chrome.storage.local에서 읽고 없으면 crypto.randomUUID() 생성·저장
  throw new Error('not implemented');
}
