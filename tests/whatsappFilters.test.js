import test from "node:test";
import assert from "node:assert/strict";

import {
  isAllowedPrivateSender,
  isBlockedWhatsAppJid,
  shouldProcessWhatsAppMessage
} from "../src/bot/whatsappFilters.js";

test("isBlockedWhatsAppJid bloquea grupos", () => {
  process.env.WHATSAPP_IGNORE_GROUPS = "true";

  assert.equal(isBlockedWhatsAppJid("12345@g.us"), true);
});

test("isBlockedWhatsAppJid bloquea status y broadcast", () => {
  assert.equal(isBlockedWhatsAppJid("status@broadcast"), true);
  assert.equal(isBlockedWhatsAppJid("12345@broadcast"), true);
  assert.equal(isBlockedWhatsAppJid("12345@newsletter"), true);
});

test("isAllowedPrivateSender permite si no hay allowlist", () => {
  delete process.env.WHATSAPP_ALLOWED_PRIVATE_PHONES;

  assert.equal(isAllowedPrivateSender("5493816654021@s.whatsapp.net"), true);
});

test("isAllowedPrivateSender bloquea privados no autorizados si hay allowlist", () => {
  process.env.WHATSAPP_ALLOWED_PRIVATE_PHONES = "5493816654021";

  assert.equal(isAllowedPrivateSender("5493816654021@s.whatsapp.net"), true);
  assert.equal(isAllowedPrivateSender("5493819999999@s.whatsapp.net"), false);
});

test("shouldProcessWhatsAppMessage no procesa mensajes propios", () => {
  process.env.WHATSAPP_ALLOWED_PRIVATE_PHONES = "5493816654021";

  const result = shouldProcessWhatsAppMessage({
    key: {
      fromMe: true,
      remoteJid: "5493816654021@s.whatsapp.net"
    }
  });

  assert.equal(result, false);
});

test("shouldProcessWhatsAppMessage procesa privado autorizado", () => {
  process.env.WHATSAPP_IGNORE_GROUPS = "true";
  process.env.WHATSAPP_ALLOWED_PRIVATE_PHONES = "5493816654021";

  const result = shouldProcessWhatsAppMessage({
    key: {
      fromMe: false,
      remoteJid: "5493816654021@s.whatsapp.net"
    }
  });

  assert.equal(result, true);
});
