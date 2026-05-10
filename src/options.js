import { DEFAULT_API_BASE_URL, getApiBaseUrl, setApiBaseUrl } from "./config.js";

const apiBaseUrlInput = document.querySelector("#apiBaseUrlInput");
const saveButton = document.querySelector("#saveApiBaseUrlButton");
const resetButton = document.querySelector("#resetApiBaseUrlButton");
const message = document.querySelector("#optionsMessage");

init();

async function init() {
  apiBaseUrlInput.value = await getApiBaseUrl();
  saveButton.addEventListener("click", save);
  resetButton.addEventListener("click", reset);
}

async function save() {
  const value = apiBaseUrlInput.value.trim();
  if (!/^https?:\/\/.+/.test(value)) {
    message.textContent = "http:// 또는 https://로 시작하는 주소를 입력해 주세요.";
    return;
  }

  apiBaseUrlInput.value = await setApiBaseUrl(value);
  message.textContent = "저장되었습니다.";
}

async function reset() {
  apiBaseUrlInput.value = await setApiBaseUrl(DEFAULT_API_BASE_URL);
  message.textContent = "기본값으로 되돌렸습니다.";
}
