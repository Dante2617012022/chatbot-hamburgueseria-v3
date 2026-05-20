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

function summaryOf(reply) {
  return String(reply || "").split("*Resumen de tu pedido*").at(-1);
}

test("1 - sacame nuggets y agregame papas actualiza ambos productos", async () => {
  resetSessionsForTests();

  const phone = "5200000001";

  await send(phone, "quiero nuggets x12 y una coca grande");
  const result = await send(phone, "sacame nuggets y agregame papas clasicas");

  const summary = summaryOf(result.reply);

  assert.equal(result.parsedMessage.intent, "MENSAJE_MIXTO_QUITAR_AGREGAR");
  assert.doesNotMatch(summary, /Nuggets/i);
  assert.match(summary, /Papas/i);
  assert.match(summary, /Gaseosa 1\.5L/i);
});
