import test from "node:test";
import assert from "node:assert/strict";

import { parseCustomerMessage } from "../src/ai/intentParser.js";
import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

async function send(phone, messageText) {
  return handleCustomerMessage({ customerPhone: phone, messageText });
}

test("1 - me preparan 2 americanas triples", async () => {
  const parsed = await parseCustomerMessage("hola me preparan 2 americanas triples");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 2);
  assert.equal(parsed.entities.product.id, "americana_2_0_triple");
});

test("2 - preparame una onion doble", async () => {
  const parsed = await parseCustomerMessage("preparame una onion doble");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 1);
  assert.equal(parsed.entities.product.id, "onion_doble");
});

test("3 - me arman dos bacon triples", async () => {
  const parsed = await parseCustomerMessage("me arman dos bacon triples");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 2);
  assert.equal(parsed.entities.product.id, "bacon_cheese_triple");
});

test("4 - añade una lata", async () => {
  const parsed = await parseCustomerMessage("añade una lata");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 1);
  assert.equal(parsed.entities.product.id, "lata");
});

test("5 - adiciona dos nuggets x6", async () => {
  const parsed = await parseCustomerMessage("adiciona dos nuggets x6");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 2);
  assert.equal(parsed.entities.product.id, "nuggets_x6");
});

test("6 - flujo real agrega americanas triples", async () => {
  resetSessionsForTests();

  const result = await send("4083000001", "hola me preparan 2 americanas triples");

  assert.equal(result.parsedMessage.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.match(result.reply, /2 x Americana 2\.0 triple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_2_0_triple");
  assert.equal(result.order.items[0].quantity, 2);
});
