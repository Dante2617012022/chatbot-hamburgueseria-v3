import { findBestProduct } from "../menu/productMatcher.js";
import { getProducts } from "../menu/menuRepository.js";
import { normalizeText } from "../utils/textNormalizer.js";
import { CUSTOMER_INTENT, isValidCustomerIntent } from "./intentTypes.js";
import { validateParsedMessage } from "./schemas.js";
import { createStructuredIntentCompletion } from "./openAiClient.js";
import { buildAiFallbackPromptInput } from "./aiFallbackPrompt.js";

const FALLBACK_STATUSES = new Set([
  "NO_MATCH",
  "PRODUCT_NOT_FOUND",
  "LOW_CONFIDENCE",
  "AMBIGUOUS"
]);

const SAFE_AI_FALLBACK_INTENTS = new Set([
  CUSTOMER_INTENT.VIEW_MENU,
  CUSTOMER_INTENT.ADD_PRODUCT,
  CUSTOMER_INTENT.REMOVE_PRODUCT,
  CUSTOMER_INTENT.ASK_TOTAL,
  CUSTOMER_INTENT.CHOOSE_PICKUP,
  CUSTOMER_INTENT.CHOOSE_DELIVERY,
  CUSTOMER_INTENT.CHOOSE_PAYMENT,
  CUSTOMER_INTENT.TALK_TO_HUMAN,
  CUSTOMER_INTENT.UNKNOWN
]);

const BLOCKED_AI_FALLBACK_INTENTS = new Set([
  CUSTOMER_INTENT.CONFIRM_ORDER,
  CUSTOMER_INTENT.CANCEL_ORDER,
  CUSTOMER_INTENT.MODIFY_PRODUCT,
  CUSTOMER_INTENT.SEND_ADDRESS,
  CUSTOMER_INTENT.ASK_HOURS,
  CUSTOMER_INTENT.ASK_DELIVERY
]);

const VALID_AI_RESOLUTIONS = new Set([
  "SAFE_MATCH",
  "AMBIGUOUS",
  "INCOMPLETE",
  "INVALID"
]);

export function isAiFallbackEnabled() {
  return (
    process.env.ENABLE_AI_FALLBACK === "true" &&
    Boolean(process.env.OPENAI_API_KEY)
  );
}

export function getAiFallbackMinConfidence() {
  const configured = Number(process.env.AI_FALLBACK_MIN_CONFIDENCE || 0.7);

  if (!Number.isFinite(configured)) {
    return 0.7;
  }

  return Math.min(1, Math.max(0, configured));
}

export function shouldUseAiFallback(parsedMessage) {
  if (!parsedMessage) {
    return true;
  }

  if (parsedMessage.intent === CUSTOMER_INTENT.UNKNOWN) {
    return true;
  }

  return FALLBACK_STATUSES.has(parsedMessage.status);
}

export async function parseCustomerMessageWithAiFallback(
  rawText,
  {
    previousParsedMessage = null,
    enabled = isAiFallbackEnabled(),
    minConfidence = getAiFallbackMinConfidence(),
    modelParser = callOpenAiIntentParser
  } = {}
) {
  if (!enabled) {
    return null;
  }

  if (previousParsedMessage && !shouldUseAiFallback(previousParsedMessage)) {
    return null;
  }

  try {
    const aiResult = await modelParser(rawText);
    return buildParsedMessageFromAi(rawText, aiResult, { minConfidence });
  } catch {
    return null;
  }
}

async function callOpenAiIntentParser(rawText) {
  const products = await getProducts({
    onlyAvailable: false
  });

  const catalog = products
    .map((product) => {
      const aliases = (product.alias || []).join(", ");

      return `- ${product.nombre}; id=${product.id}; aliases=${aliases}`;
    })
    .join("\n");

  return createStructuredIntentCompletion({
    input: buildAiFallbackPromptInput({ rawText, catalog }),
    schema: AI_INTENT_SCHEMA
  });
}

