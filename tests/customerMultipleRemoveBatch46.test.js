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

test("1 - saca nuggets y papas elimina dos productos", async () => {
  resetSessionsForTests();

  const phone = "4084000001";

  await send(phone, "quiero una bacon doble");
  await send(phone, "quiero nuggets x6");
  await send(phone, "quiero papas clasicas");
  const result = await send(phone, "saca nuggets y papas");

  assert.equal(result.parsedMessage.intent, "QUITAR_PRODUCTOS_MULTIPLES_DEL_PEDIDO");
  assert.match(result.reply, /Bacon cheese doble/i);
  assert.doesNotMatch(result.reply, /Nuggets x6/i);
  assert.doesNotMatch(result.reply, /Papas clasicas/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "bacon_cheese_doble");
});

test("2 - restale 2 americanas y 1 onion respeta cantidades", async () => {
  resetSessionsForTests();

  const phone = "4084000002";

  await send(phone, "quiero 3 americanas triples y 2 onion dobles");
  const result = await send(phone, "restale 2 americanas y 1 onion");

  assert.equal(result.parsedMessage.intent, "QUITAR_PRODUCTOS_MULTIPLES_DEL_PEDIDO");

  const americana = result.order.items.find((item) => item.productId === "americana_20_triple");
  const onion = result.order.items.find((item) => item.productId === "onion_doble");

  assert.equal(americana?.quantity, 1);
  assert.equal(onion?.quantity, 1);
});

test("3 - bajale una lata elimina una bebida", async () => {
  resetSessionsForTests();

  const phone = "4084000003";

  await send(phone, "quiero tres latas");
  await send(phone, "quiero una cheeseburger doble");
  const result = await send(phone, "bajale una lata");

  assert.equal(result.parsedMessage.intent, "QUITAR_PRODUCTOS_MULTIPLES_DEL_PEDIDO");

  const lata = result.order.items.find((item) => item.productId === "lata");
  assert.equal(lata?.quantity, 2);
});

test("4 - sacame las dos sin nombrar producto vacia pedido corto", async () => {
  resetSessionsForTests();

  const phone = "4084000004";

  await send(phone, "quiero una bacon doble y una lata");
  const result = await send(phone, "sacame las dos");

  assert.equal(result.parsedMessage.intent, "QUITAR_TODO_POR_CANTIDAD_DEL_PEDIDO");
  assert.equal(result.order.items.length, 0);
  assert.match(result.reply, /pedido está vacío|pedido esta vacio/i);
});
