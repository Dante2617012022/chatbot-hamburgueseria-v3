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

test("1 - americana simple no doble corrige doble existente", async () => {
  resetSessionsForTests();

  const phone = "4020000001";

  await send(phone, "quiero una americana doble");
  const result = await send(phone, "americana simple no doble");

  assert.equal(result.parsedMessage.intent, "CAMBIAR_PRODUCTO_DEL_PEDIDO");
  assert.match(result.reply, /cambié|cambie/i);
  assert.match(result.reply, /Americana 2\.0 simple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_20_simple");
  assert.equal(result.order.items[0].quantity, 1);
  assert.equal(result.order.total, 8500);
});

test("2 - americana comun no doble corrige doble existente", async () => {
  resetSessionsForTests();

  const phone = "4020000002";

  await send(phone, "quiero una americana doble");
  const result = await send(phone, "americana común no doble");

  assert.equal(result.parsedMessage.intent, "CAMBIAR_PRODUCTO_DEL_PEDIDO");
  assert.match(result.reply, /Americana 2\.0 simple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_20_simple");
  assert.equal(result.order.total, 8500);
});

test("3 - correccion simple no doble no suma otra doble", async () => {
  resetSessionsForTests();

  const phone = "4020000003";

  await send(phone, "quiero camdis americana");
  const result = await send(phone, "americana simple no doble");

  assert.equal(result.parsedMessage.intent, "CAMBIAR_PRODUCTO_DEL_PEDIDO");
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_20_simple");
  assert.doesNotMatch(result.reply, /2 x Americana 2\.0 doble/i);
});

test("4 - americana simple no doble como primer mensaje agrega simple", async () => {
  resetSessionsForTests();

  const result = await send("4020000004", "americana simple no doble");

  assert.match(result.reply, /1 x Americana 2\.0 simple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_20_simple");
});
