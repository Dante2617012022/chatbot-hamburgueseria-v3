import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateEnv } from "../src/config/env.js";
import { createHttpServer } from "../src/server/httpServer.js";
import {
  buildSignatureManifest,
  validateMercadoPagoWebhookSignature
} from "../src/payments/mercadoPagoWebhookSecurity.js";
import {
  createPaymentPreferenceForOrder,
  processMercadoPagoWebhook
} from "../src/payments/paymentService.js";
import { getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import { createEmptyOrder, addProductToOrder, setDeliveryData, setPaymentMethod, confirmOrder } from "../src/orders/orderService.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ROOT = process.cwd();

test("1 - validateEnv acepta configuracion productiva de pagos", () => {
  assert.doesNotThrow(() => validateEnv({
    NODE_ENV: "production",
    DATABASE_PATH: "data/database.sqlite",
    MENU_PATH: "data/menu.json",
    OWNER_PHONE: "5493810000000",
    ADMIN_PHONES: "5493810000000",
    ENABLE_WHATSAPP: "false",
    ENABLE_AI_FALLBACK: "false",
    MERCADOPAGO_DRY_RUN: "false",
    MERCADOPAGO_ACCESS_TOKEN: "TEST_ACCESS_TOKEN",
    MERCADOPAGO_NOTIFICATION_URL: "https://example.com/webhooks/mercadopago",
    MERCADOPAGO_WEBHOOK_SECRET: "webhook-secret",
    MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "true",
    DEV_ENDPOINT_TOKEN: "dev-token",
    RATE_LIMIT_ENABLED: "true",
    LOCAL_NOTIFICATION_DRY_RUN: "false"
  }));
});

test("2 - produccion rechaza Mercado Pago sin firma requerida", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "production",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ADMIN_PHONES: "5493810000000",
      ENABLE_WHATSAPP: "false",
      ENABLE_AI_FALLBACK: "false",
      MERCADOPAGO_DRY_RUN: "false",
      MERCADOPAGO_ACCESS_TOKEN: "TEST_ACCESS_TOKEN",
      MERCADOPAGO_NOTIFICATION_URL: "https://example.com/webhooks/mercadopago",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
      DEV_ENDPOINT_TOKEN: "dev-token",
      RATE_LIMIT_ENABLED: "true",
      LOCAL_NOTIFICATION_DRY_RUN: "false"
    }),
    /MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE no puede ser false en producción/
  );
});

test("3 - firma webhook valida con HMAC oficial", () => {
  const secret = "secret-test";
  const dataId = "123456789";
  const requestId = "request-abc";
  const timestamp = "1710000000";
  const manifest = buildSignatureManifest({ dataId, requestId, timestamp });
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");

  const result = validateMercadoPagoWebhookSignature({
    query: { "data.id": dataId },
    headers: {
      "x-request-id": requestId,
      "x-signature": `ts=${timestamp},v1=${signature}`
    },
    secret,
    requireSignature: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "OK");
});

test("4 - firma webhook rechaza headers faltantes o firma incorrecta", () => {
  const missingHeaders = validateMercadoPagoWebhookSignature({
    query: { "data.id": "123" },
    headers: {},
    secret: "secret",
    requireSignature: true
  });

  assert.equal(missingHeaders.ok, false);
  assert.equal(missingHeaders.status, "MISSING_SIGNATURE_HEADERS");

  const mismatch = validateMercadoPagoWebhookSignature({
    query: { "data.id": "123" },
    headers: {
      "x-request-id": "request-abc",
      "x-signature": "ts=1710000000,v1=abcdef"
    },
    secret: "secret",
    requireSignature: true
  });

  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, "SIGNATURE_MISMATCH");
});

test("5 - endpoint webhook rechaza firma invalida en produccion", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const oldRequireSignature = process.env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE;

  process.env.NODE_ENV = "production";
  process.env.MERCADOPAGO_WEBHOOK_SECRET = "secret";
  process.env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE = "true";

  const app = createHttpServer();
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/mercadopago`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { id: "123" } })
    });

    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
    assert.equal(body.error, "INVALID_WEBHOOK_SIGNATURE");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restoreEnv("NODE_ENV", oldNodeEnv);
    restoreEnv("MERCADOPAGO_WEBHOOK_SECRET", oldSecret);
    restoreEnv("MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE", oldRequireSignature);
  }
});

test("6 - webhook en dry-run no consulta Mercado Pago", async () => {
  const oldDryRun = process.env.MERCADOPAGO_DRY_RUN;
  const oldToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  process.env.MERCADOPAGO_DRY_RUN = "true";
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;

  try {
    const result = await processMercadoPagoWebhook({
      body: { data: { id: "payment-001" } }
    });

    assert.equal(result.processed, false);
    assert.equal(result.reason, "DRY_RUN_MODE_DOES_NOT_QUERY_MERCADO_PAGO");
    assert.equal(result.paymentId, "payment-001");
  } finally {
    restoreEnv("MERCADOPAGO_DRY_RUN", oldDryRun);
    restoreEnv("MERCADOPAGO_ACCESS_TOKEN", oldToken);
  }
});

test("7 - preferencia dry-run guarda referencia externa order:id", async () => {
  resetSessionsForTests();

  const order = createEmptyOrder({ customerPhone: "3900000001" });
  await addProductToOrder(order, "bacon_cheese_doble", { quantity: 1 });
  setDeliveryData(order, { deliveryType: "RETIRO" });
  setPaymentMethod(order, "MERCADO_PAGO");
  confirmOrder(order);

  const result = await createPaymentPreferenceForOrder(order, { forceDryRun: true });
  const payment = getPaymentRecordByOrderId(order.id);

  assert.equal(result.isDryRun, true);
  assert.equal(payment.externalReference, `order:${order.id}`);
  assert.equal(payment.provider, "MERCADO_PAGO");
  assert.equal(payment.currency, "ARS");
  assert.equal(payment.amount, order.total);
});

test("8 - cliente Mercado Pago usa Bearer token y endpoint de payment id codificado", () => {
  const content = readFileSync(join(ROOT, "src", "payments", "mercadoPagoClient.js"), "utf8");

  assert.match(content, /MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(content, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(content, /encodeURIComponent\(paymentId\)/);
  assert.match(content, /https:\/\/api\.mercadopago\.com\/v1\/payments/);
});

test("9 - preferencia real incluye notification_url, back_urls, auto_return y metadata", () => {
  const content = readFileSync(join(ROOT, "src", "payments", "paymentService.js"), "utf8");

  assert.match(content, /notification_url:\s*process\.env\.MERCADOPAGO_NOTIFICATION_URL/);
  assert.match(content, /back_urls:\s*buildBackUrls\(\)/);
  assert.match(content, /auto_return:\s*"approved"/);
  assert.match(content, /metadata/);
  assert.match(content, /order_id:\s*order\.id/);
  assert.match(content, /customer_phone:\s*order\.customerPhone/);
});

test("10 - estados de Mercado Pago se normalizan para operación interna", () => {
  const content = readFileSync(join(ROOT, "src", "payments", "paymentService.js"), "utf8");

  for (const status of [
    "approved",
    "pending",
    "in_process",
    "rejected",
    "cancelled",
    "refunded",
    "charged_back"
  ]) {
    assert.ok(content.includes(status), `Falta estado ${status}`);
  }

  assert.match(content, /APPROVED/);
  assert.match(content, /markAsPaid\(order\)/);
  assert.match(content, /NOTIFICATION_TYPE\.ORDER_PAID/);
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
