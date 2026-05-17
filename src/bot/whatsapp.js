import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

import { handleCustomerMessage } from "./messageHandler.js";
import { sendTextMessage, sendTextToPhone } from "./responseSender.js";
import { dispatchPendingLocalNotifications } from "../notifications/notificationDispatcher.js";
import { logger } from "../utils/logger.js";

export async function startWhatsAppBot() {
  const authDir = process.env.WHATSAPP_AUTH_DIR || "auth_info_baileys";

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Camdis Bot", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Escaneá este QR con WhatsApp para conectar el bot:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      logger.info("WhatsApp conectado correctamente.");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(
        {
          statusCode,
          shouldReconnect
        },
        "Conexión de WhatsApp cerrada."
      );

      if (shouldReconnect) {
        logger.info("Intentando reconectar WhatsApp...");
        await startWhatsAppBot();
      } else {
        logger.error("WhatsApp cerró sesión. Borrá auth_info_baileys y escaneá QR nuevamente.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") {
      return;
    }

    for (const message of messages) {
      await handleIncomingMessage(sock, message);
    }
  });

  return sock;
}

async function handleIncomingMessage(sock, message) {
  try {
    if (!message?.message) {
      return;
    }

    if (message.key?.fromMe) {
      return;
    }

    const jid = message.key.remoteJid;

    if (!jid) {
      return;
    }

    if (isGroupJid(jid)) {
      logger.info({ jid }, "Mensaje de grupo ignorado.");
      return;
    }

    const messageText = extractMessageText(message);

    if (!messageText) {
      await sendTextMessage(
        sock,
        jid,
        "Por ahora solo puedo entender mensajes de texto. Escribime tu pedido o pedime el menú."
      );
      return;
    }

    const customerPhone = extractPhoneFromJid(jid);

    logger.info(
      {
        customerPhone,
        messageText
      },
      "Mensaje recibido."
    );

    const result = await handleCustomerMessage({
      customerPhone,
      messageText
    });

    await sendTextMessage(sock, jid, result.reply);

    await dispatchPendingLocalNotifications({
      channel: "WHATSAPP",
      dryRun: false,
      sendText: async ({ destination, message }) => {
        await sendTextToPhone(sock, destination, message);
      }
    });
  } catch (error) {
    logger.error(
      {
        error: error.message,
        stack: error.stack
      },
      "Error procesando mensaje de WhatsApp."
    );

    const jid = message?.key?.remoteJid;

    if (jid) {
      await sendTextMessage(
        sock,
        jid,
        "Tuve un problema procesando el mensaje. Probá de nuevo o escribí *humano* para que te atienda una persona."
      );
    }
  }
}

function extractMessageText(message) {
  const content = message.message;

  if (content.conversation) {
    return content.conversation.trim();
  }

  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text.trim();
  }

  if (content.imageMessage?.caption) {
    return content.imageMessage.caption.trim();
  }

  if (content.videoMessage?.caption) {
    return content.videoMessage.caption.trim();
  }

  return "";
}

function extractPhoneFromJid(jid) {
  return jid.split("@")[0];
}

function isGroupJid(jid) {
  return jid.endsWith("@g.us");
}
