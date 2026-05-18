import { loadEnv } from "./config/env.js";
import { startWhatsAppBot } from "./bot/whatsapp.js";
import { startHttpServer } from "./server/httpServer.js";
import { initDatabase } from "./storage/database.js";
import { cleanupStaleOrderSessions } from "./storage/sessionStore.js";
import { logger } from "./utils/logger.js";

export async function startApp() {
  loadEnv();
  initDatabase();

  const cleanupResult = cleanupStaleOrderSessions();

  if (cleanupResult.deleted > 0) {
    logger.info(
      { cleanupResult },
      "Sesiones abandonadas limpiadas al iniciar."
    );
  }

  logger.info("Chatbot Hamburgueseria V3 iniciado correctamente.");
  logger.info("Base de datos SQLite inicializada.");

  startHttpServer();

  const enableWhatsApp = process.env.ENABLE_WHATSAPP === "true";

  if (!enableWhatsApp) {
    logger.info("WhatsApp no iniciado. Para activarlo usá ENABLE_WHATSAPP=true en .env");
    return;
  }

  logger.info("Iniciando conexión con WhatsApp...");
  await startWhatsAppBot();
}
