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

test("8 - si confirma despues de consultar precio agrega ese producto", async () => {
  resetSessionsForTests();

  const phone = "4000000008";

  const price = await send(phone, "cuanto sale la americana doble");
  assert.equal(price.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.equal(price.order.items.length, 0);

  const confirmation = await send(phone, "si");

  assert.equal(confirmation.parsedMessage.intent, "CONFIRMAR_SUGERENCIA_PRODUCTO");
  assert.match(confirmation.reply, /Americana 2\.0 doble/i);
  assert.equal(confirmation.order.items.length, 1);
  assert.equal(confirmation.order.items[0].productId, "americana_20_doble");
});

test("9 - si confirma precio de crispy triple agrega ese producto", async () => {
  resetSessionsForTests();

  const phone = "4000000009";

  await send(phone, "precio de la crispy triple");
  const confirmation = await send(phone, "si");

  assert.equal(confirmation.parsedMessage.intent, "CONFIRMAR_SUGERENCIA_PRODUCTO");
  assert.match(confirmation.reply, /Camdis crispy triple/i);
  assert.equal(confirmation.order.items.length, 1);
  assert.equal(confirmation.order.items[0].productId, "camdis_crispy_triple");
});

test("10 - a que precio tenes la onion doble responde precio", async () => {
  resetSessionsForTests();

  const result = await send("4000000010", "a que precio tenes la onion doble");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /Onion doble/i);
  assert.match(result.reply, /\$9\.500|\$9,500/i);
});

test("11 - a que costo esta la onion doble responde precio", async () => {
  resetSessionsForTests();

  const result = await send("4000000011", "a que costo esta la onion doble");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /Onion doble/i);
  assert.match(result.reply, /\$9\.500|\$9,500/i);
});

test("12 - a que precio esta la cuarto a simple mantiene comportamiento", async () => {
  resetSessionsForTests();

  const result = await send("4000000012", "a que precio esta la cuarto a simple");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /Cuarto A simple/i);
  assert.match(result.reply, /\$8\.000|\$8,000/i);
});

test("13 - seguimiento de precio no confirma variante pendiente anterior", async () => {
  resetSessionsForTests();

  const phone = "4000000013";

  await send(phone, "a que costo esta la onion doble");
  const followUp = await send(phone, "y la big camdis triple?");

  assert.equal(followUp.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(followUp.reply, /Big camdis triple/i);
  assert.match(followUp.reply, /\$12\.000|\$12,000/i);
  assert.equal(followUp.order.items.length, 0);
});

test("14 - si despues del seguimiento agrega el ultimo producto consultado", async () => {
  resetSessionsForTests();

  const phone = "4000000014";

  await send(phone, "a que costo esta la onion doble");
  await send(phone, "y la big camdis triple?");
  const confirmation = await send(phone, "si");

  assert.equal(confirmation.parsedMessage.intent, "CONFIRMAR_SUGERENCIA_PRODUCTO");
  assert.match(confirmation.reply, /Big camdis triple/i);
  assert.equal(confirmation.order.items.length, 1);
  assert.equal(confirmation.order.items[0].productId, "big_camdis_triple");
});

test("15 - si agrega confirma el ultimo producto consultado por precio", async () => {
  resetSessionsForTests();

  const phone = "4000000015";

  await send(phone, "a que costo esta la onion doble");
  await send(phone, "y la americana triple?");
  const confirmation = await send(phone, "si agrega");

  assert.equal(confirmation.parsedMessage.intent, "CONFIRMAR_SUGERENCIA_PRODUCTO");
  assert.match(confirmation.reply, /Americana 2\.0 triple/i);
  assert.equal(confirmation.order.items.length, 1);
  assert.equal(confirmation.order.items[0].productId, "americana_20_triple");
});

test("16 - pedido nuevo despues de consultar precio no se toma como seguimiento de precio", async () => {
  resetSessionsForTests();

  const phone = "4000000016";

  await send(phone, "a que costo esta la onion doble");
  await send(phone, "pasame el menu por favor");
  const result = await send(phone, "preparame una araka simple porfa");

  assert.notEqual(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /1 x Araka simple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "araka_simple");
});

test("17 - quiero producto despues de consultar precio no se toma como seguimiento", async () => {
  resetSessionsForTests();

  const phone = "4000000017";

  await send(phone, "a que costo esta la onion doble");
  const result = await send(phone, "quiero una araka simple porfa");

  assert.notEqual(result.parsedMessage.intent, "CONSULTAR_PRECIO_PRODUCTO");
  assert.match(result.reply, /1 x Araka simple/i);
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].productId, "araka_simple");
});
