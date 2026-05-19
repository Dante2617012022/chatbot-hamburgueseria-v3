import { findBestProduct } from "../menu/productMatcher.js";
import { normalizeText } from "../utils/textNormalizer.js";
import { addProductToOrder, recalculateOrder, removeProductFromOrder } from "./orderService.js";
import { formatOrderSummary } from "./orderFormatter.js";

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

const BURGER_SIZE_WORDS = ["simple", "doble", "triple"];

export async function tryHandleAdvancedOrderEdit({ order, messageText }) {
  const normalizedText = normalizeText(messageText);

  if (!order?.items || order.items.length === 0) {
    return null;
  }

  const changeResult = await tryHandleProductChange({
    order,
    messageText,
    normalizedText
  });

  if (changeResult) {
    return changeResult;
  }

  if (isRepeatLastItemMessage(normalizedText)) {
    return repeatLastItem({
      order,
      messageText
    });
  }

  const keepOnlyResult = await tryHandleKeepOnlyProducts({
    order,
    messageText,
    normalizedText
  });

  if (keepOnlyResult) {
    return keepOnlyResult;
  }

  if (isKeepOnlyFries(normalizedText)) {
    return keepOnlyMatchingItems({
      order,
      messageText,
      keepPredicate: isFriesItem,
      intent: "DEJAR_SOLO_PAPAS",
      replyTitle: "Listo, dejé solo las papas en tu pedido."
    });
  }

  if (isKeepOnlyBurgers(normalizedText)) {
    return keepOnlyMatchingItems({
      order,
      messageText,
      keepPredicate: isBurgerItem,
      intent: "DEJAR_SOLO_HAMBURGUESAS",
      replyTitle: "Listo, dejé solo las hamburguesas en tu pedido."
    });
  }

  if (isRemoveMessage(normalizedText)) {
    const removeResult = await removeMatchingItemFromOrder({
      order,
      messageText,
      normalizedText
    });

    if (removeResult) {
      return removeResult;
    }
  }

  return null;
}

async function tryHandleProductChange({
  order,
  messageText,
  normalizedText
}) {
  const changeRequest = parseChangeRequest(normalizedText);

  if (!changeRequest) {
    return null;
  }

  const targetProduct = await resolveTargetProductForChange({
    order,
    sourceQuery: changeRequest.sourceQuery,
    targetQuery: changeRequest.targetQuery
  });

  if (!targetProduct) {
    return null;
  }

  const sourceItem = await resolveSourceItemForChange({
    order,
    sourceQuery: changeRequest.sourceQuery,
    targetProduct
  });

  if (!sourceItem) {
    return null;
  }

  const sourceProductId = getItemProductId(sourceItem);
  const quantity = sourceItem.quantity || 1;

  removeProductFromOrder(order, sourceProductId, {
    quantity
  });

  await addProductToOrder(order, targetProduct.id, {
    quantity
  });

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent: "CAMBIAR_PRODUCTO_DEL_PEDIDO",
      status: "OK",
      entities: {
        fromProductId: sourceProductId,
        toProductId: targetProduct.id,
        quantity
      }
    }),
    order,
    reply:
      `Listo, cambié *${getItemName(sourceItem)}* por *${targetProduct.nombre}*.\n\n` +
      formatOrderSummary(order)
  };
}

function parseChangeRequest(text) {
  const implicitVariantCorrection = parseImplicitVariantCorrection(text);

  if (implicitVariantCorrection) {
    return implicitVariantCorrection;
  }

  const explicitPatterns = [
    /^(?:cambiame|cambia|cambiá|cambiala|cambialo)\s+(?:la|el|las|los)?\s*(.+?)\s+por\s+(.+)$/,
    /^en vez de\s+(.+?)\s+(?:poneme|pone|poné|agregame|agrega|sumame|suma|mandame|manda)\s+(.+)$/,
    /^no\s+(?:la|el)?\s*(.+?)\s+no,?\s+(?:la|el)?\s*(.+)$/
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        sourceQuery: cleanChangeQuery(match[1]),
        targetQuery: cleanChangeQuery(match[2])
      };
    }
  }

  const targetOnlyPatterns = [
    /^(?:confirmo|confirmar|confirmado|listo|ok|dale)\s+pero\s+(?:cambiala|cambialo|cambia)\s+a\s+(.+)$/,
    /^(?:cambiala|cambialo|cambia)\s+a\s+(.+)$/,
    /^(?:mejor\s+hacela|mejor\s+hacelo|hacela|hacelo)\s+(.+)$/,
    /^(?:mejor|cambiala por|cambialo por)\s+(.+)$/
  ];

  for (const pattern of targetOnlyPatterns) {
    const match = text.match(pattern);

    if (match) {
      return {
        sourceQuery: null,
        targetQuery: cleanChangeQuery(match[1])
      };
    }
  }

  return null;
}

