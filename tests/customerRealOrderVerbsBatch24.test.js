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

test("1 - hola preparame 3 americanas triples", async () => {
  resetSessionsForTests();

  const result = await send("3930000001", "hola preparame 3 americanas triples");

  assert.match(result.reply, /3 x Americana 2\.0 triple/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("2 - me preparas 2 americanas triples", async () => {
  resetSessionsForTests();

  const result = await send("3930000002", "me preparas 2 americanas triples");

  assert.match(result.reply, /2 x Americana 2\.0 triple/i);
  assert.match(result.reply, /delivery o retiro por el local/i);
});

test("3 - me preparas dos americanas triples", async () => {
  resetSessionsForTests();

  const result = await send("3930000003", "me preparas dos americanas triples");

  assert.match(result.reply, /2 x Americana 2\.0 triple/i);
  assert.match(result.reply, /forma de pago/i);
});

test("4 - voy a necesitar una crispy triple", async () => {
  resetSessionsForTests();

  const result = await send("3930000004", "voy a necesitar una crispy triple");

  assert.match(result.reply, /1 x Camdis crispy triple/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("5 - agrega segundo producto con voy a necesitar", async () => {
  resetSessionsForTests();

  const phone = "3930000005";

  await send(phone, "quiero una americana doble");

  const result = await send(phone, "voy a necesitar una crispy triple");

  assert.match(result.reply, /Americana 2\.0 doble/i);
  assert.match(result.reply, /Camdis crispy triple/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});
