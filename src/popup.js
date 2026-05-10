import { formatDate, formatTimeRange } from "./formatters.js";
import { parseAndRecommend, saveHistoryToServer, submitFeedback } from "./apiClient.js";

const GLS_URL = "https://kingoinfo.skku.edu/";
const QUICK_REFINEMENTS = ["다른 곳 보여줘", "더 큰 방", "율전만", "반려 위험 빼고"];
const STORAGE_KEYS = {
  defaults: "reservationDefaults",
  history: "reservationHistory",
  lastRequest: "lastReservationRequest"
};

const els = {
  chatLog: document.querySelector("#chatLog"),
  requestInput: document.querySelector("#requestInput"),
  parseButton: document.querySelector("#parseButton"),
  openPortalButton: document.querySelector("#openPortalButton"),
  saveDefaultsButton: document.querySelector("#saveDefaultsButton"),
  organizerInput: document.querySelector("#organizerInput"),
  eventTypeInput: document.querySelector("#eventTypeInput"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  feedbackReasonInput: document.querySelector("#feedbackReasonInput"),
  feedbackCommentInput: document.querySelector("#feedbackCommentInput"),
  feedbackSubmitButton: document.querySelector("#feedbackSubmitButton"),
  feedbackMessage: document.querySelector("#feedbackMessage"),
  ratingButtons: [...document.querySelectorAll(".rating-button")]
};

let currentRequest = null;
let currentRequestId = null;
let currentResults = [];
let selectedRating = null;

init();

async function init() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.defaults, STORAGE_KEYS.lastRequest]);
  const defaults = stored[STORAGE_KEYS.defaults] ?? {};
  els.organizerInput.value = defaults.organizer ?? "";
  els.eventTypeInput.value = defaults.eventType ?? "회의";

  currentRequest = stored[STORAGE_KEYS.lastRequest] ?? null;
  addAssistantMessage(
    currentRequest?.rawText
      ? "지난 요청을 이어서 말해도 되고, 새로 필요한 공간을 말해도 돼요."
      : "어떤 공간이 필요해요? 날짜, 시간, 인원만 말해도 제가 후보를 찾아볼게요."
  );

  els.parseButton.addEventListener("click", handleUserInput);
  els.requestInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleUserInput();
    }
  });
  els.openPortalButton.addEventListener("click", () => chrome.tabs.create({ url: GLS_URL }));
  els.saveDefaultsButton.addEventListener("click", saveDefaults);
  els.feedbackSubmitButton.addEventListener("click", sendFeedback);

  for (const button of els.ratingButtons) {
    button.addEventListener("click", () => selectRating(Number(button.dataset.rating)));
  }
}

async function handleUserInput() {
  const text = els.requestInput.value.trim();
  if (!text) return;

  els.requestInput.value = "";
  resetFeedback();
  addUserMessage(text);

  if (shouldTreatAsFollowup(text)) {
    await applyRefinement(text, { echoUser: false });
    return;
  }

  await requestRecommendation({ rawText: text });
}

async function requestRecommendation({
  rawText,
  previousRequest = null,
  refinementText = "",
  shownSpaceIds = [],
  filters = {}
}) {
  try {
    setLoading(true);
    const result = await parseAndRecommend({
      rawText,
      history: await getHistory(),
      previousRequest,
      refinementText,
      shownSpaceIds,
      filters
    });

    currentRequest = result.request;
    currentRequestId = result.requestId;
    currentResults = result.spaces;
    await chrome.storage.local.set({ [STORAGE_KEYS.lastRequest]: currentRequest });

    renderRecommendationResponse(result.followUpQuestion);
  } catch (error) {
    currentRequest = previousRequest;
    currentRequestId = null;
    currentResults = [];
    if (!previousRequest) await chrome.storage.local.remove(STORAGE_KEYS.lastRequest);
    addAssistantMessage(error.message || "서버 또는 LLM/API 연결을 확인해 주세요.");
  } finally {
    setLoading(false);
  }
}

