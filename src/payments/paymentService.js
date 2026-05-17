import { markAsPaid } from "../orders/orderService.js";
import { createLocalNotificationForOrder, NOTIFICATION_TYPE } from "../notifications/notificationService.js";
import {
  getActiveOrderByOrderId,
  saveActiveOrder
} from "../storage/orderRepository.js";
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment
} from "./mercadoPagoClient.js";
import {
  getPaymentRecordByOrderId,
  savePaymentRecord,
  updatePaymentStatusByOrderId
} from "./paymentRepository.js";

export async function createPaymentPreferenceForOrder(
  order,
  {
    forceDryRun = false
  } = {}
) {
  validateOrderForPayment(order);

  const existingPayment = getPaymentRecordByOrderId(order.id);

  if (
    existingPayment &&
    existingPayment.status === "PENDING" &&
    existingPayment.initPoint
  ) {
    return {
      alreadyExists: true,
      isDryRun: existingPayment.raw?.isDryRun === true,
      payment: existingPayment,
      initPoint: existingPayment.initPoint
    };
  }

  const isDryRun =
    forceDryRun ||
    process.env.MERCADOPAGO_DRY_RUN === "true" ||
    !process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (isDryRun) {
    return createDryRunPayment(order);
  }

  const externalReference = buildExternalReference(order);

  const body = {
    items: buildPreferenceItems(order),
    external_reference: externalReference,
    notification_url: process.env.MERCADOPAGO_NOTIFICATION_URL || undefined,
    back_urls: buildBackUrls(),
    auto_return: "approved",
    metadata: {
      order_id: order.id,
      customer_phone: order.customerPhone || null
    }
  };

  const preference = await createMercadoPagoPreference(body);

  const payment = savePaymentRecord({
    orderId: order.id,
    customerPhone: order.customerPhone,
    provider: "MERCADO_PAGO",
    preferenceId: preference.id,
    externalReference,
    status: "PENDING",
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point,
    amount: order.total,
    currency: "ARS",
    raw: preference
  });

  return {
    alreadyExists: false,
    isDryRun: false,
    payment,
    initPoint: payment.initPoint
  };
}

export function approveDryRunPaymentByOrderId(orderId) {
  if (!orderId) {
    throw new Error("orderId es obligatorio.");
  }

  const payment = getPaymentRecordByOrderId(orderId);

  if (!payment) {
    throw new Error(`No existe pago para el pedido ${orderId}.`);
  }

  if (payment.provider !== "MERCADO_PAGO") {
    throw new Error(`Proveedor de pago no soportado: ${payment.provider}`);
  }

  const updatedPayment = updatePaymentStatusByOrderId({
    orderId,
    status: "APPROVED",
    paymentId: payment.paymentId || `dry_run_payment_${orderId}`,
    raw: {
      ...(payment.raw || {}),
      dryRunApprovedAt: new Date().toISOString()
    }
  });

  const order = getActiveOrderByOrderId(orderId);

  if (!order) {
    return {
      payment: updatedPayment,
      order: null,
      orderUpdated: false
    };
  }

  markAsPaid(order);
  saveActiveOrder(order.customerPhone, order);

  const notification = createLocalNotificationForOrder({
    order,
    type: NOTIFICATION_TYPE.ORDER_PAID
  });

  return {
    payment: updatedPayment,
    order,
    orderUpdated: true,
    notification
  };
}

