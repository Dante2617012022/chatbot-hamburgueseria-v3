import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { createHttpServer } from "../src/server/httpServer.js";
import { validateEnv } from "../src/config/env.js";
import { initDatabase, closeDatabase } from "../src/storage/database.js";

const ROOT = process.cwd();

test("1 - package.json tiene scripts productivos obligatorios", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  assert.equal(pkg.type, "module");
  assert.equal(pkg.main, "index.js");

  for (const scriptName of [
    "test",
    "start",
    "health",
    "backup",
    "pm2:start",
    "pm2:stop",
    "pm2:restart",
    "pm2:logs",
    "pm2:status",
    "pm2:save"
  ]) {
    assert.ok(pkg.scripts?.[scriptName], `Falta script productivo: ${scriptName}`);
  }

  assert.ok(pkg.scripts.test.includes("node --test"));
  assert.ok(pkg.scripts.backup.includes("scripts/backup.sh"));
});

test("2 - ecosystem PM2 tiene autorestart, logs y NODE_ENV production", () => {
  const content = readFileSync(join(ROOT, "ecosystem.config.cjs"), "utf8");

  assert.ok(content.includes('name: "chatbot-hamburgueseria-v3"'));
  assert.ok(content.includes('script: "index.js"'));
  assert.ok(content.includes("autorestart: true"));
  assert.ok(content.includes("watch: false"));
  assert.ok(content.includes('max_memory_restart: "300M"'));
  assert.ok(content.includes('NODE_ENV: "production"'));
  assert.ok(content.includes("error_file"));
  assert.ok(content.includes("out_file"));
});

test("3 - backup.sh existe y usa backup seguro de sqlite", () => {
  const backupPath = join(ROOT, "scripts", "backup.sh");

  assert.equal(existsSync(backupPath), true, "Debe existir scripts/backup.sh");

  const content = readFileSync(backupPath, "utf8");

  assert.ok(content.includes("set -euo pipefail"));
  assert.ok(content.includes("BACKUP_DIR"));
  assert.ok(content.includes("database.sqlite"));
  assert.ok(content.includes("sqlite3"));
  assert.ok(content.includes(".backup"));
});

test("4 - validateEnv acepta configuracion segura de desarrollo", () => {
  assert.doesNotThrow(() => {
    validateEnv({
      NODE_ENV: "development",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ENABLE_WHATSAPP: "false",
      ENABLE_AI_FALLBACK: "false",
      MERCADOPAGO_DRY_RUN: "true",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
      RATE_LIMIT_ENABLED: "false",
      LOCAL_NOTIFICATION_DRY_RUN: "true"
    });
  });
});

test("5 - validateEnv rechaza booleanos invalidos", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "development",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ENABLE_WHATSAPP: "maybe",
      ENABLE_AI_FALLBACK: "false",
      MERCADOPAGO_DRY_RUN: "true",
      RATE_LIMIT_ENABLED: "false"
    }),
    /ENABLE_WHATSAPP debe ser "true" o "false"/
  );
});

test("6 - validateEnv exige variables criticas en produccion", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "production",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ENABLE_WHATSAPP: "true",
      ENABLE_AI_FALLBACK: "false",
      WHATSAPP_AUTH_DIR: ".wwebjs_auth",
      MERCADOPAGO_DRY_RUN: "false",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "true",
      MERCADOPAGO_ACCESS_TOKEN: "TEST_TOKEN",
      MERCADOPAGO_NOTIFICATION_URL: "https://example.com/webhooks/mercadopago",
      MERCADOPAGO_WEBHOOK_SECRET: "secret",
      RATE_LIMIT_ENABLED: "true",
      LOCAL_NOTIFICATION_DRY_RUN: "false"
    }),
    /Falta ADMIN_PHONES|Falta DEV_ENDPOINT_TOKEN/
  );
});

test("7 - validateEnv rechaza dry-run de Mercado Pago en produccion", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "production",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ADMIN_PHONES: "5493810000000",
      ENABLE_WHATSAPP: "false",
      ENABLE_AI_FALLBACK: "false",
      MERCADOPAGO_DRY_RUN: "true",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "true",
      MERCADOPAGO_WEBHOOK_SECRET: "secret",
      DEV_ENDPOINT_TOKEN: "dev-token",
      RATE_LIMIT_ENABLED: "true",
      LOCAL_NOTIFICATION_DRY_RUN: "false"
    }),
    /MERCADOPAGO_DRY_RUN no puede ser true en producción/
  );
});

test("8 - health check responde ok y estado de base de datos", async () => {
  const oldDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = ":memory:";
  initDatabase();

  const app = createHttpServer();
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "chatbot-hamburgueseria-v3");
    assert.equal(body.database, "ok");
    assert.equal(typeof body.uptimeSeconds, "number");
    assert.ok(body.timestamp);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();

    if (oldDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = oldDatabasePath;
    }
  }
});

test("9 - endpoints dev quedan bloqueados en NODE_ENV production", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldDatabasePath = process.env.DATABASE_PATH;

  process.env.NODE_ENV = "production";
  process.env.DATABASE_PATH = ":memory:";
  initDatabase();

  const app = createHttpServer();
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/dev/notifications/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });

    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.ok, false);
    assert.equal(body.error, "NOT_ALLOWED_IN_PRODUCTION");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();

    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = oldNodeEnv;
    }

    if (oldDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = oldDatabasePath;
    }
  }
});

test("10 - endpoints dev aceptan token cuando no es produccion", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldToken = process.env.DEV_ENDPOINT_TOKEN;
  const oldDatabasePath = process.env.DATABASE_PATH;

  process.env.NODE_ENV = "development";
  process.env.DEV_ENDPOINT_TOKEN = "test-token";
  process.env.DATABASE_PATH = ":memory:";
  initDatabase();

  const app = createHttpServer();
  const server = app.listen(0);

  try {
    const port = server.address().port;

    const forbidden = await fetch(`http://127.0.0.1:${port}/dev/notifications/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });

    assert.equal(forbidden.status, 401);

    const allowed = await fetch(`http://127.0.0.1:${port}/dev/notifications/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-token": "test-token"
      },
      body: JSON.stringify({})
    });

    const body = await allowed.json();

    assert.equal(allowed.status, 200);
    assert.equal(body.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();

    if (oldNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = oldNodeEnv;
    }

    if (oldToken === undefined) {
      delete process.env.DEV_ENDPOINT_TOKEN;
    } else {
      process.env.DEV_ENDPOINT_TOKEN = oldToken;
    }

    if (oldDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = oldDatabasePath;
    }
  }
});
