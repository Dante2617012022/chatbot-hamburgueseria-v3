import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const scenarios = [
  {
    name: "1 - delivery con calle numero y entre calles",
    phone: "3850000001",
    messages: [
      "quiero una bacon doble",
      "delivery",
      "belgrano 450 entre san martin y mitre",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["belgrano 450", "san martin", "mitre"],
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "2 - delivery a barrio centro sin numero queda pendiente",
    phone: "3850000002",
    messages: [
      "quiero una cheese simple",
      "delivery",
      "estoy en barrio centro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "DELIVERY",
      deliveryAddress: null,
      paymentMethod: "EFECTIVO",
      status: "ARMANDO_PEDIDO"
    }
  },
  {
    name: "3 - direccion con avenida siempre viva detecta zona centro",
    phone: "3850000003",
    messages: [
      "quiero una bacon doble delivery a avenida siempre viva 123 pago efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["avenida siempre viva 123"],
      deliveryZone: "Centro",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "4 - direccion abreviada av siempre viva detecta zona centro",
    phone: "3850000004",
    messages: [
      "quiero una onion doble",
      "mandalo a av siempre viva 321",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["av siempre viva 321"],
      deliveryZone: "Centro",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - corrige direccion completa",
    phone: "3850000005",
    messages: [
      "quiero una crispy simple delivery a belgrano 450 pago efectivo",
      "me equivoque, era san martin 123 no belgrano 450",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 123"],
      deliveryAddressNotIncludes: ["belgrano 450"],
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - agrega referencia despues de direccion",
    phone: "3850000006",
    messages: [
      "quiero una bacon doble delivery a belgrano 450 pago efectivo",
      "referencia porton negro",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["belgrano 450", "porton negro"],
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - direccion con piso y departamento",
    phone: "3850000007",
    messages: [
      "quiero una bacon doble",
      "delivery",
      "salta 123 piso 2 depto b",
      "transferencia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["salta 123", "piso 2", "depto b"],
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "8 - direccion con barrio norte detecta zona",
    phone: "3850000008",
    messages: [
      "quiero una cheese simple delivery a laprida 555 barrio norte pago efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["laprida 555", "barrio norte"],
      deliveryZone: "Barrio Norte",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - te paso ubicacion no debe confirmar sin direccion",
    phone: "3850000009",
    messages: [
      "quiero una bacon doble",
      "delivery",
      "te paso ubicacion",
      "mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddress: null,
      paymentMethod: "MERCADO_PAGO",
      status: "ARMANDO_PEDIDO"
    }
  },
  {
    name: "10 - direccion y pago combinados despues de producto",
    phone: "3850000010",
    messages: [
      "quiero una araka doble",
      "a san martin 789 pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 789"],
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  }
];

for (const scenario of scenarios) {
  test(scenario.name, async () => {
    resetSessionsForTests();

    let lastResult = null;

    for (const messageText of scenario.messages) {
      lastResult = await handleCustomerMessage({
        customerPhone: scenario.phone,
        messageText
      });
    }

    assert.ok(lastResult, "El flujo debe devolver resultado");
    assert.ok(lastResult.order, "Debe existir un pedido final");

    const order = lastResult.order;

    assert.equal(
      order.status,
      scenario.expected.status,
      `Estado incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    assert.equal(
      order.deliveryType,
      scenario.expected.deliveryType,
      `Entrega incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    if ("deliveryAddress" in scenario.expected) {
      assert.equal(
        order.deliveryAddress,
        scenario.expected.deliveryAddress,
        `Dirección incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    for (const expectedPart of scenario.expected.deliveryAddressIncludes || []) {
      assert.ok(
        String(order.deliveryAddress || "").toLowerCase().includes(expectedPart),
        `La dirección debería incluir ${expectedPart}. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    for (const forbiddenPart of scenario.expected.deliveryAddressNotIncludes || []) {
      assert.equal(
        String(order.deliveryAddress || "").toLowerCase().includes(forbiddenPart),
        false,
        `La dirección no debería incluir ${forbiddenPart}. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if ("deliveryZone" in scenario.expected) {
      assert.equal(
        order.deliveryZone,
        scenario.expected.deliveryZone,
        `Zona incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    assert.equal(
      order.paymentMethod,
      scenario.expected.paymentMethod,
      `Pago incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    for (const productId of scenario.expected.requiredProductIds || []) {
      assert.equal(
        hasProductId(order, productId),
        true,
        `El pedido debería contener ${productId}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    assert.ok(
      order.total > 0,
      `Total inválido. Pedido final: ${JSON.stringify(order, null, 2)}`
    );
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
