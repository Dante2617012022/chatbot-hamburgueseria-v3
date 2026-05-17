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

export async function sendTextToPhone(sock, phone, text) {
  const jid = phoneToWhatsAppJid(phone);
  return sendTextMessage(sock, jid, text);
}

export function phoneToWhatsAppJid(phone) {
  if (!phone) {
    throw new Error("phone es obligatorio.");
  }

  const value = String(phone).trim();

  if (value.includes("@")) {
    return value;
  }

  const normalizedPhone = value.replace(/\D/g, "");

  if (!normalizedPhone) {
    throw new Error("phone inválido.");
  }

  return `${normalizedPhone}@s.whatsapp.net`;
}
