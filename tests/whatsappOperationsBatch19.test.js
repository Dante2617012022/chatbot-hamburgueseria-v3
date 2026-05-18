import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateEnv } from "../src/config/env.js";

const ROOT = process.cwd();

function readProjectFile(pathParts) {
  return readFileSync(join(ROOT, ...pathParts), "utf8");
}

test("1 - startApp solo inicia WhatsApp con ENABLE_WHATSAPP=true", () => {
  const content = readProjectFile(["src", "app.js"]);

  assert.match(content, /process\.env\.ENABLE_WHATSAPP === "true"/);
  assert.match(content, /WhatsApp no iniciado/);
  assert.match(content, /await startWhatsAppBot\(\)/);
});

test("2 - validateEnv exige WHATSAPP_AUTH_DIR si WhatsApp esta activo", () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: "development",
      DATABASE_PATH: "data/database.sqlite",
      MENU_PATH: "data/menu.json",
      OWNER_PHONE: "5493810000000",
      ENABLE_WHATSAPP: "true",
      ENABLE_AI_FALLBACK: "false",
      MERCADOPAGO_DRY_RUN: "true",
      MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
      RATE_LIMIT_ENABLED: "false",
      LOCAL_NOTIFICATION_DRY_RUN: "true"
    }),
    /Falta WHATSAPP_AUTH_DIR/
  );

  assert.doesNotThrow(() => validateEnv({
    NODE_ENV: "development",
    DATABASE_PATH: "data/database.sqlite",
    MENU_PATH: "data/menu.json",
    OWNER_PHONE: "5493810000000",
    ENABLE_WHATSAPP: "true",
    WHATSAPP_AUTH_DIR: "auth_info_baileys",
    ENABLE_AI_FALLBACK: "false",
    MERCADOPAGO_DRY_RUN: "true",
    MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE: "false",
    RATE_LIMIT_ENABLED: "false",
    LOCAL_NOTIFICATION_DRY_RUN: "true"
  }));
});

test("3 - WhatsApp usa Baileys con auth multiarchivo y QR controlado", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /useMultiFileAuthState\(authDir\)/);
  assert.match(content, /fetchLatestBaileysVersion\(\)/);
  assert.match(content, /makeWASocket/);
  assert.match(content, /printQRInTerminal:\s*false/);
  assert.match(content, /qrcode\.generate\(qr/);
  assert.match(content, /browser:\s*\["Camdis Bot"/);
});

test("4 - WhatsApp ignora mensajes propios, grupos y eventos no notify", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /type !== "notify"/);
  assert.match(content, /message\.key\?\.fromMe/);
  assert.match(content, /isGroupJid\(jid\)/);
  assert.match(content, /jid\.endsWith\("@g\.us"\)/);
});

test("5 - WhatsApp extrae texto de conversación, texto extendido y captions", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /content\.conversation/);
  assert.match(content, /extendedTextMessage\?\.text/);
  assert.match(content, /imageMessage\?\.caption/);
  assert.match(content, /videoMessage\?\.caption/);
});

test("6 - WhatsApp responde seguro ante mensaje no textual", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /Por ahora solo puedo entender mensajes de texto/);
  assert.match(content, /sendTextMessage\(\s*sock,\s*jid/);
});

test("7 - WhatsApp registra errores y ofrece derivar a humano", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /Error procesando mensaje de WhatsApp/);
  assert.match(content, /Probá de nuevo/);
  assert.match(content, /humano/);
});

test("8 - WhatsApp intenta reconectar salvo logout", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /DisconnectReason\.loggedOut/);
  assert.match(content, /shouldReconnect/);
  assert.match(content, /Intentando reconectar WhatsApp/);
  assert.match(content, /await startWhatsAppBot\(\)/);
  assert.match(content, /cerró sesión/);
});

test("9 - notificaciones pendientes se despachan por WhatsApp luego de responder", () => {
  const content = readProjectFile(["src", "bot", "whatsapp.js"]);

  assert.match(content, /dispatchPendingLocalNotifications/);
  assert.match(content, /channel:\s*"WHATSAPP"/);
  assert.match(content, /dryRun:\s*false/);
  assert.match(content, /sendTextToPhone/);
});

test("10 - comandos admin cubren operacion diaria del local", () => {
  const content = readProjectFile(["src", "admin", "adminCommands.js"]);

  for (const command of [
    "/admin pedidos",
    "/admin notificaciones",
    "/admin stock",
    "/admin zonas",
    "/admin horario",
    "/admin abrir",
    "/admin cerrar",
    "/admin pausar",
    "/admin activar",
    "/admin preparar <idPedido>",
    "/admin listo <idPedido>",
    "/admin camino <idPedido>",
    "/admin entregado <idPedido>"
  ]) {
    assert.ok(content.includes(command), `Falta comando operativo ${command}`);
  }
});
