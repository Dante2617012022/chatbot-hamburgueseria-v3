import test from "node:test";
import assert from "node:assert/strict";

import { ORDER_STATUS } from "../src/orders/orderStatus.js";
import {
  addProductToOrder,
  cancelOrder,
  clearOrder,
  confirmOrder,
  createEmptyOrder,
  markAsPaid,
  removeProductFromOrder,
  setCustomerData,
  setDeliveryData,
  setPaymentMethod,
  updateItemQuantity
} from "../src/orders/orderService.js";
import {
  formatOrderForBusiness,
  formatOrderSummary
} from "../src/orders/orderFormatter.js";

test("createEmptyOrder crea un pedido vacío", () => {
  const order = createEmptyOrder({ customerPhone: "3811234567" });

  assert.ok(order.id);
  assert.equal(order.customerPhone, "3811234567");
  assert.equal(order.status, ORDER_STATUS.CREATED);
  assert.equal(order.items.length, 0);
  assert.equal(order.total, 0);
});

test("addProductToOrder agrega un producto y calcula total", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 2 });

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].productId, "cheeseburger_simple");
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.subtotal, 16000);
  assert.equal(order.total, 16000);
  assert.equal(order.status, ORDER_STATUS.BUILDING);
});

test("addProductToOrder acumula cantidad si es el mismo producto con mismas notas", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 1 });
  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 2 });

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 3);
  assert.equal(order.total, 30000);
});

test("addProductToOrder separa items si tienen notas distintas", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", {
    quantity: 1,
    notes: ["sin cebolla"]
  });

  await addProductToOrder(order, "cheeseburger_simple", {
    quantity: 1,
    notes: ["sin tomate"]
  });

  assert.equal(order.items.length, 2);
  assert.equal(order.total, 16000);
});

test("removeProductFromOrder quita una cantidad parcial", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "papas_clasicas", { quantity: 3 });

  const result = removeProductFromOrder(order, "papas_clasicas", { quantity: 1 });

  assert.equal(result.removed, true);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.total, 12000);
});

test("removeProductFromOrder elimina el producto completo", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "papas_clasicas", { quantity: 1 });

  const result = removeProductFromOrder(order, "papas_clasicas");

  assert.equal(result.removed, true);
  assert.equal(order.items.length, 0);
  assert.equal(order.total, 0);
  assert.equal(order.status, ORDER_STATUS.CREATED);
});

test("updateItemQuantity cambia cantidad y total", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "bebida_15l", { quantity: 1 });

  const result = updateItemQuantity(order, "bebida_15l", 3);

  assert.equal(result.updated, true);
  assert.equal(order.items[0].quantity, 3);
  assert.equal(order.total, 10500);
});

test("setDeliveryData deja delivery sin costo", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: "Av. Siempre Viva 123",
    deliveryCost: 1000
  });

  assert.equal(order.deliveryType, "DELIVERY");
  assert.equal(order.deliveryCost, 0);
  assert.equal(order.total, 8000);
});

test("confirmOrder deja el pedido esperando pago si es Mercado Pago", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  setCustomerData(order, { customerName: "Juan", customerPhone: "3811234567" });
  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: "Av. Siempre Viva 123",
    deliveryCost: 1000
  });
  setPaymentMethod(order, "MERCADO_PAGO");

  confirmOrder(order);

  assert.equal(order.status, ORDER_STATUS.WAITING_PAYMENT);
  assert.ok(order.confirmedAt);
});

test("markAsPaid marca pedido como pagado", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  setDeliveryData(order, { deliveryType: "RETIRO" });
  setPaymentMethod(order, "MERCADO_PAGO");
  confirmOrder(order);
  markAsPaid(order);

  assert.equal(order.status, ORDER_STATUS.PAID);
});

test("cancelOrder cancela pedido", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  cancelOrder(order, { reason: "Cliente canceló" });

  assert.equal(order.status, ORDER_STATUS.CANCELLED);
  assert.ok(order.cancelledAt);
  assert.ok(order.notes.some((note) => note.includes("Cliente canceló")));
});

test("clearOrder vacía el carrito", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  clearOrder(order);

  assert.equal(order.items.length, 0);
  assert.equal(order.total, 0);
  assert.equal(order.status, ORDER_STATUS.CREATED);
});

test("formatOrderSummary genera resumen para cliente", async () => {
  const order = createEmptyOrder();

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  setDeliveryData(order, { deliveryType: "RETIRO" });
  setPaymentMethod(order, "EFECTIVO");

  const text = formatOrderSummary(order);

  assert.match(text, /Resumen de tu pedido/);
  assert.match(text, /Cheeseburger simple/);
  assert.match(text, /Total/);
});

test("formatOrderForBusiness genera resumen para el local", async () => {
  const order = createEmptyOrder({ customerPhone: "3811234567" });

  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 1 });
  setCustomerData(order, { customerName: "Juan" });
  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: "Av. Siempre Viva 123",
    deliveryCost: 1000
  });
  setPaymentMethod(order, "MERCADO_PAGO");

  const text = formatOrderForBusiness(order);

  assert.match(text, /NUEVO PEDIDO/);
  assert.match(text, /Bacon cheese doble/);
  assert.match(text, /Juan/);
  assert.match(text, /Av. Siempre Viva 123/);
});
