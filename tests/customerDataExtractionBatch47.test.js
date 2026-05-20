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

test("1 - delivery direccion y mercado pago separados por comas", async () => {
  resetSessionsForTests();

  const phone = "4085000001";

  await send(phone, "quiero una bacon doble");
  const result = await send(phone, "delivery, Alem 2122, Mercado Pago");

  assert.equal(result.parsedMessage.intent, "ACTUALIZAR_DATOS_CLIENTE");
  assert.equal(result.order.delivery.type, "DELIVERY");
  assert.match(result.order.delivery.address, /alem 2122/i);
  assert.equal(result.order.payment.method, "MERCADO_PAGO");
  assert.match(result.reply, /Entrega:/i);
  assert.match(result.reply, /Pago:/i);
});

test("2 - nombre direccion y efectivo separados por coma", async () => {
  resetSessionsForTests();

  const phone = "4085000002";

  await send(phone, "quiero una onion doble");
  const result = await send(phone, "Juan Perez, Centenario 49, efectivo");

  assert.equal(result.parsedMessage.intent, "ACTUALIZAR_DATOS_CLIENTE");
  assert.match(result.order.customer.name, /Juan Perez/i);
  assert.equal(result.order.delivery.type, "DELIVERY");
  assert.match(result.order.delivery.address, /centenario 49/i);
  assert.equal(result.order.payment.method, "EFECTIVO");
});

test("3 - me llamo completa nombre", async () => {
  resetSessionsForTests();

  const phone = "4085000003";

  await send(phone, "quiero una americana triple");
  const result = await send(phone, "me llamo Sofia Gomez");

  assert.equal(result.parsedMessage.intent, "ACTUALIZAR_DATOS_CLIENTE");
  assert.match(result.order.customer.name, /Sofia Gomez/i);
});

test("4 - direccion y transferencia en una frase", async () => {
  resetSessionsForTests();

  const phone = "4085000004";

  await send(phone, "quiero una cheeseburger doble");
  const result = await send(phone, "direccion San Martin 123 pago transferencia");

  assert.equal(result.parsedMessage.intent, "ACTUALIZAR_DATOS_CLIENTE");
  assert.equal(result.order.delivery.type, "DELIVERY");
  assert.match(result.order.delivery.address, /san martin 123/i);
  assert.equal(result.order.payment.method, "TRANSFERENCIA");
});
