import { findBestProduct } from "../menu/productMatcher.js";
import { setPendingProductConfirmation } from "../orders/orderService.js";
import { saveOrderSession } from "../storage/sessionStore.js";
import { normalizeText } from "../utils/textNormalizer.js";

const PURE_GREETING_MESSAGES = new Set([
  "hola",
  "ola",
  "holis",
  "holiss",
  "olis",
  "oliss",
  "buenas",
  "buen dia",
  "buen día",
  "buenos dias",
  "buenos días",
  "buenas tardes",
  "buenas noches",
  "que tal",
  "qué tal",
  "como estas",
  "cómo estás",
  "como andas",
  "cómo andás"
]);

const LOCATION_KEYWORDS = [
  "ubicacion",
  "ubicación",
  "donde estan",
  "dónde están",
  "donde queda",
  "dónde queda",
  "direccion exacta",
  "dirección exacta",
  "ubicacion exacta",
  "ubicación exacta",
  "ubicacion del local",
  "ubicación del local",
  "direccion del local",
  "dirección del local",
  "como llego",
  "cómo llego",
  "como ir",
  "como llego al local",
  "cómo llego al local",
  "como los encuentro",
  "cómo los encuentro",
  "pasa direccion",
  "pasa dirección",
  "me pasas la direccion",
  "me pasás la dirección",
  "me pasas la ubicacion",
  "me pasás la ubicación"
];

const PRODUCT_TERMS = /\b(coca|pepsi|sprite|fanta|gaseosa|bebida|lata|papas|papa|nugget|nuggets|cheese|cheeseburger|bacon|big|cuarto|americana|americanas|araka|onion|crispy|camdis)\b/;

export async function handleCustomerInfoRequest({ order, messageText }) {
  const normalizedText = normalizeText(messageText);

  if (!normalizedText) return null;

  if (isPureGreeting(normalizedText)) {
    return {
      parsedMessage: buildSyntheticParsedMessage({ messageText, intent: "SALUDO_CLIENTE" }),
      order,
      reply: buildGreetingReply(order)
    };
  }

  if (isLocationRequest(normalizedText)) {
    return {
      parsedMessage: buildSyntheticParsedMessage({ messageText, intent: "CONSULTAR_UBICACION_LOCAL" }),
      order,
      reply: buildLocationReply()
    };
  }

  const priceQuery = extractPriceQuery(normalizedText) || extractPriceFollowUpQuery(normalizedText, order);

  if (priceQuery) {
    return buildPriceReply({ order, messageText, priceQuery });
  }

  return null;
}

function isPureGreeting(normalizedText) {
  const text = normalizedText.replace(/[!¡?¿.]+/g, "").replace(/\s+/g, " ").trim();
  return PURE_GREETING_MESSAGES.has(text);
}

function buildGreetingReply(order) {
  if (order?.items?.length > 0) {
    return "¡Hola! Ya tengo tu pedido iniciado. Podés agregar productos, modificarlo, pedirme el resumen o escribir *confirmo* cuando esté todo correcto.";
  }

  return "¡Hola! Soy el bot de Camdis. Podés pedirme el menú o escribirme qué querés encargar.";
}

