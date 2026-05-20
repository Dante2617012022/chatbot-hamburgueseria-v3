const fs = require("node:fs");
const { PathLike } = require("node:fs");

const handlerPath = "src/bot/messageHandler.js";
const testPath = "tests/customerMixedRemoveAddBatch52.test.js";

let text = fs.readFileSync(handlerPath, "utf8");

const importAnchor = 'import { handleTanda47Message } from "./tanda47Service.js";\n';
const importLine = 'import { splitMixedRemoveAndAddText } from "./mixedActionTextService.js";\n';

if (!text.includes(importLine)) {
  if (!text.includes(importAnchor)) throw new Error("No encontré importAnchor.");
  text = text.replace(importAnchor, importAnchor + importLine);
}

const callAnchor = `  const advancedOrderEditResult = await tryHandleAdvancedOrderEdit({
    order,
    messageText
  });`;

const callInsert = `  const mixedRemoveAddResult = await handleMixedRemoveAddMessage({
    customerPhone,
    order,
    messageText,
    itemNotes
  });

  if (mixedRemoveAddResult) {
    return mixedRemoveAddResult;
  }

${callAnchor}`;

if (!text.includes("handleMixedRemoveAddMessage({") && !text.includes(callAnchor)) {
  throw new Error("No encontré advancedOrderEditResult.");
}

if (!text.includes("handleMixedRemoveAddMessage({")) {
  text = text.replace(callAnchor, callInsert);
}

const functionAnchor = `async function handleCombinedCustomerMessage({
  customerPhone,
  order,
  messageText,
  itemNotes = []
}) {`;

const functions = `async function handleMixedRemoveAddMessage({
  customerPhone,
  order,
  messageText,
  itemNotes = []
}) {
  const split = splitMixedRemoveAndAddText(messageText);

  if (!split || !order?.items?.length) return null;

  const removeResult = await tryHandleAdvancedOrderEdit({
    order,
    messageText: split.removeText
  });

  const addResult = await applyMixedAddOnlyAction({
    order,
    addText: split.addText,
    itemNotes
  });

  if (!removeResult && !addResult) return null;

  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "MENSAJE_MIXTO_QUITAR_AGREGAR",
    confidence: 1,
    status: "OK",
    entities: {
      removeText: split.removeText,
      addText: split.addText,
      removeIntent: removeResult?.parsedMessage?.intent || null,
      addIntent: addResult?.parsedMessage?.intent || null
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

  const parts = [
    removeResult ? stripSummaryFromMixedReply(removeResult.reply) : null,
    addResult ? addResult.reply : null
  ].filter(Boolean);

  return {
    parsedMessage,
    order,
    reply:
      parts.join("\\n") +
      "\\n\\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

async function applyMixedAddOnlyAction({
  order,
  addText,
  itemNotes = []
}) {
  const multiProductMessage = await parseMultiProductMessage(addText);

  if (multiProductMessage.ok) {
    for (const item of multiProductMessage.items) {
      await addProductToOrder(order, item.product.id, {
        quantity: item.quantity,
        notes: itemNotes
      });
    }

    return {
      handled: true,
      parsedMessage: { intent: "AGREGAR_PRODUCTOS_MIXTO" },
      reply:
        "Agregué a tu pedido:\\n" +
        multiProductMessage.items
          .map((item) => \`- \${item.quantity} x \${item.product.nombre}\`)
          .join("\\n") +
        buildPartialMultiProductWarning(multiProductMessage.failedItems)
    };
  }

  let parsedProductMessage = await parseCustomerMessage(addText);
  parsedProductMessage = applyMessageCorrections(parsedProductMessage, addText);

  if (
    parsedProductMessage.intent !== CUSTOMER_INTENT.ADD_PRODUCT ||
    !parsedProductMessage.entities?.product
  ) {
    return null;
  }

  await addProductToOrder(order, parsedProductMessage.entities.product.id, {
    quantity: parsedProductMessage.entities.quantity || 1,
    notes: itemNotes
  });

  return {
    handled: true,
    parsedMessage: parsedProductMessage,
    reply:
      "Agregué a tu pedido:\\n" +
      \`- \${parsedProductMessage.entities.quantity || 1} x \${parsedProductMessage.entities.product.nombre}\`
  };
}

function stripSummaryFromMixedReply(reply) {
  return String(reply || "")
    .split("\\n\\n*Resumen de tu pedido*")[0]
    .trim();
}

`;

if (!text.includes(functionAnchor)) throw new Error("No encontré handleCombinedCustomerMessage.");
if (!text.includes("async function handleMixedRemoveAddMessage")) {
  text = text.replace(functionAnchor, functions + functionAnchor);
}

fs.writeFileSync(handlerPath, text, "utf8");

fs.writeFileSync(testPath, `import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";
process.env.OWNER_PHONE = "5493810000000";

async function send(phone, messageText) {
  return handleCustomerMessage({ customerPhone: phone, messageText });
}

function summaryOf(reply) {
  return String(reply || "").split("*Resumen de tu pedido*").at(-1);
}

test("1 - sacame nuggets y agregame papas actualiza ambos productos", async () => {
  resetSessionsForTests();

  const phone = "5200000001";

  await send(phone, "quiero nuggets x12 y una coca grande");
  const result = await send(phone, "sacame nuggets y agregame papas clasicas");

  const summary = summaryOf(result.reply);

  assert.equal(result.parsedMessage.intent, "MENSAJE_MIXTO_QUITAR_AGREGAR");
  assert.doesNotMatch(summary, /Nuggets/i);
  assert.match(summary, /Papas/i);
  assert.match(summary, /Gaseosa 1\\.5L/i);
});
`, "utf8");

fs.unlinkSync("scripts/apply-tanda52b.cjs");
console.log("Tanda 52B aplicada. El script se eliminó solo.");
