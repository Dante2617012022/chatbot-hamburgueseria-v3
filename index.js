import { startApp } from "./src/app.js";
import { logger } from "./src/utils/logger.js";

try {
  await startApp();
} catch (error) {
  logger.error(
    {
      error: error.message,
      stack: error.stack
    },
    "Error fatal iniciando la aplicación."
  );

  process.exit(1);
}
