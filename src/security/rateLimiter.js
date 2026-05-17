import { isAdminPhone } from "../admin/adminAuth.js";
import { getDatabase } from "../storage/database.js";

export function checkRateLimit({
  customerPhone,
  nowMs = Date.now()
}) {
  if (process.env.RATE_LIMIT_ENABLED === "false") {
    return {
      allowed: true,
      status: "DISABLED"
    };
  }

  if (!customerPhone) {
    return {
      allowed: false,
      status: "MISSING_CUSTOMER_PHONE",
      retryAfterSeconds: 60
    };
  }

  if (isAdminPhone(customerPhone)) {
    return {
      allowed: true,
      status: "ADMIN_BYPASS"
    };
  }

  const windowMs = getPositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", 60000);
  const maxMessages = getPositiveIntegerEnv("RATE_LIMIT_MAX_MESSAGES", 20);
  const blockMs = getPositiveIntegerEnv("RATE_LIMIT_BLOCK_MS", 300000);

  const db = getDatabase();

  cleanupRateLimitEvents({
    olderThanMs: nowMs - windowMs * 3
  });

  const activeBlock = db
    .prepare(`
      SELECT customer_phone, blocked_until_ms, reason
      FROM customer_blocks
      WHERE customer_phone = ?
        AND blocked_until_ms > ?
    `)
    .get(customerPhone, nowMs);

  if (activeBlock) {
    return {
      allowed: false,
      status: "BLOCKED",
      reason: activeBlock.reason,
      retryAfterSeconds: Math.ceil((activeBlock.blocked_until_ms - nowMs) / 1000)
    };
  }

  db.prepare(`
    INSERT INTO rate_limit_events (
      customer_phone,
      created_at_ms,
      created_at
    )
    VALUES (?, ?, ?)
  `).run(customerPhone, nowMs, new Date(nowMs).toISOString());

  const windowStart = nowMs - windowMs;

  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM rate_limit_events
      WHERE customer_phone = ?
        AND created_at_ms >= ?
    `)
    .get(customerPhone, windowStart);

  const count = row?.count || 0;

  if (count > maxMessages) {
    const blockedUntilMs = nowMs + blockMs;

    db.prepare(`
      INSERT INTO customer_blocks (
        customer_phone,
        blocked_until_ms,
        reason,
        updated_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(customer_phone) DO UPDATE SET
        blocked_until_ms = excluded.blocked_until_ms,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `).run(
      customerPhone,
      blockedUntilMs,
      "RATE_LIMIT_EXCEEDED",
      new Date(nowMs).toISOString()
    );

    return {
      allowed: false,
      status: "RATE_LIMIT_EXCEEDED",
      count,
      maxMessages,
      retryAfterSeconds: Math.ceil(blockMs / 1000)
    };
  }

  return {
    allowed: true,
    status: "OK",
    count,
    maxMessages,
    remaining: Math.max(0, maxMessages - count)
  };
}

export function cleanupRateLimitEvents({ olderThanMs }) {
  const db = getDatabase();

  db.prepare(`
    DELETE FROM rate_limit_events
    WHERE created_at_ms < ?
  `).run(olderThanMs);
}

export function clearRateLimitForTests() {
  const db = getDatabase();

  db.prepare("DELETE FROM rate_limit_events").run();
  db.prepare("DELETE FROM customer_blocks").run();
}

function getPositiveIntegerEnv(key, fallback) {
  const value = Number(process.env[key]);

  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}
