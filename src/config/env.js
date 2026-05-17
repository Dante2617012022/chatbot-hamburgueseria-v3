import dotenv from "dotenv";

export function loadEnv() {
  dotenv.config();

  const requiredEnvVars = [];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }

  return process.env;
}
