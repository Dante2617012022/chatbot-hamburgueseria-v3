import { createEmptyOrder } from "../orders/orderService.js";

const sessions = new Map();

export function getOrCreateOrderSession(customerPhone) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  const existingOrder = sessions.get(customerPhone);

  if (existingOrder) {
    return existingOrder;
  }

  const newOrder = createEmptyOrder({ customerPhone });
  sessions.set(customerPhone, newOrder);

  return newOrder;
}

export function saveOrderSession(customerPhone, order) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  sessions.set(customerPhone, order);
  return order;
}

export function clearOrderSession(customerPhone) {
  sessions.delete(customerPhone);
}

export function getAllSessions() {
  return Array.from(sessions.entries()).map(([phone, order]) => ({
    phone,
    order
  }));
}

export function resetSessionsForTests() {
  sessions.clear();
}
