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

test("1 - que ofrecen muestra menu", async () => {
  resetSessionsForTests();

  const result = await send("4070000001", "qué ofrecen");

  assert.equal(result.parsedMessage.intent, "VER_MENU");
  assert.match(result.reply, /Camdis Hamburguesas/i);
  assert.match(result.reply, /Cheeseburger simple/i);
});

test("2 - pasa el listado muestra menu", async () => {
  resetSessionsForTests();

  const result = await send("4070000002", "pasa el listado");

  assert.equal(result.parsedMessage.intent, "VER_MENU");
  assert.match(result.reply, /Camdis Hamburguesas/i);
});

test("3 - quiero un operador deriva a humano", async () => {
  resetSessionsForTests();

  const result = await send("4070000003", "quiero un operador");

  assert.equal(result.parsedMessage.intent, "HABLAR_CON_PERSONA");
  assert.match(result.reply, /persona|humano|ayudarte/i);
});

test("4 - atencion humana deriva a humano", async () => {
  resetSessionsForTests();

  const result = await send("4070000004", "atención humana");

  assert.equal(result.parsedMessage.intent, "HABLAR_CON_PERSONA");
  assert.match(result.reply, /persona|humano|ayudarte/i);
});

test("5 - nuevo pedido vacia el pedido", async () => {
  resetSessionsForTests();

  const phone = "4070000005";

  await send(phone, "quiero una americana doble");
  const result = await send(phone, "nuevo pedido");

  assert.equal(result.parsedMessage.intent, "VACIAR_PEDIDO");
  assert.equal(result.order.items.length, 0);
  assert.match(result.reply, /empezar|pedido/i);
});

test("6 - limpiar pedido vacia el pedido", async () => {
  resetSessionsForTests();

  const phone = "4070000006";

  await send(phone, "quiero una bacon doble");
  const result = await send(phone, "limpiar pedido");

  assert.equal(result.parsedMessage.intent, "VACIAR_PEDIDO");
  assert.equal(result.order.items.length, 0);
});

test("7 - cobrame ya reenvia link de pago cuando es mercado pago", async () => {
  resetSessionsForTests();

  const phone = "4070000007";

  await send(phone, "quiero una americana doble");
  await send(phone, "mercado pago");
  const result = await send(phone, "cobrame ya");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
});

test("8 - finalizalo reenvia link de pago cuando es mercado pago", async () => {
  resetSessionsForTests();

  const phone = "4070000008";

  await send(phone, "quiero una crispy triple");
  await send(phone, "mp");
  const result = await send(phone, "finalizalo");

  assert.equal(result.parsedMessage.intent, "REENVIAR_LINK_PAGO");
  assert.match(result.reply, /Link de pago Mercado Pago/i);
});
