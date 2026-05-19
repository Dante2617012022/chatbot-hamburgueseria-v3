import { findBestProduct } from "../menu/productMatcher.js";
import { normalizeText } from "../utils/textNormalizer.js";

const NUMBER_WORDS = new Map([
  ["un", 1],
  ["una", 1],
  ["uno", 1],
  ["unas", 1],
  ["unos", 1],
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
  const allowSingleItem = isNaturalSingleProductOrder(normalizedText);

  if (productRequests.length < 2 && !allowSingleItem) {
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

  if (items.length < 2 && !allowSingleItem) {
    return {
      ok: false,
      status: "MULTI_PRODUCT_LOW_CONFIDENCE",
      items,
      failedItems
    };
  }

  if (items.length < 1) {
    return {
      ok: false,
      status: "PRODUCT_NOT_FOUND",
      items,
      failedItems
    };
  }

  return {
    ok: true,
    status:
      items.length === 1
        ? "SINGLE_NATURAL_MATCH"
        : failedItems.length > 0
          ? "PARTIAL_MATCH"
          : "AUTO_MATCH",
    items,
    failedItems
  };
}

function shouldTryMultiProduct(normalizedText) {
  if (!normalizedText) {
    return false;
  }

  const cleanedText = removeOrderIntro(normalizedText);

  const hasAddVerb =
    /\b(voy a querer|te voy a pedir|te quiero pedir|voy a pedir|quiero pedir|quiero encargar|quiero|quisiera|dame|agregame|agrega|sumame|suma|mandame|pone|poneme|necesito|preparame|prepárame|me preparas|me preparás|me haces|me hacés|me hacen|haceme|hacéme|te encargo|encargar)\b/.test(
      normalizedText
    );

  const connectorText = normalizeAccessoryConnectors(cleanedText);

  const hasConnector =
    connectorText.includes(" y ") ||
    connectorText.includes(",") ||
    connectorText.includes(" mas ");

  const hasSpecialTwoDoubles =
    cleanedText.includes("dos dobles") &&
    cleanedText.includes("bacon") &&
    cleanedText.includes("cheese");

  const looksLikeNaturalOrder =
    normalizedText.startsWith("voy a querer") ||
    normalizedText.startsWith("hola voy a querer") ||
    normalizedText.startsWith("quiero encargar") ||
    normalizedText.startsWith("te voy a pedir") ||
    normalizedText.startsWith("hola te voy a pedir") ||
    normalizedText.startsWith("te quiero pedir") ||
    normalizedText.startsWith("voy a pedir") ||
    normalizedText.startsWith("quiero pedir") ||
    normalizedText.startsWith("me preparas") ||
    normalizedText.startsWith("me preparás") ||
    normalizedText.startsWith("preparame") ||
    normalizedText.startsWith("prepárame");

  const startsWithQuantity =
    /^(un|una|uno|unas|unos|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|[1-9])\b/.test(
      cleanedText
    );

  const startsWithKnownProductTerm =
    /^(coca|pepsi|sprite|fanta|gaseosa|bebida|lata|latita|papas|papitas|nugget|nuggets|cheese|cheeseburger|bacon|big|cuarto|americana|americanas|araka|onion|crispy|camdis)\b/.test(
      cleanedText
    );

  return (
    (hasAddVerb && hasConnector) ||
    (looksLikeNaturalOrder && hasConnector) ||
    (startsWithQuantity && hasConnector) ||
    (startsWithKnownProductTerm && hasConnector) ||
    hasSpecialTwoDoubles ||
    isNaturalSingleProductOrder(normalizedText)
  );
}

function isNaturalSingleProductOrder(normalizedText) {
  return (
    normalizedText.startsWith("quiero encargar ") ||
    normalizedText.startsWith("voy a querer ") ||
    normalizedText.startsWith("hola voy a querer ") ||
    normalizedText.startsWith("te voy a pedir ") ||
    normalizedText.startsWith("hola te voy a pedir ") ||
    normalizedText.startsWith("te quiero pedir ") ||
    normalizedText.startsWith("voy a pedir ") ||
    normalizedText.startsWith("quiero pedir ") ||
    normalizedText.startsWith("preparame ") ||
    normalizedText.startsWith("prepárame ") ||
    normalizedText.startsWith("me preparas ") ||
    normalizedText.startsWith("me preparás ") ||
    normalizedText.startsWith("me haces ") ||
    normalizedText.startsWith("me hacés ") ||
    normalizedText.startsWith("me hacen ") ||
    normalizedText.startsWith("haceme ") ||
    normalizedText.startsWith("hacéme ")
  );
}

function extractProductRequests(normalizedText) {
  const special = extractSpecialTwoDoubles(normalizedText);

  if (special.length > 0) {
    return special;
  }

  let text = normalizeAccessoryConnectors(removeOrderIntro(normalizedText))
    .replace(/\bmas\b/g, " y ");

  text = protectInternalConnectors(text);
  text = insertQuantitySeparators(text);

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

function removeOrderIntro(text) {
  let cleaned = String(text || "").trim();

  const patterns = [
    /^(hola|buenas|buen dia|buen día|buenas tardes|buenas noches)\s+/,
    /^(voy a querer que me preparen|voy a querer que preparen)\s+/,
    /^(te voy a pedir|te quiero pedir|voy a pedir|quiero pedir)\s+/,
    /^(quiero encargar|quiero que me preparen)\s+/,
    /^(voy a querer|quiero|quisiera|dame|agregame|agrega|sumame|suma|mandame|pone|poneme|necesito)\s+/,
    /^(que me preparen|que preparen|preparame|prepárame|me preparas|me preparás|me haces|me hacés|me hacen|haceme|hacéme|hacerme|encargar|te encargo)\s+/
  ];

  let changed = true;

  while (changed) {
    changed = false;

    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, "").trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

function insertQuantitySeparators(text) {
  return String(text || "").replace(
    /\s+(un|una|uno|unas|unos|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|[1-9])\s+(?=(?:[a-z0-9]+\s+){0,3}(?:coca|pepsi|sprite|fanta|gaseosa|gaseosas|bebida|bebidas|lata|latas|papas|papa|papitas|nugget|nuggets|cheese|cheeseburger|bacon|big|cuarto|americana|americanas|araka|onion|crispy|camdis)\b)/g,
    (match, quantity, offset, fullText) => {
      const before = fullText.slice(0, offset).trimEnd();

      if (!before || /(?:^|\s)y$/.test(before) || before.endsWith(",")) {
        return match;
      }

      return ` y ${quantity} `;
    }
  );
}

function parseProductPart(part) {
  let cleaned = part
    .replace(/^(tambien|también)\s+/, "")
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
    .replace(/\bpepsi\s+grande\b/g, "gaseosa grande")
    .replace(/\bgaseosas\s+grandes\s+pepsi\b/g, "gaseosa grande")
    .replace(/\bgaseosa\s+grande\s+pepsi\b/g, "gaseosa grande")
    .replace(/\bbebidas\s+grandes\s+pepsi\b/g, "bebida grande")
    .replace(/\bbebida\s+grande\s+pepsi\b/g, "bebida grande")
    .replace(/\bcrispy\s+triples\b/g, "crispy triple")
    .replace(/\bcamdis\s+crispy\s+triples\b/g, "camdis crispy triple")
    .replace(/\btriples\s+crispy\b/g, "triple crispy")
    .replace(/\bpapa\s+gratinada\b/g, "papas gratinadas")
    .replace(/\bpapa\s+gratinadas\b/g, "papas gratinadas")
    .replace(/\bpapas\s+gratinada\b/g, "papas gratinadas")
    .replace(/\blatas\s+de\s+pepsi\b/g, "lata de pepsi")
    .replace(/\blatas\s+pepsi\b/g, "lata pepsi")
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

function normalizeAccessoryConnectors(text) {
  return String(text || "")
    .replace(/\s+con\s+(un|una|unos|unas)\s+(lata|latita|coca|sprite|fanta|gaseosa|bebida|papas|papitas|nuggets)\b/g, " y $1 $2")
    .replace(/\s+con\s+(lata|latita|coca|sprite|fanta|gaseosa|bebida|papas|papitas|nuggets)\b/g, " y $1");
}
