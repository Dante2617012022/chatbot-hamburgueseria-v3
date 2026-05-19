import { findBestProduct } from "../menu/productMatcher.js";
import {
  addProductToOrder,
  clearPendingProductConfirmation,
  removeProductFromOrder,
  setDeliveryData,
  setPendingProductConfirmation,
  updateItemQuantity
} from "../orders/orderService.js";
import { formatOrderSummary } from "../orders/orderFormatter.js";
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

const PRODUCT_TERMS = /\b(coca|pepsi|sprite|fanta|gaseosa|gaseosas|bebida|bebidas|lata|latas|papas|papa|nugget|nuggets|cheese|cheeseburger|bacon|big|cuarto|americana|americanas|araka|onion|crispy|camdis)\b/;

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

export async function handleCustomerInfoRequest({ order, messageText }) {
  const normalizedText = normalizeText(messageText);

  if (!normalizedText) return null;

  const realFlowResult = await handleRealFlowQuickFixes({
    order,
    messageText,
    normalizedText
  });

  if (realFlowResult) {
    return realFlowResult;
  }

  const pendingPriceConfirmationResult = await handlePendingPriceConfirmationMessage({
    order,
    messageText,
    normalizedText
  });

  if (pendingPriceConfirmationResult) {
    return pendingPriceConfirmationResult;
  }

  clearStalePriceConfirmationForNewProductOrder({
    order,
    normalizedText
  });

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

  const availabilityQuery = extractAvailabilityQuery(normalizedText);

  if (availabilityQuery) {
    return buildPriceReply({ order, messageText, priceQuery: availabilityQuery });
  }

  return null;
}

async function handleRealFlowQuickFixes({ order, messageText, normalizedText }) {
  const deliveryResult = handleDeliveryTypoChoice({ order, messageText, normalizedText });

  if (deliveryResult) {
    return deliveryResult;
  }

  const quantityAdjustmentResult = handleQuantityAdjustment({ order, messageText, normalizedText });

  if (quantityAdjustmentResult) {
    return quantityAdjustmentResult;
  }

  const removeQuantityResult = handleRemoveQuantityRequest({ order, messageText, normalizedText });

  if (removeQuantityResult) {
    return removeQuantityResult;
  }

  return null;
}

