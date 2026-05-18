import { findBestProduct } from "../menu/productMatcher.js";
import { normalizeText } from "../utils/textNormalizer.js";
import { CUSTOMER_INTENT } from "./intentTypes.js";
import { validateParsedMessage } from "./schemas.js";

const ADD_KEYWORDS = [
  "tambien",
  "también",
  "quiero",
  "agregame",
  "agrega",
  "sumame",
  "sumale",
  "suma",
  "mandame",
  "manda",
  "haceme",
  "hace",
  "me haces",
  "me hacés",
  "me harias",
  "me harías",
  "dame",
  "poneme",
  "anotame",
  "va una",
  "va un",
  "me das",
  "con"
];

const REMOVE_KEYWORDS = [
  "sacame",
  "saca",
  "quitame",
  "quita",
  "eliminame",
  "elimina",
  "borrame",
  "borra",
  "no quiero"
];

const MENU_KEYWORDS = [
  "menu",
  "carta",
  "precios",
  "precio",
  "que tenes",
  "que hay",
  "opciones",
  "hamburguesas"
];

const TOTAL_KEYWORDS = [
  "cuanto es",
  "cuanto seria",
  "total",
  "cuanto va",
  "cuanto llevo",
  "precio final",
  "cuanto sale todo"
];

const CONFIRM_KEYWORDS = [
  "confirmo",
  "confirmar",
  "confirmado",
  "esta bien",
  "esta correcto",
  "dale",
  "ok",
  "listo",
  "si",
  "perfecto"
];

const CANCEL_KEYWORDS = [
  "cancelar",
  "cancela",
  "anular",
  "anula",
  "cancelar pedido",
  "borra todo",
  "vaciar pedido"
];

const HUMAN_KEYWORDS = [
  "humano",
  "persona",
  "asesor",
  "atendente",
  "empleado",
  "quiero hablar",
  "hablar con alguien"
];

const PICKUP_KEYWORDS = [
  "para llevar",
  "retiro",
  "retirar",
  "paso a buscar",
  "por el local",
  "busco por el local",
  "lo retiro"
];

const DELIVERY_KEYWORDS = [
  "delivery",
  "envio",
  "envío",
  "envio a",
  "envío a",
  "con envio",
  "con envío",
  "enviar",
  "mandar a",
  "mandalo a",
  "mandámelo a",
  "mandamelo a",
  "me lo mandas a",
  "me lo mandás a",
  "domicilio",
  "direccion",
  "dirección"
];

const PAYMENT_KEYWORDS = [
  "pago al retirar",
  "pagar al retirar",
  "pago cuando retiro",
  "mercado pago",
  "mercadopago",
  "mp",
  "efectivo",
  "transferencia",
  "pago con",
  "pagar con"
];

const FILLER_WORDS = [
  "por",
  "favor",
  "porfa",
  "me",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "uno",
  "de",
  "del",
  "al",
  "y",
  "tambien",
  "también",
  "buenas",
  "buenos",
  "dias",
  "días",
  "tardes",
  "noches",
  "tambien",
  "también",
  "con",
  "sin"
];

