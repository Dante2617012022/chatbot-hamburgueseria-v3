import { getDatabase } from "./database.js";

export function upsertCustomer({ phone, name = null }) {
  if (!phone) {
    throw new Error("phone es obligatorio.");
  }

  const now = new Date().toISOString();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO customers (phone, name, created_at, updated_at)
    VALUES (@phone, @name, @now, @now)
    ON CONFLICT(phone) DO UPDATE SET
      name = COALESCE(excluded.name, customers.name),
      updated_at = excluded.updated_at
  `).run({
    phone,
    name,
    now
  });

  return getCustomerByPhone(phone);
}

export function getCustomerByPhone(phone) {
  if (!phone) {
    return null;
  }

  const db = getDatabase();

  return db
    .prepare("SELECT phone, name, created_at, updated_at FROM customers WHERE phone = ?")
    .get(phone) || null;
}

export function clearCustomersForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM customers").run();
}