function handleDeliveryTypoChoice({ order, messageText, normalizedText }) {
  const text = normalizedText.replace(/[?¿!¡.,]+/g, " ").replace(/\s+/g, " ").trim();

  if (![
    "delivery",
    "delibery",
    "delivwry",
    "delibwry",
    "envio",
    "con delivery",
    "con envio",
    "a domicilio"
  ].includes(text)) {
    return null;
  }

  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: null,
    deliveryZone: null,
    deliveryCost: 0
  });

  if (order.customerPhone) {
    saveOrderSession(order.customerPhone, order);
  }

  return {
    parsedMessage: buildSyntheticParsedMessage({
      messageText,
      intent: "ELEGIR_DELIVERY_SIN_DIRECCION",
      entities: {
        deliveryType: "DELIVERY"
      }
    }),
    order,
    reply:
      "Actualicé los datos de tu pedido.\nEntrega: *delivery* sin costo\n\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function handleQuantityAdjustment({ order, messageText, normalizedText }) {
  if (!order?.items?.length) {
    return null;
  }

  const adjustment = parseQuantityAdjustment(normalizedText);

  if (!adjustment) {
    return null;
  }

  const item = findMatchingItemInOrder(order, adjustment.query);

  if (!item) {
    return null;
  }

  const productId = getItemProductId(item);
  const result = updateItemQuantity(order, productId, adjustment.quantity);

  if (!result.updated) {
    return null;
  }

  if (order.customerPhone) {
    saveOrderSession(order.customerPhone, order);
  }

  return {
    parsedMessage: buildSyntheticParsedMessage({
      messageText,
      intent: "AJUSTAR_CANTIDAD_PRODUCTO",
      entities: {
        productId,
        quantity: adjustment.quantity
      }
    }),
    order,
    reply:
      `Listo, dejé *${adjustment.quantity} x ${getItemName(item)}* en tu pedido.\n\n` +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function parseQuantityAdjustment(normalizedText) {
  const text = normalizedText
    .replace(/^(ok|okay|dale|bueno|listo)\s+/, "")
    .replace(/[?¿!¡.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let match = text.match(/^(?:una|un|uno|1)\s+sol[ao]\s+(.+)$/);

  if (match?.[1]) {
    return {
      quantity: 1,
      query: cleanProductQuery(match[1])
    };
  }

  match = text.match(/^(.+?)\s+(?:una|un|uno|1)\s+sol[ao]$/);

  if (match?.[1]) {
    return {
      quantity: 1,
      query: cleanProductQuery(match[1])
    };
  }

  match = text.match(/^([0-9]+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.+?)\s+no\s+([0-9]+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)$/);

  if (match?.[1] && match?.[2]) {
    return {
      quantity: parseQuantityToken(match[1]),
      query: cleanProductQuery(match[2])
    };
  }

  return null;
}

function handleRemoveQuantityRequest({ order, messageText, normalizedText }) {
  if (!order?.items?.length) {
    return null;
  }

  const parsed = parseRemoveQuantityRequest(normalizedText);

  if (!parsed) {
    return null;
  }

  const item = findMatchingItemInOrder(order, parsed.query);

  if (!item) {
    return null;
  }

  const productId = getItemProductId(item);
  const quantity = parsed.quantity || 1;
  removeProductFromOrder(order, productId, { quantity });

  if (order.customerPhone) {
    saveOrderSession(order.customerPhone, order);
  }

  return {
    parsedMessage: buildSyntheticParsedMessage({
      messageText,
      intent: "QUITAR_PRODUCTO_DEL_PEDIDO",
      entities: {
        productId,
        quantity
      }
    }),
    order,
    reply:
      `Quité *${quantity} x ${getItemName(item)}* de tu pedido.\n\n` +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function parseRemoveQuantityRequest(normalizedText) {
  const text = normalizedText
    .replace(/^(ok|okay|dale|bueno|listo)\s+/, "")
    .replace(/[?¿!¡.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = text.match(/^(?:restame|resta|sacame|saca|quitame|quita)\s+([0-9]+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.+)$/);

  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    quantity: parseQuantityToken(match[1]),
    query: cleanProductQuery(match[2])
  };
}

function parseQuantityToken(value) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const numbers = new Map([
    ["un", 1],
    ["una", 1],
    ["uno", 1],
    ["dos", 2],
    ["tres", 3],
    ["cuatro", 4],
    ["cinco", 5],
    ["seis", 6],
    ["siete", 7],
    ["ocho", 8],
    ["nueve", 9],
    ["diez", 10]
  ]);

  return numbers.get(value) || 1;
}

function cleanProductQuery(value) {
  return normalizeText(value)
    .replace(/\b(gaseosas|bebidas|latas)\b/g, (match) => {
      if (match === "gaseosas") return "gaseosa";
      if (match === "bebidas") return "bebida";
      if (match === "latas") return "lata";
      return match;
    })
    .replace(/\b(de|del|la|el|los|las)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingItemInOrder(order, query) {
  const text = cleanProductQuery(query);

  if (!text) {
    return null;
  }

  const direct = order.items.filter((item) => {
    const value = normalizeText(`${getItemProductId(item)} ${getItemName(item)} ${item.category || ""}`);
    return value.includes(text) || text.includes(value) || tokenMatchesItem(value, text);
  });

  if (direct.length === 1) {
    return direct[0];
  }

  if (/\b(gaseosa|bebida|coca|pepsi|sprite|fanta|lata)\b/.test(text)) {
    const drinks = order.items.filter((item) =>
      /\b(gaseosa|bebida|coca|pepsi|sprite|fanta|lata)\b/.test(
        normalizeText(`${getItemProductId(item)} ${getItemName(item)} ${item.category || ""}`)
      )
    );

    if (drinks.length === 1) {
      return drinks[0];
    }
  }

  return direct[0] || null;
}

function tokenMatchesItem(itemValue, query) {
  return query.split(/\s+/).some((token) => token.length >= 4 && itemValue.includes(token));
}

function getItemProductId(item) {
  return item.productId || item.id || item.product?.id;
}

function getItemName(item) {
  return item.name || item.nombre || item.productName || item.product?.nombre || getItemProductId(item);
}

function extractAvailabilityQuery(normalizedText) {
  const text = normalizedText.replace(/[?¿!¡.,]+/g, " ").replace(/\s+/g, " ").trim();

  if (looksLikePriceQuestion(text)) {
    return null;
  }

  if (!/\b(venden|vende|tenes|tenés|tienen|hay)\b/.test(text)) {
    return null;
  }

  if (/\b(quiero|agrega|agregame|sumame|preparame|dame|mandame)\b/.test(text)) {
    return null;
  }

  const cleaned = cleanProductQuery(
    text
      .replace(/^(venden|vende|tenes|tenés|tienen|hay)\s+/, " ")
      .replace(/\s+(venden|vende|tenes|tenés|tienen|hay)$/g, " ")
      .replace(/\b(la|el|las|los|un|una|uno|de|del|porfa|por favor)\b/g, " ")
  );

  if (!cleaned || !PRODUCT_TERMS.test(cleaned)) {
    return null;
  }

  return normalizeAvailabilityProductQuery(cleaned);
}

function normalizeAvailabilityProductQuery(query) {
  if (["gaseosa", "bebida", "coca", "pepsi", "sprite", "fanta"].includes(query)) {
    return "gaseosa grande";
  }

  if (query === "lata") {
    return "lata";
  }

  return query;
}

async function handlePendingPriceConfirmationMessage({
  order,
  messageText,
  normalizedText
}) {
  const pending = order?.pendingProductConfirmation;

  if (pending?.source !== "PRICE_QUERY") {
    return null;
  }

  if (!isAddPriceConfirmationReply(normalizedText)) {
    return null;
  }

  const suggestion = pending.suggestions?.[0];

  if (!suggestion?.id) {
    return null;
  }

  await addProductToOrder(order, suggestion.id, {
    quantity: pending.quantity || 1
  });

  clearPendingProductConfirmation(order);

  if (order.customerPhone) {
    saveOrderSession(order.customerPhone, order);
  }

  return {
    parsedMessage: buildSyntheticParsedMessage({
      messageText,
      intent: "CONFIRMAR_SUGERENCIA_PRODUCTO",
      entities: {
        productId: suggestion.id,
        quantity: pending.quantity || 1
      }
    }),
    order,
    reply:
      `Perfecto, agregué *${suggestion.nombre}* a tu pedido.\n\n` +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function clearStalePriceConfirmationForNewProductOrder({
  order,
  normalizedText
}) {
  if (order?.pendingProductConfirmation?.source !== "PRICE_QUERY") {
    return;
  }

  if (!looksLikeNewProductOrder(normalizedText)) {
    return;
  }

  clearPendingProductConfirmation(order);

  if (order.customerPhone) {
    saveOrderSession(order.customerPhone, order);
  }
}

function isAddPriceConfirmationReply(normalizedText) {
  const text = normalizedText
    .replace(/[?¿!¡.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return new Set([
    "si agrega",
    "si agregalo",
    "si agregala",
    "si sumale",
    "si sumalo",
    "si sumala",
    "agrega",
    "agregalo",
    "agregala",
    "sumale",
    "sumalo",
    "sumala",
    "mandale",
    "lo quiero",
    "quiero ese",
    "quiero esa"
  ]).has(text);
}

function looksLikeNewProductOrder(normalizedText) {
  return (
    /^(quiero|agregame|agrega|sumame|sumale|dame|mandame|preparame|prepárame|me\s+preparas|me\s+preparás|me\s+armas|me\s+armás|necesito)\b/.test(normalizedText) &&
    PRODUCT_TERMS.test(normalizedText)
  );
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
  const directReplies = new Set([
    "si",
    "sisi",
    "si agrega",
    "si agregalo",
    "si sumale",
    "dale",
    "ok",
    "okay",
    "correcto",
    "exacto",
    "no"
  ]);

  if (!text || directReplies.has(text)) return null;

  if (!/^y\s+/.test(text)) return null;

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

function buildNextStepPrompt(order) {
  if (!order?.items?.length) {
    return "";
  }

  const missing = [];

  if (!order.deliveryType) {
    missing.push("*entrega*: delivery o retiro por el local");
    missing.push("*dirección*: solo si es delivery");
  } else if (order.deliveryType === "DELIVERY" && !order.deliveryAddress) {
    missing.push("*dirección* para el delivery");
  }

  if (!order.paymentMethod) {
    missing.push("*forma de pago*: Mercado Pago, efectivo o transferencia");
  }

  if (missing.length === 0) {
    return "\n\nYa tengo todos los datos. Si está todo correcto, respondé *confirmo*.";
  }

  return (
    "\n\nPara completar el pedido me falta:" +
    "\n" +
    missing.map((item) => `- ${item}`).join("\n") +
    "\n\nPodés mandarlo todo junto, por ejemplo: *delivery a Centenario 49 pago Mercado Pago* o *retiro efectivo*."
  );
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
