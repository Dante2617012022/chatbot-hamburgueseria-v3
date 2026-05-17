import { findBestProduct } from "../menu/productMatcher.js";
import { normalizeText } from "../utils/textNormalizer.js";

const NUMBER_WORDS = new Map([
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

export async function parseMultiProductMessage(messageText) {
  const normalizedText = normalizeText(messageText);

  if (!shouldTryMultiProduct(normalizedText)) {
    return {
      ok: false,
      status: "NOT_MULTI_PRODUCT",
      items: []
    };
  }

  const productRequests = extractProductRequests(normalizedText);

  if (productRequests.length < 2) {
    return {
      ok: false,
      status: "NOT_ENOUGH_ITEMS",
      items: []
    };
  }

  const items = [];
  const failedItems = [];

  for (const request of productRequests) {
    const match = await findBestProduct(request.query);

    if (!match.ok || !match.product) {
      failedItems.push({
        request,
        match
      });
      continue;
    }

    items.push({
      quantity: request.quantity,
      product: match.product,
      confidence: match.confidence,
      status: match.status
    });
  }

  if (items.length < 2) {
    return {
      ok: false,
      status: "MULTI_PRODUCT_LOW_CONFIDENCE",
      items,
      failedItems
    };
  }

  return {
    ok: true,
    status: failedItems.length > 0 ? "PARTIAL_MATCH" : "AUTO_MATCH",
    items,
    failedItems
  };
}

function shouldTryMultiProduct(normalizedText) {
  if (!normalizedText) {
    return false;
  }

  const hasAddVerb =
    /\b(quiero|dame|agregame|agrega|sumame|suma|mandame|pone|poneme|necesito)\b/.test(
      normalizedText
    );

  const hasConnector =
    normalizedText.includes(" y ") ||
    normalizedText.includes(",") ||
    normalizedText.includes(" mas ");

  const hasSpecialTwoDoubles =
    normalizedText.includes("dos dobles") &&
    normalizedText.includes("bacon") &&
    normalizedText.includes("cheese");

  return (hasAddVerb && hasConnector) || hasSpecialTwoDoubles;
}

function extractProductRequests(normalizedText) {
  const special = extractSpecialTwoDoubles(normalizedText);

  if (special.length > 0) {
    return special;
  }

  let text = normalizedText
    .replace(/^(quiero|dame|agregame|agrega|sumame|suma|mandame|pone|poneme|necesito)\s+/, "")
    .replace(/\bmas\b/g, " y ");

  text = protectInternalConnectors(text);

  const parts = text
    .split(/\s+y\s+|,/)
    .map((part) => restoreInternalConnectors(part).trim())
    .filter(Boolean);

  return parts
    .map(parseProductPart)
    .filter((request) => request.query.length >= 2);
}

function extractSpecialTwoDoubles(normalizedText) {
  if (
    normalizedText.includes("dos dobles") &&
    normalizedText.includes("bacon") &&
    normalizedText.includes("cheese")
  ) {
    return [
      {
        quantity: 1,
        query: "bacon doble"
      },
      {
        quantity: 1,
        query: "cheeseburger doble"
      }
    ];
  }

  return [];
}

function parseProductPart(part) {
  let cleaned = part
    .replace(/^(de|del|la|el|los|las)\s+/, "")
    .replace(/\bpor favor\b/g, "")
    .trim();

  const firstWord = cleaned.split(/\s+/)[0];
  let quantity = 1;

  if (/^\d+$/.test(firstWord)) {
    quantity = Number(firstWord);
    cleaned = cleaned.replace(/^\d+\s+/, "").trim();
  } else if (NUMBER_WORDS.has(firstWord)) {
    quantity = NUMBER_WORDS.get(firstWord);
    cleaned = cleaned.replace(new RegExp(`^${firstWord}\\s+`), "").trim();
  }

  cleaned = cleaned
    .replace(/^(de|del|la|el|los|las)\s+/, "")
    .trim();

  return {
    quantity: Math.max(1, Math.min(quantity, 50)),
    query: cleaned
  };
}

function protectInternalConnectors(text) {
  return text
    .replace(/litro y medio/g, "litro_y_medio")
    .replace(/1 y medio/g, "1_y_medio");
}

function restoreInternalConnectors(text) {
  return text
    .replace(/litro_y_medio/g, "litro y medio")
    .replace(/1_y_medio/g, "1 y medio");
}
