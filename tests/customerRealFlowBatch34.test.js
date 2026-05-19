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

test("1 - gaseosa venden consulta disponibilidad sin agregar", async () => {
  resetSessionsForTests();

  const result = await send("4030000001", "Gaseosa venden?");

  assert.match(result.reply, /Gaseosa 1\.5L|Lata|vendemos|tenemos/i);
  assert.equal(result.order.items.length, 0);
});

test("2 - una sola gaseosa deja cantidad en 1", async () => {
  resetSessionsForTests();

  const phone = "4030000002";

  await send(phone, "quiero dos gaseosas grandes");
  const result = await send(phone, "una sola gaseosa");

  assert.equal(result.parsedMessage.intent, "AJUSTAR_CANTIDAD_PRODUCTO");
  assert.equal(result.order.items.length, 1);
  assert.match(result.reply, /1 x Gaseosa 1\.5L/i);
  assert.equal(result.order.items[0].quantity, 1);
  assert.equal(result.order.total, 3500);
});

test("3 - 1 gaseosa no 2 deja cantidad en 1", async () => {
  resetSessionsForTests();

  const phone = "4030000003";

  await send(phone, "quiero dos gaseosas grandes");
  const result = await send(phone, "1 gaseosa no 2");

  assert.equal(result.parsedMessage.intent, "AJUSTAR_CANTIDAD_PRODUCTO");
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].quantity, 1);
  assert.equal(result.order.total, 3500);
});

test("4 - ok restame 2 gaseosas quita dos unidades", async () => {
  resetSessionsForTests();

  const phone = "4030000004";

  await send(phone, "quiero tres gaseosas grandes y una cheeseburger triple");
  const result = await send(phone, "Ok restame 2 gaseosas");

  assert.equal(result.parsedMessage.intent, "QUITAR_PRODUCTO_DEL_PEDIDO");
  assert.match(result.reply, /Gaseosa 1\.5L/i);
  assert.equal(result.order.items.find((item) => item.productId === "gaseosa_15l")?.quantity, 1);
});

test("5 - delibery se entiende como delivery", async () => {
  resetSessionsForTests();

  const phone = "4030000005";

  await send(phone, "quiero una cheeseburger triple");
  const result = await send(phone, "Delibery");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.match(result.reply, /Entrega: Delivery|delivery/i);
});

test("6 - delivwry se entiende como delivery", async () => {
  resetSessionsForTests();

  const phone = "4030000006";

  await send(phone, "quiero una cheeseburger triple");
  const result = await send(phone, "Delivwry");

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.match(result.reply, /Entrega: Delivery|delivery/i);
});
