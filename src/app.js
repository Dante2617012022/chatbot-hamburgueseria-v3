import { loadEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";

export function startApp() {
  loadEnv();

  logger.info("Chatbot Hamburgueseria V3 iniciado correctamente.");
  logger.info("Arquitectura base cargada.");
}
