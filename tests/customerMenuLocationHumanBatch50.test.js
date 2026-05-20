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
  return handleCustomerMessage({ customerPhone: phone, messageText });
}

test("1 - me mostras las opciones muestra menu", async () => {
  resetSessionsForTests();

  const result = await send("5000000001", "me mostras las opciones");

  assert.equal(result.parsedMessage.intent, "VER_MENU");
  assert.match(result.reply, /menú|menu|Camdis|Hamburguesas/i);
});

test("2 - que opciones manejan muestra menu", async () => {
  resetSessionsForTests();

  const result = await send("5000000002", "que opciones manejan?");

  assert.equal(result.parsedMessage.intent, "VER_MENU");
  assert.match(result.reply, /menú|menu|Camdis|Hamburguesas/i);
});

test("3 - me compartis el maps responde ubicacion", async () => {
  resetSessionsForTests();

  const result = await send("5000000003", "me compartis el maps");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_UBICACION_LOCAL");
  assert.match(result.reply, /Estamos en/i);
});

test("4 - pasame la dire responde ubicacion", async () => {
  resetSessionsForTests();

  const result = await send("5000000004", "pasame la dire");

  assert.equal(result.parsedMessage.intent, "CONSULTAR_UBICACION_LOCAL");
  assert.match(result.reply, /Estamos en/i);
});

test("5 - me atiende alguien deriva a humano", async () => {
  resetSessionsForTests();

  const result = await send("5000000005", "me atiende alguien?");

  assert.equal(result.parsedMessage.intent, "HABLAR_CON_PERSONA");
  assert.match(result.reply, /persona|humano|local|equipo/i);
});

test("6 - quiero hablar con el local deriva a humano", async () => {
  resetSessionsForTests();

  const result = await send("5000000006", "quiero hablar con el local");

  assert.equal(result.parsedMessage.intent, "HABLAR_CON_PERSONA");
  assert.match(result.reply, /persona|humano|local|equipo/i);
});