function parseImplicitVariantCorrection(text) {
  const normalized = normalizeText(text);

  const simpleNoDoubleMatch = normalized.match(
    /^(.+?)\s+(simple|comun|común)\s+no\s+(doble|triple)$/
  );

  if (simpleNoDoubleMatch?.[1]) {
    const familyQuery = cleanChangeQuery(simpleNoDoubleMatch[1]);

    return {
      sourceQuery: `${familyQuery} ${simpleNoDoubleMatch[3]}`,
      targetQuery: `${familyQuery} simple`
    };
  }

  const noDoubleSimpleMatch = normalized.match(
    /^(.+?)\s+no\s+(doble|triple),?\s*(simple|comun|común)$/
  );

  if (noDoubleSimpleMatch?.[1]) {
    const familyQuery = cleanChangeQuery(noDoubleSimpleMatch[1]);

    return {
      sourceQuery: `${familyQuery} ${noDoubleSimpleMatch[2]}`,
      targetQuery: `${familyQuery} simple`
    };
  }

  return null;
}

function cleanChangeQuery(query) {
  return normalizeText(query)
    .replace(/\s+y\s*$/g, "")
    .replace(/^(una|un|uno|la|el|las|los|esa|ese|esta|este)\s*/, "")
    .replace(/\b(poneme|pone|poné|agregame|agrega|sumame|suma|mandame|manda)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveTargetProductForChange({
  order,
  sourceQuery,
  targetQuery
}) {
  const targetSize = extractBurgerSize(targetQuery);

  if (targetSize && isBareSizeChange(targetQuery)) {
    const sourceItem = sourceQuery
      ? await findItemInCurrentOrder(order, sourceQuery)
      : getLastReplaceableItem(order);

    const inferredQuery = buildSameFamilyQuery(sourceItem, targetSize);

    if (inferredQuery) {
      const inferredMatch = await findBestProduct(inferredQuery);

      if (inferredMatch.ok && inferredMatch.product) {
        return inferredMatch.product;
      }
    }
  }

  const directMatch = await findBestProduct(targetQuery);

  if (directMatch.ok && directMatch.product) {
    return directMatch.product;
  }

  if (targetSize) {
    const sourceItem = sourceQuery
      ? await findItemInCurrentOrder(order, sourceQuery)
      : getLastReplaceableItem(order);

    const inferredQuery = buildSameFamilyQuery(sourceItem, targetSize);

    if (inferredQuery) {
      const inferredMatch = await findBestProduct(inferredQuery);

      if (inferredMatch.ok && inferredMatch.product) {
        return inferredMatch.product;
      }
    }
  }

  return null;
}

async function resolveSourceItemForChange({
  order,
  sourceQuery,
  targetProduct
}) {
  if (sourceQuery) {
    const explicitItem = await findItemInCurrentOrder(order, sourceQuery);

    if (explicitItem) {
      return explicitItem;
    }
  }

  const sameFamilyItem = findSameFamilyItem(order, targetProduct);

  if (sameFamilyItem) {
    return sameFamilyItem;
  }

  const sameCategoryItems = order.items.filter((item) =>
    getItemCategory(item) === targetProduct.categoria
  );

  if (sameCategoryItems.length === 1) {
    return sameCategoryItems[0];
  }

  return getLastReplaceableItem(order);
}

function findSameFamilyItem(order, targetProduct) {
  const targetFamily = getProductFamilyFromValue(
    `${targetProduct.id} ${targetProduct.nombre}`
  );

  if (!targetFamily) {
    return null;
  }

  return order.items.find((item) =>
    getProductFamilyFromValue(`${getItemProductId(item)} ${getItemName(item)}`) === targetFamily
  ) || null;
}

function buildSameFamilyQuery(item, targetSize) {
  if (!item || !targetSize) {
    return null;
  }

  const family = getProductFamilyFromValue(`${getItemProductId(item)} ${getItemName(item)}`);

  if (!family) {
    return null;
  }

  return `${family} ${targetSize}`;
}

function getProductFamilyFromValue(value) {
  const text = normalizeText(value);

  if (text.includes("bacon")) {
    return "bacon";
  }

  if (text.includes("cheeseburger") || text.includes("cheese")) {
    return "cheese";
  }

  if (text.includes("cuarto")) {
    return "cuarto";
  }

  if (text.includes("americana")) {
    return "americana";
  }

  if (text.includes("big")) {
    return "big";
  }

  if (text.includes("crispy")) {
    return "crispy";
  }

  if (text.includes("araka")) {
    return "araka";
  }

  if (text.includes("onion")) {
    return "onion";
  }

  if (text.includes("triple l") || text.includes("triple_l")) {
    return "triple l";
  }

  if (text.includes("nuggets")) {
    return "nuggets";
  }

  if (text.includes("bebida") || text.includes("gaseosa") || text.includes("coca") || text.includes("lata")) {
    return "bebida";
  }

  if (text.includes("papa")) {
    return "papas";
  }

  return null;
}

function extractBurgerSize(text) {
  const normalized = normalizeText(text);

  return BURGER_SIZE_WORDS.find((size) =>
    new RegExp(`\\b${size}\\b`).test(normalized)
  ) || null;
}

function isBareSizeChange(text) {
  const normalized = normalizeText(text);

  return BURGER_SIZE_WORDS.includes(normalized);
}

function getLastReplaceableItem(order) {
  return order.items.at(-1) || null;
}

async function tryHandleKeepOnlyProducts({
  order,
  messageText,
  normalizedText
}) {
  const request = parseKeepOnlyRequest(normalizedText);

  if (!request) {
    return null;
  }

  const keepItems = [];

  for (const query of request.queries) {
    const matchingItems = await resolveKeepOnlyItems(order, query);
    keepItems.push(...matchingItems);
  }

  const uniqueKeepItems = [
    ...new Map(keepItems.map((item) => [item.id || getItemProductId(item), item])).values()
  ];

  if (uniqueKeepItems.length === 0) {
    return null;
  }

  const keepIds = new Set(uniqueKeepItems.map((item) => item.id || getItemProductId(item)));
  order.items = order.items.filter((item) => keepIds.has(item.id || getItemProductId(item)));

  if (request.quantity !== null && order.items.length === 1) {
    order.items[0].quantity = request.quantity;
  }

  recalculateOrder(order);

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent: "DEJAR_SOLO_PRODUCTOS",
      status: "OK",
      entities: {
        queries: request.queries,
        quantity: request.quantity
      }
    }),
    order,
    reply: "Listo, dejé solo lo que me pediste en el pedido.\n\n" + formatOrderSummary(order)
  };
}

