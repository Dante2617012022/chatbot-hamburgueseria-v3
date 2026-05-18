import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";

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

test("1 - si a esa confirma sugerencia pendiente", async () => {
  resetSessionsForTests();

  const phone = "3920000001";

  const first = await send(phone, "hola quiero encargar dos americanas dobles");

  let reply = first.reply;

  if (/Te referís|Te referis|alguno de estos productos/i.test(reply)) {
    const second = await send(phone, "si a esa");
    reply = second.reply;
  }

  assert.match(reply, /2 x Americana 2\.0 doble/i);
  assert.match(reply, /Para completar el pedido me falta/i);
  assert.match(reply, /delivery o retiro por el local/i);
  assert.match(reply, /forma de pago/i);
});

test("2 - informa todos los datos faltantes y permite mandarlos juntos", async () => {
  resetSessionsForTests();

  const phone = "3920000002";

  const product = await send(phone, "quiero dos americanas dobles");
  assert.match(product.reply, /Para completar el pedido me falta/i);
  assert.match(product.reply, /entrega/i);
  assert.match(product.reply, /dirección|direccion/i);
  assert.match(product.reply, /forma de pago/i);
  assert.match(product.reply, /delivery a Centenario 49 pago Mercado Pago/i);

  const completed = await send(phone, "delivery a centenario 49 pago mercado pago");

  assert.match(completed.reply, /Dirección: centenario 49|Direccion: centenario 49/i);
  assert.match(completed.reply, /Pago: Mercado Pago/i);
  assert.match(completed.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);
});

test("3 - sigamos muestra el checklist actual del pedido", async () => {
  resetSessionsForTests();

  const phone = "3920000003";

  await send(phone, "quiero una bacon doble");

  const result = await send(phone, "sigamos");

  assert.match(result.reply, /Resumen de tu pedido/i);
  assert.match(result.reply, /Para completar el pedido me falta/i);
  assert.match(result.reply, /delivery o retiro por el local/i);
  assert.match(result.reply, /forma de pago/i);
});

test("4 - dame para pagar reenvia link si el pedido espera Mercado Pago", async () => {
  resetSessionsForTests();

  const phone = "3920000004";

  await send(phone, "quiero una bacon doble delivery a centenario 49 pago mercado pago");
  await send(phone, "confirmo");

  const result = await send(phone, "dame para pagar");

  assert.match(result.reply, /Link de pago Mercado Pago/i);
  assert.match(result.reply, /Cuando el pago esté aprobado/i);
});

test("5 - si cambia el total despues del link, se actualiza el importe del pago pendiente", async () => {
  resetSessionsForTests();

  const phone = "3920000005";

  const created = await send(phone, "quiero dos americanas dobles delivery a centenario 49 pago mercado pago");
  assert.match(created.reply, /respondé \*confirmo\*|responde \*confirmo\*/i);

  const confirmed = await send(phone, "confirmo");
  assert.match(confirmed.reply, /Link de pago Mercado Pago/i);

  let payment = getPaymentRecordByOrderId(confirmed.order.id);
  assert.equal(payment.amount, 20000);

  const changed = await send(phone, "borra 1 americana");
  assert.match(changed.reply, /1 x Americana 2\.0 doble/i);

  const newLink = await send(phone, "dame para pagar");
  assert.match(newLink.reply, /Link de pago Mercado Pago/i);

  payment = getPaymentRecordByOrderId(newLink.order.id);
  assert.equal(payment.amount, 10000);
});
