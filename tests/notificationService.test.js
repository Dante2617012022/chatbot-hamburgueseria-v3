import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import {
  addProductToOrder,
  confirmOrder,
  createEmptyOrder,
  setDeliveryData,
  setPaymentMethod
} from "../src/orders/orderService.js";
import { ORDER_STATUS } from "../src/orders/orderStatus.js";
import {
  createLocalNotificationForOrder,
  NOTIFICATION_TYPE
} from "../src/notifications/notificationService.js";
import {
  getNotificationsByOrderId,
  getPendingLocalNotifications,
  markLocalNotificationSent
} from "../src/notifications/notificationRepository.js";
import {
  approveDryRunPaymentByOrderId,
  createPaymentPreferenceForOrder
} from "../src/payments/paymentService.js";
import { saveActiveOrder } from "../src/storage/orderRepository.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

async function createOrderForNotification() {
  const order = createEmptyOrder({
    customerPhone: "3818888888"
  });

  await addProductToOrder(order, "bacon_cheese_doble", {
    quantity: 1
  });

  setDeliveryData(order, {
    deliveryType: "RETIRO"
  });

  setPaymentMethod(order, "EFECTIVO");
  confirmOrder(order);

  return order;
}

test("createLocalNotificationForOrder crea notificación interna", async () => {
  resetSessionsForTests();

  const order = await createOrderForNotification();

  const notification = createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_CONFIRMED
  });

  assert.ok(notification.id);
  assert.equal(notification.orderId, order.id);
  assert.equal(notification.type, NOTIFICATION_TYPE.ORDER_CONFIRMED);
  assert.equal(notification.status, "PENDING");
  assert.match(notification.message, /PEDIDO CONFIRMADO/);
  assert.match(notification.message, /Bacon cheese doble/);
});

test("getPendingLocalNotifications devuelve notificaciones pendientes", async () => {
  resetSessionsForTests();

  const order = await createOrderForNotification();

  createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_CONFIRMED
  });

  const pending = getPendingLocalNotifications();

  assert.equal(pending.length, 1);
  assert.equal(pending[0].orderId, order.id);
});

test("markLocalNotificationSent marca notificación enviada", async () => {
  resetSessionsForTests();

  const order = await createOrderForNotification();

  const notification = createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_CONFIRMED
  });

  const sentNotification = markLocalNotificationSent(notification.id);

  assert.equal(sentNotification.status, "SENT");
  assert.ok(sentNotification.sentAt);
});

test("pedido confirmado con efectivo crea notificación ORDER_CONFIRMED", async () => {
  resetSessionsForTests();

  const phone = "3811231231";

  await handleCustomerMessage({
    customerPhone: phone,
    messageText: "quiero una bacon doble"
  });

  await handleCustomerMessage({
    customerPhone: phone,
    messageText: "retiro por el local"
  });

  await handleCustomerMessage({
    customerPhone: phone,
    messageText: "pago en efectivo"
  });

  const result = await handleCustomerMessage({
    customerPhone: phone,
    messageText: "confirmo"
  });

  const notifications = getNotificationsByOrderId(result.order.id);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, NOTIFICATION_TYPE.ORDER_CONFIRMED);
  assert.match(notifications[0].message, /PEDIDO CONFIRMADO/);
});

test("pago aprobado crea notificación ORDER_PAID", async () => {
  resetSessionsForTests();

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

  const result = approveDryRunPaymentByOrderId(order.id);

  assert.equal(result.order.status, ORDER_STATUS.PAID);
  assert.ok(result.notification);
  assert.equal(result.notification.type, NOTIFICATION_TYPE.ORDER_PAID);

  const notifications = getNotificationsByOrderId(order.id);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, NOTIFICATION_TYPE.ORDER_PAID);
  assert.match(notifications[0].message, /PEDIDO PAGADO/);
});