function parseKeepOnlyRequest(text) {
  const normalized = normalizeText(text)
    .replace(/[?¿!¡.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /^(?:dejame|deja|dejá|dejar|quedame|quedate)\s+solo\s+(.+)$/,
    /^(?:dejame|deja|dejá|dejar|quedame|quedate)\s+(.+)\s+solo$/,
    /^(?:sacame|saca|quitame|quita|borra|elimina|eliminame)\s+todo\s+menos\s+(.+)$/,
    /^todo\s+menos\s+(.+)$/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const parsed = parseKeepOnlyTarget(match[1]);

    if (parsed.queries.length > 0) {
      return parsed;
    }
  }

  return null;
}

function parseKeepOnlyTarget(value) {
  let rawText = normalizeText(value)
    .replace(/[?¿!¡.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let quantity = null;
  const firstWord = rawText.split(/\s+/)[0];

  if (/^\d+$/.test(firstWord)) {
    quantity = Number(firstWord);
    rawText = rawText.replace(/^\d+\s+/, "").trim();
  } else if (NUMBER_WORDS.has(firstWord)) {
    quantity = NUMBER_WORDS.get(firstWord);
    rawText = rawText.replace(new RegExp(`^${firstWord}\\s+`), "").trim();
  }

  return {
    quantity,
    queries: splitKeepOnlyQueries(rawText).map(cleanKeepOnlyQuery).filter(Boolean)
  };
}

function splitKeepOnlyQueries(value) {
  return normalizeText(value)
    .split(/\s+(?:y|e)\s+|\s*,\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanKeepOnlyQuery(value) {
  return normalizeText(value)
    .replace(/\b(la|el|las|los|un|una|uno|de|del|al|porfa|por favor)\b/g, " ")
    .replace(/\b(hamburguesa|hamburguesas)\b/g, "hamburguesas")
    .replace(/\b(gaseosas|bebidas|cocas|pepsis|sprites|fantas)\b/g, (match) => {
      if (match === "gaseosas") return "gaseosa";
      if (match === "bebidas") return "bebida";
      if (match === "cocas") return "coca";
      if (match === "pepsis") return "pepsi";
      if (match === "sprites") return "sprite";
      if (match === "fantas") return "fanta";
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveKeepOnlyItems(order, query) {
  const text = cleanKeepOnlyQuery(query);

  if (!text) {
    return [];
  }

  if (/\bhamburguesas?\b/.test(text)) {
    return order.items.filter(isBurgerItem);
  }

  if (/\b(gaseosa|bebida|coca|pepsi|sprite|fanta|lata)\b/.test(text)) {
    const drinks = order.items.filter(isDrinkItem);

    if (drinks.length > 0) {
      return drinks;
    }
  }

  if (/\b(papa|papas|papita|papitas)\b/.test(text)) {
    const fries = order.items.filter(isFriesItem);

    if (fries.length > 0) {
      return fries;
    }
  }

  const explicitItem = await findItemInCurrentOrder(order, text);

  return explicitItem ? [explicitItem] : [];
}

function isKeepOnlyFries(text) {
  return (
    text.includes("todo menos las papas") ||
    text.includes("todo menos papas") ||
    text.includes("solo las papas") ||
    text.includes("solo papas")
  );
}

function isKeepOnlyBurgers(text) {
  return (
    text.includes("solo las hamburguesas") ||
    text.includes("solo hamburguesas") ||
    text.includes("deja las hamburguesas") ||
    text.includes("deja hamburguesas") ||
    text.includes("dejame las hamburguesas") ||
    text.includes("dejame solo las hamburguesas")
  );
}

function isRemoveMessage(text) {
  return /^(sacame|saca|quitame|quita|borra|elimina|eliminame|sin)\b/.test(text);
}

function isRepeatLastItemMessage(text) {
  return (
    /^(agregame|agrega|sumame|suma|mandame|manda|dame|pone|poneme)\s+(otra|otro)\s+(igual|mas|más)$/.test(text) ||
    /^(otra|otro)\s+igual$/.test(text) ||
    /^(agregame|agrega|sumame|suma|mandame|manda|dame|pone|poneme)\s+(una|un|uno|otra|otro|1)\s+(mas|más)$/.test(text) ||
    /^(agregame|agrega|sumame|suma|mandame|manda|dame|pone|poneme)\s+(otra|otro)$/.test(text) ||
    /^(agregame|agrega|sumame|suma|mandame|manda|dame)\s+lo\s+mismo$/.test(text) ||
    /^(una|un|uno|otra|otro|1)\s+(mas|más)$/.test(text) ||
    /^(otra|otro|lo mismo)$/.test(text)
  );
}

async function repeatLastItem({ order, messageText }) {
  const lastItem = order.items.at(-1);

  if (!lastItem) {
    return null;
  }

  const productId = getItemProductId(lastItem);

  if (!productId) {
    return null;
  }

  await addProductToOrder(order, productId, {
    quantity: 1
  });

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent: "REPETIR_ULTIMO_PRODUCTO",
      status: "OK",
      entities: {
        productId,
        quantity: 1
      }
    }),
    order,
    reply:
      `Agregué otra unidad de *${getItemName(lastItem)}*.\n\n` +
      formatOrderSummary(order)
  };
}

function keepOnlyMatchingItems({
  order,
  messageText,
  keepPredicate,
  intent,
  replyTitle
}) {
  const itemsToRemove = order.items.filter((item) => !keepPredicate(item));

  if (itemsToRemove.length === 0) {
    return {
      handled: true,
      parsedMessage: buildParsedMessage({
        messageText,
        intent,
        status: "NO_CHANGES"
      }),
      order,
      reply: "No tuve que cambiar nada.\n\n" + formatOrderSummary(order)
    };
  }

  for (const item of [...itemsToRemove]) {
    removeProductFromOrder(order, getItemProductId(item), {
      quantity: item.quantity || 999
    });
  }

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent,
      status: "OK"
    }),
    order,
    reply: `${replyTitle}\n\n${formatOrderSummary(order)}`
  };
}

async function removeMatchingItemFromOrder({
  order,
  messageText,
  normalizedText
}) {
  const parsed = parseRemoveRequest(normalizedText);
  const item = await findItemInCurrentOrder(order, parsed.query);

  if (!item) {
    return null;
  }

  const productId = getItemProductId(item);
  const quantityToRemove = parsed.quantity || item.quantity || 1;

  removeProductFromOrder(order, productId, {
    quantity: quantityToRemove
  });

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent: "QUITAR_PRODUCTO_DEL_PEDIDO",
      status: "OK",
      entities: {
        productId,
        quantity: quantityToRemove
      }
    }),
    order,
    reply:
      `Quité *${getItemName(item)}* de tu pedido.\n\n` +
      formatOrderSummary(order)
  };
}