function renderRecommendationResponse(followUpQuestion = null) {
  if ((currentRequest?.missing?.length ?? 0) > 0) {
    addAssistantMessage(followUpQuestion ?? `${currentRequest.missing.join(", ")}을 알려주면 이어서 찾아볼게요.`);
    resetFeedback();
    return;
  }

  if (currentResults.length === 0) {
    addAssistantMessage("조건에 맞는 후보가 없어요. 시간이나 조건을 조금 바꿔서 다시 찾아볼까요?", createQuickActions());
    showFeedbackPanel();
    return;
  }

  const stack = document.createElement("div");
  stack.className = "bubble-stack";

  const summary = document.createElement("p");
  summary.textContent = `${formatDate(currentRequest.date)} ${formatTimeRange(currentRequest)}, ${currentRequest.people}명 기준으로 찾았어요. 마음에 드는 공간을 고르면 신청 전 확인을 보여줄게요.`;
  stack.append(summary);

  for (const space of currentResults) stack.append(createSpaceCard(space));
  stack.append(createQuickActions());
  addAssistantMessage("", stack);
  showFeedbackPanel();
}

function createSpaceCard(space) {
  const card = document.createElement("article");
  card.className = "space-card";

  const header = document.createElement("header");
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = space.name;
  const meta = document.createElement("p");
  meta.textContent = `${space.campus} · 최대 ${space.capacity}명 · ${space.availableHours[0]}-${space.availableHours[1]}`;
  copy.append(title, meta);

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = `적합도 ${Math.max(0, Math.round(space.score))}`;
  header.append(copy, badge);
  card.append(header);

  if (space.rejectionRisk !== "low") {
    const risk = document.createElement("p");
    risk.className = "risk";
    risk.textContent = space.rejectionReason ?? "반려 가능성이 있어 최종 신청 전 확인이 필요합니다.";
    card.append(risk);
  }

  if (Array.isArray(space.reasons) && space.reasons.length > 0) {
    const reasons = document.createElement("div");
    reasons.className = "reason-list";
    for (const reasonText of space.reasons) {
      const reason = document.createElement("span");
      reason.className = "reason";
      reason.textContent = reasonText;
      reasons.append(reason);
    }
    card.append(reasons);
  }

  const button = document.createElement("button");
  button.className = "apply-button";
  button.type = "button";
  button.textContent = "선택";
  button.addEventListener("click", () => confirmSpace(space));
  card.append(button);
  return card;
}

function confirmSpace(space) {
  const actions = document.createElement("div");
  actions.className = "chat-actions";

  const confirm = document.createElement("button");
  confirm.className = "primary-action";
  confirm.type = "button";
  confirm.textContent = "확인 후 폼 채우기";
  confirm.addEventListener("click", () => applyToPortal(space));

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "취소";
  cancel.addEventListener("click", () => addAssistantMessage("좋아요. 다른 공간을 고르거나 조건을 다시 말해줘요."));

  actions.append(confirm, cancel);
  addAssistantMessage(
    `${formatDate(currentRequest.date)} ${formatTimeRange(currentRequest)}, ${currentRequest.people}명, ${space.name}으로 신청서를 채울게요. 진행할까요?`,
    actions
  );
}

async function applyToPortal(space) {
  const payload = {
    request: {
      ...currentRequest,
      organizer: els.organizerInput.value.trim(),
      eventType: els.eventTypeInput.value
    },
    space
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "APPLY_RESERVATION", payload }, async (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon.svg",
        title: "폼 자동 입력 실패",
        message: response?.message ?? "GLS 예약 화면을 연 뒤 다시 시도해 주세요."
      });
      return;
    }

    await saveLocalHistory(space);
    await saveRemoteHistory(space);
    window.close();
  });
}

async function applyRefinement(refinementText, { echoUser = true } = {}) {
  if (!currentRequest) return;
  resetFeedback();
  if (echoUser) addUserMessage(refinementText);

  await requestRecommendation({
    rawText: currentRequest.rawText,
    previousRequest: currentRequest,
    refinementText,
    shownSpaceIds: currentResults.map((space) => space.id),
    filters: buildClientFilters(refinementText)
  });
}

