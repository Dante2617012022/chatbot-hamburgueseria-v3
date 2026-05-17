import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { handleAdminCommand } from "../src/admin/adminCommands.js";
import {
  BUSINESS_OPEN_OVERRIDE,
  getBusinessAvailability,
  setBusinessOpenOverride
} from "../src/business/businessHoursService.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ADMIN_PHONE = "5491111111111";
const NORMAL_PHONE = "3819999999";

function setAdminEnv() {
  process.env.OWNER_PHONE = ADMIN_PHONE;
  process.env.ADMIN_PHONES = ADMIN_PHONE;
}

test("getBusinessAvailability respeta apertura manual", async () => {
  resetSessionsForTests();

  setBusinessOpenOverride(BUSINESS_OPEN_OVERRIDE.OPEN);

  const availability = await getBusinessAvailability();

  assert.equal(availability.isOpen, true);
  assert.equal(availability.source, "MANUAL_OPEN");
});

test("getBusinessAvailability respeta cierre manual", async () => {
  resetSessionsForTests();

  setBusinessOpenOverride(BUSINESS_OPEN_OVERRIDE.CLOSED);

  const availability = await getBusinessAvailability();

  assert.equal(availability.isOpen, false);
  assert.equal(availability.source, "MANUAL_CLOSED");
});

test("admin puede abrir y cerrar local manualmente", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const closeResult = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin cerrar"
  });

  assert.match(closeResult.reply, /CERRADO/);

  let availability = await getBusinessAvailability();
  assert.equal(availability.isOpen, false);

  const openResult = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin abrir"
  });

  assert.match(openResult.reply, /ABIERTO/);

  availability = await getBusinessAvailability();
  assert.equal(availability.isOpen, true);
});

test("messageHandler bloquea pedidos si local está cerrado", async () => {
  resetSessionsForTests();
  setAdminEnv();

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin cerrar"
  });

  const result = await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "quiero una bacon doble"
  });

  assert.equal(result.order, null);
  assert.match(result.reply, /local está cerrado/);

  await handleCustomerMessage({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin abrir"
  });
});

test("admin puede consultar horario", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const result = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin horario"
  });

  assert.match(result.reply, /Horario del local/);
  assert.match(result.reply, /Estado:/);
});
