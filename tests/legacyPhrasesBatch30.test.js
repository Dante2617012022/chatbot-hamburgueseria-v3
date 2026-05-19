import test from "node:test";
import assert from "node:assert/strict";

import { parseCustomerMessage } from "../src/ai/intentParser.js";
import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { CUSTOMER_INTENT } from "../src/ai/intentTypes.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

async function send(phone, messageText) {
  return handleCustomerMessage({
    customerPhone: phone,
    messageText
  });
}

test("1 - frases heredadas de menu muestran carta", async () => {
  const parsed = await parseCustomerMessage("me pasas la carta");

  assert.equal(parsed.intent, CUSTOMER_INTENT.VIEW_MENU);
  assert.equal(parsed.status, "OK");
});

test("2 - frases heredadas de humano derivan a persona", async () => {
  const parsed = await parseCustomerMessage("necesito hablar con alguien");

  assert.equal(parsed.intent, CUSTOMER_INTENT.TALK_TO_HUMAN);
  assert.equal(parsed.status, "OK");
});

test("3 - frases heredadas de cancelar limpian pedido", async () => {
  resetSessionsForTests();

  const phone = "3990000003";
  await send(phone, "quiero una americana doble");
  const result = await send(phone, "empecemos de cero");

  assert.equal(result.parsedMessage.intent, CUSTOMER_INTENT.CANCEL_ORDER);
  assert.match(result.reply, /cancelé tu pedido|cancele tu pedido/i);
});

test("4 - frases heredadas de pago generan confirmacion si faltan datos", async () => {
  resetSessionsForTests();

  const phone = "3990000004";
  await send(phone, "quiero una americana doble retiro efectivo");
  const result = await send(phone, "pasame el link");

  assert.equal(result.parsedMessage.intent, CUSTOMER_INTENT.CONFIRM_ORDER);
  assert.match(result.reply, /Pedido confirmado|Link de pago|pago/i);
});

test("5 - numeros escritos hasta veinte se usan como cantidad", async () => {
  const parsed = await parseCustomerMessage("quiero once latas");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 11);
  assert.match(parsed.entities.product.nombre, /Lata/i);
});

test("6 - frase heredada me armas agrega producto", async () => {
  const parsed = await parseCustomerMessage("me armas dos bacon triples");

  assert.equal(parsed.intent, CUSTOMER_INTENT.ADD_PRODUCT);
  assert.equal(parsed.entities.quantity, 2);
  assert.match(parsed.entities.product.nombre, /Bacon cheese triple/i);
});

test("7 - frase heredada pago al recibir se interpreta como efectivo", async () => {
  const parsed = await parseCustomerMessage("pago al recibir");

  assert.equal(parsed.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(parsed.entities.paymentMethod, "EFECTIVO");
});

test("8 - frase heredada transfiero se interpreta como transferencia", async () => {
  const parsed = await parseCustomerMessage("transfiero");

  assert.equal(parsed.intent, CUSTOMER_INTENT.CHOOSE_PAYMENT);
  assert.equal(parsed.entities.paymentMethod, "TRANSFERENCIA");
});
