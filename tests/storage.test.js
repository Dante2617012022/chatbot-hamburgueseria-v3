import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyOrder, addProductToOrder } from "../src/orders/orderService.js";
import { getCustomerByPhone } from "../src/storage/customerRepository.js";
import {
  getActiveOrderByPhone,
  saveActiveOrder
} from "../src/storage/orderRepository.js";
import {
  getUnrecognizedMessages,
  saveUnrecognizedMessage
} from "../src/storage/messageRepository.js";
import {
  getOrCreateOrderSession,
  resetSessionsForTests,
  saveOrderSession
} from "../src/storage/sessionStore.js";

test("sessionStore crea y persiste un pedido activo", () => {
  resetSessionsForTests();

  const order = getOrCreateOrderSession("3812222222");

  assert.ok(order.id);
  assert.equal(order.customerPhone, "3812222222");

  const storedOrder = getActiveOrderByPhone("3812222222");

  assert.ok(storedOrder);
  assert.equal(storedOrder.id, order.id);
});

test("sessionStore recupera el mismo pedido activo", async () => {
  resetSessionsForTests();

  const order = getOrCreateOrderSession("3813333333");

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  saveOrderSession("3813333333", order);

  const recoveredOrder = getOrCreateOrderSession("3813333333");

  assert.equal(recoveredOrder.id, order.id);
  assert.equal(recoveredOrder.items.length, 1);
  assert.equal(recoveredOrder.total, 8000);
});

test("saveActiveOrder crea cliente asociado", () => {
  resetSessionsForTests();

  const order = createEmptyOrder({
    customerPhone: "3814444444"
  });

  order.customerName = "Juan";
  saveActiveOrder("3814444444", order);

  const customer = getCustomerByPhone("3814444444");

  assert.ok(customer);
  assert.equal(customer.phone, "3814444444");
  assert.equal(customer.name, "Juan");
});

test("saveUnrecognizedMessage guarda mensajes no entendidos", () => {
  resetSessionsForTests();

  saveUnrecognizedMessage({
    customerPhone: "3815555555",
    text: "asdfgh qwerty",
    parsedMessage: {
      intent: "NO_ENTENDIDO",
      status: "NO_MATCH",
      confidence: 0.2
    }
  });

  const messages = getUnrecognizedMessages();

  assert.equal(messages.length, 1);
  assert.equal(messages[0].customerPhone, "3815555555");
  assert.equal(messages[0].text, "asdfgh qwerty");
});
