import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { sanitizeMessageText } from "../src/security/inputSanitizer.js";
import { checkRateLimit } from "../src/security/rateLimiter.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ADMIN_PHONE = "5491111111111";
const NORMAL_PHONE = "3819999999";

function saveRateLimitEnv() {
  return {
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
    RATE_LIMIT_MAX_MESSAGES: process.env.RATE_LIMIT_MAX_MESSAGES,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_BLOCK_MS: process.env.RATE_LIMIT_BLOCK_MS,
    OWNER_PHONE: process.env.OWNER_PHONE,
    ADMIN_PHONES: process.env.ADMIN_PHONES
  };
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("sanitizeMessageText limpia caracteres de control y recorta longitud", () => {
  const result = sanitizeMessageText("  hola\u0000 mundo  ", {
    maxLength: 8
  });

  assert.equal(result, "hola mun");
});

test("checkRateLimit permite mensajes dentro del límite", () => {
  const env = saveRateLimitEnv();

  try {
    resetSessionsForTests();

    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_MESSAGES = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_BLOCK_MS = "300000";

    const first = checkRateLimit({
      customerPhone: NORMAL_PHONE,
      nowMs: 1000
    });

    const second = checkRateLimit({
      customerPhone: NORMAL_PHONE,
      nowMs: 2000
    });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
  } finally {
    restoreEnv(env);
  }
});

test("checkRateLimit bloquea cuando excede el límite", () => {
  const env = saveRateLimitEnv();

  try {
    resetSessionsForTests();

    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_MESSAGES = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_BLOCK_MS = "300000";

    const first = checkRateLimit({
      customerPhone: NORMAL_PHONE,
      nowMs: 1000
    });

    const second = checkRateLimit({
      customerPhone: NORMAL_PHONE,
      nowMs: 2000
    });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);
    assert.equal(second.status, "RATE_LIMIT_EXCEEDED");
  } finally {
    restoreEnv(env);
  }
});

test("admins no son bloqueados por rate limit", () => {
  const env = saveRateLimitEnv();

  try {
    resetSessionsForTests();

    process.env.OWNER_PHONE = ADMIN_PHONE;
    process.env.ADMIN_PHONES = ADMIN_PHONE;
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_MESSAGES = "1";

    const first = checkRateLimit({
      customerPhone: ADMIN_PHONE,
      nowMs: 1000
    });

    const second = checkRateLimit({
      customerPhone: ADMIN_PHONE,
      nowMs: 2000
    });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(second.status, "ADMIN_BYPASS");
  } finally {
    restoreEnv(env);
  }
});

test("handleCustomerMessage responde bloqueo por demasiados mensajes", async () => {
  const env = saveRateLimitEnv();

  try {
    resetSessionsForTests();

    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_MESSAGES = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_BLOCK_MS = "60000";

    const first = await handleCustomerMessage({
      customerPhone: NORMAL_PHONE,
      messageText: "pasame el menú"
    });

    const second = await handleCustomerMessage({
      customerPhone: NORMAL_PHONE,
      messageText: "pasame el menú"
    });

    assert.match(first.reply, /Camdis Hamburguesas/);
    assert.equal(second.order, null);
    assert.match(second.reply, /demasiados mensajes/);
  } finally {
    restoreEnv(env);
  }
});