function parseRemoveRequest(text) {
  let cleaned = text
    .replace(/^(sacame|saca|quitame|quita|borra|elimina|eliminame|sin)\s+/, "")
    .replace(/\b(de|del|la|el|los|las)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstWord = cleaned.split(/\s+/)[0];
  let quantity = null;

  if (/^\d+$/.test(firstWord)) {
    quantity = Number(firstWord);
    cleaned = cleaned.replace(/^\d+\s+/, "").trim();
  } else if (NUMBER_WORDS.has(firstWord)) {
    quantity = NUMBER_WORDS.get(firstWord);
    cleaned = cleaned.replace(new RegExp(`^${firstWord}\\s+`), "").trim();
  }

  return {
    quantity,
    query: cleaned.trim()
  };
}

async function findItemInCurrentOrder(order, query) {
  const text = normalizeText(query);

  if (!text) {
    return null;
  }

  const directMatches = order.items.filter((item) =>
    itemMatchesText(item, text)
  );

  if (directMatches.length === 1) {
    return directMatches[0];
  }

  if (text.includes("coca") || text.includes("gaseosa") || text.includes("bebida") || text.includes("lata")) {
    const drinks = order.items.filter(isDrinkItem);

    if (drinks.length === 1) {
      return drinks[0];
    }
  }

  if (text.includes("papa") || text.includes("papita")) {
    const fries = order.items.filter(isFriesItem);

    if (fries.length === 1) {
      return fries[0];
    }
  }

  const match = await findBestProduct(text, {
    onlyAvailable: false
  });

  if (match.product?.id) {
    return order.items.find((item) => getItemProductId(item) === match.product.id) || null;
  }

  return directMatches[0] || null;
}

function itemMatchesText(item, text) {
  const itemName = normalizeText(getItemName(item));
  const productId = normalizeText(getItemProductId(item));

  return (
    itemName.includes(text) ||
    text.includes(itemName) ||
    productId.includes(text) ||
    text.includes(productId)
  );
}

function isBurgerItem(item) {
  const value = normalizeText(
    `${getItemCategory(item)} ${getItemName(item)} ${getItemProductId(item)}`
  );

  return (
    value.includes("hamburguesa") ||
    value.includes("cheeseburger") ||
    value.includes("bacon cheese") ||
    value.includes("big camdis") ||
    value.includes("cuarto") ||
    value.includes("americana") ||
    value.includes("araka") ||
    value.includes("onion") ||
    value.includes("crispy") ||
    value.includes("triple l")
  );
}

function isFriesItem(item) {
  const value = normalizeText(
    `${getItemCategory(item)} ${getItemName(item)} ${getItemProductId(item)}`
  );

  return value.includes("papa");
}

function isDrinkItem(item) {
  const value = normalizeText(
    `${getItemCategory(item)} ${getItemName(item)} ${getItemProductId(item)}`
  );

  return (
    value.includes("bebida") ||
    value.includes("gaseosa") ||
    value.includes("lata") ||
    value.includes("coca") ||
    value.includes("sprite") ||
    value.includes("fanta")
  );
}

function getItemProductId(item) {
  return item.productId || item.id || item.product?.id;
}

function getItemName(item) {
  return item.name || item.nombre || item.productName || item.product?.nombre || getItemProductId(item);
}

function getItemCategory(item) {
  return item.category || item.categoria || item.product?.categoria || "";
}

function buildParsedMessage({
  messageText,
  intent,
  status,
  entities = {}
}) {
  return {
    rawText: messageText,
    normalizedText: normalizeText(messageText),
    intent,
    confidence: 1,
    status,
    entities,
    replyHint: null
  };
}
