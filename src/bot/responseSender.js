import { logger } from "../utils/logger.js";

export async function sendTextMessage(sock, jid, text) {
  if (!sock) {
    throw new Error("sock es obligatorio.");
  }

  if (!jid) {
    throw new Error("jid es obligatorio.");
  }

  if (!text) {
    logger.warn({ jid }, "No se envió mensaje porque el texto estaba vacío.");
    return;
  }

  await sock.sendMessage(jid, {
    text
  });
}