export async function processMercadoPagoWebhook({
  query = {},
  body = {}
} = {}) {
  const paymentId = extractPaymentIdFromWebhook({ query, body });

  if (!paymentId) {
    return {
      processed: false,
      reason: "PAYMENT_ID_NOT_FOUND"
    };
  }

  const isDryRun =
    process.env.MERCADOPAGO_DRY_RUN === "true" ||
    !process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (isDryRun) {
    return {
      processed: false,
      reason: "DRY_RUN_MODE_DOES_NOT_QUERY_MERCADO_PAGO",
      paymentId
    };
  }

  const paymentInfo = await getMercadoPagoPayment(paymentId);

  const orderId = extractOrderIdFromExternalReference(
    paymentInfo.external_reference
  );

  if (!orderId) {
    return {
      processed: false,
      reason: "ORDER_ID_NOT_FOUND_IN_EXTERNAL_REFERENCE",
      paymentId,
      paymentInfo
    };
  }

  const normalizedStatus = normalizeMercadoPagoStatus(paymentInfo.status);

  const updatedPayment = updatePaymentStatusByOrderId({
    orderId,
    status: normalizedStatus,
    paymentId: String(paymentId),
    raw: paymentInfo
  });

  let order = null;
  let orderUpdated = false;
  let notification = null;

  if (normalizedStatus === "APPROVED") {
    order = getActiveOrderByOrderId(orderId);

    if (order) {
      markAsPaid(order);
      saveActiveOrder(order.customerPhone, order);
      orderUpdated = true;

      notification = createLocalNotificationForOrder({
        order,
        type: NOTIFICATION_TYPE.ORDER_PAID
      });
    }
  }

  return {
    processed: true,
    paymentId,
    status: normalizedStatus,
    payment: updatedPayment,
    order,
    orderUpdated,
    notification
  };
}

function createDryRunPayment(order) {
  const externalReference = buildExternalReference(order);
  const preferenceId = `dry_run_${order.id}`;

  const initPoint = `https://example.com/mercado-pago/dry-run/${encodeURIComponent(
    order.id
  )}`;

  const raw = {
    isDryRun: true,
    message: "Pago simulado para desarrollo. Este link no cobra dinero.",
    preferenceId
  };

  const payment = savePaymentRecord({
    orderId: order.id,
    customerPhone: order.customerPhone,
    provider: "MERCADO_PAGO",
    preferenceId,
    externalReference,
    status: "PENDING",
    initPoint,
    sandboxInitPoint: initPoint,
    amount: order.total,
    currency: "ARS",
    raw
  });

  return {
    alreadyExists: false,
    isDryRun: true,
    payment,
    initPoint
  };
}

function validateOrderForPayment(order) {
  if (!order || typeof order !== "object") {
    throw new Error("El pedido es obligatorio.");
  }

  if (!order.id) {
    throw new Error("El pedido no tiene id.");
  }

  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error("No se puede crear pago para un pedido vacío.");
  }

  if (!Number.isInteger(order.total) || order.total <= 0) {
    throw new Error("El total del pedido debe ser mayor a 0.");
  }
}

function buildPreferenceItems(order) {
  return order.items.map((item) => ({
    id: item.productId,
    title: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    currency_id: "ARS"
  }));
}

function buildExternalReference(order) {
  return `order:${order.id}`;
}

function extractOrderIdFromExternalReference(externalReference) {
  if (!externalReference || typeof externalReference !== "string") {
    return null;
  }

  if (!externalReference.startsWith("order:")) {
    return null;
  }

  return externalReference.replace("order:", "");
}

function extractPaymentIdFromWebhook({ query, body }) {
  return (
    body?.data?.id ||
    body?.id ||
    query?.["data.id"] ||
    query?.id ||
    query?.payment_id ||
    null
  );
}

function normalizeMercadoPagoStatus(status) {
  const normalized = String(status || "").toLowerCase();

  const map = {
    approved: "APPROVED",
    pending: "PENDING",
    in_process: "IN_PROCESS",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
    refunded: "REFUNDED",
    charged_back: "CHARGED_BACK"
  };

  return map[normalized] || normalized.toUpperCase() || "UNKNOWN";
}

function buildBackUrls() {
  const success = process.env.MERCADOPAGO_SUCCESS_URL;
  const failure = process.env.MERCADOPAGO_FAILURE_URL;
  const pending = process.env.MERCADOPAGO_PENDING_URL;

  const backUrls = {};

  if (success) {
    backUrls.success = success;
  }

  if (failure) {
    backUrls.failure = failure;
  }

  if (pending) {
    backUrls.pending = pending;
  }

  return Object.keys(backUrls).length > 0 ? backUrls : undefined;
}
