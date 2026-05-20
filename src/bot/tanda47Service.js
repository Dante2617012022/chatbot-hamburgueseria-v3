import { setCustomerData, setDeliveryData, setPaymentMethod } from "../orders/orderService.js";
import { formatOrderSummary } from "../orders/orderFormatter.js";
import { saveOrderSession } from "../storage/sessionStore.js";
import { normalizeText } from "../utils/textNormalizer.js";

export function handleTanda47Message({ order, messageText, buildNextStepPrompt = () => "" }) {
  if (!order?.items?.length) return null;

  const data = parseTanda47Data(messageText);
  if (!data.hasData) return null;

  if (data.customerName) setCustomerData(order, { customerName: data.customerName });

  if (data.deliveryType || data.deliveryAddress) {
    setDeliveryData(order, {
      deliveryType: data.deliveryType || "DELIVERY",
      deliveryAddress: data.deliveryAddress || order.deliveryAddress || null,
      deliveryZone: order.deliveryZone || null,
      deliveryCost: 0
    });
  }

  if (data.paymentMethod) setPaymentMethod(order, data.paymentMethod);

  order.customer = { ...(order.customer || {}), name: order.customerName || null };
  order.delivery = { ...(order.delivery || {}), type: order.deliveryType || null, address: order.deliveryAddress || null };
  order.payment = { ...(order.payment || {}), method: order.paymentMethod || null };

  if (order.customerPhone) saveOrderSession(order.customerPhone, order);

  return {
    parsedMessage: {
      rawText: messageText,
      normalizedText: normalizeText(messageText),
      intent: "ACTUALIZAR_DATOS_CLIENTE",
      confidence: 1,
      status: "OK",
      entities: data,
      replyHint: null
    },
    order,
    reply: "Actualicé los datos de tu pedido.\n" + buildSummary(order) + "\n\n" + formatOrderSummary(order) + buildNextStepPrompt(order)
  };
}

function parseTanda47Data(messageText) {
  const text = String(messageText || "");
  const normalizedFull = normalizeText(text);
  const hasSeparator = /[\n,]/.test(text);
  const hasExplicitName = /\b(me\s+llamo|mi\s+nombre\s+es)\b/i.test(text);
  const startsAsAddress = /^(direccion|dirección)\b/i.test(text.trim());

  if (!hasSeparator && !hasExplicitName && !startsAsAddress) {
    return { hasData: false, customerName: null, deliveryType: null, deliveryAddress: null, paymentMethod: null };
  }

  const parts = text.split(/[\n,]/).map((part) => part.trim()).filter(Boolean);
  const source = parts.length > 1 ? parts : [text];
  const allowStandaloneName = hasSeparator;
  const data = { hasData: false, customerName: null, deliveryType: null, deliveryAddress: null, paymentMethod: null };

  for (const part of source) {
    const low = normalizeText(part);
    const pay = parsePay(low);
    if (pay) {
      data.paymentMethod = pay;
      data.hasData = true;
    }

    if (/\b(delivery|delibery|delivwry|envio|domicilio)\b/.test(low)) {
      data.deliveryType = "DELIVERY";
      data.hasData = true;
    }
    if (/\b(retiro|retirar|local)\b/.test(low)) {
      data.deliveryType = "RETIRO";
      data.hasData = true;
    }

    const name = parseName(part);
    if (name) {
      data.customerName = name;
      data.hasData = true;
      continue;
    }

    const addr = parseAddress(part);
    if (addr) {
      data.deliveryAddress = addr;
      data.deliveryType = data.deliveryType || "DELIVERY";
      data.hasData = true;
      continue;
    }

    if (allowStandaloneName && !data.customerName && looksName(part) && !pay && !/\d/.test(part)) {
      data.customerName = formatName(part);
      data.hasData = true;
    }
  }

  if (!data.paymentMethod) {
    const pay = parsePay(normalizedFull);
    if (pay) {
      data.paymentMethod = pay;
      data.hasData = true;
    }
  }

  if (!data.deliveryAddress && startsAsAddress) {
    const addr = parseAddress(text);
    if (addr) {
      data.deliveryAddress = addr;
      data.deliveryType = data.deliveryType || "DELIVERY";
      data.hasData = true;
    }
  }

  return data;
}

function parsePay(text) {
  if (/\b(mercado pago|mercadopago|mercado|mp)\b/.test(text)) return "MERCADO_PAGO";
  if (/\befectivo\b/.test(text)) return "EFECTIVO";
  if (/\b(transferencia|transferir|transfiero)\b/.test(text)) return "TRANSFERENCIA";
  return null;
}

function parseName(value) {
  const match = String(value || "").match(/\b(?:me\s+llamo|mi\s+nombre\s+es)\s+([a-záéíóúñü\s]+)$/i);
  return match?.[1] ? formatName(match[1]) : null;
}

function parseAddress(value) {
  const cleaned = String(value || "")
    .replace(/^(direccion|dirección)\s*:?\s*/i, "")
    .replace(/\b(pago con|pago|mercado pago|mercadopago|mercado|mp|efectivo|transferencia)\b.*$/i, "")
    .replace(/\b(delivery|delibery|delivwry|envio|domicilio)\b/gi, "")
    .replace(/^\s*(a|en)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!/\d/.test(cleaned)) return null;
  if (/\b(link|pago|mercado|efectivo|transferencia)\b/i.test(cleaned)) return null;
  return normalizeText(cleaned);
}

function looksName(value) {
  const text = String(value || "").trim();
  return /^[a-záéíóúñü\s]+$/i.test(text) && text.split(/\s+/).length >= 2 && text.split(/\s+/).length <= 4;
}

function formatName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase().replace(/\b[a-záéíóúñü]/g, (letter) => letter.toUpperCase());
}

function buildSummary(order) {
  const lines = [];
  if (order.customerName) lines.push(`Cliente: ${order.customerName}`);
  if (order.deliveryType === "DELIVERY") lines.push(`Entrega: delivery${order.deliveryAddress ? ` a ${order.deliveryAddress}` : ""}`);
  if (order.deliveryType === "RETIRO") lines.push("Entrega: retiro por el local");
  if (order.paymentMethod === "MERCADO_PAGO") lines.push("Pago: Mercado Pago");
  if (order.paymentMethod === "EFECTIVO") lines.push("Pago: efectivo");
  if (order.paymentMethod === "TRANSFERENCIA") lines.push("Pago: transferencia");
  return lines.join("\n");
}
