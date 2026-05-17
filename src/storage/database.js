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

    CREATE INDEX IF NOT EXISTS idx_message_events_customer_phone
      ON message_events(customer_phone);

    CREATE INDEX IF NOT EXISTS idx_message_events_intent
      ON message_events(intent);

    CREATE INDEX IF NOT EXISTS idx_message_events_status
      ON message_events(status);
  `);
}
