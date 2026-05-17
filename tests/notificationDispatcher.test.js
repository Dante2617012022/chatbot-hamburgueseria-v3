import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalNotificationForOrder,
  NOTIFICATION_TYPE
} from "../src/notifications/notificationService.js";
import {
  getPendingLocalNotifications,
  getNotificationsByOrderId
} from "../src/notifications/notificationRepository.js";
import { dispatchPendingLocalNotifications } from "../src/notifications/notificationDispatcher.js";
import {
  addProductToOrder,
  confirmOrder,
  createEmptyOrder,
  setDeliveryData,
  setPaymentMethod
} from "../src/orders/orderService.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

async function createConfirmedOrder() {
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

test("dispatchPendingLocalNotifications marca INTERNAL como SENT en dry-run", async () => {
  resetSessionsForTests();

  const order = await createConfirmedOrder();

  createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_CONFIRMED,
    channel: "INTERNAL"
  });

  let pending = getPendingLocalNotifications();
  assert.equal(pending.length, 1);

  const result = await dispatchPendingLocalNotifications({
    channel: "INTERNAL",
    dryRun: true
  });

  assert.equal(result.totalProcessed, 1);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[0].notification.status, "SENT");

  pending = getPendingLocalNotifications();
  assert.equal(pending.length, 0);
});

test("dispatchPendingLocalNotifications puede enviar WHATSAPP con sender mock", async () => {
  resetSessionsForTests();

  const order = await createConfirmedOrder();
  const sentMessages = [];

  createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_CONFIRMED,
    channel: "WHATSAPP",
    destination: "5491111111111"
  });

  const result = await dispatchPendingLocalNotifications({
    channel: "WHATSAPP",
    dryRun: false,
    sendText: async ({ destination, message }) => {
      sentMessages.push({
        destination,
        message
      });
    }
  });

  assert.equal(result.totalProcessed, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].destination, "5491111111111");
  assert.match(sentMessages[0].message, /PEDIDO CONFIRMADO/);

  const notifications = getNotificationsByOrderId(order.id);
  assert.equal(notifications[0].status, "SENT");
});
