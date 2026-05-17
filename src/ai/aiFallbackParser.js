import { findBestProduct } from "../menu/productMatcher.js";
import { getProducts } from "../menu/menuRepository.js";
import { normalizeText } from "../utils/textNormalizer.js";
import { CUSTOMER_INTENT, isValidCustomerIntent } from "./intentTypes.js";
import { validateParsedMessage } from "./schemas.js";
import { createStructuredIntentCompletion } from "./openAiClient.js";

const FALLBACK_STATUSES = new Set([
  "NO_MATCH",
  "PRODUCT_NOT_FOUND",
  "LOW_CONFIDENCE",
  "AMBIGUOUS"
]);

export function isAiFallbackEnabled() {
  return (
    process.env.ENABLE_AI_FALLBACK === "true" &&
    Boolean(process.env.OPENAI_API_KEY)
  );
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
    return buildParsedMessageFromAi(rawText, aiResult);
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

  const input = [
    {
      role: "system",
      content:
        "Sos un parser de mensajes de WhatsApp para una hamburguesería. " +
        "Tu tarea es devolver solamente JSON válido siguiendo el schema. " +
        "No inventes productos. Si el cliente pide un producto, devolvé productQuery con el nombre más probable."
    },
    {
      role: "user",
      content:
        `Mensaje del cliente:\n${rawText}\n\n` +
        `Catálogo disponible para reconocer nombres:\n${catalog}\n\n` +
        "Interpretá intención, cantidad, producto, entrega, dirección y forma de pago."
    }
  ];

  return createStructuredIntentCompletion({
    input,
    schema: AI_INTENT_SCHEMA
  });
}

async function buildParsedMessageFromAi(rawText, aiResult) {
  const normalizedText = normalizeText(rawText);

  const intent = isValidCustomerIntent(aiResult?.intent)
    ? aiResult.intent
    : CUSTOMER_INTENT.UNKNOWN;

  const confidence = sanitizeConfidence(aiResult?.confidence);
  const entities = {};

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
      status: productMatch.ok ? productMatch.status : productMatch.status || "PRODUCT_NOT_FOUND",
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
    "productQuery",
    "quantity",
    "deliveryType",
    "possibleAddress",
    "paymentMethod",
    "replyHint"
  ]
};
