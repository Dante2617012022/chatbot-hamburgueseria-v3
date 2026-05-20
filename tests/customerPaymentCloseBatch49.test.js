import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

async function send(phone, messageText) {
  return handleCustomerMessage({ customerPhone: phone, messageText });
}

async function createMercadoPagoOrder(phone) {
  await send(phone, "quiero una bacon doble");
  await send(phone, "retiro");
  await send(phone, "mercado pago");
  return send(phone, "confirmo");
}

test("1 - dale para pagar reenvia link de pago Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "4900000001";

  await createMercadoPagoOrder(phone);
  const result = await send(phone, "dale para pagar");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
  assert.match(result.reply, /dry-run/i);
});

test("2 - quiero abonar reenvia link de pago Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "4900000002";

  await createMercadoPagoOrder(phone);
  const result = await send(phone, "quiero abonar");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
  assert.match(result.reply, /dry-run/i);
});

test("3 - cerrame el pedido reenvia link de pago Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "4900000003";

  await createMercadoPagoOrder(phone);
  const result = await send(phone, "cerrame el pedido");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
  assert.match(result.reply, /dry-run/i);
});

test("4 - generame el link reenvia link de pago Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "4900000004";

  await createMercadoPagoOrder(phone);
  const result = await send(phone, "generame el link");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
  assert.match(result.reply, /dry-run/i);
});
