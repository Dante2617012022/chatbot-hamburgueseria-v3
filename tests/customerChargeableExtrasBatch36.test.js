import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { buildChargeableExtrasFromNotes } from "../src/orders/chargeableExtrasService.js";
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

test("1 - extra queso genera extra cobrable", async () => {
  const extras = await buildChargeableExtrasFromNotes(["extra queso"]);

  assert.equal(extras.length, 1);
  assert.equal(extras[0].productId, "queso_extra");
  assert.equal(extras[0].unitPrice, 1000);
});

test("2 - extra queso suma precio al producto", async () => {
  resetSessionsForTests();

  const result = await send("4040000002", "preparame una bacon doble extra queso");

  assert.match(result.reply, /1 x Bacon cheese doble/i);
  assert.match(result.reply, /Extra: Queso extra — \$1\.000/i);
  assert.equal(result.order.items[0].unitPrice, 10000);
  assert.equal(result.order.items[0].extras[0].productId, "queso_extra");
  assert.equal(result.order.items[0].subtotal, 11000);
  assert.equal(result.order.total, 11000);
});

test("3 - extra bacon y extra carne suman ambos", async () => {
  resetSessionsForTests();

  const result = await send("4040000003", "quiero una americana doble extra bacon extra carne");

  assert.match(result.reply, /Extra: Bacon extra — \$1\.000/i);
  assert.match(result.reply, /Extra: Carne extra — \$2\.300/i);
  assert.equal(result.order.items[0].subtotal, 13300);
  assert.equal(result.order.total, 13300);
});

test("4 - salsa extra suma 500", async () => {
  resetSessionsForTests();

  const result = await send("4040000004", "quiero una crispy triple salsa extra");

  assert.match(result.reply, /Extra: Salsa extra — \$500/i);
  assert.equal(result.order.items[0].subtotal, 12500);
});

test("5 - sin queso no cobra queso extra", async () => {
  resetSessionsForTests();

  const result = await send("4040000005", "quiero una americana doble sin queso");

  assert.match(result.reply, /Notas: sin queso/i);
  assert.doesNotMatch(result.reply, /Extra: Queso extra/i);
  assert.equal(result.order.items[0].extras.length, 0);
  assert.equal(result.order.total, 10000);
});

test("6 - dos unidades cobran extras por unidad", async () => {
  resetSessionsForTests();

  const result = await send("4040000006", "quiero dos bacon dobles extra queso");

  assert.match(result.reply, /2 x Bacon cheese doble/i);
  assert.match(result.reply, /Extra: Queso extra — \$1\.000/i);
  assert.equal(result.order.items[0].quantity, 2);
  assert.equal(result.order.items[0].subtotal, 22000);
  assert.equal(result.order.total, 22000);
});
