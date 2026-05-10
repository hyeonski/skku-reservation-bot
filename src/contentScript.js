chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "APPLY_RESERVATION") return false;

  try {
    const result = applyReservation(message.payload);
    sendResponse(result);
  } catch (error) {
    sendResponse({ ok: false, message: error.message });
  }

  return true;
});

function applyReservation(payload) {
  const selectors = globalThis.SKKU_RESERVATION_SELECTORS;
  if (!selectors) return { ok: false, message: "셀렉터 설정을 찾지 못했습니다." };
  if (isLoginPage(selectors)) return { ok: false, message: "로그인 후 예약 화면에서 다시 시도해 주세요." };

  const { request, space } = payload;
  const fields = {
    eventType: request.eventType,
    organizer: request.organizer,
    eventName: buildEventName(request),
    people: request.people,
    campus: space.campus,
    building: space.building,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    room: space.room,
    purpose: buildPurpose(request, space)
  };

  const applied = [];
  const missed = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!value) continue;
    const element = findFirst(selectors.fields[key] ?? []);
    if (!element) {
      missed.push(key);
      continue;
    }
    setElementValue(element, String(value));
    applied.push(key);
  }

  if (applied.length === 0) {
    return { ok: false, message: "입력 가능한 예약 폼을 찾지 못했습니다." };
  }

  return {
    ok: true,
    message: missed.length > 0 ? `일부 항목은 직접 확인해 주세요: ${missed.join(", ")}` : "폼 입력을 완료했습니다.",
    applied,
    missed
  };
}

function isLoginPage(selectors) {
  return selectors.loginHints.some((selector) => document.querySelector(selector));
}

function findFirst(selectorList) {
  for (const selector of selectorList) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function setElementValue(element, value) {
  element.focus();

  if (element.tagName === "SELECT") {
    const option = [...element.options].find((item) => item.value === value || item.textContent.includes(value));
    element.value = option?.value ?? value;
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.blur();
}

function buildEventName(request) {
  const rawText = String(request.rawText ?? "").trim();
  if (rawText && rawText.length <= 40) return rawText;
  return `${request.purpose ?? "공간 사용"} 예약`;
}

function buildPurpose(request, space) {
  const rawText = String(request.rawText ?? "").trim();
  const suffix = rawText ? ` 요청 원문: ${rawText}` : "";
  return `${request.purpose ?? "공간 사용"} 목적으로 ${space.name ?? "선택 공간"} 사용을 신청합니다.${suffix}`;
}
