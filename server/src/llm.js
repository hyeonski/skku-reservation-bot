const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const SEOUL_TIMEZONE = "Asia/Seoul";

export async function parseReservationWithLLM({ rawText, previousRequest = null, refinementText = "" }) {
  assertLlmConfig();

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({
            rawText,
            previousRequest,
            refinementText,
            currentDate: getSeoulDateString(),
            timezone: SEOUL_TIMEZONE
          })
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM API returned an empty response.");

  return normalizeParsedRequest(JSON.parse(content), rawText, previousRequest, refinementText);
}

function assertLlmConfig() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  if (!process.env.OPENAI_MODEL) {
    throw new Error("OPENAI_MODEL is required.");
  }
}

function buildSystemPrompt() {
  return [
    "You parse Korean natural-language campus space reservation requests.",
    "Return only valid JSON. Do not include markdown.",
    "All dates must be absolute YYYY-MM-DD based on the provided currentDate and Asia/Seoul timezone.",
    "Use 24-hour HH:mm time format. If duration is omitted, default to 2 hours when startTime exists.",
    "If previousRequest is present, treat refinementText as a follow-up. Preserve previous fields unless the follow-up clearly changes them.",
    "Examples of follow-up: 더 큰 방, 다른 곳 보여줘, 율전만, 반려 위험 빼고, 6시 20명.",
    "If a field is unknown, use null. missing must list required missing fields among 날짜, 시간, 인원.",
    "Output shape:",
    "{",
    '  "date": "YYYY-MM-DD|null",',
    '  "startTime": "HH:mm|null",',
    '  "endTime": "HH:mm|null",',
    '  "durationHours": "number|null",',
    '  "people": "number|null",',
    '  "purpose": "string",',
    '  "campus": "자연과학캠퍼스|인문사회과학캠퍼스|null",',
    '  "building": "string|null",',
    '  "room": "string|null",',
    '  "missing": ["날짜|시간|인원"]',
    "}"
  ].join("\n");
}

function normalizeParsedRequest(parsed, rawText, previousRequest, refinementText) {
  const merged = mergeWithPrevious(parsed, previousRequest);
  const durationHours = Number(merged.durationHours ?? 2);
  const request = {
    rawText,
    refinementText: nullableString(refinementText),
    date: nullableString(merged.date),
    startTime: nullableString(merged.startTime),
    endTime: nullableString(merged.endTime),
    durationHours: Number.isFinite(durationHours) ? durationHours : 2,
    people: Number.isFinite(Number(merged.people)) ? Number(merged.people) : null,
    purpose: merged.purpose || "공간 사용",
    campus: nullableString(merged.campus),
    building: nullableString(merged.building),
    room: nullableString(merged.room),
    missing: Array.isArray(merged.missing) ? merged.missing : []
  };

  if (request.startTime && !request.endTime) {
    request.endTime = addHours(request.startTime, request.durationHours);
  }
  request.missing = requiredMissingFields(request);
  return request;
}

function mergeWithPrevious(parsed, previousRequest) {
  if (!previousRequest) return parsed;
  return {
    date: cleanNullable(parsed.date) ?? previousRequest.date,
    startTime: cleanNullable(parsed.startTime) ?? previousRequest.startTime,
    endTime: cleanNullable(parsed.endTime) ?? previousRequest.endTime,
    durationHours: cleanNullable(parsed.durationHours) ?? previousRequest.durationHours,
    people: cleanNullable(parsed.people) ?? previousRequest.people,
    purpose: cleanNullable(parsed.purpose) ?? previousRequest.purpose,
    campus: cleanNullable(parsed.campus) ?? previousRequest.campus,
    building: cleanNullable(parsed.building) ?? previousRequest.building,
    room: cleanNullable(parsed.room) ?? previousRequest.room,
    missing: parsed.missing
  };
}

function requiredMissingFields(request) {
  const missing = [];
  if (!request.date) missing.push("날짜");
  if (!request.startTime || !request.endTime) missing.push("시간");
  if (!request.people) missing.push("인원");
  return missing;
}

function nullableString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function cleanNullable(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function addHours(timeValue, hoursToAdd) {
  const [hour, minute] = timeValue.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + Math.round(Number(hoursToAdd ?? 2) * 60);
  const nextHour = Math.floor(totalMinutes / 60) % 24;
  const nextMinute = totalMinutes % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function getSeoulDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
