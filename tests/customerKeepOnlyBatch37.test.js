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

test("1 - dejame solo la hamburguesa conserva hamburguesas y quita acompañamientos", async () => {
  resetSessionsForTests();

  const phone = "4050000001";

  await send(phone, "quiero una bacon doble, una papa gratinada y una gaseosa grande");
  const result = await send(phone, "dejame solo la hamburguesa");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Papas gratinadas/i);
  assert.doesNotMatch(result.reply, /Gaseosa 1\.5L/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "bacon_cheese_doble");
});

test("2 - dejame solo las gaseosas conserva bebidas", async () => {
  resetSessionsForTests();

  const phone = "4050000002";

  await send(phone, "quiero una bacon doble, una papa gratinada y dos gaseosas grandes");
  const result = await send(phone, "dejame solo las gaseosas");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /2 x Gaseosa 1\.5L/i);
  assert.doesNotMatch(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Papas gratinadas/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "bebida_15l");
});

test("3 - dejame solo una gaseosa ajusta cantidad a 1", async () => {
  resetSessionsForTests();

  const phone = "4050000003";

  await send(phone, "quiero una bacon doble y tres gaseosas grandes");
  const result = await send(phone, "dejame solo una gaseosa");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
  assert.doesNotMatch(result.reply, /Bacon cheese doble/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].quantity, 1);
  assert.equal(result.order.total, 3500);
});

test("4 - sacame todo menos la cheeseburger conserva cheeseburger", async () => {
  resetSessionsForTests();

  const phone = "4050000004";

  await send(phone, "quiero una cheeseburger triple, una papa gratinada y una gaseosa grande");
  const result = await send(phone, "sacame todo menos la cheeseburger");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /Cheeseburger triple/i);
  assert.doesNotMatch(result.reply, /Papas gratinadas/i);
  assert.doesNotMatch(result.reply, /Gaseosa 1\.5L/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "cheeseburger_triple");
});

test("5 - todo menos las papas conserva papas", async () => {
  resetSessionsForTests();

  const phone = "4050000005";

  await send(phone, "quiero una bacon doble, una papa gratinada y una gaseosa grande");
  const result = await send(phone, "todo menos las papas");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /Papas gratinadas/i);
  assert.doesNotMatch(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Gaseosa 1\.5L/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "papas_gratinadas");
});

test("6 - dejame solo bacon doble y coca conserva dos productos", async () => {
  resetSessionsForTests();

  const phone = "4050000006";

  await send(phone, "quiero una bacon doble, una papa gratinada y una gaseosa grande");
  const result = await send(phone, "dejame solo la bacon doble y la coca");

  assert.equal(result.parsedMessage.intent, "DEJAR_SOLO_PRODUCTOS");
  assert.match(result.reply, /Bacon cheese doble/i);
  assert.match(result.reply, /Gaseosa 1\.5L/i);
  assert.doesNotMatch(result.reply, /Papas gratinadas/i);
  assert.equal(result.order.items.length, 2);
});
