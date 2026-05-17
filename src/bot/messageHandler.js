import { parseCustomerMessage } from "../ai/intentParser.js";
import { handleAdminCommand, isAdminCommand, shouldBlockCustomerMessages } from "../admin/adminCommands.js";
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
import { createPaymentPreferenceForOrder } from "../payments/paymentService.js";
import { createLocalNotificationForOrder, NOTIFICATION_TYPE } from "../notifications/notificationService.js";
import { getBusinessAvailability } from "../business/businessHoursService.js";
import { findDeliveryZoneByText } from "../delivery/deliveryZoneService.js";
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

async function handleChooseDelivery({ customerPhone, order, parsedMessage }) {
  const possibleAddress = parsedMessage.entities.possibleAddress;

  if (!possibleAddress) {
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
