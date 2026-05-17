import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCustomerMessageWithAiFallback,
  shouldUseAiFallback
} from "../src/ai/aiFallbackParser.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

test("shouldUseAiFallback devuelve true para NO_ENTENDIDO", () => {
  const parsedMessage = {
    intent: CUSTOMER_INTENT.UNKNOWN,
    status: "NO_MATCH"
  };

  assert.equal(shouldUseAiFallback(parsedMessage), true);
});

test("shouldUseAiFallback devuelve false para mensaje entendido", () => {
  const parsedMessage = {
    intent: CUSTOMER_INTENT.ADD_PRODUCT,
    status: "AUTO_MATCH"
  };

  assert.equal(shouldUseAiFallback(parsedMessage), false);
});

test("parseCustomerMessageWithAiFallback interpreta producto con parser mock", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "mandame la doble con bacon",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "AGREGAR_PRODUCTO",
        confidence: 0.91,
        productQuery: "bacon doble",
        quantity: 1,
        deliveryType: null,
        possibleAddress: null,
        paymentMethod: null,
        replyHint: null
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(result.entities.product.id, "bacon_cheese_doble");
  assert.equal(result.entities.quantity, 1);
});

test("parseCustomerMessageWithAiFallback interpreta delivery con dirección", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "mandalo a avenida siempre viva 123",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "ELEGIR_DELIVERY",
        confidence: 0.88,
        productQuery: null,
        quantity: 1,
        deliveryType: "DELIVERY",
        possibleAddress: "avenida siempre viva 123",
        paymentMethod: null,
        replyHint: null
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_DELIVERY);
  assert.equal(result.entities.deliveryType, "DELIVERY");
  assert.equal(result.entities.possibleAddress, "avenida siempre viva 123");
});

test("parseCustomerMessageWithAiFallback interpreta forma de pago", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "te pago con transferencia",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "ELEGIR_FORMA_PAGO",
        confidence: 0.9,
        productQuery: null,
        quantity: 1,
        deliveryType: null,
        possibleAddress: null,
        paymentMethod: "TRANSFERENCIA",
        replyHint: null
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(result.entities.paymentMethod, "TRANSFERENCIA");
});

test("parseCustomerMessageWithAiFallback devuelve null si está desactivado", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "mensaje raro",
    {
      enabled: false,
      modelParser: async () => {
        throw new Error("No debería llamarse");
      }
    }
  );

  assert.equal(result, null);
});