const NUMBER_WORDS = new Map([
  ["un", 1],
  ["una", 1],
  ["uno", 1],
  ["unas", 1],
  ["unos", 1],
  ["otra", 1],
  ["otro", 1],
  ["otras", 1],
  ["otros", 1],
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

export async function parseCustomerMessage(rawText) {
  const normalizedText = normalizeText(rawText);

  if (!normalizedText) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.UNKNOWN,
      confidence: 0,
      status: "EMPTY_MESSAGE",
      replyHint: "No recibí ningún mensaje. ¿Me podés escribir tu pedido?"
    });
  }

  if (containsAny(normalizedText, HUMAN_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.TALK_TO_HUMAN,
      confidence: 0.95,
      status: "OK"
    });
  }

  if (containsAny(normalizedText, CANCEL_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.CANCEL_ORDER,
      confidence: 0.95,
      status: "OK"
    });
  }

  if (containsAny(normalizedText, MENU_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.VIEW_MENU,
      confidence: 0.95,
      status: "OK"
    });
  }

  if (containsAny(normalizedText, TOTAL_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.ASK_TOTAL,
      confidence: 0.95,
      status: "OK"
    });
  }

  if (containsAny(normalizedText, PAYMENT_KEYWORDS)) {
    return parsePaymentMessage({ rawText, normalizedText });
  }

  if (containsAny(normalizedText, PICKUP_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.CHOOSE_PICKUP,
      confidence: 0.9,
      status: "OK",
      entities: {
        deliveryType: "RETIRO"
      }
    });
  }

  if (containsAny(normalizedText, DELIVERY_KEYWORDS)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.CHOOSE_DELIVERY,
      confidence: 0.85,
      status: "OK",
      entities: {
        deliveryType: "DELIVERY",
        possibleAddress: extractAddress(normalizedText)
      }
    });
  }

  if (isConfirmationMessage(normalizedText)) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.CONFIRM_ORDER,
      confidence: 0.85,
      status: "OK"
    });
  }

  if (containsAny(normalizedText, REMOVE_KEYWORDS)) {
    return parseProductActionMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.REMOVE_PRODUCT,
      actionKeywords: REMOVE_KEYWORDS
    });
  }

  if (containsAny(normalizedText, ADD_KEYWORDS)) {
    return parseProductActionMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.ADD_PRODUCT,
      actionKeywords: ADD_KEYWORDS
    });
  }

  return parsePossibleProductOnlyMessage({ rawText, normalizedText });
}

async function parseProductActionMessage({
  rawText,
  normalizedText,
  intent,
  actionKeywords
}) {
  const quantity = intent === CUSTOMER_INTENT.ADD_PRODUCT
    ? extractQuantity(normalizedText)
    : null;

  const productQuery = cleanProductQuery(normalizedText, actionKeywords);

  const productMatch = await findProductWithFallback(productQuery, normalizedText);

  if (!productMatch.ok) {
    return buildParsedMessage({
      rawText,
      normalizedText,
      intent,
      confidence: productMatch.confidence || 0.35,
      status: productMatch.status || "PRODUCT_NOT_FOUND",
      entities: {
        quantity: quantity || 1,
        product: productMatch.product || null,
        suggestions: productMatch.suggestions || []
      },
      replyHint: "No estoy seguro de qué producto querés. ¿Me lo podés escribir de otra forma?"
    });
  }

  return buildParsedMessage({
    rawText,
    normalizedText,
    intent,
    confidence: productMatch.confidence,
    status: productMatch.status,
    entities: {
      quantity: quantity || 1,
      product: productMatch.product,
      suggestions: productMatch.suggestions
    }
  });
}

async function parsePossibleProductOnlyMessage({ rawText, normalizedText }) {
  const productMatch = await findBestProduct(normalizedText);

  if (!productMatch.ok) {
    if (productMatch.status === "PRODUCT_UNAVAILABLE") {
      return buildParsedMessage({
        rawText,
        normalizedText,
        intent: CUSTOMER_INTENT.ADD_PRODUCT,
        confidence: productMatch.confidence || 0.8,
        status: "PRODUCT_UNAVAILABLE",
        entities: {
          quantity: 1,
          product: productMatch.product,
          suggestions: productMatch.suggestions || []
        },
        replyHint: "Ese producto no está disponible en este momento."
      });
    }

    return buildParsedMessage({
      rawText,
      normalizedText,
      intent: CUSTOMER_INTENT.UNKNOWN,
      confidence: 0.2,
      status: "NO_MATCH",
      replyHint: "No entendí el mensaje. Podés pedirme el menú o escribirme el producto que querés."
    });
  }

  return buildParsedMessage({
    rawText,
    normalizedText,
    intent: CUSTOMER_INTENT.ADD_PRODUCT,
    confidence: productMatch.confidence,
    status: productMatch.status,
    entities: {
      quantity: 1,
      product: productMatch.product,
      suggestions: productMatch.suggestions
    }
  });
}

