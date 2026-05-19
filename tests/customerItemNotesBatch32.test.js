import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { extractItemNotes, removeItemNotesFromText } from "../src/orders/itemNotesService.js";
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

test("1 - extrae notas conocidas", () => {
  const notes = extractItemNotes("quiero una americana doble sin cebolla con extra queso bien cocida");

  assert.deepEqual(notes, ["sin cebolla", "bien cocida", "extra queso"]);
});

test("2 - limpia notas del texto para encontrar producto", () => {
  const cleaned = removeItemNotesFromText("quiero una americana doble sin cebolla con extra queso");

  assert.equal(cleaned, "quiero una americana doble");
});

test("3 - agrega producto con nota sin cebolla", async () => {
  resetSessionsForTests();

  const result = await send("4010000003", "quiero una americana doble sin cebolla");

  assert.match(result.reply, /1 x Americana 2\.0 doble/i);
  assert.match(result.reply, /Notas: sin cebolla/i);
  assert.equal(result.order.items[0].productId, "americana_20_doble");
  assert.deepEqual(result.order.items[0].notes, ["sin cebolla"]);
});

test("4 - combina notas y extras como observacion sin cambiar precio", async () => {
  resetSessionsForTests();

  const result = await send("4010000004", "preparame una bacon doble sin salsa extra queso");

  assert.match(result.reply, /1 x Bacon cheese doble/i);
  assert.match(result.reply, /Notas: sin salsa, extra queso/i);
  assert.equal(result.order.items[0].unitPrice, 10000);
  assert.equal(result.order.total, 10000);
});

test("5 - mismo producto con notas distintas queda en lineas separadas", async () => {
  resetSessionsForTests();

  const phone = "4010000005";

  await send(phone, "quiero una americana doble sin cebolla");
  const result = await send(phone, "agregame una americana doble sin salsa");

  assert.equal(result.order.items.length, 2);
  assert.deepEqual(result.order.items[0].notes, ["sin cebolla"]);
  assert.deepEqual(result.order.items[1].notes, ["sin salsa"]);
});

test("6 - multi producto aplica nota global a los productos del mensaje", async () => {
  resetSessionsForTests();

  const result = await send("4010000006", "quiero una americana doble y una crispy triple sin cebolla");

  assert.match(result.reply, /Americana 2\.0 doble/i);
  assert.match(result.reply, /Camdis crispy triple/i);
  assert.equal(result.order.items.length, 2);
  assert.deepEqual(result.order.items[0].notes, ["sin cebolla"]);
  assert.deepEqual(result.order.items[1].notes, ["sin cebolla"]);
});
