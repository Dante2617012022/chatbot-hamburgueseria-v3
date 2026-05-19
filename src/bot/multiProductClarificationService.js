import { parseCustomerMessage } from "../ai/intentParser.js";
import { formatProductSuggestions } from "../menu/menuFormatter.js";
import {
  addProductToOrder,
  clearPendingProductConfirmation,
  setPendingProductConfirmation
} from "../orders/orderService.js";
import { formatOrderSummary } from "../orders/orderFormatter.js";
import { saveOrderSession } from "../storage/sessionStore.js";
import { saveMessageEvent } from "../storage/messageRepository.js";
import { normalizeText } from "../utils/textNormalizer.js";

export async function handleMultipleProductClarificationRequest({
  customerPhone,
  order,
  messageText
}) {
  const items = await parseMultiProductClarificationItems(messageText);

  if (items.length < 2) {
    return null;
  }

  setPendingProductConfirmation(order, {
    type: "MULTI_PRODUCT_CLARIFICATION",
    items,
    createdAt: new Date().toISOString()
  });

  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: normalizeClarificationText(messageText),
    intent: "ACLARAR_PRODUCTOS_MULTIPLES",
    confidence: 0.9,
    status: "PENDING_CLARIFICATION",
    entities: { items },
    replyHint: null
  };

  saveMessageEvent({
    customerPhone,
    direction: "IN",
    text: messageText,
    intent: parsedMessage.intent,
    status: parsedMessage.status,
    payload: parsedMessage
  });

  return {
    parsedMessage,
    order,
    reply: buildMultiProductClarificationReply(items)
  };
}

export async function handlePendingMultiProductClarification({
  customerPhone,
  order,
  messageText,
  buildNextStepPrompt = () => ""
}) {
  const pending = order.pendingProductConfirmation;

  if (pending?.type !== "MULTI_PRODUCT_CLARIFICATION") {
    return null;
  }

  const selections = resolveMultiProductClarificationSelection({
    pending,
    messageText
  });

  if (selections.length !== pending.items.length) {
    return null;
  }

  for (const selection of selections) {
    await addProductToOrder(order, selection.product.id, {
      quantity: selection.quantity
    });
  }

  clearPendingProductConfirmation(order);
  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: normalizeClarificationText(messageText),
    intent: "CONFIRMAR_ACLARACION_PRODUCTOS_MULTIPLES",
    confidence: 1,
    status: "OK",
    entities: {
      items: selections.map((selection) => ({
        quantity: selection.quantity,
        productId: selection.product.id
      }))
    },
    replyHint: null
  };

  saveMessageEvent({
    customerPhone,
    direction: "IN",
    text: messageText,
    intent: parsedMessage.intent,
    status: parsedMessage.status,
    payload: parsedMessage
  });

  return {
    parsedMessage,
    order,
    reply:
      "Agregué a tu pedido:\n" +
      selections
        .map((selection) => `- ${selection.quantity} x ${selection.product.nombre}`)
        .join("\n") +
      "\n\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

async function parseMultiProductClarificationItems(messageText) {
  const text = normalizeClarificationText(messageText);

  if (!/\b(y|e|con|mas|más)\b/.test(text)) {
    return [];
  }

  const items = [];

  if (mentionsGenericCheeseburger(text)) {
    items.push({
      family: "cheeseburger",
      label: "cheeseburger",
      quantity: extractQuantityBeforeFamily(
        text,
        /(cheese\s*burger|cheeseburger|cheese\s*burguer|cheeseburguer)/
      ),
      suggestions: await buildClarificationSuggestions([
        "cheeseburger simple",
        "cheeseburger doble",
        "cheeseburger triple"
      ])
    });
  }

  if (mentionsGenericNuggets(text)) {
    items.push({
      family: "nuggets",
      label: "nuggets",
      quantity: extractQuantityBeforeFamily(text, /nuggets?/),
      suggestions: await buildClarificationSuggestions([
        "nuggets x6",
        "nuggets x12"
      ])
    });
  }

  return items.filter((item) => item.suggestions.length > 0);
}

function mentionsGenericCheeseburger(text) {
  return (
    /\b(cheese\s*burger|cheeseburger|cheese\s*burguer|cheeseburguer)\b/.test(text) &&
    !/\b(simple|simples|doble|dobles|triple|triples)\b/.test(text)
  );
}

function mentionsGenericNuggets(text) {
  return /\bnuggets?\b/.test(text) && !/\bnuggets?\s*x?\s*(6|12)\b/.test(text);
}

async function buildClarificationSuggestions(productQueries) {
  const suggestions = [];

  for (const productQuery of productQueries) {
    const parsed = await parseCustomerMessage(productQuery);
    const product = parsed?.entities?.product;

    if (product?.id) {
      suggestions.push({
        id: product.id,
        nombre: product.nombre,
        precio: product.precio,
        confidence: 1
      });
    }
  }

  return suggestions;
}

function resolveMultiProductClarificationSelection({ pending, messageText }) {
  const text = normalizeClarificationText(messageText);
  const selections = [];

  for (const item of pending.items || []) {
    const product = resolveClarificationItemProduct(item, text);

    if (!product) {
      return [];
    }

    selections.push({
      quantity: item.quantity || 1,
      product
    });
  }

  return selections;
}

function resolveClarificationItemProduct(item, text) {
  if (item.family === "cheeseburger") {
    const size = getVariantSizeFromText(text);
    return size ? findSuggestionByText(item.suggestions, size) : null;
  }

  if (item.family === "nuggets") {
    const pack = getNuggetsPackFromText(text);
    return pack ? findSuggestionByText(item.suggestions, pack) : null;
  }

  return null;
}

function findSuggestionByText(suggestions, text) {
  return (suggestions || []).find((suggestion) =>
    normalizeClarificationText(`${suggestion.id} ${suggestion.nombre}`).includes(text)
  ) || null;
}

function getVariantSizeFromText(text) {
  if (/\bsimples?\b/.test(text)) return "simple";
  if (/\bdobles?\b/.test(text)) return "doble";
  if (/\btriples?\b/.test(text)) return "triple";
  return null;
}

function getNuggetsPackFromText(text) {
  if (/\bx\s*6\b|\bx6\b|\bseis\b|\bprimera\b|\bprimero\b/.test(text)) {
    return "x6";
  }

  if (/\bx\s*12\b|\bx12\b|\bdoce\b|\bsegunda\b|\bsegundo\b/.test(text)) {
    return "x12";
  }

  return null;
}

function extractQuantityBeforeFamily(text, familyPattern) {
  const pattern = new RegExp(
    `(?:^|\\s)([0-9]+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\\s+${familyPattern.source}`,
    "i"
  );
  const match = text.match(pattern);

  if (!match?.[1]) {
    return 1;
  }

  return parseQuantityToken(match[1]);
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
    ["diez", 10],
    ["once", 11],
    ["doce", 12]
  ]);

  return numbers.get(value) || 1;
}

function buildMultiProductClarificationReply(items) {
  const lines = ["Te entiendo, pero necesito aclarar estas opciones:"];

  for (const item of items) {
    lines.push("");
    lines.push(`Para ${item.label}:`);
    lines.push(formatProductSuggestions(item.suggestions));
  }

  lines.push("");
  lines.push("Podés responder, por ejemplo: *dobles y x6*.");

  return lines.join("\n");
}

function normalizeClarificationText(value) {
  return normalizeText(value)
    .replace(/[?¿!¡.,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
