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

test("1 - delivery coma direccion coma mercado completa direccion y pago", async () => {
  resetSessionsForTests();

  const phone = "3940000001";

  await send(phone, "hola preparame 3 americanas triples");
  await send(phone, "voy a necesitar una crispy triple");

  const result = await send(phone, "delivery, centenario 49, mercado");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "centenario 49");
  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(result.reply, /Pago: Mercado Pago/i);
  assert.match(result.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);
});

test("2 - direccion y mp en mensaje multilinea completa ambos datos", async () => {
  resetSessionsForTests();

  const phone = "3940000002";

  await send(phone, "quiero una americana doble");
  await send(phone, "delivery");

  const result = await send(phone, "centenario 49\nmp");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "centenario 49");
  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(result.reply, /Pago: Mercado Pago/i);
});

test("3 - mercado solo se interpreta como Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "3940000003";

  await send(phone, "quiero una bacon doble retiro");

  const result = await send(phone, "mercado");

  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /Mercado Pago/i);
  assert.match(result.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);
});

test("4 - delivery centenario 49 mp sin comas completa direccion y pago", async () => {
  resetSessionsForTests();

  const phone = "3940000004";

  await send(phone, "quiero una crispy triple");

  const result = await send(phone, "delivery centenario 49 mp");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "centenario 49");
  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(result.reply, /Pago: Mercado Pago/i);
});
