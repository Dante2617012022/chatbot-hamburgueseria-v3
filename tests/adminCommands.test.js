import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { handleAdminCommand, isAdminCommand } from "../src/admin/adminCommands.js";
import { isBotPaused } from "../src/storage/settingsRepository.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ADMIN_PHONE = "5491111111111";
const NORMAL_PHONE = "3819999999";

function setAdminEnv() {
  process.env.OWNER_PHONE = ADMIN_PHONE;
  process.env.ADMIN_PHONES = ADMIN_PHONE;
}

test("isAdminCommand detecta comandos admin", () => {
  assert.equal(isAdminCommand("/admin ayuda"), true);
  assert.equal(isAdminCommand(" /admin pedidos"), true);
  assert.equal(isAdminCommand("quiero una bacon doble"), false);
});

test("handleAdminCommand rechaza usuarios no admin", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const result = await handleAdminCommand({
    customerPhone: NORMAL_PHONE,
    messageText: "/admin estado"
  });

  assert.equal(result.allowed, false);
  assert.match(result.reply, /No tenés permisos/);
});

test("admin puede pausar y activar el bot", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const pauseResult = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin pausar"
  });

  assert.equal(pauseResult.allowed, true);
  assert.equal(isBotPaused(), true);

  const activateResult = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin activar"
  });

  assert.equal(activateResult.allowed, true);
  assert.equal(isBotPaused(), false);
});

test("messageHandler bloquea mensajes normales si el bot está pausado", async () => {
  resetSessionsForTests();
  setAdminEnv();

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin pausar"
  });

  const result = await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "quiero una bacon doble"
  });

  assert.equal(result.order, null);
  assert.match(result.reply, /bot está pausado/);

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin activar"
  });
});

test("messageHandler permite comandos admin aunque el bot esté pausado", async () => {
  resetSessionsForTests();
  setAdminEnv();

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin pausar"
  });

  const result = await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin estado"
  });

  assert.equal(result.admin.allowed, true);
  assert.match(result.reply, /Estado del bot/);

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin activar"
  });
});

test("admin puede listar pedidos activos", async () => {
  resetSessionsForTests();
  setAdminEnv();

  await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "quiero una bacon doble"
  });

  const result = await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin pedidos"
  });

  assert.match(result.reply, /Pedidos activos/);
  assert.match(result.reply, /Bacon|Total|Estado/);
});
