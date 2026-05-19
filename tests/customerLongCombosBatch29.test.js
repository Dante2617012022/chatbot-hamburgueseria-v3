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

test("1 - combo largo crispy triples gaseosas pepsi y papa gratinada", async () => {
  resetSessionsForTests();

  const result = await send(
    "3980000001",
    "quiero encargar 4 crispy triples, dos gaseosas grandes pepsi y una papa gratinada"
  );

  assert.match(result.reply, /4 x Camdis crispy triple/i);
  assert.match(result.reply, /2 x Gaseosa 1\.5L/i);
  assert.match(result.reply, /1 x Papas gratinadas/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
});

test("2 - combo largo con pepsi grande singular", async () => {
  resetSessionsForTests();

  const result = await send(
    "3980000002",
    "quiero encargar una crispy triple, una pepsi grande y una papa gratinada"
  );

  assert.match(result.reply, /1 x Camdis crispy triple/i);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
  assert.match(result.reply, /1 x Papas gratinadas/i);
});

test("3 - combo largo completo con delivery y mp", async () => {
  resetSessionsForTests();

  const result = await send(
    "3980000003",
    "quiero encargar 4 crispy triples, dos gaseosas grandes pepsi y una papa gratinada delivery a centenario 49 mp"
  );

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "centenario 49");
  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /4 x Camdis crispy triple/i);
  assert.match(result.reply, /2 x Gaseosa 1\.5L/i);
  assert.match(result.reply, /1 x Papas gratinadas/i);
  assert.match(result.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);
});
