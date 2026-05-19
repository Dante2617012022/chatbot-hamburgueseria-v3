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

test("1 - pedido ambiguo multiple pide aclaracion y no agrega", async () => {
  resetSessionsForTests();

  const result = await send("4080000001", "quiero cheeseburger y nuggets");

  assert.equal(result.parsedMessage.intent, "ACLARAR_PRODUCTOS_MULTIPLES");
  assert.equal(result.order.items.length, 0);
  assert.match(result.reply, /cheeseburger/i);
  assert.match(result.reply, /Cheeseburger simple/i);
  assert.match(result.reply, /Cheeseburger doble/i);
  assert.match(result.reply, /Cheeseburger triple/i);
  assert.match(result.reply, /nuggets/i);
  assert.match(result.reply, /Nuggets x6/i);
  assert.match(result.reply, /Nuggets x12/i);
});

test("2 - respuesta a aclaracion multiple agrega productos elegidos", async () => {
  resetSessionsForTests();

  const phone = "4080000002";

  await send(phone, "voy a encargar cuatro cheeseburger y nuggets");
  const result = await send(phone, "dobles y x6");

  assert.equal(result.parsedMessage.intent, "CONFIRMAR_ACLARACION_PRODUCTOS_MULTIPLES");
  assert.match(result.reply, /4 x Cheeseburger doble/i);
  assert.match(result.reply, /1 x Nuggets x6/i);
  assert.equal(result.order.items.length, 2);

  const cheeseburger = result.order.items.find((item) => item.productId === "cheeseburger_doble");
  const nuggets = result.order.items.find((item) => item.productId === "nuggets_x6");

  assert.equal(cheeseburger?.quantity, 4);
  assert.equal(nuggets?.quantity, 1);
});

test("3 - respuesta por numero a aclaracion simple agrega producto elegido", async () => {
  resetSessionsForTests();

  const phone = "4080000003";

  await send(phone, "quiero nuggets");
  const result = await send(phone, "1");

  assert.equal(result.parsedMessage.intent, "CONFIRMAR_SUGERENCIA_PRODUCTO");
  assert.match(result.reply, /Nuggets x6/i);
});
