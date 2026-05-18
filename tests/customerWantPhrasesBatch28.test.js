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
  return handleCustomerMessage({
    customerPhone: phone,
    messageText
  });
}

test("1 - voy a querer 2 crispy y dos latas de pepsi no se confunde con delivery", async () => {
  resetSessionsForTests();

  const result = await send("3970000001", "voy a querer 2 crispy y dos latas de pepsi");

  assert.notEqual(result.order.deliveryType, "DELIVERY");
  assert.match(result.reply, /2 x Camdis crispy simple|2 x .*crispy/i);
  assert.match(result.reply, /2 x Lata|2 x .*lata|2 x .*Pepsi/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("2 - hola voy a querer 2 crispy y dos latas de pepsi", async () => {
  resetSessionsForTests();

  const result = await send("3970000002", "hola voy a querer 2 crispy y dos latas de pepsi");

  assert.notEqual(result.order.deliveryType, "DELIVERY");
  assert.match(result.reply, /2 x Camdis crispy simple|crispy/i);
  assert.match(result.reply, /2 x Lata|lata|Pepsi/i);
});

test("3 - voy a querer una americana doble", async () => {
  resetSessionsForTests();

  const result = await send("3970000003", "voy a querer una americana doble");

  assert.match(result.reply, /1 x Americana 2\.0 doble/i);
  assert.match(result.reply, /delivery o retiro por el local/i);
});

test("4 - delivery a centenario 49 sigue detectando direccion", async () => {
  resetSessionsForTests();

  const phone = "3970000004";

  await send(phone, "quiero una americana doble");
  const result = await send(phone, "delivery a centenario 49 mp");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "centenario 49");
  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
});
