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

test("1 - hola te voy a pedir dos bacon triples y una coca grande", async () => {
  resetSessionsForTests();

  const result = await send("3960000001", "hola! te voy a pedir dos bacon triples y una coca grande");

  assert.match(result.reply, /2 x Bacon cheese triple/i);
  assert.match(result.reply, /1 x Gaseosa 1\.5L|1 x Coca Cola 1\.5L|1 x Coca/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("2 - te voy a pedir dos bacon triples y una coca grande", async () => {
  resetSessionsForTests();

  const result = await send("3960000002", "te voy a pedir dos bacon triples y una coca grande");

  assert.match(result.reply, /2 x Bacon cheese triple/i);
  assert.match(result.reply, /Gaseosa 1\.5L|Coca/i);
  assert.match(result.reply, /delivery o retiro por el local/i);
});

test("3 - te quiero pedir dos bacon triples y una coca grande", async () => {
  resetSessionsForTests();

  const result = await send("3960000003", "te quiero pedir dos bacon triples y una coca grande");

  assert.match(result.reply, /2 x Bacon cheese triple/i);
  assert.match(result.reply, /Gaseosa 1\.5L|Coca/i);
  assert.match(result.reply, /forma de pago/i);
});

test("4 - voy a pedir una americana doble", async () => {
  resetSessionsForTests();

  const result = await send("3960000004", "voy a pedir una americana doble");

  assert.match(result.reply, /1 x Americana 2\.0 doble/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("5 - quiero pedir una crispy triple", async () => {
  resetSessionsForTests();

  const result = await send("3960000005", "quiero pedir una crispy triple");

  assert.match(result.reply, /1 x Camdis crispy triple/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});
