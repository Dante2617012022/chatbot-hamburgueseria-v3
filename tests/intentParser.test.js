import test from "node:test";
import assert from "node:assert/strict";

import { parseCustomerMessage } from "../src/ai/intentParser.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

test("parseCustomerMessage detecta pedido de menú", async () => {
  const result = await parseCustomerMessage("pasame el menú");

  assert.equal(result.intent, CUSTOMER_INTENT.VIEW_MENU);
  assert.equal(result.status, "OK");
});

test("parseCustomerMessage detecta agregar producto con cantidad escrita en número", async () => {
  const result = await parseCustomerMessage("sumame 2 cheese simple");

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.quantity, 2);
  assert.equal(result.entities.product.id, "cheeseburger_simple");
});

test("parseCustomerMessage detecta agregar producto con frase natural", async () => {
  const result = await parseCustomerMessage("quiero una bacon doble");

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.quantity, 1);
  assert.equal(result.entities.product.id, "bacon_cheese_doble");
});

test("parseCustomerMessage detecta producto escrito solo", async () => {
  const result = await parseCustomerMessage("big camdis triple");

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.product.id, "big_camdis_triple");
});

test("parseCustomerMessage detecta quitar producto", async () => {
  const result = await parseCustomerMessage("sacame las papitas");

  assert.equal(result.intent, CUSTOMER_INTENT.REMOVE_PRODUCT);
  assert.equal(result.entities.product.id, "papas_clasicas");
});

test("parseCustomerMessage detecta pedir total", async () => {
  const result = await parseCustomerMessage("cuánto es todo?");

  assert.equal(result.intent, CUSTOMER_INTENT.ASK_TOTAL);
});

test("parseCustomerMessage detecta confirmación", async () => {
  const result = await parseCustomerMessage("confirmo");

  assert.equal(result.intent, CUSTOMER_INTENT.CONFIRM_ORDER);
});

test("parseCustomerMessage detecta cancelación", async () => {
  const result = await parseCustomerMessage("cancelar pedido");

  assert.equal(result.intent, CUSTOMER_INTENT.CANCEL_ORDER);
});

test("parseCustomerMessage detecta retiro por local", async () => {
  const result = await parseCustomerMessage("retiro por el local");

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_PICKUP);
  assert.equal(result.entities.deliveryType, "RETIRO");
});

test("parseCustomerMessage detecta delivery", async () => {
  const result = await parseCustomerMessage("delivery a avenida siempre viva 123");

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_DELIVERY);
  assert.equal(result.entities.deliveryType, "DELIVERY");
});

test("parseCustomerMessage detecta Mercado Pago", async () => {
  const result = await parseCustomerMessage("pago con mercado pago");

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(result.entities.paymentMethod, "MERCADO_PAGO");
});

test("parseCustomerMessage detecta efectivo", async () => {
  const result = await parseCustomerMessage("pago en efectivo");

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(result.entities.paymentMethod, "EFECTIVO");
});

test("parseCustomerMessage detecta hablar con persona", async () => {
  const result = await parseCustomerMessage("quiero hablar con una persona");

  assert.equal(result.intent, CUSTOMER_INTENT.TALK_TO_HUMAN);
});

test("parseCustomerMessage devuelve NO_ENTENDIDO si no reconoce nada", async () => {
  const result = await parseCustomerMessage("asdfgh qwerty");

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
});
