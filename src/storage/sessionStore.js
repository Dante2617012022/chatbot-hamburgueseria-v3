import { createEmptyOrder } from "../orders/orderService.js";
import {
  clearActiveOrdersForTests,
  deleteActiveOrderByPhone,
  getActiveOrderByPhone,
  getAllActiveOrders,
  saveActiveOrder
} from "./orderRepository.js";
import { clearMessageEventsForTests } from "./messageRepository.js";
import { clearCustomersForTests } from "./customerRepository.js";
import { clearPaymentRecordsForTests } from "../payments/paymentRepository.js";
import { clearLocalNotificationsForTests } from "../notifications/notificationRepository.js";
import { clearSettingsForTests } from "./settingsRepository.js";

export function getOrCreateOrderSession(customerPhone) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  const existingOrder = getActiveOrderByPhone(customerPhone);

  if (existingOrder) {
    return existingOrder;
  }

  const newOrder = createEmptyOrder({ customerPhone });
  saveActiveOrder(customerPhone, newOrder);

  return newOrder;
}

export function saveOrderSession(customerPhone, order) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  return saveActiveOrder(customerPhone, order);
}

export function clearOrderSession(customerPhone) {
  deleteActiveOrderByPhone(customerPhone);
}

export function getAllSessions() {
  return getAllActiveOrders();
}

export function resetSessionsForTests() {
  clearSettingsForTests();
  clearLocalNotificationsForTests();
  clearPaymentRecordsForTests();
  clearActiveOrdersForTests();
  clearMessageEventsForTests();
  clearCustomersForTests();
}
