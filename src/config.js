export const DEFAULT_API_BASE_URL = "http://localhost:8787";
export const API_BASE_URL_STORAGE_KEY = "apiBaseUrl";

export async function getApiBaseUrl() {
  if (!globalThis.chrome?.storage?.local) return DEFAULT_API_BASE_URL;

  const stored = await chrome.storage.local.get(API_BASE_URL_STORAGE_KEY);
  return normalizeApiBaseUrl(stored[API_BASE_URL_STORAGE_KEY] || DEFAULT_API_BASE_URL);
}

export async function setApiBaseUrl(value) {
  const apiBaseUrl = normalizeApiBaseUrl(value || DEFAULT_API_BASE_URL);
  await chrome.storage.local.set({ [API_BASE_URL_STORAGE_KEY]: apiBaseUrl });
  return apiBaseUrl;
}

export function normalizeApiBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}
