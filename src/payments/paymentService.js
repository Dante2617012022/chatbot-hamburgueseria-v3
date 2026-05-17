import { createMercadoPagoPreference } from "./mercadoPagoClient.js";
import {
  getPaymentRecordByOrderId,
  savePaymentRecord
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
