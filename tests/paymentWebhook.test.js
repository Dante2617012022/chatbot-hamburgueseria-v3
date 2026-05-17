import test from "node:test";
import assert from "node:assert/strict";

import {
  addProductToOrder,
  confirmOrder,
  createEmptyOrder,
  setDeliveryData,
  setPaymentMethod
} from "../src/orders/orderService.js";
import { ORDER_STATUS } from "../src/orders/orderStatus.js";
import {
  approveDryRunPaymentByOrderId,
  createPaymentPreferenceForOrder,
  processMercadoPagoWebhook
} from "../src/payments/paymentService.js";
import { getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import {
  getActiveOrderByOrderId,
  saveActiveOrder
} from "../src/storage/orderRepository.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

async function createConfirmedMercadoPagoOrder() {
  const order = createEmptyOrder({
    customerPhone: "3817777777"
  });

  await addProductToOrder(order, "bacon_cheese_doble", {
    quantity: 1
  });

  setDeliveryData(order, {
    deliveryType: "RETIRO"
  });

  setPaymentMethod(order, "MERCADO_PAGO");
  confirmOrder(order);
  saveActiveOrder(order.customerPhone, order);

  await createPaymentPreferenceForOrder(order, {
    forceDryRun: true
  });

  return order;
}

test("approveDryRunPaymentByOrderId marca pago aprobado y pedido pagado", async () => {
  resetSessionsForTests();

  const order = await createConfirmedMercadoPagoOrder();

  const result = approveDryRunPaymentByOrderId(order.id);

  assert.equal(result.orderUpdated, true);
  assert.equal(result.payment.status, "APPROVED");
  assert.equal(result.order.status, ORDER_STATUS.PAID);

  const storedPayment = getPaymentRecordByOrderId(order.id);
  const storedOrder = getActiveOrderByOrderId(order.id);

  assert.equal(storedPayment.status, "APPROVED");
  assert.equal(storedOrder.status, ORDER_STATUS.PAID);
});

test("processMercadoPagoWebhook en dry-run no consulta Mercado Pago", async () => {
  resetSessionsForTests();

  const result = await processMercadoPagoWebhook({
    body: {
      type: "payment",
      data: {
        id: "123456"
      }
    }
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "DRY_RUN_MODE_DOES_NOT_QUERY_MERCADO_PAGO");
  assert.equal(result.paymentId, "123456");
});
