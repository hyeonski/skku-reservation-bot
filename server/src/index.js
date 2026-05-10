import "dotenv/config";
import cors from "cors";
import express from "express";
import { createPool } from "./db.js";
import { parseReservationWithLLM } from "./llm.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const pool = createPool();

app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: resolveCorsOrigin() }));

app.get("/health", async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: rows[0]?.ok === 1 });
  } catch (error) {
    next(error);
  }
});

app.post("/api/parse-and-recommend", async (req, res, next) => {
  try {
    const rawText = String(req.body?.rawText ?? "").trim();
    const refinementText = String(req.body?.refinementText ?? "").trim();
    const previousRequest = req.body?.previousRequest ?? null;
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!rawText) {
      res.status(400).json({ ok: false, message: "rawText is required" });
      return;
    }

    const request = await parseReservationWithLLM({ rawText, previousRequest, refinementText });
    applyRefinementTextToRequest(request, refinementText);

    if (request.missing.length > 0) {
      const requestId = await saveRequestLog(request, 0);
      res.json({
        request,
        requestId,
        spaces: [],
        followUpQuestion: buildFollowUpQuestion(request.missing)
      });
      return;
    }

    const refinementOptions = buildRefinementOptions({
      text: refinementText || rawText,
      filters: req.body?.filters,
      shownSpaceIds: req.body?.shownSpaceIds,
      people: request.people
    });
    const spaces = await findRecommendedSpaces(request, history, refinementOptions);
    const requestId = await saveRequestLog(request, spaces.length);
    res.json({ request, requestId, spaces, followUpQuestion: null });
  } catch (error) {
    next(error);
  }
});

