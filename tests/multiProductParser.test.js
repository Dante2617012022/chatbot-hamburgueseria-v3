import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { parseMultiProductMessage } from "../src/ai/multiProductParser.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

test("parseMultiProductMessage detecta papas y coca grande", async () => {
  resetSessionsForTests();

  const result = await parseMultiProductMessage("agregame papas y una coca grande");

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].product.id, "papas_clasicas");
  assert.equal(result.items[1].product.id, "bebida_15l");
});

test("handleCustomerMessage agrega papas y coca grande", async () => {
  resetSessionsForTests();
  process.env.RATE_LIMIT_ENABLED = "false";

  const result = await handleCustomerMessage({
    customerPhone: "3819999999",
    messageText: "agregame papas y una coca grande"
  });

  assert.equal(result.parsedMessage.intent, "AGREGAR_PRODUCTOS_MULTIPLES");
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.total, 9500);
  assert.match(result.reply, /Papas clasicas/);
  assert.match(result.reply, /Gaseosa 1.5L/);
});

test("parseMultiProductMessage detecta dos dobles una bacon y una cheese", async () => {
  resetSessionsForTests();

  const result = await parseMultiProductMessage(
    "quiero dos dobles una con bacon y una cheese"
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].product.id, "bacon_cheese_doble");
  assert.equal(result.items[1].product.id, "cheeseburger_doble");
});

test("handleCustomerMessage agrega dos dobles una bacon y una cheese", async () => {
  resetSessionsForTests();
  process.env.RATE_LIMIT_ENABLED = "false";

  const result = await handleCustomerMessage({
    customerPhone: "3819999999",
    messageText: "quiero dos dobles una con bacon y una cheese"
  });

  assert.equal(result.parsedMessage.intent, "AGREGAR_PRODUCTOS_MULTIPLES");
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.total, 19500);
  assert.match(result.reply, /Bacon cheese doble/);
  assert.match(result.reply, /Cheeseburger doble/);
});

test("parseMultiProductMessage detecta frase natural con americanas dobles y papas", async () => {
  resetSessionsForTests();

  const result = await parseMultiProductMessage(
    "voy a querer que me preparen dos americanas dobles y una papas clasicas"
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].product.nombre, "Americana 2.0 doble");
  assert.equal(result.items[1].quantity, 1);
  assert.equal(result.items[1].product.id, "papas_clasicas");
});

test("handleCustomerMessage agrega americanas dobles y papas desde frase natural", async () => {
  resetSessionsForTests();
  process.env.RATE_LIMIT_ENABLED = "false";

  const result = await handleCustomerMessage({
    customerPhone: "3819999999",
    messageText: "voy a querer que me preparen dos americanas dobles y una papas clasicas"
  });

  assert.equal(result.parsedMessage.intent, "AGREGAR_PRODUCTOS_MULTIPLES");
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.total, 26000);
  assert.match(result.reply, /2 x Americana 2.0 doble/);
  assert.match(result.reply, /1 x Papas clasicas/);
});
