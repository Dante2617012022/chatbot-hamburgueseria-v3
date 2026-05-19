import { parseCustomerMessage } from "../ai/intentParser.js";
import { applyMessageCorrections } from "../ai/messageCorrections.js";
import { parseMultiProductMessage } from "../ai/multiProductParser.js";
import { tryHandleAdvancedOrderEdit } from "../orders/orderEditService.js";
import { extractNotesAndCleanMessage } from "../orders/itemNotesService.js";
import { handleCustomerInfoRequest } from "./customerInfoRequestService.js";
import {
  handleMultipleProductClarificationRequest,
  handlePendingMultiProductClarification
} from "./multiProductClarificationService.js";
import { parseCustomerMessageWithAiFallback, shouldUseAiFallback } from "../ai/aiFallbackParser.js";
import { handleAdminCommand, isAdminCommand, shouldBlockCustomerMessages } from "../admin/adminCommands.js";
import { CUSTOMER_INTENT } from "../ai/intentTypes.js";
import { formatMenuForWhatsApp, formatProductSuggestions } from "../menu/menuFormatter.js";
import {
  addProductToOrder,
  cancelOrder,
  clearOrder,
  confirmOrder,
  removeProductFromOrder,
  setDeliveryData as setDeliveryDataRaw,
  setPaymentMethod,
  clearPendingProductConfirmation,
  setPendingProductConfirmation
} from "../orders/orderService.js";
import { formatOrderSummary } from "../orders/orderFormatter.js";
import { createPaymentPreferenceForOrder } from "../payments/paymentService.js";
import { createLocalNotificationForOrder, NOTIFICATION_TYPE } from "../notifications/notificationService.js";
import { formatOrderStatusLabel } from "../orders/orderWorkflowService.js";
import { getBusinessAvailability } from "../business/businessHoursService.js";
import { findDeliveryZoneByText } from "../delivery/deliveryZoneService.js";
import { sanitizeMessageText } from "../security/inputSanitizer.js";
import { checkRateLimit } from "../security/rateLimiter.js";
import { isSupervisedPilotModeEnabled } from "../storage/settingsRepository.js";
import {
  clearOrderSession,
  getOrCreateOrderSession,
  saveOrderSession
} from "../storage/sessionStore.js";
import {
  saveMessageEvent,
  saveUnrecognizedMessage
} from "../storage/messageRepository.js";


function setDeliveryData(order, deliveryData) {
  if (
    !deliveryData ||
    deliveryData.deliveryType !== "DELIVERY" ||
    !deliveryData.deliveryAddress
  ) {
    return setDeliveryDataRaw(order, deliveryData);
  }

  return setDeliveryDataRaw(order, {
    ...deliveryData,
    deliveryAddress: normalizeStoredDeliveryAddress(deliveryData.deliveryAddress)
  });
}

