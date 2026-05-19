import { getDatabase } from "./database.js";

export function saveMessageEvent({
  customerPhone = null,
  direction,
  text = null,
  intent = null,
  status = null,
  payload = null
}) {
  if (!direction) {
    throw new Error("direction es obligatorio.");
  }

  const db = getDatabase();

  db.prepare(`
    INSERT INTO message_events (
      customer_phone,
      direction,
      text,
      intent,
      status,
      payload_json,
      created_at
    )
    VALUES (
      @customerPhone,
      @direction,
      @text,
      @intent,
      @status,
      @payloadJson,
      @createdAt
    )
  `).run({
    customerPhone,
    direction,
    text,
    intent,
    status,
    payloadJson: payload ? JSON.stringify(payload) : null,
    createdAt: new Date().toISOString()
  });
}

export function saveUnrecognizedMessage({
  customerPhone,
  text,
  parsedMessage
}) {
  saveMessageEvent({
    customerPhone,
    direction: "IN",
    text,
    intent: parsedMessage?.intent || "NO_ENTENDIDO",
    status: parsedMessage?.status || "NO_MATCH",
    payload: parsedMessage || null
  });
}

export function getUnrecognizedMessages({ limit = 50 } = {}) {
  const db = getDatabase();

  return db
    .prepare(`
      SELECT
        id,
        customer_phone,
        text,
        intent,
        status,
        payload_json,
        created_at
      FROM message_events
      WHERE intent = 'NO_ENTENDIDO'
         OR status IN ('NO_MATCH', 'PRODUCT_NOT_FOUND', 'LOW_CONFIDENCE', 'AMBIGUOUS')
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit)
    .map((row) => ({
      id: row.id,
      customerPhone: row.customer_phone,
      text: row.text,
      intent: row.intent,
      status: row.status,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      createdAt: row.created_at
    }));
}

export function clearMessageEventsForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM message_events").run();
}

export function getAiMessageMetrics({ limit = 500 } = {}) {
  const db = getDatabase();

  const rows = db
    .prepare(`
      SELECT
        id,
        customer_phone,
        text,
        intent,
        status,
        payload_json,
        created_at
      FROM message_events
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(limit);

  const metrics = {
    total: rows.length,
    aiTotal: 0,
    noEntendidoTotal: 0,
    byResolution: {},
    byStatus: {},
    recentAiEvents: []
  };

  for (const row of rows) {
    const payload = row.payload_json ? JSON.parse(row.payload_json) : null;
    const aiResolution = payload?.entities?.aiResolution || null;
    const isAiEvent = Boolean(aiResolution) || String(row.status || "").startsWith("AI_");

    const isNoEntendido =
      row.intent === "NO_ENTENDIDO" ||
      [
        "NO_MATCH",
        "PRODUCT_NOT_FOUND",
        "LOW_CONFIDENCE",
        "AMBIGUOUS",
        "AI_LOW_CONFIDENCE",
        "AI_AMBIGUOUS",
        "AI_INCOMPLETE",
        "AI_INVALID",
        "AI_INVALID_RESOLUTION",
        "AI_UNKNOWN"
      ].includes(row.status);

    if (isAiEvent) {
      metrics.aiTotal += 1;
      metrics.byStatus[row.status] = (metrics.byStatus[row.status] || 0) + 1;

      if (aiResolution) {
        metrics.byResolution[aiResolution] = (metrics.byResolution[aiResolution] || 0) + 1;
      }

      if (metrics.recentAiEvents.length < 10) {
        metrics.recentAiEvents.push({
          id: row.id,
          customerPhone: row.customer_phone,
          text: row.text,
          intent: row.intent,
          status: row.status,
          aiResolution,
          createdAt: row.created_at
        });
      }
    }

    if (isNoEntendido) {
      metrics.noEntendidoTotal += 1;
    }
  }

  return metrics;
}
