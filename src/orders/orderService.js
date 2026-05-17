import { randomUUID } from "node:crypto";

import { getProductById } from "../menu/menuRepository.js";
import { ORDER_STATUS } from "./orderStatus.js";
import {
  assertValidOrder,
  assertValidProductId,
  assertValidQuantity
} from "./orderValidator.js";

export function createEmptyOrder({ customerPhone = null } = {}) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    customerPhone,
    customerName: null,
    status: ORDER_STATUS.CREATED,

    deliveryType: null,
    deliveryAddress: null,
    deliveryCost: 0,

    paymentMethod: null,

    items: [],
    notes: [],

    subtotal: 0,
    total: 0,

    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    cancelledAt: null
  };
}

export async function addProductToOrder(
  order,
  productId,
  { quantity = 1, notes = [] } = {}
) {
  assertValidOrder(order);
  assertValidProductId(productId);
  assertValidQuantity(quantity);

  const product = await getProductById(productId);

  if (!product) {
    throw new Error(`Producto no encontrado: ${productId}`);
  }

  if (product.disponible !== true) {
    throw new Error(`Producto no disponible: ${product.nombre}`);
  }

  const normalizedNotes = normalizeNotes(notes);

  const existingItem = order.items.find(
    (item) =>
      item.productId === product.id &&
      JSON.stringify(item.notes) === JSON.stringify(normalizedNotes)
  );

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.subtotal = existingItem.quantity * existingItem.unitPrice;
  } else {
    order.items.push({
      id: randomUUID(),
      productId: product.id,
      name: product.nombre,
      category: product.categoria,
      unitPrice: product.precio,
      quantity,
      notes: normalizedNotes,
      subtotal: product.precio * quantity
    });
  }

  order.status = ORDER_STATUS.BUILDING;
  recalculateOrder(order);
  touchOrder(order);

  return order;
}

export function removeProductFromOrder(order, productId, { quantity = null } = {}) {
  assertValidOrder(order);
  assertValidProductId(productId);

  const itemIndex = order.items.findIndex((item) => item.productId === productId);

  if (itemIndex === -1) {
    return {
      removed: false,
      order
    };
  }

  const item = order.items[itemIndex];

  if (quantity === null || quantity >= item.quantity) {
    order.items.splice(itemIndex, 1);
  } else {
    assertValidQuantity(quantity);
    item.quantity -= quantity;
    item.subtotal = item.quantity * item.unitPrice;
  }

  if (order.items.length === 0) {
    order.status = ORDER_STATUS.CREATED;
  }

  recalculateOrder(order);
  touchOrder(order);

  return {
    removed: true,
    order
  };
}

export function updateItemQuantity(order, productId, quantity) {
  assertValidOrder(order);
  assertValidProductId(productId);
  assertValidQuantity(quantity);

  const item = order.items.find((currentItem) => currentItem.productId === productId);

  if (!item) {
    return {
      updated: false,
      order
    };
  }

  item.quantity = quantity;
  item.subtotal = item.unitPrice * quantity;

  recalculateOrder(order);
  touchOrder(order);

  return {
    updated: true,
    order
  };
}

export function clearOrder(order) {
  assertValidOrder(order);

  order.items = [];
  order.subtotal = 0;
  order.total = 0;
  order.status = ORDER_STATUS.CREATED;
  touchOrder(order);

  return order;
}

export function setCustomerData(order, { customerName = null, customerPhone = null } = {}) {
  assertValidOrder(order);

  if (customerName) {
    order.customerName = customerName;
  }

  if (customerPhone) {
    order.customerPhone = customerPhone;
  }

  touchOrder(order);
  return order;
}

export function setDeliveryData(
  order,
  {
    deliveryType,
    deliveryAddress = null,
    deliveryCost = 0
  } = {}
) {
  assertValidOrder(order);

  if (!["DELIVERY", "RETIRO"].includes(deliveryType)) {
    throw new Error("deliveryType debe ser DELIVERY o RETIRO.");
  }

  if (deliveryCost < 0) {
    throw new Error("El costo de delivery no puede ser negativo.");
  }

  order.deliveryType = deliveryType;
  order.deliveryAddress = deliveryAddress;
  order.deliveryCost = deliveryType === "DELIVERY" ? deliveryCost : 0;

  recalculateOrder(order);
  touchOrder(order);

  return order;
}

export function setPaymentMethod(order, paymentMethod) {
  assertValidOrder(order);

  if (!["MERCADO_PAGO", "EFECTIVO", "TRANSFERENCIA"].includes(paymentMethod)) {
    throw new Error("Forma de pago inválida.");
  }

  order.paymentMethod = paymentMethod;
  touchOrder(order);

  return order;
}

export function markWaitingConfirmation(order) {
  assertValidOrder(order);

  if (order.items.length === 0) {
    throw new Error("No se puede confirmar un pedido vacío.");
  }

  order.status = ORDER_STATUS.WAITING_CONFIRMATION;
  touchOrder(order);

  return order;
}

export function confirmOrder(order) {
  assertValidOrder(order);

  if (order.items.length === 0) {
    throw new Error("No se puede confirmar un pedido vacío.");
  }

  if (!order.deliveryType) {
    throw new Error("Falta definir si el pedido es delivery o retiro.");
  }

  if (order.deliveryType === "DELIVERY" && !order.deliveryAddress) {
    throw new Error("Falta dirección de delivery.");
  }

  if (!order.paymentMethod) {
    throw new Error("Falta forma de pago.");
  }

  order.status =
    order.paymentMethod === "MERCADO_PAGO"
      ? ORDER_STATUS.WAITING_PAYMENT
      : ORDER_STATUS.WAITING_CONFIRMATION;

  order.confirmedAt = new Date().toISOString();
  touchOrder(order);

  return order;
}

export function markAsPaid(order) {
  assertValidOrder(order);

  order.status = ORDER_STATUS.PAID;
  touchOrder(order);

  return order;
}

export function cancelOrder(order, { reason = null } = {}) {
  assertValidOrder(order);

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelledAt = new Date().toISOString();

  if (reason) {
    order.notes.push(`Cancelado: ${reason}`);
  }

  touchOrder(order);

  return order;
}

export function recalculateOrder(order) {
  assertValidOrder(order);

  order.subtotal = order.items.reduce((total, item) => {
    return total + item.subtotal;
  }, 0);

  order.total = order.subtotal + order.deliveryCost;

  return order;
}

function touchOrder(order) {
  order.updatedAt = new Date().toISOString();
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .filter((note) => typeof note === "string")
    .map((note) => note.trim())
    .filter(Boolean);
}
