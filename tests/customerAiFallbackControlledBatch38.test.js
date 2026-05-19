import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCustomerMessageWithAiFallback,
  shouldUseAiFallback
} from "../src/ai/aiFallbackParser.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.ENABLE_AI_FALLBACK = "true";
process.env.OPENAI_API_KEY = "test-key";
process.env.AI_FALLBACK_MIN_CONFIDENCE = "0.7";

test("1 - no usa IA fallback si parser normal ya entendio", () => {
  const parsedMessage = {
    intent: CUSTOMER_INTENT.ADD_PRODUCT,
    status: "AUTO_MATCH"
  };

  assert.equal(shouldUseAiFallback(parsedMessage), false);
});

test("2 - usa IA fallback si parser normal no entendio", () => {
  const parsedMessage = {
    intent: CUSTOMER_INTENT.UNKNOWN,
    status: "NO_MATCH"
  };

  assert.equal(shouldUseAiFallback(parsedMessage), true);
});

test("3 - IA fallback puede agregar producto real del menu", async () => {
  const result = await parseCustomerMessageWithAiFallback("me pinta una bacon doble", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      confidence: 0.91,
      productQuery: "bacon doble",
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.status, "AI_FALLBACK_PRODUCT_MATCH");
  assert.equal(result.entities.product.id, "bacon_cheese_doble");
});

test("4 - IA fallback no inventa producto inexistente", async () => {
  const result = await parseCustomerMessageWithAiFallback("quiero la burger dragon azul", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      confidence: 0.95,
      productQuery: "burger dragon azul",
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.notEqual(result.status, "AI_FALLBACK_PRODUCT_MATCH");
  assert.equal(result.entities.product, null);
});

test("5 - IA fallback rechaza baja confianza", async () => {
  const result = await parseCustomerMessageWithAiFallback("algo raro", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      confidence: 0.42,
      productQuery: "bacon doble",
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_LOW_CONFIDENCE");
});

test("6 - IA fallback no confirma pedido", async () => {
  const result = await parseCustomerMessageWithAiFallback("confirmo", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.CONFIRM_ORDER,
      confidence: 0.99,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_BLOCKED_INTENT");
});

test("7 - IA fallback no cancela pedido", async () => {
  const result = await parseCustomerMessageWithAiFallback("cancelalo", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.CANCEL_ORDER,
      confidence: 0.99,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: null,
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_BLOCKED_INTENT");
});

test("8 - IA fallback normaliza forma de pago valida", async () => {
  const result = await parseCustomerMessageWithAiFallback("te transfiero", {
    previousParsedMessage: {
      intent: CUSTOMER_INTENT.UNKNOWN,
      status: "NO_MATCH"
    },
    enabled: true,
    modelParser: async () => ({
      intent: CUSTOMER_INTENT.CHOOSE_PAYMENT,
      confidence: 0.9,
      productQuery: null,
      quantity: 1,
      deliveryType: null,
      possibleAddress: null,
      paymentMethod: "TRANSFERENCIA",
      replyHint: null
    })
  });

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(result.status, "AI_FALLBACK");
  assert.equal(result.entities.paymentMethod, "TRANSFERENCIA");
});