function isLocationRequest(normalizedText) {
  if (/\d/.test(normalizedText) && !/\b(local|ubicacion|ubicación|donde|dónde)\b/.test(normalizedText)) {
    return false;
  }

  return LOCATION_KEYWORDS.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}(?=\\s|$)`).test(normalizedText);
  });
}

function buildLocationReply() {
  const address = process.env.STORE_ADDRESS || "Uttinger, Gral. José de San Martín y, T4103 Tafí Viejo, Tucumán.";
  return `📍 Estamos en: ${address}`;
}

function extractPriceQuery(normalizedText) {
  if (!looksLikePriceQuestion(normalizedText)) return null;

  if (/\b(todo|total|pedido|cuenta|final)\b/.test(normalizedText)) return null;

  const cleaned = normalizedText
    .replace(/\ba\s+que\s+(precio|costo)\s+(esta|está|tenes|tenés|tienen|vale|sale)\b/g, " ")
    .replace(/\ba\s+qué\s+(precio|costo)\s+(esta|está|tenes|tenés|tienen|vale|sale)\b/g, " ")
    .replace(/\bque\s+(precio|costo)\s+(tiene|tienen|tenes|tenés|esta|está)\b/g, " ")
    .replace(/\bqué\s+(precio|costo)\s+(tiene|tienen|tenes|tenés|esta|está)\b/g, " ")
    .replace(/\bcuanto\s+(sale|cuesta|vale|esta)\b/g, " ")
    .replace(/\bcuánto\s+(sale|cuesta|vale|está)\b/g, " ")
    .replace(/\b(precio|costo)\s+de\b/g, " ")
    .replace(/\bque\s+(precio|costo)\b/g, " ")
    .replace(/\bqué\s+(precio|costo)\b/g, " ")
    .replace(/\ba\s+que\s+(precio|costo)\b/g, " ")
    .replace(/\ba\s+qué\s+(precio|costo)\b/g, " ")
    .replace(/\ba\s+cuanto\b/g, " ")
    .replace(/\ba\s+cuánto\b/g, " ")
    .replace(/\b(la|el|las|los|un|una|uno|de|del|porfa|por favor|sale|cuesta|vale|esta|está|tenes|tenés|tienen|tiene|costo|precio)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function looksLikePriceQuestion(text) {
  return (
    /\bcuanto\s+(sale|cuesta|vale|esta)\b/.test(text) ||
    /\bcuánto\s+(sale|cuesta|vale|está)\b/.test(text) ||
    /\b(precio|costo)\s+de\b/.test(text) ||
    /\b(que|qué)\s+(precio|costo)\b/.test(text) ||
    /\ba\s+(que|qué)\s+(precio|costo)\b/.test(text) ||
    /\ba\s+(cuanto|cuánto)\b/.test(text)
  );
}

function extractPriceFollowUpQuery(normalizedText, order) {
  if (order?.pendingProductConfirmation?.source !== "PRICE_QUERY") return null;

  const text = normalizedText.replace(/[?¿!¡.]+/g, "").replace(/\s+/g, " ").trim();
  const directReplies = new Set(["si", "sisi", "dale", "ok", "okay", "correcto", "exacto", "no"]);

  if (!text || directReplies.has(text)) return null;

  const cleaned = text
    .replace(/^y\s+/, "")
    .replace(/^(la|el|las|los|un|una|uno)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || !PRODUCT_TERMS.test(cleaned)) return null;

  return cleaned;
}

async function buildPriceReply({ order, messageText, priceQuery }) {
  const match = await findBestProduct(priceQuery, { onlyAvailable: false });

  const parsedMessage = buildSyntheticParsedMessage({
    messageText,
    intent: "CONSULTAR_PRECIO_PRODUCTO",
    entities: {
      productQuery: priceQuery,
      productId: match.product?.id || null
    }
  });

  if (!match.product) {
    return {
      parsedMessage,
      order,
      reply: "No encontré ese producto para pasarte el precio. Podés pedirme el menú o escribirme el nombre de otra forma."
    };
  }

  const availability = match.product.disponible === false ? "\nPor ahora figura como no disponible." : "";

  if (match.product.disponible !== false) {
    setPendingProductConfirmation(order, {
      type: "ADD_PRODUCT",
      source: "PRICE_QUERY",
      quantity: 1,
      suggestions: [
        {
          id: match.product.id,
          nombre: match.product.nombre,
          precio: match.product.precio,
          confidence: match.confidence || 1
        }
      ],
      createdAt: new Date().toISOString()
    });

    if (order.customerPhone) saveOrderSession(order.customerPhone, order);
  }

  return {
    parsedMessage,
    order,
    reply: `*${match.product.nombre}* cuesta *${formatCurrency(match.product.precio)}*.${availability}\n\n¿Querés que lo agregue al pedido?`
  };
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function buildSyntheticParsedMessage({ messageText, intent, entities = {} }) {
  return {
    rawText: messageText,
    normalizedText: normalizeText(messageText),
    intent,
    confidence: 1,
    status: "OK",
    entities,
    replyHint: null
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
