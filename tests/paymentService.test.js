import test from "node:test";
import assert from "node:assert/strict";

import {
  addProductToOrder,
  confirmOrder,
  createEmptyOrder,
  setDeliveryData,
  setPaymentMethod
} from "../src/orders/orderService.js";
import { createPaymentPreferenceForOrder } from "../src/payments/paymentService.js";
import { getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

test("createPaymentPreferenceForOrder crea pago dry-run y lo guarda", async () => {
  resetSessionsForTests();

  const order = createEmptyOrder({
    customerPhone: "3819999999"
  });

  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 1 });
  setDeliveryData(order, { deliveryType: "RETIRO" });
  setPaymentMethod(order, "MERCADO_PAGO");
  confirmOrder(order);

  const result = await createPaymentPreferenceForOrder(order, {
    forceDryRun: true
  });

  assert.equal(result.isDryRun, true);
  assert.ok(result.initPoint);
  assert.match(result.initPoint, /dry-run/);

  const savedPayment = getPaymentRecordByOrderId(order.id);

  assert.ok(savedPayment);
  assert.equal(savedPayment.orderId, order.id);
  assert.equal(savedPayment.amount, 10000);
  assert.equal(savedPayment.status, "PENDING");
});

test("createPaymentPreferenceForOrder reutiliza pago pendiente existente", async () => {
  resetSessionsForTests();

  const order = createEmptyOrder({
    customerPhone: "3819999998"
  });

  await addProductToOrder(order, "cheeseburger_simple", { quantity: 1 });
  setDeliveryData(order, { deliveryType: "RETIRO" });
  setPaymentMethod(order, "MERCADO_PAGO");
  confirmOrder(order);

  const first = await createPaymentPreferenceForOrder(order, {
    forceDryRun: true
  });

  const second = await createPaymentPreferenceForOrder(order, {
    forceDryRun: true
  });

  assert.equal(second.alreadyExists, true);
  assert.equal(second.initPoint, first.initPoint);
});
