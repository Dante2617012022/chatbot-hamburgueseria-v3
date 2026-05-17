export function shouldProcessWhatsAppMessage(message) {
  const jid = message?.key?.remoteJid;

  if (!jid) {
    return false;
  }

  if (message?.key?.fromMe) {
    return false;
  }

  if (isBlockedWhatsAppJid(jid)) {
    return false;
  }

  if (!isAllowedPrivateSender(jid)) {
    return false;
  }

  return true;
}

export function isBlockedWhatsAppJid(jid) {
  const value = String(jid || "");

  if (process.env.WHATSAPP_IGNORE_GROUPS !== "false") {
    if (value.endsWith("@g.us")) {
      return true;
    }
  }

  return (
    value.endsWith("@broadcast") ||
    value.endsWith("@newsletter") ||
    value === "status@broadcast"
  );
}

export function isAllowedPrivateSender(jid) {
  const allowedPhones = String(process.env.WHATSAPP_ALLOWED_PRIVATE_PHONES || "")
    .split(",")
    .map((phone) => phone.replace(/\D/g, ""))
    .filter(Boolean);

  if (allowedPhones.length === 0) {
    return true;
  }

  const jidPhone = String(jid || "").split("@")[0].replace(/\D/g, "");

  return allowedPhones.includes(jidPhone);
}