function normalizeStoredDeliveryAddress(value) {
  let text = normalizeCombinedText(value)
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const correctionMatch = text.match(
    /^(?:me\s+equivoque|me\s+equivoqué|perdon|perdón)?\s*(?:era|es)\s+(.+?)\s+no\s+.+$/
  );

  if (correctionMatch?.[1]) {
    text = correctionMatch[1];
  }

  const trailingAddressMatch = text.match(/\ba\s+([a-z0-9\s]*\d+[a-z0-9\s]*)$/);

  if (
    trailingAddressMatch?.[1] &&
    /\b(quiero|quisiera|dame|mandame|preparame|necesito|agregame|sumame|me\s+preparas|hola)\b/.test(text)
  ) {
    text = trailingAddressMatch[1];
  }

  return text
    .replace(/\b(pago\s+con|pago|mercado\s+pago|mercadopago|mercado|mp|efectivo|transferencia)\b.*$/g, " ")
    .replace(/\b(delivery|envio|dirección|direccion)\b/g, " ")
    .replace(/^(?:a|en)\s+/g, "")
    .replace(/\b(no|sino|era|es)\b\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function handleCustomerMessage({
  customerPhone,
  messageText
}) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  messageText = sanitizeMessageText(messageText);
  messageText = normalizeCommonCustomerTypos(messageText);

  if (!messageText) {
    return {
      parsedMessage: null,
      order: null,
      reply: "No recibí ningún mensaje. ¿Me podés escribir tu pedido?"
    };
  }

  if (isAdminCommand(messageText)) {
    const adminResult = await handleAdminCommand({
      customerPhone,
      messageText
    });

    return {
      parsedMessage: null,
      order: null,
      reply: adminResult.reply,
      admin: adminResult
    };
  }

  const rateLimit = checkRateLimit({
    customerPhone
  });

  if (!rateLimit.allowed) {
    return {
      parsedMessage: null,
      order: null,
      rateLimit,
      reply: buildRateLimitReply(rateLimit)
    };
  }

  if (shouldBlockCustomerMessages()) {
    return {
      parsedMessage: null,
      order: null,
      reply: "En este momento el bot está pausado. Te responderemos manualmente a la brevedad."
    };
  }

  const availability = await getBusinessAvailability();

  if (!availability.isOpen && !availability.acceptsScheduledOrders) {
    return {
      parsedMessage: null,
      order: null,
      reply:
        "Ahora el local está cerrado. " +
        "Cuando estemos abiertos voy a poder tomar tu pedido automáticamente."
    };
  }

  const order = getOrCreateOrderSession(customerPhone);

  const itemNoteData = extractNotesAndCleanMessage(messageText);
  const itemNotes = itemNoteData.notes || [];

  if (itemNotes.length > 0 && itemNoteData.cleanMessageText) {
    messageText = itemNoteData.cleanMessageText;
  }

  const customerInfoRequestResult = await handleCustomerInfoRequest({
    order,
    messageText
  });

  if (customerInfoRequestResult) {
    saveMessageEvent({
      customerPhone,
      direction: "IN",
      text: messageText,
      intent: customerInfoRequestResult.parsedMessage.intent,
      status: customerInfoRequestResult.parsedMessage.status,
      payload: customerInfoRequestResult.parsedMessage
    });

    return customerInfoRequestResult;
  }

  const customerOrderInfoResult = handleCustomerOrderInfoRequest({
    order,
    messageText
  });

  if (customerOrderInfoResult) {
    return customerOrderInfoResult;
  }

  const progressRequestResult = handleProgressRequest({
    customerPhone,
    order,
    messageText
  });

  if (progressRequestResult) {
    return progressRequestResult;
  }

  const combinedMessageResult = await handleCombinedCustomerMessage({
    customerPhone,
    order,
    messageText,
    itemNotes
  });

  if (combinedMessageResult) {
    return combinedMessageResult;
  }

  const standaloneDeliveryChoiceResult = handleStandaloneDeliveryChoice({
    customerPhone,
    order,
    messageText
  });

  if (standaloneDeliveryChoiceResult) {
    return standaloneDeliveryChoiceResult;
  }

  const pendingMultiProductClarificationResult = await handlePendingMultiProductClarification({
    customerPhone,
    order,
    messageText,
    buildNextStepPrompt
  });

  if (pendingMultiProductClarificationResult) {
    return pendingMultiProductClarificationResult;
  }

  const pendingConfirmationResult = await handlePendingProductConfirmation({
    customerPhone,
    order,
    messageText
  });

  if (pendingConfirmationResult) {
    return pendingConfirmationResult;
  }

  const pendingDeliveryAddressResult = await handlePendingDeliveryAddress({
    customerPhone,
    order,
    messageText
  });

  if (pendingDeliveryAddressResult) {
    return pendingDeliveryAddressResult;
  }

  const paymentSupportResult = await handlePaymentSupportMessage({
    customerPhone,
    order,
    messageText
  });

  if (paymentSupportResult) {
    return paymentSupportResult;
  }

  const deliveryAddressUpdateResult = await handleDeliveryAddressUpdateRequest({
    customerPhone,
    order,
    messageText
  });

  if (deliveryAddressUpdateResult) {
    return deliveryAddressUpdateResult;
  }

  const clearOrderResult = handleClearOrderRequest({
    customerPhone,
    order,
    messageText
  });

  if (clearOrderResult) {
    return clearOrderResult;
  }

  const advancedOrderEditResult = await tryHandleAdvancedOrderEdit({
    order,
    messageText
  });

  if (advancedOrderEditResult) {
    saveOrderSession(customerPhone, order);

    saveMessageEvent({
      customerPhone,
      direction: "IN",
      text: messageText,
      intent: advancedOrderEditResult.parsedMessage.intent,
      status: advancedOrderEditResult.parsedMessage.status,
      payload: advancedOrderEditResult.parsedMessage
    });

    if (shouldConfirmAfterEmbeddedCorrection(messageText)) {
      return handleConfirmOrder({
        customerPhone,
        order,
        parsedMessage: advancedOrderEditResult.parsedMessage
      });
    }

    return {
      parsedMessage: advancedOrderEditResult.parsedMessage,
      order,
      reply: advancedOrderEditResult.reply
    };
  }

  const multiProductClarificationResult = await handleMultipleProductClarificationRequest({
    customerPhone,
    order,
    messageText
  });

  if (multiProductClarificationResult) {
    return multiProductClarificationResult;
  }

  const multiProductMessage = await parseMultiProductMessage(messageText);

  if (multiProductMessage.ok) {
    for (const item of multiProductMessage.items) {
      await addProductToOrder(order, item.product.id, {
        quantity: item.quantity,
        notes: itemNotes
      });
    }

    saveOrderSession(customerPhone, order);

    const parsedMessage = {
      rawText: messageText,
      normalizedText: messageText,
      intent: "AGREGAR_PRODUCTOS_MULTIPLES",
      confidence: 0.9,
      status: multiProductMessage.status,
      entities: {
        items: multiProductMessage.items,
        failedItems: multiProductMessage.failedItems || [],
        notes: itemNotes
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
        multiProductMessage.items
          .map((item) => `- ${item.quantity} x ${item.product.nombre}`)
          .join("\n") +
        buildPartialMultiProductWarning(multiProductMessage.failedItems) +
        "\n\n" +
        formatOrderSummary(order) +
        buildNextStepPrompt(order)
    };
  }

  let parsedMessage = await parseCustomerMessage(messageText);

  if (shouldUseAiFallback(parsedMessage)) {
    const aiParsedMessage = await parseCustomerMessageWithAiFallback(messageText, {
      previousParsedMessage: parsedMessage
    });

    if (aiParsedMessage) {
      parsedMessage = aiParsedMessage;
    }
  }

  parsedMessage = applyMessageCorrections(parsedMessage, messageText);

  if (
    itemNotes.length > 0 &&
    parsedMessage.intent === CUSTOMER_INTENT.ADD_PRODUCT
  ) {
    parsedMessage.entities.notes = itemNotes;
  }

  saveMessageEvent({
    customerPhone,
    direction: "IN",
    text: messageText,
    intent: parsedMessage.intent,
    status: parsedMessage.status,
    payload: parsedMessage
  });

  if (
    parsedMessage.intent === CUSTOMER_INTENT.UNKNOWN ||
    ["NO_MATCH", "PRODUCT_NOT_FOUND", "LOW_CONFIDENCE", "AMBIGUOUS"].includes(parsedMessage.status)
  ) {
    saveUnrecognizedMessage({
      customerPhone,
      text: messageText,
      parsedMessage
    });
  }

  switch (parsedMessage.intent) {
    case CUSTOMER_INTENT.VIEW_MENU:
      return {
        parsedMessage,
        order,
        reply: await formatMenuForWhatsApp()
      };

    case CUSTOMER_INTENT.ADD_PRODUCT:
      return handleAddProduct({ customerPhone, order, parsedMessage });

    case CUSTOMER_INTENT.REMOVE_PRODUCT:
      return handleRemoveProduct({ customerPhone, order, parsedMessage });

    case CUSTOMER_INTENT.ASK_TOTAL:
      return {
        parsedMessage,
        order,
        reply: formatOrderSummary(order)
      };

    case CUSTOMER_INTENT.CHOOSE_PICKUP:
      setDeliveryData(order, { deliveryType: "RETIRO" });
      saveOrderSession(customerPhone, order);

      return {
        parsedMessage,
        order,
        reply: `Perfecto, marcamos tu pedido como *retiro por el local*.\n\n${formatOrderSummary(order)}${buildNextStepPrompt(order)}`
      };

    case CUSTOMER_INTENT.CHOOSE_DELIVERY:
      return handleChooseDelivery({ customerPhone, order, parsedMessage });

    case CUSTOMER_INTENT.CHOOSE_PAYMENT:
      return handleChoosePayment({ customerPhone, order, parsedMessage });

    case CUSTOMER_INTENT.CONFIRM_ORDER:
      return handleConfirmOrder({ customerPhone, order, parsedMessage });

    case CUSTOMER_INTENT.CANCEL_ORDER:
      cancelOrder(order, { reason: "Cancelado por el cliente" });
      clearOrderSession(customerPhone);

      return {
        parsedMessage,
        order,
        reply: "Listo, cancelé tu pedido. Si querés hacer uno nuevo, escribime el producto o pedime el menú."
      };

    case CUSTOMER_INTENT.TALK_TO_HUMAN:
      return {
        parsedMessage,
        order,
        reply: "Te paso con una persona para ayudarte mejor. Un momento por favor."
      };

    default:
      return {
        parsedMessage,
        order,
        reply: buildUnknownMessageReply(parsedMessage)
      };
  }
}

function buildUnknownMessageReply(parsedMessage) {
  if (isSupervisedPilotModeEnabled()) {
    return (
      "No estoy seguro de haber entendido tu mensaje. " +
      "Como estamos en modo piloto supervisado, te paso con una persona para revisión manual."
    );
  }

  return (
    parsedMessage.replyHint ||
    "No entendí bien tu mensaje. Podés pedirme el menú o escribirme qué producto querés."
  );
}

function buildPartialMultiProductWarning(failedItems = []) {
  if (!Array.isArray(failedItems) || failedItems.length === 0) {
    return "";
  }

  return failedItems
    .map(({ request, match }) => {
      const originalRequest = [
        request?.quantity && request.quantity !== 1 ? request.quantity : null,
        request?.query
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const suggestions = match?.suggestions?.length > 0
        ? formatProductSuggestions(match.suggestions)
        : "No encontré productos parecidos.";

      return (
        `\n\nCon "${originalRequest || request?.query || "ese producto"}" no estoy seguro.\n` +
        suggestions
      );
    })
    .join("");
}

async function handleAddProduct({ customerPhone, order, parsedMessage }) {
  const product = parsedMessage.entities.product;
  const quantity = parsedMessage.entities.quantity || 1;

  if (parsedMessage.status === "PRODUCT_UNAVAILABLE" && product) {
    return {
      parsedMessage,
      order,
      reply:
        `Por ahora *${product.nombre}* no está disponible.\n` +
        buildProductNotClearReply(parsedMessage)
    };
  }

  if (!product) {
    const suggestions = parsedMessage.entities?.suggestions || [];

    if (suggestions.length > 0) {
      setPendingProductConfirmation(order, {
        type: "ADD_PRODUCT",
        quantity,
        suggestions,
        createdAt: new Date().toISOString()
      });

      saveOrderSession(customerPhone, order);
    }

    return {
      parsedMessage,
      order,
      reply: buildProductNotClearReply(parsedMessage)
    };
  }

  clearPendingProductConfirmation(order);

  await addProductToOrder(order, product.id, {
    quantity,
    notes: parsedMessage.entities.notes || []
  });
  saveOrderSession(customerPhone, order);

  return {
    parsedMessage,
    order,
    reply:
      `Agregué a tu pedido:\n` +
      `- ${quantity} x ${product.nombre}\n\n` +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function handleRemoveProduct({ customerPhone, order, parsedMessage }) {
  const product = parsedMessage.entities.product;

  if (!product) {
    return {
      parsedMessage,
      order,
      reply: buildProductNotClearReply(parsedMessage)
    };
  }

  const result = removeProductFromOrder(order, product.id);
  saveOrderSession(customerPhone, order);

  if (!result.removed) {
    return {
      parsedMessage,
      order,
      reply: `No encontré *${product.nombre}* en tu pedido actual.`
    };
  }

  return {
    parsedMessage,
    order,
    reply:
      `Quité *${product.nombre}* de tu pedido.\n\n` +
      formatOrderSummary(order)
  };
}

function handleCustomerOrderInfoRequest({
  order,
  messageText
}) {
  if (isOrderSummaryRequest(messageText)) {
    return {
      parsedMessage: buildSyntheticParsedMessage({
        messageText,
        intent: "VER_PEDIDO_ACTUAL"
      }),
      order,
      reply: order.items.length > 0
        ? formatOrderSummary(order)
        : "Todavía no tenés productos en el pedido. Podés pedirme el menú o decirme qué querés agregar."
    };
  }

  if (!isOrderStatusRequest(messageText)) {
    return null;
  }

  return {
    parsedMessage: buildSyntheticParsedMessage({
      messageText,
      intent: "CONSULTAR_ESTADO_PEDIDO"
    }),
    order,
    reply: buildCustomerOrderStatusReply(order)
  };
}

function buildSyntheticParsedMessage({
  messageText,
  intent
}) {
  return {
    rawText: messageText,
    normalizedText: normalizeCombinedText(messageText),
    intent,
    confidence: 1,
    status: "OK",
    entities: {},
    replyHint: null
  };
}

function buildCustomerOrderStatusReply(order) {
  if (!order.items?.length) {
    return "Todavía no tenés un pedido activo. Podés pedirme el menú o decirme qué querés agregar.";
  }

  const statusLabel = formatOrderStatusLabel(order.status);
  const lines = [
    "*Estado de tu pedido*",
    "",
    `Estado: *${statusLabel}*`
  ];

  if (order.status === "ESPERANDO_PAGO" && order.paymentMethod === "MERCADO_PAGO") {
    lines.push("Tu pedido está esperando pago por Mercado Pago. Cuando el pago esté aprobado, vamos a marcarlo como pagado.");
  } else if (order.status === "ESPERANDO_CONFIRMACION") {
    lines.push("Tu pedido ya fue confirmado por vos y está pendiente de revisión del local.");
  } else if (order.status === "PAGADO") {
    lines.push("El pago figura como aprobado. El local puede avanzar con la preparación.");
  } else if (order.status === "EN_PREPARACION") {
    lines.push("El local ya está preparando tu pedido.");
  } else if (order.status === "LISTO") {
    lines.push(order.deliveryType === "RETIRO"
      ? "Tu pedido está listo para retirar por el local."
      : "Tu pedido ya está listo.");
  } else if (order.status === "EN_CAMINO") {
    lines.push("Tu pedido está en camino.");
  } else if (order.status === "ENTREGADO") {
    lines.push("Tu pedido figura como entregado.");
  } else if (order.status === "CANCELADO") {
    lines.push("Este pedido figura como cancelado.");
  } else {
    lines.push("Todavía estamos armando los datos de tu pedido.");
  }

  lines.push("");
  lines.push(formatOrderSummary(order));

  return lines.join("\n");
}

function isOrderSummaryRequest(messageText) {
  const text = normalizeCombinedText(messageText);

  return [
    "ver pedido",
    "mi pedido",
    "pedido",
    "resumen",
    "resumen del pedido",
    "que pedi",
    "que pedí",
    "que tengo pedido",
    "cuanto va",
    "cuanto llevo"
  ].includes(text);
}

function isOrderStatusRequest(messageText) {
  const text = normalizeCombinedText(messageText);

  if (!text) {
    return false;
  }

  if (
    [
      "estado",
      "estado pedido",
      "estado del pedido",
      "como va mi pedido",
      "cómo va mi pedido",
      "como va el pedido",
      "cómo va el pedido",
      "cuanto falta",
      "cuánto falta",
      "falta mucho",
      "ya esta listo",
      "ya está listo",
      "ya esta listo?",
      "ya está listo?",
      "esta listo",
      "está listo",
      "esta listo?",
      "está listo?",
      "lo vienen trayendo",
      "lo vienen trayendo?",
      "viene en camino",
      "esta en camino",
      "está en camino"
    ].includes(text)
  ) {
    return true;
  }

  return (
    /\bestado\b.*\bpedido\b/.test(text) ||
    /\b(cuanto|cuánto)\s+falta\b/.test(text) ||
    /\b(ya\s+)?esta\s+listo\??$/.test(text) ||
    /\b(ya\s+)?está\s+listo\??$/.test(text) ||
    /\blo\s+vienen\s+trayendo\??$/.test(text)
  );
}

function handleProgressRequest({
  customerPhone,
  order,
  messageText
}) {
  const text = normalizeCombinedText(messageText);

  if (!isProgressRequest(text)) {
    return null;
  }

  const parsedMessage = buildSyntheticParsedMessage({
    messageText,
    intent: "CONTINUAR_FLUJO_PEDIDO"
  });

  saveMessageEvent({
    customerPhone,
    direction: "IN",
    text: messageText,
    intent: parsedMessage.intent,
    status: parsedMessage.status,
    payload: parsedMessage
  });

  if (!order.items?.length) {
    return {
      parsedMessage,
      order,
      reply: "Todavía no tenés productos en el pedido. Podés pedirme el menú o decirme qué querés agregar."
    };
  }

  const nextStep = buildNextStepPrompt(order);

  return {
    parsedMessage,
    order,
    reply:
      formatOrderSummary(order) +
      (nextStep || "\n\nSi querés cambiar algo, decime qué modificamos. Si está todo correcto, respondé *confirmo*.")
  };
}

function isProgressRequest(text) {
  return (
    [
      "sigamos",
      "seguimos",
      "continuemos",
      "siguiente",
      "como sigo",
      "cómo sigo",
      "que sigue",
      "qué sigue",
      "que falta",
      "qué falta",
      "y ahora"
    ].includes(text) ||
    /\b(que|qué)\s+(falta|sigue)\b/.test(text) ||
    /\b(como|cómo)\s+sigo\b/.test(text)
  );
}

async function handleCombinedCustomerMessage({
  customerPhone,
  order,
  messageText,
  itemNotes = []
}) {
  const paymentMethod = detectCombinedPaymentMethod(messageText);
  let deliveryData = detectCombinedDeliveryData(messageText);
  const standaloneAddress = extractStandaloneAddressFromCombinedMessage(messageText);

  if (
    standaloneAddress &&
    (
      order.deliveryType === "DELIVERY" ||
      deliveryData?.deliveryType === "DELIVERY" ||
      normalizeCombinedText(messageText).includes("delivery") ||
      normalizeCombinedText(messageText).includes("envio")
    )
  ) {
    deliveryData = {
      deliveryType: "DELIVERY",
      deliveryAddress: standaloneAddress,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  const productText = cleanCombinedProductText(messageText);

  if (isFinalConfirmationWithDeliveryWord(messageText, order)) {
    return null;
  }

  if (
    !paymentMethod &&
    !deliveryData &&
    !hasCombinedMessageShape(messageText)
  ) {
    return null;
  }

  const hasProductText = looksLikeCombinedProductText(productText);

  if (!hasProductText && !paymentMethod && !deliveryData) {
    return null;
  }

  let handledProduct = false;
  let productReply = null;

  if (hasProductText) {
    const editResult = await tryHandleAdvancedOrderEdit({
      order,
      messageText: productText
    });

    if (editResult) {
      handledProduct = true;
      productReply = editResult.reply;
    } else {
      const multiProductMessage = await parseMultiProductMessage(productText);

      if (multiProductMessage.ok) {
        for (const item of multiProductMessage.items) {
          await addProductToOrder(order, item.product.id, {
            quantity: item.quantity,
            notes: itemNotes
          });
        }

        handledProduct = true;
        productReply =
          "Agregué a tu pedido:\n" +
          multiProductMessage.items
            .map((item) => `- ${item.quantity} x ${item.product.nombre}`)
            .join("\n") +
          buildPartialMultiProductWarning(multiProductMessage.failedItems);
      } else {
        let parsedProductMessage = await parseCustomerMessage(productText);
        parsedProductMessage = applyMessageCorrections(parsedProductMessage, productText);

        if (
          parsedProductMessage.intent === CUSTOMER_INTENT.ADD_PRODUCT &&
          parsedProductMessage.entities?.product
        ) {
          await addProductToOrder(order, parsedProductMessage.entities.product.id, {
            quantity: parsedProductMessage.entities.quantity || 1,
            notes: itemNotes
          });

          handledProduct = true;
          productReply =
            "Agregué a tu pedido:\n" +
            `- ${parsedProductMessage.entities.quantity || 1} x ${parsedProductMessage.entities.product.nombre}`;
        }
      }
    }
  }

  if (!handledProduct && !paymentMethod && !deliveryData) {
    return null;
  }

  if (deliveryData) {
    setDeliveryData(order, await enrichDeliveryDataWithZone(deliveryData));
  }

  if (paymentMethod) {
    setPaymentMethod(order, paymentMethod);
  }

  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "MENSAJE_COMBINADO_PEDIDO",
    confidence: 0.9,
    status: "OK",
    entities: {
      productText,
      deliveryData,
      paymentMethod
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

  if (shouldConfirmAfterEmbeddedCorrection(messageText)) {
    return handleConfirmOrder({
      customerPhone,
      order,
      parsedMessage
    });
  }

  const deliveryReply = deliveryData?.deliveryType === "RETIRO"
    ? "\nEntrega: *retiro por el local*"
    : deliveryData?.deliveryType === "DELIVERY"
      ? `\nEntrega: *delivery*${deliveryData.deliveryAddress ? ` a *${deliveryData.deliveryAddress}*` : ""} sin costo`
      : "";

  const paymentReply = paymentMethod
    ? `\nPago: *${formatPaymentMethodLabel(paymentMethod)}*`
    : "";

  return {
    parsedMessage,
    order,
    reply:
      (productReply || "Actualicé los datos de tu pedido.") +
      deliveryReply +
      paymentReply +
      "\n\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function isFinalConfirmationWithDeliveryWord(messageText, order) {
  const text = normalizeCombinedText(messageText);

  if (!order?.items?.length || !order.deliveryType || !order.paymentMethod) {
    return false;
  }

  if (order.deliveryType === "DELIVERY" && !order.deliveryAddress) {
    return false;
  }

  return /^(ok|okay|dale|listo|confirmo|si)\s+(mandalo|manda|envialo|enviamelo|asi|nomás|nomas)$/.test(text);
}

function shouldConfirmAfterEmbeddedCorrection(messageText) {
  const text = normalizeCombinedText(messageText);

  if (/\bno\s+confirmes?\b/.test(text) || /\bno\s+confirmo\b/.test(text)) {
    return false;
  }

  return /^(confirmo|confirmar|confirmado|listo|ok|dale)\b/.test(text);
}

function hasCombinedMessageShape(messageText) {
  const text = normalizeCombinedText(messageText);

  return (
    detectCombinedPaymentMethod(text) !== null ||
    detectCombinedDeliveryData(text) !== null
  );
}

function detectCombinedPaymentMethod(messageText) {
  const text = normalizeCombinedText(messageText);

  if (
    /\b(no\s+me\s+anda|no\s+funciona|falla|fallo|no\s+puedo\s+usar)\b.*\b(mp|mercado pago|mercadopago)\b.*\b(efectivo|pago al retirar)\b/.test(text) ||
    /\b(efectivo|pago al retirar|pago en efectivo)\b.*\bno\b.*\b(mp|mercado pago|mercadopago|transferencia)\b/.test(text) ||
    /\bera\s+(efectivo|pago al retirar|pago en efectivo)\b/.test(text)
  ) {
    return "EFECTIVO";
  }

  if (
    /\b(mp|mercado pago|mercadopago)\b.*\bno\b.*\b(efectivo|transferencia)\b/.test(text) ||
    /\bera\s+(mp|mercado pago|mercadopago)\b/.test(text)
  ) {
    return "MERCADO_PAGO";
  }

  if (
    /\btransferencia\b.*\bno\b.*\b(mp|mercado pago|mercadopago|efectivo)\b/.test(text) ||
    /\bera\s+transferencia\b/.test(text)
  ) {
    return "TRANSFERENCIA";
  }

  if (
    text.includes("mercado pago") ||
    text.includes("mercadopago") ||
    /\bmp\b/.test(text)
  ) {
    return "MERCADO_PAGO";
  }

  if (
    text.includes("efectivo") ||
    text.includes("pago al retirar") ||
    text.includes("pago en efectivo")
  ) {
    return "EFECTIVO";
  }

  if (text.includes("transferencia")) {
    return "TRANSFERENCIA";
  }

  return null;
}

function detectCombinedDeliveryData(messageText) {
  const text = normalizeCombinedText(messageText);

  if (
    /\bdelivery\b.*\bno\b.*\bretiro\b/.test(text) ||
    /\bera\s+delivery\b/.test(text)
  ) {
    const address = extractCombinedDeliveryAddress(text);

    return {
      deliveryType: "DELIVERY",
      deliveryAddress: address,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  if (
    /\bretiro\b.*\bno\b.*\bdelivery\b/.test(text) ||
    /\bera\s+retiro\b/.test(text)
  ) {
    return {
      deliveryType: "RETIRO",
      deliveryAddress: null,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  if (
    text.includes("retiro") ||
    text.includes("retirar") ||
    text.includes("para llevar") ||
    text.includes("lo paso a buscar") ||
    text.includes("lo busco") ||
    text.includes("pago al retirar")
  ) {
    return {
      deliveryType: "RETIRO",
      deliveryAddress: null,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  const address = extractCombinedDeliveryAddress(text);

  if (address) {
    return {
      deliveryType: "DELIVERY",
      deliveryAddress: address,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  if (
    text.includes("delivery") ||
    text.includes("envio") ||
    text.includes("mandalo")
  ) {
    return {
      deliveryType: "DELIVERY",
      deliveryAddress: null,
      deliveryZone: null,
      deliveryCost: 0
    };
  }

  return null;
}

function looksLikeFalseAddressCandidate(value) {
  const text = normalizeCombinedText(value);

  if (!text) {
    return true;
  }

  return (
    /^(querer|pedir|necesitar|encargar)\b/.test(text) ||
    /\b(crispy|bacon|cheese|americana|americanas|cuarto|araka|onion|big|camdis|papas|nuggets|coca|pepsi|sprite|gaseosa|bebida|lata|latas)\b/.test(text)
  );
}

function extractCombinedDeliveryAddress(messageText) {
  const text = normalizeCombinedText(messageText);

  const markerPatterns = [
    /\bdelivery\s+a\s+(.+)$/,
    /\bdelivery\s*,?\s+(.+\d.*)$/,
    /\bmandalo\s+a\s+(.+)$/,
    /\benvio\s+a\s+(.+)$/,
    /\benvio\s*,?\s+(.+\d.*)$/,
    /\bdireccion\s+(.+)$/,
    /\ba\s+([a-z0-9\s]+\d+[a-z0-9\s]*)$/
  ];

  for (const pattern of markerPatterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const candidate = cleanDeliveryAddressValue(match[1]);

      if (looksLikeFalseAddressCandidate(candidate)) {
        continue;
      }

      return candidate;
    }
  }

  return null;
}

function looksLikeProductOrderText(text) {
  return /\b(quiero|voy|querer|pedir|preparame|encargar|encargo|necesito|mandame|dame)\b/.test(text) &&
    /\b(crispy|bacon|cheese|americana|americanas|cuarto|araka|onion|big|camdis|papas|nuggets|coca|pepsi|sprite|gaseosa|bebida|lata|latas)\b/.test(text);
}

function extractStandaloneAddressFromCombinedMessage(messageText) {
  let text = normalizeCombinedText(messageText);

  text = cleanCombinedTail(text)
    .replace(/\b(delivery|envio|direccion)\b/g, " ")
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || !/\d/.test(text)) {
    return null;
  }

  if (
    /\b(retiro|retirar|local|buscar|confirmo|cancelar|menu|menú)\b/.test(text)
  ) {
    return null;
  }

  if (looksLikeProductOrderText(text)) {
    return null;
  }

  return text;
}

function cleanCombinedProductText(messageText) {
  let text = normalizeCombinedText(messageText);

  text = text
    .replace(/\bpago\s+al\s+retirar\b/g, " ")
    .replace(/\bpago\s+cuando\s+retiro\b/g, " ")
    .replace(/\bpara\s+retirar\b/g, " ")
    .replace(/\bpara\s+llevar\b/g, " ")
    .replace(/\blo\s+paso\s+a\s+buscar\b/g, " ")
    .replace(/\blo\s+busco\b/g, " ")
    .replace(/\bretiro\b/g, " ")
    .replace(/\bretirar\b/g, " ")
    .replace(/\bpago\s+en\s+efectivo\b/g, " ")
    .replace(/\bpago\s+efectivo\b/g, " ")
    .replace(/\bpago\s+con\s+mp\b/g, " ")
    .replace(/\bpago\s+con\s+mercado\s+pago\b/g, " ")
    .replace(/\bmercado\s+pago\b/g, " ")
    .replace(/\bmercadopago\b/g, " ")
    .replace(/\befectivo\b/g, " ")
    .replace(/\btransferencia\b/g, " ")
    .replace(/\bmp\b/g, " ")
    .replace(/\bcambio\s+(?:de\s+pago\s+)?a\b/g, " ")
    .replace(/\bcambio\s+de\s+pago\b/g, " ");

  text = text
    .replace(/\bdelivery\s+a\s+.+$/g, " ")
    .replace(/\bmandalo\s+a\s+.+$/g, " ")
    .replace(/\benvio\s+a\s+.+$/g, " ")
    .replace(/\bdireccion\s+.+$/g, " ")
    .replace(/\ba\s+[a-z0-9\s]+\d+[a-z0-9\s]*$/g, " ");

  return text
    .replace(/\s+y\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCombinedTail(value) {
  return normalizeCombinedText(value)
    .replace(/\bpago\s+con\s+mp\b.*$/g, "")
    .replace(/\bpago\s+con\s+mercado\s+pago\b.*$/g, "")
    .replace(/\bpago\s+en\s+efectivo\b.*$/g, "")
    .replace(/\bpago\s+efectivo\b.*$/g, "")
    .replace(/\bpago\s+transferencia\b.*$/g, "")
    .replace(/\bpago\s+con\s+transferencia\b.*$/g, "")
    .replace(/\bpago\b.*$/g, "")
    .replace(/\bmercado\s+pago\b.*$/g, "")
    .replace(/\bmercadopago\b.*$/g, "")
    .replace(/\befectivo\b.*$/g, "")
    .replace(/\btransferencia\b.*$/g, "")
    .replace(/\bmp\b.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCombinedProductText(productText) {
  const text = normalizeCombinedText(productText);

  if (!text || text.length < 3) {
    return false;
  }

  return (
    /\b(quiero|voy|querer|pedir|mandame|dame|agregame|sumame|mejor|cambiala|cambialo|una|un|dos|tres|coca|pepsi|sprite|gaseosa|bebida|lata|latas|papas|nuggets|cheese|bacon|big|cuarto|americana|americanas|araka|onion|crispy|camdis)\b/.test(text)
  );
}

function normalizeCombinedText(messageText) {
  return String(messageText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPaymentMethodLabel(paymentMethod) {
  const labels = {
    MERCADO_PAGO: "Mercado Pago",
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia"
  };

  return labels[paymentMethod] || paymentMethod;
}

async function enrichDeliveryDataWithZone(deliveryData) {
  if (deliveryData?.deliveryType !== "DELIVERY" || !deliveryData.deliveryAddress) {
    return deliveryData;
  }

  const zoneMatch = await findDeliveryZoneByText(deliveryData.deliveryAddress);

  return {
    ...deliveryData,
    deliveryZone: zoneMatch.zone?.nombre || null,
    deliveryCost: 0
  };
}

async function handleDeliveryAddressUpdateRequest({
  customerPhone,
  order,
  messageText
}) {
  if (order.deliveryType !== "DELIVERY") {
    return null;
  }

  const correctedAddress = extractDeliveryAddressCorrection(messageText);
  const reference = extractDeliveryReference(messageText);

  if (!correctedAddress && !reference) {
    return null;
  }

  if (reference && !order.deliveryAddress) {
    return null;
  }

  const nextAddress = correctedAddress
    ? correctedAddress
    : appendDeliveryReference(order.deliveryAddress, reference);

  if (!nextAddress || !looksLikeAddressWithNumber(nextAddress)) {
    return null;
  }

  const enrichedDeliveryData = await enrichDeliveryDataWithZone({
    deliveryType: "DELIVERY",
    deliveryAddress: nextAddress,
    deliveryZone: null,
    deliveryCost: 0
  });

  setDeliveryData(order, enrichedDeliveryData);
  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: correctedAddress ? "CORREGIR_DIRECCION_DELIVERY" : "AGREGAR_REFERENCIA_DELIVERY",
    confidence: 1,
    status: "OK",
    entities: {
      deliveryType: "DELIVERY",
      deliveryAddress: nextAddress,
      deliveryZone: enrichedDeliveryData.deliveryZone
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

  const zoneText = enrichedDeliveryData.deliveryZone
    ? `\nZona: *${enrichedDeliveryData.deliveryZone}*`
    : "";

  return {
    parsedMessage,
    order,
    reply:
      `Perfecto, actualicé la dirección: *${nextAddress}*.` +
      zoneText +
      "\n\n" +
      formatOrderSummary(order)
  };
}

function extractDeliveryAddressCorrection(messageText) {
  const text = normalizeCombinedText(messageText);

  const patterns = [
    /^(?:me\s+equivoque|me\s+equivoqué|perdon|perdón)?\s*,?\s*era\s+(.+?)\s+no\s+.+$/,
    /^(?:me\s+equivoque|me\s+equivoqué|perdon|perdón)?\s*,?\s*es\s+(.+?)\s+no\s+.+$/,
    /^(?:direccion|dirección|dire)\s+(?:correcta|bien)?\s*:??\s*(.+)$/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanDeliveryAddressValue(match[1]);
    }
  }

  return null;
}

function extractDeliveryReference(messageText) {
  const text = normalizeCombinedText(messageText);

  const patterns = [
    /^(?:referencia|ref)\s+(.+)$/,
    /^(?:entre\s+calles|entre)\s+(.+)$/,
    /^(?:casa|porton|portón|depto|departamento|piso)\s+(.+)$/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanDeliveryAddressValue(match[1]);
    }
  }

  return null;
}

function cleanDeliveryAddressValue(value) {
  return cleanCombinedTail(value)
    .replace(/\b(no|sino|era|es)\b\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendDeliveryReference(address, reference) {
  const cleanedAddress = normalizeCombinedText(address);
  const cleanedReference = cleanDeliveryAddressValue(reference);

  if (!cleanedAddress || !cleanedReference) {
    return cleanedAddress || cleanedReference;
  }

  if (cleanedAddress.includes(cleanedReference)) {
    return cleanedAddress;
  }

  return `${cleanedAddress} referencia ${cleanedReference}`;
}

function looksLikeAddressWithNumber(value) {
  return /\d/.test(normalizeCombinedText(value));
}

async function handlePaymentSupportMessage({
  customerPhone,
  order,
  messageText
}) {
  const text = normalizeCombinedText(messageText);

  if (isPaymentLinkRequest(text)) {
    return handlePaymentLinkRequest({
      customerPhone,
      order,
      messageText
    });
  }

  if (isCustomerSaysAlreadyPaid(text)) {
    return handleCustomerSaysAlreadyPaid({
      customerPhone,
      order,
      messageText
    });
  }

  if (isPaymentReceiptMessage(text)) {
    return handlePaymentReceiptMessage({
      customerPhone,
      order,
      messageText
    });
  }

  return null;
}

async function handlePaymentLinkRequest({
  customerPhone,
  order,
  messageText
}) {
  if (order.paymentMethod !== "MERCADO_PAGO" || order.items.length === 0) {
    return null;
  }

  const paymentResult = await createPaymentPreferenceForOrder(order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "REENVIAR_LINK_PAGO",
    confidence: 1,
    status: "OK",
    entities: {
      paymentMethod: "MERCADO_PAGO",
      initPoint: paymentResult.initPoint
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
      "Link de pago Mercado Pago:\n" +
      paymentResult.initPoint +
      "\n\nCuando el pago esté aprobado, vamos a marcar el pedido como pagado."
  };
}

function handleCustomerSaysAlreadyPaid({
  customerPhone,
  order,
  messageText
}) {
  if (order.paymentMethod !== "MERCADO_PAGO") {
    return null;
  }

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "CLIENTE_DICE_PAGO_REALIZADO",
    confidence: 1,
    status: "PAGO_NO_VERIFICADO",
    entities: {
      paymentMethod: "MERCADO_PAGO"
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
      "Gracias por avisar. Cuando el pago esté aprobado por Mercado Pago, vamos a marcar el pedido como pagado automáticamente."
  };
}

function handlePaymentReceiptMessage({
  customerPhone,
  order,
  messageText
}) {
  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "CLIENTE_ENVIA_COMPROBANTE",
    confidence: 1,
    status: "PENDIENTE_REVISION_MANUAL",
    entities: {
      paymentMethod: order.paymentMethod || null
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
      "Recibido. Si mandaste comprobante, lo revisamos con una persona del local y te confirmamos a la brevedad."
  };
}

function isPaymentLinkRequest(text) {
  return (
    [
      "quiero pagar",
      "pagar",
      "cobrame",
      "cobrame ya",
      "cobramelo",
      "cobrámelo",
      "finaliza",
      "finalizá",
      "finalizalo",
      "terminamos",
      "ya esta",
      "ya está",
      "como pago",
      "cómo pago"
    ].includes(text) ||
    /\b(pasame|pasar|mandame|manda|enviame|envia|genera|generá)\b.*\b(link|pago|pagar)\b/.test(text) ||
    /\b(dame|necesito|quiero)\b.*\b(pagar|link|pago)\b/.test(text) ||
    /\b(para\s+pagar|link\s+de\s+pago|link\s+mercado\s+pago)\b/.test(text)
  );
}

function isCustomerSaysAlreadyPaid(text) {
  return (
    /\b(ya\s+pague|ya\s+pagué|pague|pagué|pagado)\b/.test(text) &&
    !isPaymentReceiptMessage(text)
  );
}

function isPaymentReceiptMessage(text) {
  return /\b(comprobante|captura|screenshot|transferi|transferí|te\s+mando\s+comprobante|mando\s+comprobante)\b/.test(text);
}

function handleClearOrderRequest({
  customerPhone,
  order,
  messageText
}) {
  if (!isClearOrderRequest(messageText)) {
    return null;
  }

  clearOrder(order);
  clearPendingProductConfirmation(order);
  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "VACIAR_PEDIDO",
    confidence: 1,
    status: "OK",
    entities: {},
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
    reply: "Listo, saqué todos los productos del pedido. Si querés empezar otro, decime qué agregamos."
  };
}

function isClearOrderRequest(messageText) {
  const text = normalizeCombinedText(messageText);

  return [
    "saca todo",
    "sacame todo",
    "quita todo",
    "quitame todo",
    "elimina todo",
    "eliminame todo",
    "nuevo pedido",
    "pedido nuevo",
    "limpiar pedido"
  ].includes(text);
}

function handleStandaloneDeliveryChoice({
  customerPhone,
  order,
  messageText
}) {
  if (!isStandaloneDeliveryChoice(messageText)) {
    return null;
  }

  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: null,
    deliveryZone: null,
    deliveryCost: 0
  });

  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "ELEGIR_DELIVERY_SIN_DIRECCION",
    confidence: 1,
    status: "OK",
    entities: {
      deliveryType: "DELIVERY",
      possibleAddress: null
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
    reply: "Perfecto, sería con delivery. Pasame tu dirección, por favor. El delivery no tiene costo."
  };
}

function isStandaloneDeliveryChoice(messageText) {
  const normalized = sanitizeMessageText(messageText)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return [
    "delivery",
    "envio",
    "envío",
    "con delivery",
    "con envio",
    "con envío",
    "a domicilio"
  ].includes(normalized);
}

async function handlePendingDeliveryAddress({
  customerPhone,
  order,
  messageText
}) {
  if (order.deliveryType !== "DELIVERY" || order.deliveryAddress) {
    return null;
  }

  if (!looksLikeStandaloneAddress(messageText)) {
    return null;
  }

  const possibleAddress = sanitizeMessageText(messageText);
  const zoneMatch = await findDeliveryZoneByText(possibleAddress);

  if (!zoneMatch.ok && zoneMatch.requiresKnownZone) {
    return {
      parsedMessage: {
        rawText: messageText,
        normalizedText: possibleAddress,
        intent: "COMPLETAR_DIRECCION_DELIVERY",
        confidence: 0.8,
        status: "ZONE_NOT_FOUND",
        entities: {
          possibleAddress
        },
        replyHint: null
      },
      order,
      reply:
        "Tenemos delivery sin costo, pero no pude reconocer si esa dirección está dentro de nuestra zona. " +
        "Pasame el barrio o zona, por favor."
    };
  }

  const deliveryZone = zoneMatch.zone?.nombre || null;

  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: possibleAddress,
    deliveryZone,
    deliveryCost: 0
  });

  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: possibleAddress,
    intent: "COMPLETAR_DIRECCION_DELIVERY",
    confidence: 0.9,
    status: "OK",
    entities: {
      deliveryType: "DELIVERY",
      possibleAddress
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

  const zoneText = deliveryZone
    ? `\nZona: *${deliveryZone}*`
    : "\nNo pude detectar la zona automáticamente, pero el delivery queda sin costo.";

  return {
    parsedMessage,
    order,
    reply:
      `Perfecto, envío a: *${possibleAddress}*.` +
      zoneText +
      "\nDelivery: *sin costo*.\n\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function looksLikeStandaloneAddress(messageText) {
  const normalized = sanitizeMessageText(messageText)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!normalized) {
    return false;
  }

  if (
    /\b(retiro|retirar|local|buscar|efectivo|transferencia|mercado pago|mercadopago|mp|confirmo|cancelar|menu|menú)\b/.test(normalized)
  ) {
    return false;
  }

  return /\d/.test(normalized);
}

async function handleChooseDelivery({ customerPhone, order, parsedMessage }) {
  const possibleAddress = parsedMessage.entities.possibleAddress;

  if (!possibleAddress) {
    setDeliveryData(order, {
      deliveryType: "DELIVERY",
      deliveryAddress: null,
      deliveryZone: null,
      deliveryCost: 0
    });

    saveOrderSession(customerPhone, order);

    return {
      parsedMessage,
      order,
      reply: "Perfecto, sería con delivery. Pasame tu dirección, por favor. El delivery no tiene costo."
    };
  }

  const zoneMatch = await findDeliveryZoneByText(possibleAddress);

  if (!zoneMatch.ok && zoneMatch.requiresKnownZone) {
    return {
      parsedMessage,
      order,
      reply:
        "Tenemos delivery sin costo, pero no pude reconocer si esa dirección está dentro de nuestra zona. " +
        "Pasame el barrio o zona, por favor."
    };
  }

  const deliveryZone = zoneMatch.zone?.nombre || null;

  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: possibleAddress,
    deliveryZone,
    deliveryCost: 0
  });

  saveOrderSession(customerPhone, order);

  const zoneText = deliveryZone
    ? `\nZona: *${deliveryZone}*`
    : "\nNo pude detectar la zona automáticamente, pero el delivery queda sin costo.";

  return {
    parsedMessage,
    order,
    reply:
      `Perfecto, envío a: *${possibleAddress}*.` +
      zoneText +
      "\nDelivery: *sin costo*.\n\n" +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

function handleChoosePayment({ customerPhone, order, parsedMessage }) {
  const paymentMethod = parsedMessage.entities.paymentMethod;

  if (!paymentMethod) {
    return {
      parsedMessage,
      order,
      reply: "¿Querés pagar con Mercado Pago, efectivo o transferencia?"
    };
  }

  setPaymentMethod(order, paymentMethod);
  saveOrderSession(customerPhone, order);

  return {
    parsedMessage,
    order,
    reply:
      `Perfecto, forma de pago: *${formatPaymentLabel(paymentMethod)}*.\n\n` +
      formatOrderSummary(order) +
      "\n\nSi está todo correcto, respondé *confirmo*."
  };
}

async function handleConfirmOrder({ customerPhone, order, parsedMessage }) {
  try {
    confirmOrder(order);
    saveOrderSession(customerPhone, order);

    if (order.paymentMethod === "MERCADO_PAGO") {
      const paymentResult = await createPaymentPreferenceForOrder(order);

      const dryRunNotice = paymentResult.isDryRun
        ? "\n\n_Modo desarrollo: este link de pago es simulado y no cobra dinero._"
        : "";

      return {
        parsedMessage,
        order,
        reply:
          "Pedido confirmado.\n\n" +
          formatOrderSummary(order) +
          "\n\nLink de pago Mercado Pago:\n" +
          paymentResult.initPoint +
          dryRunNotice +
          "\n\nCuando el pago esté aprobado, vamos a marcar el pedido como pagado."
      };
    }

    const notification = createLocalNotificationForOrder({
      order,
      type: NOTIFICATION_TYPE.ORDER_CONFIRMED
    });

    return {
      parsedMessage,
      order,
      notification,
      reply:
        "Pedido confirmado.\n\n" +
        formatOrderSummary(order) +
        "\n\nTu pedido quedó confirmado. En breve lo revisa el local."
    };
  } catch (error) {
    return {
      parsedMessage,
      order,
      reply: buildMissingDataReply(error.message, order)
    };
  }
}

function buildProductNotClearReply(parsedMessage) {
  const suggestions = parsedMessage.entities.suggestions || [];

  if (suggestions.length > 0) {
    return formatProductSuggestions(suggestions);
  }

  return parsedMessage.replyHint || "No estoy seguro de qué producto querés.";
}

function normalizeCommonCustomerTypos(messageText) {
  return String(messageText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?]/g, " ")
    .replace(/\b(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches)\s+(te\s+voy\s+a\s+pedir|te\s+quiero\s+pedir|voy\s+a\s+pedir|quiero\s+pedir|voy\s+a\s+querer|te\s+voy\s+a\s+querer|te\s+voy\s+a\s+querer\s+pedir|te\s+puedo\s+encargar|te\s+encargo|preparame|me\s+preparas|voy\s+a\s+necesitar|necesito|quiero)\b/g, "$2")
    .replace(/\bkiero\b/g, "quiero")
    .replace(/\bte\s+puedo\s+encargar\b/g, "quiero")
    .replace(/\bpuedo\s+encargarte\b/g, "quiero")
    .replace(/\bpuedo\s+encargar\b/g, "quiero")
    .replace(/\bte\s+encargo\b/g, "quiero")
    .replace(/\bencargame\b/g, "quiero")
    .replace(/\bencargar\b/g, "quiero")
    .replace(/\bte\s+voy\s+a\s+pedir\b/g, "quiero")
    .replace(/\bte\s+quiero\s+pedir\b/g, "quiero")
    .replace(/\bvoy\s+a\s+pedir\b/g, "quiero")
    .replace(/\bquiero\s+pedir\b/g, "quiero")
    .replace(/\bvoy\s+a\s+querer\b/g, "quiero")
    .replace(/\bte\s+voy\s+a\s+querer\s+pedir\b/g, "quiero")
    .replace(/\bte\s+voy\s+a\s+querer\b/g, "quiero")
    .replace(/\bme\s+pedis\b/g, "quiero")
    .replace(/\bpreparame\b/g, "quiero")
    .replace(/\bme\s+preparas\b/g, "quiero")
    .replace(/\bpreparas\b/g, "quiero")
    .replace(/\bvoy\s+a\s+necesitar\b/g, "quiero")
    .replace(/\bnecesito\b/g, "quiero")
    .replace(/\bmercado\b/g, "mercado pago")
    .replace(/\btriples\b/g, "triple")
    .replace(/\bagregale\b/g, "agregame")
    .replace(/\bsumale\b/g, "sumame")
    .replace(/\bqiero\b/g, "quiero")
    .replace(/\bqro\b/g, "quiero")
    .replace(/\bbcon\b/g, "bacon")
    .replace(/\bchese\b/g, "cheese")
    .replace(/\bnugget\s*12\b/g, "nuggets x12")
    .replace(/\bnuggets\s*12\b/g, "nuggets x12")
    .replace(/\bnugget\s*6\b/g, "nuggets x6")
    .replace(/\bnuggets\s*6\b/g, "nuggets x6")
    .replace(/\bamericnas\b/g, "americanas")
    .replace(/\bcamdiss\b/g, "camdis")
    .replace(/\btrple\b/g, "triple")
    .replace(/\btripl\b/g, "triple")
    .replace(/\bdble\b/g, "doble")
    .replace(/\bgrnade\b/g, "grande")
    .replace(/\bgrnde\b/g, "grande")
    .replace(/\bpapass\b/g, "papas")
    .replace(/\bcripsy\b/g, "crispy")
    .replace(/\bmndalo\b/g, "mandalo")
    .replace(/\bt paso dire\s+/g, "delivery a ")
    .replace(/\bte paso dire\s+/g, "delivery a ")
    .replace(/\bdire\b/g, "direccion")
    .replace(/\bmpago\b/g, "mercado pago")
    .replace(/\bmp\b/g, "mp")
    .replace(/\befvo\b/g, "efectivo")
    .replace(/\befect\b/g, "efectivo")
    .replace(/\btransf\b/g, "transferencia")
    .replace(/\btransfer\b/g, "transferencia")
    .replace(/^retira$/g, "retiro")
    .replace(/^lo busco$/g, "lo paso a buscar")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRateLimitReply(rateLimit) {
  const retryAfterSeconds = rateLimit.retryAfterSeconds || 60;
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return (
    "Recibí demasiados mensajes seguidos. " +
    `Por seguridad pausé la atención automática para este número por aproximadamente ${minutes} minuto(s). ` +
    "Si necesitás ayuda urgente, escribí *humano* más tarde o esperá a que te respondan manualmente."
  );
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

  if (missing.length > 0) {
    return (
      "\n\nPara completar el pedido me falta:" +
      "\n" +
      missing.map((item) => `- ${item}`).join("\n") +
      buildNextStepExample(order)
    );
  }

  if (order.status === "ARMANDO_PEDIDO" || order.status === "CREADO") {
    return "\n\nYa tengo todos los datos. Si está todo correcto, respondé *confirmo*.";
  }

  if (order.status === "ESPERANDO_PAGO" && order.paymentMethod === "MERCADO_PAGO") {
    return "\n\nTu pedido está esperando pago por Mercado Pago. Si necesitás el link, escribí *pasame el link* o *dame para pagar*.";
  }

  return "";
}

function buildNextStepExample(order) {
  if (!order.deliveryType) {
    return "\n\nPodés mandarlo todo junto, por ejemplo: *delivery a Centenario 49 pago Mercado Pago* o *retiro efectivo*.";
  }

  if (order.deliveryType === "DELIVERY" && !order.deliveryAddress && !order.paymentMethod) {
    return "\n\nPodés responder todo junto, por ejemplo: *dirección Centenario 49 pago Mercado Pago*.";
  }

  if (order.deliveryType === "DELIVERY" && !order.deliveryAddress) {
    return "\n\nPodés responder, por ejemplo: *dirección Centenario 49*.";
  }

  if (!order.paymentMethod) {
    return "\n\nPodés responder, por ejemplo: *Mercado Pago*, *efectivo* o *transferencia*.";
  }

  return "";
}

function buildMissingDataReply(errorMessage, order) {
  if (order.items.length === 0) {
    return "Todavía no tenés productos en el pedido. Podés pedirme el menú o decirme qué querés agregar.";
  }

  if (errorMessage.includes("dirección")) {
    return "Me falta la dirección para el delivery. Pasámela por favor.";
  }

  if (errorMessage.includes("delivery") || errorMessage.includes("retiro")) {
    return "Antes de confirmar, decime si es *delivery* o *retiro por el local*.";
  }

  if (errorMessage.includes("forma de pago")) {
    return "Me falta la forma de pago. ¿Pagás con Mercado Pago, efectivo o transferencia?";
  }

  return `Falta completar un dato del pedido: ${errorMessage}`;
}

function formatPaymentLabel(paymentMethod) {
  const labels = {
    MERCADO_PAGO: "Mercado Pago",
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia"
  };

  return labels[paymentMethod] || paymentMethod;
}

async function handlePendingProductConfirmation({
  customerPhone,
  order,
  messageText
}) {
  const pending = order.pendingProductConfirmation;

  if (!pending) {
    return null;
  }

  if (isNegativeConfirmation(messageText)) {
    clearPendingProductConfirmation(order);
    saveOrderSession(customerPhone, order);

    return {
      parsedMessage: {
        rawText: messageText,
        normalizedText: messageText,
        intent: "RECHAZAR_SUGERENCIA_PRODUCTO",
        confidence: 1,
        status: "OK",
        entities: {},
        replyHint: null
      },
      order,
      reply: "Perfecto, no lo agrego. Escribime el producto de otra forma o pedime el menú."
    };
  }

  const selectedSuggestion = await resolvePendingProductSuggestion({
    pending,
    messageText
  });

  if (!selectedSuggestion?.id) {
    return null;
  }

  await addProductToOrder(order, selectedSuggestion.id, {
    quantity: pending.quantity || 1
  });

  clearPendingProductConfirmation(order);
  saveOrderSession(customerPhone, order);

  const parsedMessage = {
    rawText: messageText,
    normalizedText: messageText,
    intent: "CONFIRMAR_SUGERENCIA_PRODUCTO",
    confidence: 1,
    status: "OK",
    entities: {
      productId: selectedSuggestion.id,
      quantity: pending.quantity || 1
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
      `Perfecto, agregué *${selectedSuggestion.nombre}* a tu pedido.\n\n` +
      formatOrderSummary(order) +
      buildNextStepPrompt(order)
  };
}

async function resolvePendingProductSuggestion({
  pending,
  messageText
}) {
  const normalized = normalizeShortConfirmationText(messageText);
  const suggestions = pending.suggestions || [];

  if (isAffirmativeConfirmation(messageText)) {
    return suggestions[0] || null;
  }

  const index = getSuggestionIndexFromText(normalized);

  if (index !== null) {
    return suggestions[index] || null;
  }

  const size = getVariantSizeFromText(normalized);

  if (size) {
    const directSuggestion = suggestions.find((suggestion) =>
      normalizeShortConfirmationText(`${suggestion.id} ${suggestion.nombre}`).includes(size)
    );

    if (directSuggestion) {
      return directSuggestion;
    }

    const family = getFamilyFromPendingSuggestions(suggestions);

    if (family) {
      const match = await parseCustomerMessage(`${family} ${size}`);

      if (match?.entities?.product) {
        return {
          id: match.entities.product.id,
          nombre: match.entities.product.nombre,
          precio: match.entities.product.precio,
          confidence: 1
        };
      }
    }
  }

  return null;
}

function normalizeShortConfirmationText(messageText) {
  return String(messageText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(no|esa|ese|esta|este|la|el|las|los|porfa|por favor)\b/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSuggestionIndexFromText(text) {
  if (/\b(primera|primero|1|uno|una)\b/.test(text)) {
    return 0;
  }

  if (/\b(segunda|segundo|2|dos)\b/.test(text)) {
    return 1;
  }

  if (/\b(tercera|tercero|3|tres)\b/.test(text)) {
    return 2;
  }

  return null;
}

function getVariantSizeFromText(text) {
  if (/\bsimple\b/.test(text)) {
    return "simple";
  }

  if (/\bdoble\b/.test(text)) {
    return "doble";
  }

  if (/\btriple\b/.test(text)) {
    return "triple";
  }

  return null;
}

function getFamilyFromPendingSuggestions(suggestions) {
  const value = normalizeShortConfirmationText(
    suggestions.map((suggestion) => `${suggestion.id} ${suggestion.nombre}`).join(" ")
  );

  if (value.includes("bacon")) return "bacon";
  if (value.includes("cheeseburger") || value.includes("cheese")) return "cheese";
  if (value.includes("cuarto")) return "cuarto";
  if (value.includes("americana")) return "americana";
  if (value.includes("big")) return "big";
  if (value.includes("crispy")) return "crispy";
  if (value.includes("araka")) return "araka";
  if (value.includes("onion")) return "onion";

  return null;
}

function isAffirmativeConfirmation(messageText) {
  const normalized = String(messageText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return [
    "si",
    "sisi",
    "si ese",
    "si esa",
    "si a ese",
    "si a esa",
    "si es ese",
    "si es esa",
    "si esa misma",
    "si ese mismo",
    "ese",
    "esa",
    "correcto",
    "exacto",
    "dale",
    "ok",
    "okay"
  ].includes(normalized);
}

function isNegativeConfirmation(messageText) {
  const normalized = String(messageText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  return [
    "no",
    "no ese",
    "no esa",
    "ninguno",
    "ninguna",
    "cancelar"
  ].includes(normalized);
}