async function buildParsedMessageFromAi(rawText, aiResult, { minConfidence }) {
  const normalizedText = normalizeText(rawText);

  const intent = isValidCustomerIntent(aiResult?.intent)
    ? aiResult.intent
    : CUSTOMER_INTENT.UNKNOWN;

  const confidence = sanitizeConfidence(aiResult?.confidence);
  const aiResolution = normalizeAiResolution(aiResult?.resolution);

  if (aiResolution === "INVALID_RESOLUTION") {
    return buildRejectedAiParsedMessage({
      rawText,
      normalizedText,
      status: "AI_INVALID_RESOLUTION",
      entities: {
        aiResolution: aiResult?.resolution || null
      },
      replyHint: "No pude procesar eso automáticamente. Escribime el producto de otra forma o pedí ayuda humana."
    });
  }

  if (aiResolution === "INVALID") {
    return buildRejectedAiParsedMessage({
      rawText,
      normalizedText,
      status: "AI_INVALID",
      entities: {
        aiResolution
      },
      replyHint: aiResult?.replyHint || "No pude procesar eso automáticamente."
    });
  }

  if (aiResolution === "AMBIGUOUS" || aiResolution === "INCOMPLETE") {
    return buildRejectedAiParsedMessage({
      rawText,
      normalizedText,
      status: aiResolution === "AMBIGUOUS" ? "AI_AMBIGUOUS" : "AI_INCOMPLETE",
      entities: {
        aiResolution,
        productQuery: aiResult?.productQuery || null
      },
      replyHint:
        aiResult?.replyHint ||
        "Te entendí, pero necesito que me aclares una opción para no cargar mal el pedido."
    });
  }

  if (confidence < minConfidence) {
    return buildRejectedAiParsedMessage({
      rawText,
      normalizedText,
      status: "AI_LOW_CONFIDENCE",
      replyHint: "No estoy seguro de haber entendido. ¿Me lo podés escribir de otra forma?"
    });
  }

  if (BLOCKED_AI_FALLBACK_INTENTS.has(intent) || !SAFE_AI_FALLBACK_INTENTS.has(intent)) {
    return buildRejectedAiParsedMessage({
      rawText,
      normalizedText,
      status: "AI_BLOCKED_INTENT",
      replyHint: "No pude procesar eso automáticamente. Escribime el producto o pedime ayuda humana."
    });
  }

  const entities = {
    aiResolution
  };

  if (
    intent === CUSTOMER_INTENT.ADD_PRODUCT ||
    intent === CUSTOMER_INTENT.REMOVE_PRODUCT
  ) {
    const quantity = sanitizeQuantity(aiResult?.quantity);
    const productQuery = aiResult?.productQuery || rawText;
    const productMatch = await findBestProduct(productQuery);

    entities.quantity = quantity;
    entities.product = productMatch.product || null;
    entities.suggestions = productMatch.suggestions || [];

    return validateParsedMessage({
      rawText: rawText || "",
      normalizedText,
      intent,
      confidence: productMatch.confidence || confidence,
      status: productMatch.ok ? "AI_FALLBACK_PRODUCT_MATCH" : productMatch.status || "PRODUCT_NOT_FOUND",
      entities,
      replyHint: productMatch.ok
        ? null
        : "No estoy seguro de qué producto querés. ¿Me lo podés escribir de otra forma?"
    });
  }

  if (intent === CUSTOMER_INTENT.CHOOSE_DELIVERY) {
    entities.deliveryType = "DELIVERY";
    entities.possibleAddress = aiResult?.possibleAddress || null;
  }

  if (intent === CUSTOMER_INTENT.CHOOSE_PICKUP) {
    entities.deliveryType = "RETIRO";
  }

  if (intent === CUSTOMER_INTENT.CHOOSE_PAYMENT) {
    entities.paymentMethod = normalizePaymentMethod(aiResult?.paymentMethod);

    if (!entities.paymentMethod) {
      return buildRejectedAiParsedMessage({
        rawText,
        normalizedText,
        status: "AI_INVALID_PAYMENT_METHOD",
        replyHint: "No pude detectar la forma de pago. Puede ser Mercado Pago, efectivo o transferencia."
      });
    }
  }

  return validateParsedMessage({
    rawText: rawText || "",
    normalizedText,
    intent,
    confidence,
    status: intent === CUSTOMER_INTENT.UNKNOWN ? "AI_UNKNOWN" : "AI_FALLBACK",
    entities,
    replyHint: aiResult?.replyHint || null
  });
}

function buildRejectedAiParsedMessage({
  rawText,
  normalizedText,
  status,
  replyHint,
  entities = {}
}) {
  return validateParsedMessage({
    rawText: rawText || "",
    normalizedText,
    intent: CUSTOMER_INTENT.UNKNOWN,
    confidence: 0,
    status,
    entities,
    replyHint
  });
}

function sanitizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, Number(number.toFixed(2))));
}

function sanitizeQuantity(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return 1;
  }

  return Math.min(number, 50);
}

function normalizePaymentMethod(value) {
  const normalized = normalizeText(String(value || ""));

  if (normalized.includes("mercado") || normalized === "mp") {
    return "MERCADO_PAGO";
  }

  if (normalized.includes("efectivo")) {
    return "EFECTIVO";
  }

  if (normalized.includes("transferencia")) {
    return "TRANSFERENCIA";
  }

  return null;
}

function normalizeAiResolution(value) {
  if (value === null || value === undefined || value === "") {
    return "SAFE_MATCH";
  }

  const normalized = String(value).trim().toUpperCase();

  if (VALID_AI_RESOLUTIONS.has(normalized)) {
    return normalized;
  }

  return "INVALID_RESOLUTION";
}

const AI_INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "VER_MENU",
        "AGREGAR_PRODUCTO",
        "QUITAR_PRODUCTO",
        "MODIFICAR_PRODUCTO",
        "PEDIR_TOTAL",
        "CONFIRMAR_PEDIDO",
        "CANCELAR_PEDIDO",
        "CONSULTAR_HORARIO",
        "CONSULTAR_ENVIO",
        "ENVIAR_DIRECCION",
        "ELEGIR_RETIRO",
        "ELEGIR_DELIVERY",
        "ELEGIR_FORMA_PAGO",
        "HABLAR_CON_PERSONA",
        "NO_ENTENDIDO"
      ]
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    resolution: {
      type: ["string", "null"],
      enum: ["SAFE_MATCH", "AMBIGUOUS", "INCOMPLETE", "INVALID", null]
    },
    productQuery: {
      type: ["string", "null"]
    },
    quantity: {
      type: "integer",
      minimum: 1,
      maximum: 50
    },
    deliveryType: {
      type: ["string", "null"],
      enum: ["DELIVERY", "RETIRO", null]
    },
    possibleAddress: {
      type: ["string", "null"]
    },
    paymentMethod: {
      type: ["string", "null"],
      enum: ["MERCADO_PAGO", "EFECTIVO", "TRANSFERENCIA", null]
    },
    replyHint: {
      type: ["string", "null"]
    }
  },
  required: [
    "intent",
    "confidence",
    "resolution",
    "productQuery",
    "quantity",
    "deliveryType",
    "possibleAddress",
    "paymentMethod",
    "replyHint"
  ]
};
