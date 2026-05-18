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

test("1 - hola te puedo encargar 2 americanas dobles", async () => {
  resetSessionsForTests();

  const result = await send("3950000001", "hola te puedo encargar 2 americanas dobles");

  assert.match(result.reply, /2 x Americana 2\.0 doble/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("2 - te encargo dos americanas dobles", async () => {
  resetSessionsForTests();

  const result = await send("3950000002", "te encargo dos americanas dobles");

  assert.match(result.reply, /2 x Americana 2\.0 doble/i);
  assert.match(result.reply, /delivery o retiro por el local/i);
});

test("3 - puedo encargarte una crispy triple", async () => {
  resetSessionsForTests();

  const result = await send("3950000003", "puedo encargarte una crispy triple");

  assert.match(result.reply, /1 x Camdis crispy triple/i);
  assert.match(result.reply, /forma de pago/i);
});

test("4 - encargar cuarto a doble y una papa gratinada", async () => {
  resetSessionsForTests();

  const result = await send("3950000004", "encargar cuarto a doble y una papa gratinada");

  assert.match(result.reply, /1 x Cuarto A doble/i);
  assert.match(result.reply, /1 x Papas gratinadas/i);
});
