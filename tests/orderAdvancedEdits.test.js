import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

test("cliente puede quitar cantidad parcial de crispy", async () => {
  resetSessionsForTests();
  process.env.RATE_LIMIT_ENABLED = "false";

  const phone = "3819999999";

  await handleCustomerMessage({
    customerPhone: phone,
    messageText: "sumame 4 camdis crispy simple"
  });

  const result = await handleCustomerMessage({
    customerPhone: phone,
    messageText: "sacame 2 crispy"
  });

  assert.equal(result.parsedMessage.intent, "QUITAR_PRODUCTO_DEL_PEDIDO");
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].name, "Camdis crispy simple");
  assert.equal(result.order.items[0].quantity, 2);
  assert.equal(result.order.total, 17000);
});
