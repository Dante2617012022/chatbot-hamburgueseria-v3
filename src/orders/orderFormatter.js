import { formatPrice } from "../menu/menuFormatter.js";

export function formatOrderSummary(order) {
  if (!order || !Array.isArray(order.items)) {
    return "No hay pedido activo.";
  }

  if (order.items.length === 0) {
    return "Tu pedido está vacío.";
  }

  const lines = [];

  lines.push("*Resumen de tu pedido*");
  lines.push("");

  for (const item of order.items) {
    lines.push(
      `- ${item.quantity} x ${item.name} — $${formatPrice(item.subtotal)}`
    );

    if (item.notes?.length > 0) {
      lines.push(`  Notas: ${item.notes.join(", ")}`);
    }

    if (item.extras?.length > 0) {
      for (const extra of item.extras) {
        lines.push(`  Extra: ${extra.name} — $${formatPrice(extra.unitPrice)}`);
      }
    }
  }

  lines.push("");
  lines.push(`Subtotal: $${formatPrice(order.subtotal)}`);

  if (order.deliveryCost > 0) {
    lines.push(`Delivery: $${formatPrice(order.deliveryCost)}`);
  }

  lines.push(`*Total: $${formatPrice(order.total)}*`);

  if (order.deliveryType) {
    lines.push("");
    lines.push(`Entrega: ${formatDeliveryType(order.deliveryType)}`);
  }

  if (order.deliveryAddress) {
    lines.push(`Dirección: ${order.deliveryAddress}`);
  }

  if (order.deliveryZone) {
    lines.push(`Zona: ${order.deliveryZone}`);
  }

  if (order.paymentMethod) {
    lines.push(`Pago: ${formatPaymentMethod(order.paymentMethod)}`);
  }

  return lines.join("\n");
}

export function formatOrderForBusiness(order) {
  if (!order || !Array.isArray(order.items)) {
    return "Pedido inválido.";
  }

  const lines = [];

  lines.push("*NUEVO PEDIDO*");
  lines.push("");
  lines.push(`Pedido: ${order.id}`);
  lines.push(`Estado: ${order.status}`);

  if (order.customerName) {
    lines.push(`Cliente: ${order.customerName}`);
  }

  if (order.customerPhone) {
    lines.push(`Teléfono: ${order.customerPhone}`);
  }

  lines.push("");

  for (const item of order.items) {
    lines.push(`- ${item.quantity} x ${item.name}`);

    if (item.notes?.length > 0) {
      lines.push(`  Notas: ${item.notes.join(", ")}`);
    }

    if (item.extras?.length > 0) {
      for (const extra of item.extras) {
        lines.push(`  Extra: ${extra.name} — $${formatPrice(extra.unitPrice)}`);
      }
    }
  }

  lines.push("");
  lines.push(`Total: $${formatPrice(order.total)}`);

  if (order.deliveryType) {
    lines.push(`Entrega: ${formatDeliveryType(order.deliveryType)}`);
  }

  if (order.deliveryAddress) {
    lines.push(`Dirección: ${order.deliveryAddress}`);
  }

  if (order.deliveryZone) {
    lines.push(`Zona: ${order.deliveryZone}`);
  }

  if (order.paymentMethod) {
    lines.push(`Pago: ${formatPaymentMethod(order.paymentMethod)}`);
  }

  return lines.join("\n");
}

export function formatDeliveryType(deliveryType) {
  const labels = {
    DELIVERY: "Delivery",
    RETIRO: "Retiro por local"
  };

  return labels[deliveryType] || deliveryType;
}

export function formatPaymentMethod(paymentMethod) {
  const labels = {
    MERCADO_PAGO: "Mercado Pago",
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia"
  };

  return labels[paymentMethod] || paymentMethod;
}
