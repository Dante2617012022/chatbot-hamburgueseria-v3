import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
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

test("1 - despues de agregar producto indica que falta delivery o retiro", async () => {
  resetSessionsForTests();

  const result = await send("3910000001", "quiero una bacon doble");

  assert.match(result.reply, /Agregué a tu pedido/i);
  assert.match(result.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);
});

test("2 - despues de confirmar sugerencia de producto indica proximo dato faltante", async () => {
  resetSessionsForTests();

  const phone = "3910000002";

  const first = await send(phone, "hola quiero encargar 2 americanas dobles");
  assert.match(first.reply, /Te referís|Te referis|alguno de estos productos/i);

  const second = await send(phone, "si");

  assert.match(second.reply, /2 x Americana 2\.0 doble/i);
  assert.match(second.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);
});

test("3 - entiende agregale 2 papas clasicas y mantiene guia proactiva", async () => {
  resetSessionsForTests();

  const phone = "3910000003";

  await send(phone, "quiero una americana doble");
  await send(phone, "si");

  const result = await send(phone, "agregale 2 papas clasicas");

  assert.match(result.reply, /2 x Papas clasicas/i);
  assert.match(result.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);
});

test("4 - entiende sumale 2 papas clasicas", async () => {
  resetSessionsForTests();

  const phone = "3910000004";

  await send(phone, "quiero una bacon doble");

  const result = await send(phone, "sumale 2 papas clasicas");

  assert.match(result.reply, /2 x Papas clasicas/i);
  assert.match(result.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);
});

test("5 - despues de elegir delivery sin direccion pide direccion directamente", async () => {
  resetSessionsForTests();

  const phone = "3910000005";

  await send(phone, "quiero una bacon doble");
  const result = await send(phone, "delivery");

  assert.match(result.reply, /Pasame tu dirección|Pasame tu direccion/i);
  assert.match(result.reply, /delivery.*sin costo|delivery no tiene costo/i);
});

test("6 - despues de recibir direccion pide forma de pago", async () => {
  resetSessionsForTests();

  const phone = "3910000006";

  await send(phone, "quiero una bacon doble");
  await send(phone, "delivery");

  const result = await send(phone, "centenario 49");

  assert.match(result.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(result.reply, /me falta la forma de pago/i);
  assert.match(result.reply, /Mercado Pago/i);
  assert.match(result.reply, /efectivo/i);
  assert.match(result.reply, /transferencia/i);
});

test("7 - despues de elegir retiro pide forma de pago", async () => {
  resetSessionsForTests();

  const phone = "3910000007";

  await send(phone, "quiero una bacon doble");
  const result = await send(phone, "retiro");

  assert.match(result.reply, /retiro por el local/i);
  assert.match(result.reply, /me falta la forma de pago/i);
});

test("8 - despues de elegir pago con datos completos pide confirmar", async () => {
  resetSessionsForTests();

  const phone = "3910000008";

  await send(phone, "quiero una bacon doble");
  await send(phone, "delivery");
  await send(phone, "centenario 49");

  const result = await send(phone, "mp");

  assert.match(result.reply, /Pago: Mercado Pago|forma de pago: \*Mercado Pago\*/i);
  assert.match(result.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);
});

test("9 - mensaje combinado con producto y direccion pide pago", async () => {
  resetSessionsForTests();

  const result = await send("3910000009", "quiero una bacon doble delivery a centenario 49");

  assert.match(result.reply, /Bacon cheese doble/i);
  assert.match(result.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(result.reply, /me falta la forma de pago/i);
});

test("10 - flujo real ya no necesita dale para descubrir datos faltantes", async () => {
  resetSessionsForTests();

  const phone = "3910000010";

  const product = await send(phone, "hola quiero encargar 2 americanas dobles");
  assert.match(product.reply, /Te referís|Te referis|alguno de estos productos/i);

  const selected = await send(phone, "si");
  assert.match(selected.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);

  const potatoes = await send(phone, "agregale 2 papas clasicas");
  assert.match(potatoes.reply, /2 x Papas clasicas/i);
  assert.match(potatoes.reply, /me falta saber si es \*delivery\* o \*retiro por el local\*/i);

  const delivery = await send(phone, "delivery");
  assert.match(delivery.reply, /Pasame tu dirección|Pasame tu direccion/i);

  const address = await send(phone, "centenario 49");
  assert.match(address.reply, /me falta la forma de pago/i);

  const payment = await send(phone, "mp");
  assert.match(payment.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);

  const confirmed = await send(phone, "confirmo");
  assert.match(confirmed.reply, /Pedido confirmado/i);
  assert.match(confirmed.reply, /Link de pago Mercado Pago/i);
});
