import { getDatabase } from "./database.js";
import { upsertCustomer } from "./customerRepository.js";

export function saveActiveOrder(customerPhone, order) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  if (!order || typeof order !== "object") {
    throw new Error("order es obligatorio.");
  }

  upsertCustomer({
    phone: customerPhone,
    name: order.customerName || null
  });

  const now = new Date().toISOString();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO active_orders (
      customer_phone,
      order_id,
      status,
      order_json,
      created_at,
      updated_at
    )
    VALUES (
      @customerPhone,
      @orderId,
      @status,
      @orderJson,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(customer_phone) DO UPDATE SET
      order_id = excluded.order_id,
      status = excluded.status,
      order_json = excluded.order_json,
      updated_at = excluded.updated_at
  `).run({
    customerPhone,
    orderId: order.id,
    status: order.status,
    orderJson: JSON.stringify(order),
    createdAt: order.createdAt || now,
    updatedAt: now
  });

  return order;
}

export function getActiveOrderByPhone(customerPhone) {
  if (!customerPhone) {
    return null;
  }

  const db = getDatabase();

  const row = db
    .prepare("SELECT order_json FROM active_orders WHERE customer_phone = ?")
    .get(customerPhone);

  if (!row) {
    return null;
  }

  return JSON.parse(row.order_json);
}

export function getActiveOrderByOrderId(orderId) {
  if (!orderId) {
    return null;
  }

  const db = getDatabase();

  const row = db
    .prepare("SELECT order_json FROM active_orders WHERE order_id = ?")
    .get(orderId);

  if (!row) {
    return null;
  }

  return JSON.parse(row.order_json);
}

export function deleteActiveOrderByPhone(customerPhone) {
  if (!customerPhone) {
    return;
  }

  const db = getDatabase();
  db.prepare("DELETE FROM active_orders WHERE customer_phone = ?").run(customerPhone);
}

export function getAllActiveOrders() {
  const db = getDatabase();

  return db
    .prepare(`
      SELECT customer_phone, order_json
      FROM active_orders
      ORDER BY updated_at DESC
    `)
    .all()
    .map((row) => ({
      phone: row.customer_phone,
      order: JSON.parse(row.order_json)
    }));
}

export function clearActiveOrdersForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM active_orders").run();
}
