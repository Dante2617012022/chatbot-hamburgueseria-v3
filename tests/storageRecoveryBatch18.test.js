import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { initDatabase, getDatabase, closeDatabase } from "../src/storage/database.js";
import { saveActiveOrder, getActiveOrderByPhone } from "../src/storage/orderRepository.js";
import { saveMessageEvent } from "../src/storage/messageRepository.js";
import { savePaymentRecord, getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import { createEmptyOrder, addProductToOrder, setDeliveryData, confirmOrder } from "../src/orders/orderService.js";

const ROOT = process.cwd();

function withTempDatabase(fn) {
  return async () => {
    const oldDatabasePath = process.env.DATABASE_PATH;
    const dir = mkdtempSync(join(tmpdir(), "camdis-db-"));
    const databasePath = join(dir, "database.sqlite");

    closeDatabase();
    process.env.DATABASE_PATH = databasePath;

    try {
      await fn();
    } finally {
      closeDatabase();

      if (oldDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = oldDatabasePath;
      }
    }
  };
}

test("1 - SQLite inicializa WAL y foreign_keys", withTempDatabase(async () => {
  const db = initDatabase();
  const journalMode = db.pragma("journal_mode", { simple: true });
  const foreignKeys = db.pragma("foreign_keys", { simple: true });

  assert.equal(String(journalMode).toLowerCase(), "wal");
  assert.equal(foreignKeys, 1);
}));

test("2 - migraciones crean tablas productivas principales", withTempDatabase(async () => {
  const db = initDatabase();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);

  for (const tableName of [
    "customers",
    "active_orders",
    "message_events",
    "payment_records",
    "local_notifications",
    "app_settings",
    "product_availability",
    "rate_limit_events",
    "customer_blocks"
  ]) {
    assert.ok(tables.includes(tableName), `Falta tabla ${tableName}`);
  }
}));

test("3 - migraciones crean indices para consultas criticas", withTempDatabase(async () => {
  const db = initDatabase();
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);

  for (const indexName of [
    "idx_active_orders_order_id",
    "idx_message_events_customer_phone",
    "idx_message_events_status",
    "idx_payment_records_order_id",
    "idx_payment_records_status",
    "idx_local_notifications_status",
    "idx_rate_limit_events_customer_phone",
    "idx_customer_blocks_blocked_until_ms"
  ]) {
    assert.ok(indexes.includes(indexName), `Falta indice ${indexName}`);
  }
}));

test("4 - pedido activo sobrevive a cerrar y reabrir SQLite", withTempDatabase(async () => {
  const phone = "3890000001";
  const order = createEmptyOrder({ customerPhone: phone });

  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 1 });
  setDeliveryData(order, {
    deliveryType: "RETIRO",
    deliveryAddress: null,
    deliveryZone: null,
    deliveryCost: 0
  });
  order.paymentMethod = "EFECTIVO";
  confirmOrder(order);

  saveActiveOrder(phone, order);
  closeDatabase();

  const recovered = getActiveOrderByPhone(phone);

  assert.ok(recovered);
  assert.equal(recovered.id, order.id);
  assert.equal(recovered.status, "ESPERANDO_CONFIRMACION");
  assert.equal(recovered.items[0].productId, "bacon_cheese_doble");
  assert.equal(recovered.total, 10000);
}));

test("5 - registros de pago sobreviven a cerrar y reabrir SQLite", withTempDatabase(async () => {
  const orderId = "order-recovery-001";

  savePaymentRecord({
    orderId,
    customerPhone: "3890000002",
    provider: "MERCADO_PAGO",
    preferenceId: "pref_001",
    externalReference: `order:${orderId}`,
    status: "PENDING",
    initPoint: "https://example.com/pay/001",
    sandboxInitPoint: "https://example.com/pay/001",
    amount: 10000,
    currency: "ARS",
    raw: { isDryRun: true }
  });

  closeDatabase();

  const recovered = getPaymentRecordByOrderId(orderId);

  assert.ok(recovered);
  assert.equal(recovered.status, "PENDING");
  assert.equal(recovered.initPoint, "https://example.com/pay/001");
  assert.equal(recovered.amount, 10000);
  assert.equal(recovered.raw.isDryRun, true);
}));

test("6 - eventos de mensaje persisten y quedan consultables", withTempDatabase(async () => {
  saveMessageEvent({
    customerPhone: "3890000003",
    direction: "IN",
    text: "mensaje raro",
    intent: "NO_ENTENDIDO",
    status: "NO_MATCH",
    payload: { rawText: "mensaje raro" }
  });

  closeDatabase();

  const db = getDatabase();
  const row = db.prepare("SELECT customer_phone, direction, text, intent, status, payload_json FROM message_events WHERE customer_phone = ?").get("3890000003");

  assert.ok(row);
  assert.equal(row.customer_phone, "3890000003");
  assert.equal(row.direction, "IN");
  assert.equal(row.intent, "NO_ENTENDIDO");
  assert.equal(row.status, "NO_MATCH");
  assert.equal(JSON.parse(row.payload_json).rawText, "mensaje raro");
}));

test("7 - backup.sh usa ruta estable y backup nativo de sqlite", () => {
  const content = readFileSync(join(ROOT, "scripts", "backup.sh"), "utf8");

  assert.match(content, /PROJECT_DIR/);
  assert.match(content, /BACKUP_DIR/);
  assert.match(content, /data\/database\.sqlite/);
  assert.match(content, /sqlite3/);
  assert.match(content, /\.backup/);
});

test("8 - PM2 escribe logs en carpeta logs", () => {
  const content = readFileSync(join(ROOT, "ecosystem.config.cjs"), "utf8");

  assert.match(content, /error_file:\s*"\.\/logs\/pm2-error\.log"/);
  assert.match(content, /out_file:\s*"\.\/logs\/pm2-out\.log"/);
  assert.match(content, /log_date_format/);
});

test("9 - logger respeta LOG_LEVEL y evita pino-pretty en produccion", () => {
  const content = readFileSync(join(ROOT, "src", "utils", "logger.js"), "utf8");

  assert.match(content, /LOG_LEVEL/);
  assert.match(content, /process\.env\.NODE_ENV !== "production"/);
  assert.match(content, /pino-pretty/);
});

test("10 - package.json expone comandos de logs backup y pm2", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  assert.equal(pkg.scripts.backup, "bash scripts/backup.sh");
  assert.equal(pkg.scripts["pm2:logs"], "pm2 logs chatbot-hamburgueseria-v3");
  assert.equal(pkg.scripts["pm2:restart"], "pm2 restart chatbot-hamburgueseria-v3");
  assert.equal(pkg.scripts["pm2:save"], "pm2 save");
});
