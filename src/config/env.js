import dotenv from "dotenv";

const BOOLEAN_ENV_VARS = [
  "ENABLE_WHATSAPP",
  "ENABLE_AI_FALLBACK",
  "MERCADOPAGO_DRY_RUN",
  "MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE",
  "RATE_LIMIT_ENABLED",
  "LOCAL_NOTIFICATION_DRY_RUN"
];

export function loadEnv() {
  dotenv.config();

  validateEnv();

  return process.env;
}

export function validateEnv(env = process.env) {
  const errors = [];

  validateBooleanValues(env, errors);
  validateRequiredEnvVars(env, errors);
  validateProductionEnv(env, errors);

  if (errors.length > 0) {
    throw new Error(
      "Configuración inválida:\n" +
        errors.map((error) => `- ${error}`).join("\n")
    );
  }
}

function validateRequiredEnvVars(env, errors) {
  const required = [
    "NODE_ENV",
    "DATABASE_PATH",
    "MENU_PATH",
    "OWNER_PHONE"
  ];

  if (env.ENABLE_WHATSAPP === "true") {
    required.push("WHATSAPP_AUTH_DIR");
  }

  if (env.ENABLE_AI_FALLBACK === "true") {
    required.push("OPENAI_API_KEY");
  }

  if (env.MERCADOPAGO_DRY_RUN !== "true") {
    required.push("MERCADOPAGO_ACCESS_TOKEN");
    required.push("MERCADOPAGO_NOTIFICATION_URL");
  }

  if (shouldRequireWebhookSecret(env)) {
    required.push("MERCADOPAGO_WEBHOOK_SECRET");
  }

  for (const key of required) {
    if (!env[key]) {
      errors.push(`Falta ${key}.`);
    }
  }
}

function validateProductionEnv(env, errors) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.MERCADOPAGO_DRY_RUN === "true") {
    errors.push("MERCADOPAGO_DRY_RUN no puede ser true en producción.");
  }

  if (env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE === "false") {
    errors.push("MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE no puede ser false en producción.");
  }

  if (!env.ADMIN_PHONES) {
    errors.push("Falta ADMIN_PHONES en producción.");
  }

  if (!env.DEV_ENDPOINT_TOKEN) {
    errors.push("Falta DEV_ENDPOINT_TOKEN en producción.");
  }

  if (!env.RATE_LIMIT_ENABLED || env.RATE_LIMIT_ENABLED === "false") {
    errors.push("RATE_LIMIT_ENABLED debe estar activo en producción.");
  }
}

function validateBooleanValues(env, errors) {
  for (const key of BOOLEAN_ENV_VARS) {
    const value = env[key];

    if (
      value !== undefined &&
      value !== "" &&
      value !== "true" &&
      value !== "false"
    ) {
      errors.push(`${key} debe ser "true" o "false".`);
    }
  }
}

function shouldRequireWebhookSecret(env) {
  if (env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE === "false") {
    return false;
  }

  if (env.NODE_ENV === "production") {
    return true;
  }

  return Boolean(env.MERCADOPAGO_WEBHOOK_SECRET);
}