app.post("/api/history", async (req, res, next) => {
  let connection;
  try {
    const { request, space } = req.body ?? {};
    if (!space?.name) {
      res.status(400).json({ ok: false, message: "space is required" });
      return;
    }

    const requestId = toPositiveIntegerOrNull(req.body?.requestId);
    const spaceId = toPositiveIntegerOrNull(space.id);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `
        INSERT INTO reservation_history
          (request_id, space_id, space_name, reserved_date, start_time, end_time, people, status)
        VALUES
          (:requestId, :spaceId, :spaceName, :reservedDate, :startTime, :endTime, :people, 'applied')
      `,
      {
        requestId,
        spaceId,
        spaceName: space.name,
        reservedDate: request?.date ?? null,
        startTime: request?.startTime ?? null,
        endTime: request?.endTime ?? null,
        people: request?.people ?? null
      }
    );

    if (requestId) {
      await connection.execute(
        `
          UPDATE reservation_requests
          SET status = 'applied'
          WHERE id = :requestId
        `,
        { requestId }
      );
    }

    if (spaceId && request?.date && request?.startTime && request?.endTime) {
      await connection.execute(
        `
          INSERT INTO space_reservation_slots
            (space_id, reserved_date, start_time, end_time, status, source, external_ref, note, fetched_at)
          VALUES
            (:spaceId, :reservedDate, :startTime, :endTime, 'pending', 'user_applied', :externalRef, :note, CURRENT_TIMESTAMP)
        `,
        {
          spaceId,
          reservedDate: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          externalRef: requestId ? `request:${requestId}` : null,
          note: "Extension form-fill attempt"
        }
      );
    }

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

app.post("/api/feedback", async (req, res, next) => {
  try {
    const requestId = toPositiveIntegerOrNull(req.body?.requestId);
    const rating = Number(req.body?.rating);
    const reason = String(req.body?.reason ?? "").trim() || null;
    const comment = String(req.body?.comment ?? "").trim() || null;

    if (!requestId) {
      res.status(400).json({ ok: false, message: "requestId is required" });
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ ok: false, message: "rating must be an integer between 1 and 5" });
      return;
    }

    await pool.execute(
      `
        INSERT INTO feedback_events
          (request_id, rating, reason, comment)
        VALUES
          (:requestId, :rating, :reason, :comment)
      `,
      { requestId, rating, reason, comment }
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = getErrorStatus(error);
  res.status(status).json({ ok: false, message: getClientMessage(error) });
});

app.listen(port, () => {
  console.log(`Reservation agent API listening on http://localhost:${port}`);
});

function resolveCorsOrigin() {
  const origin = process.env.CORS_ORIGIN;
  if (!origin || origin === "*") return true;
  if (origin === "chrome-extension://*") {
    return (requestOrigin, callback) => {
      if (!requestOrigin || requestOrigin.startsWith("chrome-extension://")) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin is not allowed."));
    };
  }
  return origin.split(",").map((item) => item.trim());
}

function normalizeSpace(row) {
  return {
    id: String(row.id),
    campus: row.campus,
    building: row.building,
    room: row.room,
    name: row.name,
    capacity: row.capacity,
    tags: parseTags(row.tags),
    rejectionRisk: row.effectiveRejectionRisk,
    rejectionReason: row.effectiveRejectionReason,
    rejectionCount: Number(row.rejectionCount ?? 0),
    availableHours: [row.openTime, row.closeTime]
  };
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

function scoreSpace(space, request, history) {
  const favorites = new Set(history.map((item) => String(item.spaceId)));
  const capacityFit = Math.max(0, 100 - (space.capacity - request.people));
  const purposeFit = space.tags.some((tag) => request.purpose?.includes(tag)) ? 18 : 0;
  const favoriteFit = favorites.has(String(space.id)) ? 12 : 0;
  const riskPenalty = space.rejectionRisk === "high" ? 40 : space.rejectionRisk === "medium" ? 16 : 0;
  return capacityFit + purposeFit + favoriteFit - riskPenalty;
}

async function findRecommendedSpaces(request, history, options = {}) {
  const [rows] = await pool.execute(
    `
      SELECT
        s.id,
        s.campus,
        s.building,
        s.room,
        s.name,
        s.capacity,
        TIME_FORMAT(s.open_time, '%H:%i') AS openTime,
        TIME_FORMAT(s.close_time, '%H:%i') AS closeTime,
        CASE
          WHEN COALESCE(rs.rejection_count, 0) > 0 THEN 'high'
          WHEN COALESCE(rh.rejection_count, 0) > 0 THEN 'high'
          ELSE s.rejection_risk
        END AS effectiveRejectionRisk,
        COALESCE(
          rs.rejection_reason,
          rh.rejection_reason,
          s.rejection_reason
        ) AS effectiveRejectionReason,
        COALESCE(rs.rejection_count, 0) + COALESCE(rh.rejection_count, 0) AS rejectionCount,
        s.tags
      FROM spaces s
      LEFT JOIN (
        SELECT
          campus,
          building,
          room,
          COUNT(*) AS rejection_count,
          MAX(reason) AS rejection_reason
        FROM rejected_spaces
        GROUP BY campus, building, room
      ) rs
        ON rs.campus = s.campus
       AND rs.building = s.building
       AND rs.room = s.room
      LEFT JOIN (
        SELECT
          space_id,
          COUNT(*) AS rejection_count,
          MAX(rejection_reason) AS rejection_reason
        FROM reservation_history
        WHERE status = 'rejected'
        GROUP BY space_id
      ) rh
        ON rh.space_id = s.id
      WHERE s.is_active = TRUE
        AND s.capacity >= :minCapacity
        AND (:campus IS NULL OR s.campus = :campus)
        AND (:building IS NULL OR s.building LIKE CONCAT('%', :building, '%'))
        AND (:room IS NULL OR s.room = :room)
        AND (:startTime IS NULL OR TIME(:startTime) >= s.open_time)
        AND (:endTime IS NULL OR TIME(:endTime) <= s.close_time)
        AND (
          :reservedDate IS NULL
          OR :startTime IS NULL
          OR :endTime IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM space_reservation_slots slot
            WHERE slot.space_id = s.id
              AND slot.reserved_date = :reservedDate
              AND slot.status IN ('pending', 'reserved', 'approved', 'unavailable')
              AND slot.start_time < TIME(:endTime)
              AND slot.end_time > TIME(:startTime)
          )
        )
    `,
    {
      minCapacity: options.minCapacity ?? request.people,
      reservedDate: request.date ?? null,
      campus: request.campus ?? null,
      building: request.building ?? null,
      room: request.room ?? null,
      startTime: request.startTime ?? null,
      endTime: request.endTime ?? null
    }
  );

  return rows
    .map((row) => normalizeSpace(row))
    .filter((space) => !options.avoidRisk || space.rejectionRisk === "low")
    .filter((space) => !options.excludeSpaceIds?.has(String(space.id)))
    .map((space) => ({
      ...space,
      score: scoreSpace(space, request, history),
      reasons: buildRecommendationReasons(space, request, history)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildRecommendationReasons(space, request, history) {
  const reasons = [];
  const capacityGap = space.capacity - request.people;
  if (capacityGap <= 5) reasons.push("인원에 가장 잘 맞음");
  else reasons.push(`요청 인원보다 ${capacityGap}명 여유`);

  if (request.campus && space.campus === request.campus) reasons.push("요청 캠퍼스와 일치");
  if (request.building && space.building.includes(request.building)) reasons.push("요청 건물과 일치");
  if (space.tags.some((tag) => request.purpose?.includes(tag))) reasons.push("사용 목적과 잘 맞음");
  if (space.rejectionRisk === "low") reasons.push("반려 위험 낮음");
  if (space.rejectionRisk !== "low") reasons.push(`반려 이력 ${space.rejectionCount}건 확인 필요`);
  if (history.some((item) => String(item.spaceId) === String(space.id))) reasons.push("이전에 사용한 공간");

  return [...new Set(reasons)].slice(0, 4);
}

function buildRefinementOptions({ text, filters, shownSpaceIds, people }) {
  const source = `${text ?? ""}`.toLowerCase();
  const options = {
    excludeSpaceIds: new Set()
  };

  if (/다른|말고/.test(source) || filters?.excludeShown) {
    for (const id of shownSpaceIds ?? []) options.excludeSpaceIds.add(String(id));
    for (const id of filters?.excludeSpaceIds ?? []) options.excludeSpaceIds.add(String(id));
  }
  if (/더\s*큰|큰\s*방|넓은|넓게/.test(source) || filters?.capacity === "larger") {
    options.minCapacity = Math.max(Number(people ?? 0) + 1, Math.ceil(Number(people ?? 0) * 1.25));
  }
  if (/반려.*(빼|제외|없는|낮은)|위험.*(빼|제외|없는|낮은)|안전/.test(source) || filters?.avoidRisk) {
    options.avoidRisk = true;
  }

  return options;
}

function applyRefinementTextToRequest(request, refinementText) {
  const text = refinementText.toLowerCase();
  if (/율전|자과|자연과학|수원/.test(text)) request.campus = "자연과학캠퍼스";
  if (/명륜|인사캠|인문사회|서울/.test(text)) request.campus = "인문사회과학캠퍼스";
  if (/율전만|자과만|자연과학.*만|수원만|명륜만|인사캠.*만|인문사회.*만|서울만/.test(text)) {
    request.building = null;
    request.room = null;
  }
}

function buildFollowUpQuestion(missing) {
  const asks = [];
  if (missing.includes("날짜")) asks.push("날짜");
  if (missing.includes("시간")) asks.push("시간");
  if (missing.includes("인원")) asks.push("인원");
  if (asks.length === 0) return null;
  return `${asks.join(", ")}을 알려주면 바로 후보를 찾아볼게요.`;
}

async function saveRequestLog(request, recommendationCount) {
  const [result] = await pool.execute(
    `
      INSERT INTO reservation_requests
        (raw_text, parsed_date, start_time, end_time, people, purpose, campus, building, room, parse_result, status)
      VALUES
        (:rawText, :parsedDate, :startTime, :endTime, :people, :purpose, :campus, :building, :room, :parseResult, :status)
    `,
    {
      rawText: request.rawText ?? "",
      parsedDate: request.date ?? null,
      startTime: request.startTime ?? null,
      endTime: request.endTime ?? null,
      people: request.people ?? null,
      purpose: request.purpose ?? null,
      campus: request.campus ?? null,
      building: request.building ?? null,
      room: request.room ?? null,
      parseResult: JSON.stringify(request),
      status: recommendationCount > 0 ? "recommended" : "parsed"
    }
  );
  return result.insertId;
}

function getErrorStatus(error) {
  if (error.message?.includes("OPENAI_API_KEY") || error.message?.includes("OPENAI_MODEL")) return 503;
  if (error.code?.startsWith?.("ER_")) return 503;
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") return 503;
  return 500;
}

function getClientMessage(error) {
  if (error.message?.includes("OPENAI_API_KEY")) return "OPENAI_API_KEY를 server/.env에 입력해 주세요.";
  if (error.message?.includes("OPENAI_MODEL")) return "OPENAI_MODEL을 server/.env에 입력해 주세요.";
  if (error.code?.startsWith?.("ER_")) return "MySQL 스키마와 접속 정보를 확인해 주세요.";
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
    return "MySQL 또는 LLM API 네트워크 연결을 확인해 주세요.";
  }
  return "서버 처리 중 오류가 발생했습니다.";
}

function toPositiveIntegerOrNull(value) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) return null;
  return numberValue;
}
