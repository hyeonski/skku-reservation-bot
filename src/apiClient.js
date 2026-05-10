import { getApiBaseUrl } from "./config.js";

export async function parseAndRecommend({
  rawText,
  history,
  previousRequest = null,
  refinementText = "",
  shownSpaceIds = [],
  filters = {}
}) {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/parse-and-recommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rawText, history, previousRequest, refinementText, shownSpaceIds, filters })
  });

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new Error(detail || `parse-and-recommend api failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    request: data.request,
    requestId: data.requestId,
    spaces: Array.isArray(data.spaces) ? data.spaces : [],
    followUpQuestion: data.followUpQuestion ?? null
  };
}

export async function saveHistoryToServer(request, space, requestId) {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/history`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ request, space, requestId })
  });

  if (!response.ok) {
    throw new Error(`history api failed: ${response.status}`);
  }

  return response.json();
}

export async function submitFeedback({ requestId, rating, reason, comment }) {
  const apiBaseUrl = await getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requestId, rating, reason, comment })
  });

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new Error(detail || `feedback api failed: ${response.status}`);
  }

  return response.json();
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data.message;
  } catch {
    return "";
  }
}
