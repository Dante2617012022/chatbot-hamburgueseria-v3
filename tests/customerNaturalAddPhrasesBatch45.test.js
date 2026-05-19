import test from "node:test";
import assert from "node:assert/strict";

import { parseCustomerMessage } from "../src/ai/intentParser.js";
import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

async function send(phone, messageText) {
  return handleCustomerMessage({ customerPhone: phone, messageText });
}

async function assertAddProduct(messageText, { quantity, productId }) {
  const parsed = await parseCustomerMessage(messageText);

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, quantity);
  assert.equal(parsed.entities.product.id, productId);
}

test("1 - frases con preparar", async () => {
  await assertAddProduct("hola me preparan 2 americanas triples", {
    quantity: 2,
    productId: "americana_20_triple"
  });

  await assertAddProduct("me preparas una onion doble", {
    quantity: 1,
    productId: "onion_doble"
  });

  await assertAddProduct("me preparás una onion doble", {
    quantity: 1,
    productId: "onion_doble"
  });

  await assertAddProduct("preparame una onion doble", {
    quantity: 1,
    productId: "onion_doble"
  });

  await assertAddProduct("prepárame una crispy triple", {
    quantity: 1,
    productId: "camdis_crispy_triple"
  });
});

test("2 - frases con armar", async () => {
  await assertAddProduct("me arman dos bacon triples", {
    quantity: 2,
    productId: "bacon_cheese_triple"
  });

  await assertAddProduct("me armas una big camdis doble", {
    quantity: 1,
    productId: "big_camdis_doble"
  });

  await assertAddProduct("me armás una big camdis doble", {
    quantity: 1,
    productId: "big_camdis_doble"
  });

  await assertAddProduct("armame una cuarto a simple", {
    quantity: 1,
    productId: "cuarto_a_simple"
  });

  await assertAddProduct("ármame una araka triple", {
    quantity: 1,
    productId: "araka_triple"
  });
});

test("3 - frases con hacer", async () => {
  await assertAddProduct("me hacen dos cheese dobles", {
    quantity: 2,
    productId: "cheeseburger_doble"
  });

  await assertAddProduct("me haces dos cheese dobles", {
    quantity: 2,
    productId: "cheeseburger_doble"
  });

  await assertAddProduct("me hacés dos cheese dobles", {
    quantity: 2,
    productId: "cheeseburger_doble"
  });

  await assertAddProduct("haceme dos triple l dobles", {
    quantity: 2,
    productId: "triple_l_doble"
  });
});

test("4 - frases heredadas agrega/sumale/pone", async () => {
  await assertAddProduct("añade una lata", {
    quantity: 1,
    productId: "lata"
  });

  await assertAddProduct("anade una lata", {
    quantity: 1,
    productId: "lata"
  });

  await assertAddProduct("adiciona dos nuggets x6", {
    quantity: 2,
    productId: "nuggets_x6"
  });

  await assertAddProduct("pone una lata", {
    quantity: 1,
    productId: "lata"
  });

  await assertAddProduct("poneme una lata", {
    quantity: 1,
    productId: "lata"
  });

  await assertAddProduct("ponele una lata", {
    quantity: 1,
    productId: "lata"
  });
});

test("5 - flujo real agrega americanas triples", async () => {
  resetSessionsForTests();

  const result = await send("4083000001", "hola me preparan 2 americanas triples");

  assert.equal(result.parsedMessage.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.match(result.reply, /2 x Americana 2\.0 triple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "americana_20_triple");
  assert.equal(result.order.items[0].quantity, 2);
});
