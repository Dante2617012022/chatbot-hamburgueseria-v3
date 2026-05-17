import { formatOrderForBusiness } from "../orders/orderFormatter.js";
import { saveLocalNotification } from "./notificationRepository.js";

export const NOTIFICATION_TYPE = Object.freeze({
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_PAID: "ORDER_PAID",
  ORDER_REQUIRES_HUMAN: "ORDER_REQUIRES_HUMAN"
});

export function createLocalNotificationForOrder({
  order,
  type = NOTIFICATION_TYPE.ORDER_CONFIRMED,
  channel = "INTERNAL",
  destination = process.env.OWNER_PHONE || null
}) {
  if (!order || typeof order !== "object") {
    throw new Error("order es obligatorio.");
  }

  if (!order.id) {
    throw new Error("El pedido no tiene id.");
  }

  const message = buildLocalNotificationMessage(order, type);

  return saveLocalNotification({
    orderId: order.id,
    customerPhone: order.customerPhone,
    type,
    channel,
    destination,
    status: "PENDING",
    message,
    payload: {
      order,
      type
    }
  });
}

export function buildLocalNotificationMessage(order, type) {
  const title = getNotificationTitle(type);
  const lines = [];

  lines.push(`*${title}*`);
  lines.push("");
  lines.push(formatOrderForBusiness(order));

  return lines.join("\n");
}

function getNotificationTitle(type) {
  const titles = {
    [NOTIFICATION_TYPE.ORDER_CONFIRMED]: "PEDIDO CONFIRMADO",
    [NOTIFICATION_TYPE.ORDER_PAID]: "PEDIDO PAGADO",
    [NOTIFICATION_TYPE.ORDER_REQUIRES_HUMAN]: "PEDIDO REQUIERE ATENCIÓN HUMANA"
  };

  return titles[type] || "NOTIFICACIÓN DEL PEDIDO";
}
