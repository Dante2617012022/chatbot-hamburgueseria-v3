import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(pathParts) {
  return readFileSync(join(ROOT, ...pathParts), "utf8");
}

test("1 - existe checklist de lanzamiento con objetivo de piloto supervisado", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /Checklist de lanzamiento/);
  assert.match(checklist, /lanzamiento controlado/);
  assert.match(checklist, /piloto supervisado/i);
});

test("2 - checklist exige test health y backup antes de lanzar", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /npm test/);
  assert.match(checklist, /fail 0/);
  assert.match(checklist, /npm run health/);
  assert.match(checklist, /npm run backup/);
});

test("3 - checklist documenta variables base obligatorias", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  for (const key of [
    "NODE_ENV=production",
    "DATABASE_PATH=data/database.sqlite",
    "MENU_PATH=data/menu.json",
    "OWNER_PHONE=",
    "ADMIN_PHONES=",
    "RATE_LIMIT_ENABLED=true",
    "DEV_ENDPOINT_TOKEN=",
    "LOCAL_NOTIFICATION_DRY_RUN=false"
  ]) {
    assert.ok(checklist.includes(key), `Falta ${key}`);
  }
});

test("4 - checklist documenta activacion de WhatsApp", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /ENABLE_WHATSAPP=true/);
  assert.match(checklist, /WHATSAPP_AUTH_DIR=auth_info_baileys/);
  assert.match(checklist, /Escanear el QR/);
  assert.match(checklist, /ignora grupos/i);
});

test("5 - checklist documenta OpenAI como fallback controlado", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /ENABLE_AI_FALLBACK=true/);
  assert.match(checklist, /OPENAI_API_KEY/);
  assert.match(checklist, /OPENAI_MODEL=gpt-4o-mini/);
  assert.match(checklist, /fallback controlado/i);
});

test("6 - checklist documenta Mercado Pago y webhooks seguros", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  for (const key of [
    "MERCADOPAGO_DRY_RUN=false",
    "MERCADOPAGO_ACCESS_TOKEN=",
    "MERCADOPAGO_NOTIFICATION_URL=",
    "MERCADOPAGO_WEBHOOK_SECRET=",
    "MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE=true"
  ]) {
    assert.ok(checklist.includes(key), `Falta ${key}`);
  }

  assert.match(checklist, /PAGADO/);
  assert.match(checklist, /Mercado Pago aprueba/);
});

test("7 - checklist documenta diferencia dry-run vs real", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /Modo dry-run vs real/);
  assert.match(checklist, /MERCADOPAGO_DRY_RUN=true/);
  assert.match(checklist, /MERCADOPAGO_DRY_RUN=false/);
  assert.match(checklist, /ENABLE_WHATSAPP=false/);
  assert.match(checklist, /ENABLE_WHATSAPP=true/);
});

test("8 - checklist documenta PM2 logs y reinicio", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  for (const command of [
    "npm run pm2:start",
    "npm run pm2:status",
    "npm run pm2:logs",
    "npm run pm2:restart",
    "npm run pm2:save"
  ]) {
    assert.ok(checklist.includes(command), `Falta ${command}`);
  }

  assert.match(checklist, /PM2 debe reiniciar/);
});

test("9 - checklist documenta protocolo humano y comandos admin", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);

  assert.match(checklist, /Protocolo humano del local/);

  for (const command of [
    "/admin pedidos",
    "/admin notificaciones",
    "/admin stock",
    "/admin zonas",
    "/admin horario",
    "/admin abrir",
    "/admin cerrar",
    "/admin pausar",
    "/admin activar",
    "/admin preparar <idPedido>",
    "/admin listo <idPedido>",
    "/admin camino <idPedido>",
    "/admin entregado <idPedido>"
  ]) {
    assert.ok(checklist.includes(command), `Falta ${command}`);
  }
});

test("10 - package.json conserva comandos finales de operacion", () => {
  const checklist = read(["LAUNCH_CHECKLIST.md"]);
  const pkg = JSON.parse(read(["package.json"]));

  assert.ok(checklist.includes("No lanzar si pasa algo de esto"));
  assert.equal(pkg.scripts.test, "node --test --test-concurrency=1 tests/*.test.js");
  assert.equal(pkg.scripts.backup, "bash scripts/backup.sh");
  assert.equal(pkg.scripts.health, "curl http://localhost:3000/health");
});
