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
process.env.STORE_ADDRESS = "Uttinger, Gral. José de San Martín y, Tafí Viejo";

async function send(phone, messageText) {
  return handleCustomerMessage({
    customerPhone: phone,
    messageText
  });
}

test("1 - saludo puro responde bienvenida sin romper pedidos", async () => {
  resetSessionsForTests();

  const result = await send("4000000001", "hola");

  assert.equal(result.parsedMessage.intent, "SALUDO_CLIENTE");
  assert.match(result.reply, /Camdis|menú|menu|encargar/i);
});

test("2 - saludo con pedido no queda atrapado como saludo", async () => {
  resetSessionsForTests();

  const result = await send("4000000002", "hola quiero una americana doble");

  assert.match(result.reply, /1 x Americana 2\.0 doble/i);
});

test("3 - consulta ubicacion del local responde direccion del local", async () => {
  resetSessionsForTests();

  const result = await send("4000000003", "donde estan");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_UBICACION_LOCAL");
  assert.match(result.reply, /Uttinger|Tafí Viejo|Tafi Viejo/i);
});

test("4 - como llego al local responde direccion", async () => {
  resetSessionsForTests();

  const result = await send("4000000004", "como llego al local");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_UBICACION_LOCAL");
  assert.match(result.reply, /Estamos en|Uttinger/i);
});

test("5 - precio de producto responde precio sin agregar al pedido", async () => {
  resetSessionsForTests();

  const result = await send("4000000005", "cuanto sale la americana doble");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /Americana 2\.0 doble/i);
  assert.match(result.reply, /\$10\.000|\$10,000/i);
  assert.equal(result.order.items.length, 0);
});

test("6 - precio de crispy triple responde precio", async () => {
  resetSessionsForTests();

  const result = await send("4000000006", "precio de la crispy triple");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /Camdis crispy triple/i);
  assert.match(result.reply, /\$12\.000|\$12,000/i);
});

test("7 - direccion con numero no se confunde con ubicacion del local", async () => {
  resetSessionsForTests();

  const phone = "4000000007";

  await send(phone, "quiero una americana doble");
  await send(phone, "delivery");
  const result = await send(phone, "centenario 49");

  assert.notEqual(result.parsedMessage.intent, "CONSULTAR_UBICACION_LOCAL");
  assert.equal(result.order.deliveryAddress, "centenario 49");
});