function createQuickActions() {
  const actions = document.createElement("div");
  actions.className = "chat-actions";

  for (const refinement of QUICK_REFINEMENTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = refinement.replace(" 보여줘", "");
    button.addEventListener("click", () => applyRefinement(refinement));
    actions.append(button);
  }

  return actions;
}

function buildClientFilters(refinementText) {
  return {
    excludeShown: /다른|말고/.test(refinementText),
    capacity: /더\s*큰|큰\s*방|넓은|넓게/.test(refinementText) ? "larger" : undefined,
    avoidRisk: /반려|위험|안전/.test(refinementText)
  };
}

async function saveDefaults() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.defaults]: {
      organizer: els.organizerInput.value.trim(),
      eventType: els.eventTypeInput.value
    }
  });
  els.saveDefaultsButton.textContent = "저장됨";
  setTimeout(() => {
    els.saveDefaultsButton.textContent = "기본값 저장";
  }, 1200);
}

async function getHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  return stored[STORAGE_KEYS.history] ?? [];
}

async function saveLocalHistory(space) {
  const history = await getHistory();
  const next = [{ spaceId: space.id, spaceName: space.name, usedAt: new Date().toISOString() }, ...history].slice(0, 30);
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: next });
}

async function saveRemoteHistory(space) {
  try {
    await saveHistoryToServer(currentRequest, space, currentRequestId);
  } catch (error) {
    console.warn("Remote history save failed. Local history is kept.", error);
  }
}

function selectRating(rating) {
  selectedRating = rating;
  for (const button of els.ratingButtons) {
    button.classList.toggle("selected", Number(button.dataset.rating) === rating);
  }
}

async function sendFeedback() {
  if (!currentRequestId) {
    els.feedbackMessage.textContent = "먼저 추천 결과를 받아야 피드백을 보낼 수 있습니다.";
    return;
  }
  if (!selectedRating) {
    els.feedbackMessage.textContent = "좋음 또는 아쉬움을 먼저 선택해 주세요.";
    return;
  }

  els.feedbackSubmitButton.disabled = true;
  els.feedbackMessage.textContent = "전송 중...";
  try {
    await submitFeedback({
      requestId: currentRequestId,
      rating: selectedRating,
      reason: els.feedbackReasonInput.value,
      comment: els.feedbackCommentInput.value.trim()
    });
    els.feedbackMessage.textContent = "피드백이 저장되었습니다.";
    els.feedbackCommentInput.value = "";
  } catch (error) {
    els.feedbackMessage.textContent = error.message || "피드백 저장에 실패했습니다.";
  } finally {
    els.feedbackSubmitButton.disabled = false;
  }
}

function showFeedbackPanel() {
  if (currentRequestId) {
    els.feedbackPanel.hidden = false;
    els.feedbackMessage.textContent = "";
  }
}

function resetFeedback() {
  selectedRating = null;
  els.feedbackPanel.hidden = true;
  els.feedbackReasonInput.value = "";
  els.feedbackCommentInput.value = "";
  els.feedbackMessage.textContent = "";
  for (const button of els.ratingButtons) button.classList.remove("selected");
}

function setLoading(isLoading) {
  els.parseButton.disabled = isLoading;
  els.parseButton.textContent = isLoading ? "생각 중..." : "보내기";
}

function addUserMessage(text) {
  appendMessage("user", text);
}

function addAssistantMessage(text, contentNode = null) {
  appendMessage("assistant", text, contentNode);
}

function appendMessage(role, text, contentNode = null) {
  const message = document.createElement("div");
  message.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (text) {
    const p = document.createElement("p");
    p.textContent = text;
    bubble.append(p);
  }
  if (contentNode) bubble.append(contentNode);

  message.append(bubble);
  els.chatLog.append(message);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function shouldTreatAsFollowup(text) {
  if (!currentRequest) return false;
  if ((currentRequest.missing?.length ?? 0) > 0) return true;
  return /다른|더\s*큰|큰\s*방|넓은|율전만|자과만|명륜만|인사캠|반려|위험|안전/.test(text);
}