function parsePaymentMessage({ rawText, normalizedText }) {
  let paymentMethod = null;

  if (
    normalizedText.includes("mercado pago") ||
    normalizedText.includes("mercadopago") ||
    normalizedText === "mp" ||
    normalizedText.includes(" mp ")
  ) {
    paymentMethod = "MERCADO_PAGO";
  } else if (
    normalizedText.includes("efectivo") ||
    normalizedText.includes("pago al retirar") ||
    normalizedText.includes("pagar al retirar") ||
    normalizedText.includes("pago cuando retiro")
  ) {
    paymentMethod = "EFECTIVO";
  } else if (normalizedText.includes("transferencia")) {
    paymentMethod = "TRANSFERENCIA";
  }

  return buildParsedMessage({
    rawText,
    normalizedText,
    intent: CUSTOMER_INTENT.CHOOSE_PAYMENT,
    confidence: paymentMethod ? 0.95 : 0.7,
    status: paymentMethod ? "OK" : "PAYMENT_METHOD_NOT_CLEAR",
    entities: {
      paymentMethod
    },
    replyHint: paymentMethod
      ? null
      : "¿Querés pagar con Mercado Pago, efectivo o transferencia?"
  });
}

async function findProductWithFallback(productQuery, normalizedText) {
  const productMatch = await findBestProduct(productQuery);

  if (productMatch.ok || productMatch.status === "PRODUCT_UNAVAILABLE") {
    return productMatch;
  }

  const fallbackMatch = await findBestProduct(normalizedText);

  if (fallbackMatch.ok || fallbackMatch.status === "PRODUCT_UNAVAILABLE") {
    return fallbackMatch;
  }

  return productMatch;
}

function cleanProductQuery(normalizedText, actionKeywords) {
  let result = ` ${normalizedText} `;

  const keywords = [...actionKeywords].sort((a, b) => b.length - a.length);

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    result = result.replaceAll(` ${normalizedKeyword} `, " ");
  }

  for (const [numberWord] of NUMBER_WORDS) {
    result = result.replace(new RegExp(`\\b${numberWord}\\b`, "g"), " ");
  }

  result = result.replace(/\b([2-9]|[1-4][0-9]|50)\b/g, " ");

  for (const filler of FILLER_WORDS) {
    const normalizedFiller = normalizeText(filler);
    result = result.replace(new RegExp(`\\b${normalizedFiller}\\b`, "g"), " ");
  }

  return normalizeText(result);
}

function extractQuantity(normalizedText) {
  const digitMatch = normalizedText.match(/\b([1-9]|[1-4][0-9]|50)\b/);

  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const words = normalizedText.split(" ");

  for (const word of words) {
    if (NUMBER_WORDS.has(word)) {
      return NUMBER_WORDS.get(word);
    }
  }

  return 1;
}

function extractAddress(normalizedText) {
  const markers = [
    "direccion",
    "dirección",
    "domicilio",
    "delivery a",
    "envio a",
    "envío a",
    "con envio a",
    "con envío a",
    "enviar a",
    "mandar a",
    "mandalo a",
    "mandámelo a",
    "mandamelo a",
    "me lo mandas a",
    "me lo mandás a"
  ];

  for (const marker of markers) {
    const normalizedMarker = normalizeText(marker);
    const index = normalizedText.indexOf(normalizedMarker);

    if (index !== -1) {
      return normalizedText.slice(index + normalizedMarker.length).trim() || null;
    }
  }

  return null;
}

function containsAny(normalizedText, keywords) {
  return keywords.some((keyword) => containsKeyword(normalizedText, keyword));
}

function containsKeyword(normalizedText, keyword) {
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  const escapedKeyword = escapeRegExp(normalizedKeyword);
  const regex = new RegExp(`(^|\\s)${escapedKeyword}(?=\\s|$)`, "i");

  return regex.test(normalizedText);
}

function isConfirmationMessage(normalizedText) {
  return CONFIRM_KEYWORDS.some((keyword) =>
    containsKeyword(normalizedText, keyword)
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function buildParsedMessage({
  rawText,
  normalizedText,
  intent,
  confidence,
  status,
  entities = {},
  replyHint = null
}) {
  const parsedMessage = {
    rawText: rawText || "",
    normalizedText,
    intent,
    confidence: Number(confidence.toFixed(2)),
    status,
    entities,
    replyHint
  };

  return validateParsedMessage(parsedMessage);
}
