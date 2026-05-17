import { parseCustomerMessage } from "../ai/intentParser.js";
import { CUSTOMER_INTENT } from "../ai/intentTypes.js";
import { formatMenuForWhatsApp, formatProductSuggestions } from "../menu/menuFormatter.js";
import {
  addProductToOrder,
  cancelOrder,
  confirmOrder,
  removeProductFromOrder,
  setDeliveryData,
  setPaymentMethod
} from "../orders/orderService.js";
import { formatOrderSummary } from "../orders/orderFormatter.js";
import {
  clearOrderSession,
  getOrCreateOrderSession,
  saveOrderSession
} from "../storage/sessionStore.js";
import {
  saveMessageEvent,
  saveUnrecognizedMessage
} from "../storage/messageRepository.js";

export async function handleCustomerMessage({
  customerPhone,
  messageText
}) {
  if (!customerPhone) {
    throw new Error("customerPhone es obligatorio.");
  }

  const order = getOrCreateOrderSession(customerPhone);
  const parsedMessage = await parseCustomerMessage(messageText);

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
        reply: `Perfecto, marcamos tu pedido como *retiro por el local*.\n\n${formatOrderSummary(order)}`
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
        reply:
          parsedMessage.replyHint ||
          "No entendí bien tu mensaje. Podés pedirme el menú o escribirme qué producto querés."
      };
  }
}

async function handleAddProduct({ customerPhone, order, parsedMessage }) {
  const product = parsedMessage.entities.product;
  const quantity = parsedMessage.entities.quantity || 1;

  if (!product) {
    return {
      parsedMessage,
      order,
      reply: buildProductNotClearReply(parsedMessage)
    };
  }

  await addProductToOrder(order, product.id, { quantity });
  saveOrderSession(customerPhone, order);

  return {
    parsedMessage,
    order,
    reply:
      `Agregué a tu pedido:\n` +
      `- ${quantity} x ${product.nombre}\n\n` +
      formatOrderSummary(order)
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

function handleChooseDelivery({ customerPhone, order, parsedMessage }) {
  const possibleAddress = parsedMessage.entities.possibleAddress;

  if (!possibleAddress) {
    return {
      parsedMessage,
      order,
      reply: "Perfecto, sería con delivery. Pasame tu dirección, por favor."
    };
  }

  setDeliveryData(order, {
    deliveryType: "DELIVERY",
    deliveryAddress: possibleAddress,
    deliveryCost: 0
  });

  saveOrderSession(customerPhone, order);

  return {
    parsedMessage,
    order,
    reply:
      `Perfecto, envío a: *${possibleAddress}*.\n\n` +
      formatOrderSummary(order)
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

function handleConfirmOrder({ customerPhone, order, parsedMessage }) {
  try {
    confirmOrder(order);
    saveOrderSession(customerPhone, order);

    return {
      parsedMessage,
      order,
      reply:
        "Pedido confirmado.\n\n" +
        formatOrderSummary(order) +
        "\n\nEn el próximo paso vamos a generar el pago o avisar al local."
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

function buildMissingDataReply(errorMessage, order) {
  if (order.items.length === 0) {
    return "Todavía no tenés productos en el pedido. Podés pedirme el menú o decirme qué querés agregar.";
  }

  if (errorMessage.includes("delivery") || errorMessage.includes("retiro")) {
    return "Antes de confirmar, decime si es *delivery* o *retiro por el local*.";
  }

  if (errorMessage.includes("dirección")) {
    return "Me falta la dirección para el delivery. Pasámela por favor.";
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
