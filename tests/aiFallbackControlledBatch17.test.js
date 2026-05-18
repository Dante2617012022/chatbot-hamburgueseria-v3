import test from "node:test";
import assert from "node:assert/strict";

import {
  isAiFallbackEnabled,
  parseCustomerMessageWithAiFallback,
  shouldUseAiFallback
} from "../src/ai/aiFallbackParser.js";
import { validateEnv } from "../src/config/env.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

test("1 - IA fallback solo se activa con flag y OPENAI_API_KEY", () => {
  const oldEnabled = process.env.ENABLE_AI_FALLBACK;
  const oldKey = process.env.OPENAI_API_KEY;

  try {
    process.env.ENABLE_AI_FALLBACK = "false";
    delete process.env.OPENAI_API_KEY;
    assert.equal(isAiFallbackEnabled(), false);

    process.env.ENABLE_AI_FALLBACK = "true";
    delete process.env.OPENAI_API_KEY;
    assert.equal(isAiFallbackEnabled(), false);

    process.env.ENABLE_AI_FALLBACK = "false";
    process.env.OPENAI_API_KEY = "test-key";
    assert.equal(isAiFallbackEnabled(), false);

    process.env.ENABLE_AI_FALLBACK = "true";
    process.env.OPENAI_API_KEY = "test-key";
    assert.equal(isAiFallbackEnabled(), true);
  } finally {
    restoreEnv("ENABLE_AI_FALLBACK", oldEnabled);
    restoreEnv("OPENAI_API_KEY", oldKey);
  }
});

test("2 - shouldUseAiFallback se activa solo para mensajes problematicos", () => {
  assert.equal(shouldUseAiFallback(null), true);

  for (const status of [
    "NO_MATCH",
    "PRODUCT_NOT_FOUND",
    "LOW_CONFIDENCE",
    "AMBIGUOUS"
  ]) {
    assert.equal(
      shouldUseAiFallback({
        intent: CUSTOMER_INTENT.ADD_PRODUCT,
        status
      }),
      true,
      `Deberia activar fallback para ${status}`
    );
  }

  assert.equal(
    shouldUseAiFallback({
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "AI_UNKNOWN"
    }),
    true
  );

  assert.equal(
    shouldUseAiFallback({
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      status: "AUTO_MATCH"
    }),
    false
  );

  assert.equal(
    shouldUseAiFallback({
      intent: CUSTOMER_INTENT.CHOOSE_PAYMENT,
      status: "OK"
    }),
    false
  );
});

test("3 - no llama al modelo si el parser normal ya entendio", async () => {
  let calls = 0;

  const result = await parseCustomerMessageWithAiFallback("bacon doble", {
    enabled: true,
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      status: "AUTO_MATCH"
    },
    modelParser: async () => {
      calls += 1;
      throw new Error("No deberia llamarse");
    }
  });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("4 - si OpenAI falla, el bot no se cae y devuelve null", async () => {
  const result = await parseCustomerMessageWithAiFallback("mensaje raro", {
    enabled: true,
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    modelParser: async () => {
      throw new Error("Falla simulada de OpenAI");
    }
  });

  assert.equal(result, null);
});

test("5 - interpreta producto con cantidad y limita cantidad maxima", async () => {
  const result = await parseCustomerMessageWithAiFallback("haceme muchas bacon doble", {
    enabled: true,
    modelParser: async () => ({
      intent: "AGREGAR_PRODUCTO",
      confidence: 1.5,
      productQuery: "bacon doble",
      quantity: 999,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.product.id, "bacon_cheese_doble");
  assert.equal(result.entities.quantity, 50);
  assert.equal(result.confidence <= 1, true);
});

test("6 - no inventa producto si GPT devuelve un producto inexistente", async () => {
  const result = await parseCustomerMessageWithAiFallback("quiero la burger fantasma", {
    enabled: true,
    modelParser: async () => ({
      intent: "AGREGAR_PRODUCTO",
      confidence: 0.92,
      productQuery: "burger fantasma inexistente",
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.product, null);
  assert.equal(Array.isArray(result.entities.suggestions), true);
  assert.notEqual(result.status, "OK");
});

test("7 - interpreta delivery con direccion sin inventar otros campos", async () => {
  const result = await parseCustomerMessageWithAiFallback("mandalo a san martin 123", {
    enabled: true,
    modelParser: async () => ({
      intent: "ELEGIR_DELIVERY",
      confidence: 0.88,
      productQuery: null,
      quantity: 1,
      deliveryType: "DELIVERY",
      possibleAddress: "san martin 123",
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_DELIVERY);
  assert.equal(result.entities.deliveryType, "DELIVERY");
  assert.equal(result.entities.possibleAddress, "san martin 123");
  assert.equal(result.entities.paymentMethod, undefined);
});

test("8 - normaliza forma de pago devuelta por GPT", async () => {
  const mp = await parseCustomerMessageWithAiFallback("pago con mp", {
    enabled: true,
    modelParser: async () => ({
      intent: "ELEGIR_FORMA_PAGO",
      confidence: 0.9,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: "mp",
      replyHint: null
    })
  });

  assert.equal(mp.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(mp.entities.paymentMethod, "MERCADO_PAGO");

  const cash = await parseCustomerMessageWithAiFallback("pago cash", {
    enabled: true,
    modelParser: async () => ({
      intent: "ELEGIR_FORMA_PAGO",
      confidence: 0.9,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: "efectivo",
      replyHint: null
    })
  });

  assert.equal(cash.entities.paymentMethod, "EFECTIVO");
});

test("9 - intencion invalida de GPT cae a NO_ENTENDIDO", async () => {
  const result = await parseCustomerMessageWithAiFallback("algo imposible", {
    enabled: true,
    modelParser: async () => ({
      intent: "INVENTAR_PEDIDO",
      confidence: 0.7,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: "No entendi bien"
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_UNKNOWN");
});

test("10 - validateEnv exige OPENAI_API_KEY si ENABLE_AI_FALLBACK esta activo", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "development",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ENABLE_WHATSAPP: "false",
      ENABLE_AI_FALLBACK: "true",
      MERCADOPAGO_DRY_RUN: "true",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
      RATE_LIMIT_ENABLED: "false",
      LOCAL_NOTIFICATION_DRY_RUN: "true"
    }),
    /Falta OPENAI_API_KEY/
  );

  assert.doesNotThrow(() => validateEnv({
    NODE_ENV: "development",
    DATABASE_PATH: "data/database.sqlite",
    MENU_PATH: "data/menu.json",
    OWNER_PHONE: "5493810000000",
    ENABLE_WHATSAPP: "false",
    ENABLE_AI_FALLBACK: "true",
    OPENAI_API_KEY: "test-key",
    MERCADOPAGO_DRY_RUN: "true",
    MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
    RATE_LIMIT_ENABLED: "false",
    LOCAL_NOTIFICATION_DRY_RUN: "true"
  }));
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
