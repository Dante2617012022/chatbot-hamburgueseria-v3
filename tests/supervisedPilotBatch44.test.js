import test from "node:test";
import assert from "node:assert/strict";

import { handleAdminCommand } from "../src/admin/adminCommands.js";
import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { clearSettingsForTests } from "../src/storage/settingsRepository.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

test("1 - admin puede activar modo piloto supervisado", async () => {
  clearSettingsForTests();

  const result = await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin piloto activar"
  });

  assert.equal(result.allowed, true);
  assert.match(result.reply, /piloto supervisado/i);
  assert.match(result.reply, /activado/i);
});

test("2 - admin estado muestra modo piloto supervisado", async () => {
  clearSettingsForTests();

  await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin piloto activar"
  });

  const result = await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin estado"
  });

  assert.equal(result.allowed, true);
  assert.match(result.reply, /Piloto supervisado: ACTIVADO/i);
});

test("3 - admin puede desactivar modo piloto supervisado", async () => {
  clearSettingsForTests();

  await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin piloto activar"
  });

  const result = await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin piloto desactivar"
  });

  assert.equal(result.allowed, true);
  assert.match(result.reply, /desactivado/i);
});

test("4 - en modo piloto, no entendido deriva a humano", async () => {
  resetSessionsForTests();
  clearSettingsForTests();

  await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin piloto activar"
  });

  const result = await handleCustomerMessage({
    customerPhone: "4082000001",
    messageText: "asdasd xyz raro"
  });

  assert.equal(result.parsedMessage.intent, "NO_ENTENDIDO");
  assert.match(result.reply, /persona|humano|manual/i);
  assert.match(result.reply, /piloto|supervis/i);
});

test("5 - sin modo piloto, no entendido conserva respuesta normal", async () => {
  resetSessionsForTests();
  clearSettingsForTests();

  const result = await handleCustomerMessage({
    customerPhone: "4082000002",
    messageText: "asdasd xyz raro"
  });

  assert.equal(result.parsedMessage.intent, "NO_ENTENDIDO");
  assert.doesNotMatch(result.reply, /piloto supervisado/i);
});
