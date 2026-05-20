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

test("1 - sacame una hamburguesa quita una unidad", async () => {
  resetSessionsForTests();

  const phone = "5100000001";

  await send(phone, "quiero dos bacon doble y una coca grande");
  const result = await send(phone, "sacame una hamburguesa");

  assert.equal(result.parsedMessage.intent, "QUITAR_CATEGORIA_DEL_PEDIDO");
  assert.equal(result.parsedMessage.entities.category, "HAMBURGUESAS");
  assert.equal(result.parsedMessage.entities.quantity, 1);
  assert.match(result.reply, /1 x Bacon cheese doble/i);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
});

test("2 - sacame las dos hamburguesas quita dos", async () => {
  resetSessionsForTests();

  const phone = "5100000002";

  await send(phone, "quiero una bacon doble, una cheese simple y una coca grande");
  const result = await send(phone, "sacame las dos hamburguesas");

  assert.equal(result.parsedMessage.intent, "QUITAR_CATEGORIA_DEL_PEDIDO");
  assert.equal(result.parsedMessage.entities.category, "HAMBURGUESAS");
  assert.equal(result.parsedMessage.entities.quantity, 2);
  assert.doesNotMatch(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Cheeseburger simple/i);
  assert.match(result.reply, /Gaseosa 1\.5L/i);
});

test("3 - bajale una bebida quita una unidad de bebidas", async () => {
  resetSessionsForTests();

  const phone = "5100000003";

  await send(phone, "quiero una bacon doble y dos gaseosas grandes");
  const result = await send(phone, "bajale una bebida");

  assert.equal(result.parsedMessage.intent, "QUITAR_CATEGORIA_DEL_PEDIDO");
  assert.equal(result.parsedMessage.entities.category, "BEBIDAS");
  assert.equal(result.parsedMessage.entities.quantity, 1);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
});

test("4 - sacame todas las bebidas elimina bebidas", async () => {
  resetSessionsForTests();

  const phone = "5100000004";

  await send(phone, "quiero una bacon doble, dos gaseosas grandes y una lata");
  const result = await send(phone, "sacame todas las bebidas");

  assert.equal(result.parsedMessage.intent, "QUITAR_CATEGORIA_DEL_PEDIDO");
  assert.equal(result.parsedMessage.entities.category, "BEBIDAS");
  assert.equal(result.parsedMessage.entities.removeAll, true);
  assert.match(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Gaseosa 1\.5L/i);
  assert.doesNotMatch(result.reply, /Lata/i);
});

test("5 - no quiero mas gaseosas elimina bebidas", async () => {
  resetSessionsForTests();

  const phone = "5100000005";

  await send(phone, "quiero una bacon doble y dos gaseosas grandes");
  const result = await send(phone, "no quiero mas gaseosas");

  assert.equal(result.parsedMessage.intent, "QUITAR_CATEGORIA_DEL_PEDIDO");
  assert.equal(result.parsedMessage.entities.category, "BEBIDAS");
  assert.equal(result.parsedMessage.entities.removeAll, true);
  assert.match(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Gaseosa 1\.5L/i);
});
