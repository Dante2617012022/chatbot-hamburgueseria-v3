import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { ORDER_STATUS } from "../src/orders/orderStatus.js";

test("handleCustomerMessage responde menú", async () => {
  resetSessionsForTests();

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "pasame el menú"
  });

  assert.match(result.reply, /Camdis Hamburguesas/);
  assert.match(result.reply, /Cheeseburger simple/);
});

test("handleCustomerMessage agrega producto al pedido", async () => {
  resetSessionsForTests();

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una bacon doble"
  });

  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "bacon_cheese_doble");
  assert.match(result.reply, /Agregué/);
  assert.match(result.reply, /Bacon cheese doble/);
});

test("handleCustomerMessage acumula productos en la misma sesión", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una bacon doble"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "sumame 2 cheese simple"
  });

  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.total, 26000);
});

test("handleCustomerMessage quita producto del pedido", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una bacon doble"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "sacame bacon doble"
  });

  assert.equal(result.order.items.length, 0);
  assert.match(result.reply, /Quité/);
});

test("handleCustomerMessage marca retiro", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "retiro por el local"
  });

  assert.equal(result.order.deliveryType, "RETIRO");
  assert.match(result.reply, /retiro por el local/i);
});

test("handleCustomerMessage marca delivery con dirección", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "delivery a avenida siempre viva 123"
  });

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "avenida siempre viva 123");
  assert.match(result.reply, /avenida siempre viva 123/);
});

test("handleCustomerMessage marca forma de pago", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "pago con mercado pago"
  });

  assert.equal(result.order.paymentMethod, "MERCADO_PAGO");
  assert.match(result.reply, /Mercado Pago/);
});

test("handleCustomerMessage pide datos faltantes al confirmar", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "confirmo"
  });

  assert.match(result.reply, /delivery|retiro/i);
});

test("handleCustomerMessage confirma pedido completo con Mercado Pago", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "retiro por el local"
  });

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "pago con mercado pago"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "confirmo"
  });

  assert.equal(result.order.status, ORDER_STATUS.WAITING_PAYMENT);
  assert.match(result.reply, /Pedido confirmado/);
});

test("handleCustomerMessage cancela pedido y limpia sesión", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "quiero una cheese simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: "3811111111",
    messageText: "cancelar pedido"
  });

  assert.equal(result.order.status, ORDER_STATUS.CANCELLED);
  assert.match(result.reply, /cancelé tu pedido/i);
});
