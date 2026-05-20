import { normalizeText } from "../utils/textNormalizer.js";
import { removeProductFromOrder } from "./orderService.js";
import { formatOrderSummary } from "./orderFormatter.js";

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

export async function tryHandleCategoryQuantityRemove({ order, messageText, normalizedText }) {
  const request = parseCategoryQuantityRemoveRequest(normalizedText);

  if (!request) return null;

  const matchingItems = order.items.filter(request.predicate);

  if (matchingItems.length === 0) return null;

  const totalAvailable = matchingItems.reduce(
    (total, item) => total + (item.quantity || 1),
    0
  );

  const requestedQuantity = request.removeAll
    ? totalAvailable
    : request.quantity || totalAvailable;

  const quantityToRemove = Math.min(requestedQuantity, totalAvailable);

  if (quantityToRemove <= 0) return null;

  let remaining = quantityToRemove;
  const removedItems = [];

  for (const item of [...matchingItems]) {
    if (remaining <= 0) break;

    const productId = getItemProductId(item);
    const itemQuantity = item.quantity || 1;
    const removeQuantity = Math.min(remaining, itemQuantity);

    removedItems.push({
      productId,
      name: getItemName(item),
      quantity: removeQuantity
    });

    removeProductFromOrder(order, productId, {
      quantity: removeQuantity
    });

    remaining -= removeQuantity;
  }

  const removedText = removedItems
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(", ");

  const reply = order.items.length === 0
    ? `Listo, saqué ${removedText}. Tu pedido quedó vacío por ahora. ¿Querés ver el menú?`
    : `Listo, saqué ${removedText}.\n\n${formatOrderSummary(order)}`;

  return {
    handled: true,
    parsedMessage: buildParsedMessage({
      messageText,
      intent: "QUITAR_CATEGORIA_DEL_PEDIDO",
      status: "OK",
      entities: {
        category: request.category,
        quantity: quantityToRemove,
        removeAll: request.removeAll,
        items: removedItems
      }
    }),
    order,
    reply
  };
}

function parseCategoryQuantityRemoveRequest(normalizedText) {
  const text = normalizeText(normalizedText)
    .replace(/[?¿!¡.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let body = null;
  let removeAll = false;

  const removeMatch = text.match(
    /^(?:sacame|saca|quitame|quita|elimina|eliminame|borra|restale|sacale|bajale)\s+(.+)$/
  );

  if (removeMatch?.[1]) {
    body = removeMatch[1];
  }

  const noMoreMatch = text.match(
    /^no\s+(?:quiero|va|van)\s+(?:mas|más)\s+(.+)$/
  );

  if (!body && noMoreMatch?.[1]) {
    body = noMoreMatch[1];
    removeAll = true;
  }

  if (!body) return null;

  body = stripCategoryRemoveFiller(body);

  const allMatch = body.match(
    /^(?:todo|toda|todos|todas|totalidad|total|completo|completa|completos|completas)\b\s*(.*)$/
  );

  if (allMatch) {
    removeAll = true;
    body = stripCategoryRemoveFiller(allMatch[1] || "");
  }

  const firstWord = body.split(/\s+/)[0];
  let quantity = null;

  if (/^\d+$/.test(firstWord)) {
    quantity = Number(firstWord);
    body = body.replace(/^\d+\s+/, "").trim();
  } else if (NUMBER_WORDS.has(firstWord) || firstWord === "ambas" || firstWord === "ambos") {
    quantity = firstWord === "ambas" || firstWord === "ambos"
      ? 2
      : NUMBER_WORDS.get(firstWord);

    body = body.replace(new RegExp(`^${firstWord}\\s+`), "").trim();
  }

  body = stripCategoryRemoveFiller(body);

  const category = resolveRemoveCategory(body);

  if (!category) return null;

  return {
    ...category,
    quantity,
    removeAll
  };
}

function stripCategoryRemoveFiller(value) {
  let text = normalizeText(value)
    .replace(/\s+/g, " ")
    .trim();

  let previous = "";

  while (text && text !== previous) {
    previous = text;
    text = text
      .replace(/^(?:de\s+)?(?:la|el|las|los|un|una|unos|unas)\s+/, "")
      .replace(/^(?:de\s+)/, "")
      .trim();
  }

  return text;
}

function resolveRemoveCategory(value) {
  const text = normalizeText(value);

  if (/\b(hamburguesa|hamburguesas|burger|burgers)\b/.test(text)) {
    return { category: "HAMBURGUESAS", predicate: isBurgerItem };
  }

  if (/\b(gaseosa|gaseosas|bebida|bebidas|coca|cocas|pepsi|pepsis|sprite|sprites|fanta|fantas|lata|latas)\b/.test(text)) {
    return { category: "BEBIDAS", predicate: isDrinkItem };
  }

  if (/\b(papa|papas|papita|papitas)\b/.test(text)) {
    return { category: "PAPAS", predicate: isFriesItem };
  }

  if (/\b(nugget|nuggets)\b/.test(text)) {
    return { category: "NUGGETS", predicate: isNuggetsItem };
  }

  return null;
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

function isNuggetsItem(item) {
  const value = normalizeText(
    `${getItemCategory(item)} ${getItemName(item)} ${getItemProductId(item)}`
  );

  return value.includes("nugget");
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

function buildParsedMessage({ messageText, intent, status, entities = {} }) {
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
