import test from "node:test";
import assert from "node:assert/strict";

import { parseCustomerMessageWithAiFallback } from "../src/ai/aiFallbackParser.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

test("1 - IA marca producto seguro con resolution SAFE_MATCH", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "me pinta una bacon doble",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "AGREGAR_PRODUCTO",
        confidence: 0.94,
        resolution: "SAFE_MATCH",
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
  assert.equal(result.status, "AI_FALLBACK_PRODUCT_MATCH");
  assert.equal(result.entities.aiResolution, "SAFE_MATCH");
  assert.equal(result.entities.product.id, "bacon_cheese_doble");
});

test("2 - IA ambigua no agrega producto y devuelve sugerencias", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "quiero cheeseburger",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "AGREGAR_PRODUCTO",
        confidence: 0.9,
        resolution: "AMBIGUOUS",
        productQuery: "cheeseburger",
        quantity: 1,
        deliveryType: null,
        possibleAddress: null,
        paymentMethod: null,
        replyHint: "Necesito saber si querés simple, doble o triple."
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_AMBIGUOUS");
  assert.equal(result.entities.aiResolution, "AMBIGUOUS");
  assert.match(result.replyHint, /simple|doble|triple/i);
});

test("3 - IA incompleta pide aclaracion sin tocar pedido", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "quiero nuggets",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "AGREGAR_PRODUCTO",
        confidence: 0.88,
        resolution: "INCOMPLETE",
        productQuery: "nuggets",
        quantity: 1,
        deliveryType: null,
        possibleAddress: null,
        paymentMethod: null,
        replyHint: "Tenemos Nuggets x6 y Nuggets x12. ¿Cuál querés?"
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_INCOMPLETE");
  assert.equal(result.entities.aiResolution, "INCOMPLETE");
  assert.match(result.replyHint, /Nuggets x6|Nuggets x12/i);
});

test("4 - resolution invalida se rechaza como NO_ENTENDIDO", async () => {
  const result = await parseCustomerMessageWithAiFallback(
    "inventame algo",
    {
      enabled: true,
      modelParser: async () => ({
        intent: "AGREGAR_PRODUCTO",
        confidence: 0.95,
        resolution: "INVENT_PRODUCT",
        productQuery: "hamburguesa secreta",
        quantity: 1,
        deliveryType: null,
        possibleAddress: null,
        paymentMethod: null,
        replyHint: null
      })
    }
  );

  assert.equal(result.intent, CUSTOMER_INTENT.UNKNOWN);
  assert.equal(result.status, "AI_INVALID_RESOLUTION");
});
