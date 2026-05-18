import {
  getActiveOrderByOrderId,
  getAllActiveOrders,
  saveActiveOrder
} from "../storage/orderRepository.js";
import { ORDER_STATUS, isValidOrderStatus } from "./orderStatus.js";

export const ADMIN_ORDER_STATUS_ACTIONS = Object.freeze({
  preparar: ORDER_STATUS.IN_PREPARATION,
  listo: ORDER_STATUS.READY,
  camino: ORDER_STATUS.ON_THE_WAY,
  entregado: ORDER_STATUS.DELIVERED
});

export function updateActiveOrderStatus({
  orderId,
  status,
  note = null
} = {}) {
  if (!orderId) {
    throw new Error("orderId es obligatorio.");
  }

  if (!isValidOrderStatus(status)) {
    throw new Error(`Estado de pedido inválido: ${status}`);
  }

  const orderMatch = findActiveOrderByIdOrPrefix(orderId);

  if (orderMatch.multiple) {
    return {
      ok: false,
      status: "MULTIPLE_ORDERS_FOUND",
      order: null,
      matches: orderMatch.matches
    };
  }

  if (!orderMatch.order) {
    return {
      ok: false,
      status: "ORDER_NOT_FOUND",
      order: null,
      matches: []
    };
  }

  const order = orderMatch.order;
  const previousStatus = order.status;
  const changedAt = new Date().toISOString();

  order.status = status;
  order.updatedAt = changedAt;

  order.statusHistory = Array.isArray(order.statusHistory)
    ? order.statusHistory
    : [];

  order.statusHistory.push({
    from: previousStatus,
    to: status,
    changedAt,
    note
  });

  applyStatusTimestamp(order, status, changedAt);

  saveActiveOrder(order.customerPhone, order);

  return {
    ok: true,
    status: "OK",
    order,
    previousStatus,
    newStatus: status,
    matchedBy: orderMatch.matchedBy
  };
}

export function formatOrderStatusLabel(status) {
  const labels = {
    [ORDER_STATUS.CREATED]: "Creado",
    [ORDER_STATUS.BUILDING]: "Armando pedido",
    [ORDER_STATUS.WAITING_CONFIRMATION]: "Esperando confirmación",
    [ORDER_STATUS.WAITING_PAYMENT]: "Esperando pago",
    [ORDER_STATUS.PAID]: "Pagado",
    [ORDER_STATUS.IN_PREPARATION]: "En preparación",
    [ORDER_STATUS.READY]: "Listo",
    [ORDER_STATUS.ON_THE_WAY]: "En camino",
    [ORDER_STATUS.DELIVERED]: "Entregado",
    [ORDER_STATUS.CANCELLED]: "Cancelado",
    [ORDER_STATUS.ERROR]: "Error",
    [ORDER_STATUS.REQUIRES_HUMAN]: "Requiere atención humana"
  };

  return labels[status] || status;
}

function findActiveOrderByIdOrPrefix(orderIdOrPrefix) {
  const normalized = String(orderIdOrPrefix || "").trim();

  if (!normalized) {
    return {
      order: null,
      matchedBy: null,
      multiple: false,
      matches: []
    };
  }

  const exactOrder = getActiveOrderByOrderId(normalized);

  if (exactOrder) {
    return {
      order: exactOrder,
      matchedBy: "exact",
      multiple: false,
      matches: []
    };
  }

  const matches = getAllActiveOrders()
    .map((session) => session.order)
    .filter((order) => order?.id?.startsWith(normalized));

  if (matches.length === 1) {
    return {
      order: matches[0],
      matchedBy: "prefix",
      multiple: false,
      matches
    };
  }

  if (matches.length > 1) {
    return {
      order: null,
      matchedBy: "prefix",
      multiple: true,
      matches
    };
  }

  return {
    order: null,
    matchedBy: null,
    multiple: false,
    matches: []
  };
}

function applyStatusTimestamp(order, status, changedAt) {
  if (status === ORDER_STATUS.IN_PREPARATION && !order.preparationStartedAt) {
    order.preparationStartedAt = changedAt;
  }

  if (status === ORDER_STATUS.READY) {
    order.readyAt = changedAt;
  }

  if (status === ORDER_STATUS.ON_THE_WAY) {
    order.onTheWayAt = changedAt;
  }

  if (status === ORDER_STATUS.DELIVERED) {
    order.deliveredAt = changedAt;
  }
}
