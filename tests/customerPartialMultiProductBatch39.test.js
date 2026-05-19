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

test("1 - combo parcial no ignora nuggets ambiguos", async () => {
  resetSessionsForTests();

  const result = await send(
    "4060000001",
    "quiero 2 onion triples, 4 nuggets y una pepsi grande"
  );

  assert.equal(result.parsedMessage.intent, "AGREGAR_PRODUCTOS_MULTIPLES");
  assert.equal(result.parsedMessage.status, "PARTIAL_MATCH");
  assert.match(result.reply, /2 x Onion triple/i);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
  assert.match(result.reply, /4 nuggets/i);
  assert.match(result.reply, /Nuggets x6/i);
  assert.match(result.reply, /Nuggets x12/i);
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.items.some((item) => item.productId === "nuggets_x6"), false);
  assert.equal(result.order.items.some((item) => item.productId === "nuggets_x12"), false);
});

test("2 - nuggets explicitos siguen agregando normal", async () => {
  resetSessionsForTests();

  const result = await send(
    "4060000002",
    "quiero 2 onion triples, 2 nuggets x6 y una pepsi grande"
  );

  assert.equal(result.parsedMessage.intent, "AGREGAR_PRODUCTOS_MULTIPLES");
  assert.match(result.reply, /2 x Onion triple/i);
  assert.match(result.reply, /2 x Nuggets x6/i);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
  assert.doesNotMatch(result.reply, /no estoy seguro/i);
  assert.equal(result.order.items.length, 3);
});
