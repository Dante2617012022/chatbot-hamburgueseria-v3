import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

let db = null;

export function initDatabase() {
  if (db) {
    return db;
  }

  const databasePath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "database.sqlite");

  mkdirSync(path.dirname(databasePath), { recursive: true });

  db = new Database(databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return db;
}

export function getDatabase() {
  if (!db) {
    return initDatabase();
  }

  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      phone TEXT PRIMARY KEY,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_orders (
      customer_phone TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      order_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_phone) REFERENCES customers(phone)
    );

    CREATE TABLE IF NOT EXISTS message_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone TEXT,
      direction TEXT NOT NULL,
      text TEXT,
      intent TEXT,
      status TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_active_orders_order_id
      ON active_orders(order_id);

    CREATE INDEX IF NOT EXISTS idx_message_events_customer_phone
      ON message_events(customer_phone);

    CREATE INDEX IF NOT EXISTS idx_message_events_intent
      ON message_events(intent);

    CREATE INDEX IF NOT EXISTS idx_message_events_status
      ON message_events(status);

    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      customer_phone TEXT,
      provider TEXT NOT NULL,
      preference_id TEXT,
      payment_id TEXT,
      external_reference TEXT,
      status TEXT NOT NULL,
      init_point TEXT,
      sandbox_init_point TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payment_records_order_id
      ON payment_records(order_id);

    CREATE INDEX IF NOT EXISTS idx_payment_records_customer_phone
      ON payment_records(customer_phone);

    CREATE INDEX IF NOT EXISTS idx_payment_records_status
      ON payment_records(status);

    CREATE TABLE IF NOT EXISTS local_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      customer_phone TEXT,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      UNIQUE(order_id, type)
    );

    CREATE INDEX IF NOT EXISTS idx_local_notifications_order_id
      ON local_notifications(order_id);

    CREATE INDEX IF NOT EXISTS idx_local_notifications_status
      ON local_notifications(status);

    CREATE INDEX IF NOT EXISTS idx_local_notifications_type
      ON local_notifications(type);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_availability (
      product_id TEXT PRIMARY KEY,
      available INTEGER NOT NULL,
      reason TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_product_availability_available
      ON product_availability(available);
  `);
}
