import { findBestProduct } from "../menu/productMatcher.js";
import { normalizeText } from "../utils/textNormalizer.js";
import { addProductToOrder, removeProductFromOrder } from "./orderService.js";
import { formatOrderSummary } from "./orderFormatter.js";

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

export async function tryHandleAdvancedOrderEdit({ order, messageText }) {
  const normalizedText = normalizeText(messageText);

  if (!order?.items || order.items.length === 0) {
    return null;
  }

  if (isRepeatLastItemMessage(normalizedText)) {
    return repeatLastItem({
      order,
      messageText
    });
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

  if (text.includes("coca") || text.includes("gaseosa") || text.includes("bebida")) {
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
