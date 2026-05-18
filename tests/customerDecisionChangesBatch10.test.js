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
    name: "1 - cancela pedido con cancelar",
    phone: "3830000001",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "cancelar"
    ],
    expected: {
      status: "CANCELADO"
    }
  },
  {
    name: "2 - cancela pedido con me arrepenti",
    phone: "3830000002",
    messages: [
      "quiero una cheese simple retiro efectivo",
      "me arrepenti"
    ],
    expected: {
      status: "CANCELADO"
    }
  },
  {
    name: "3 - cancela pedido con empezar de nuevo",
    phone: "3830000003",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "empezar de nuevo"
    ],
    expected: {
      status: "CANCELADO"
    }
  },
  {
    name: "4 - vacia pedido con saca todo",
    phone: "3830000004",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "saca todo"
    ],
    expected: {
      status: "CREADO",
      itemCount: 0,
      total: 0
    }
  },
  {
    name: "5 - cambia delivery con direccion a retiro",
    phone: "3830000005",
    messages: [
      "quiero una bacon doble delivery a belgrano 450 pago efectivo",
      "mejor retiro",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      deliveryAddress: null,
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - cambia retiro a delivery con direccion",
    phone: "3830000006",
    messages: [
      "quiero una cheese simple retiro efectivo",
      "no, mandalo a belgrano 450",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: "belgrano 450",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - cambia pago efectivo a mercado pago",
    phone: "3830000007",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "mejor pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "8 - cambia pago mercado pago a efectivo",
    phone: "3830000008",
    messages: [
      "quiero una bacon doble retiro mp",
      "mejor efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - cambia pago efectivo a transferencia",
    phone: "3830000009",
    messages: [
      "quiero una crispy simple retiro efectivo",
      "mejor transferencia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "10 - cancela pedido con borra todo",
    phone: "3830000010",
    messages: [
      "quiero una onion doble retiro efectivo",
      "borra todo"
    ],
    expected: {
      status: "CANCELADO"
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

    if ("itemCount" in scenario.expected) {
      assert.equal(
        order.items.length,
        scenario.expected.itemCount,
        `Cantidad de items incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if ("total" in scenario.expected) {
      assert.equal(
        order.total,
        scenario.expected.total,
        `Total incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if ("deliveryType" in scenario.expected) {
      assert.equal(
        order.deliveryType,
        scenario.expected.deliveryType,
        `Entrega incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if ("deliveryAddress" in scenario.expected) {
      assert.equal(
        order.deliveryAddress,
        scenario.expected.deliveryAddress,
        `Dirección incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if (scenario.expected.deliveryAddressIncludes) {
      assert.ok(
        String(order.deliveryAddress || "").includes(scenario.expected.deliveryAddressIncludes),
        `La dirección debería incluir ${scenario.expected.deliveryAddressIncludes}. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    if ("paymentMethod" in scenario.expected) {
      assert.equal(
        order.paymentMethod,
        scenario.expected.paymentMethod,
        `Pago incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    for (const productId of scenario.expected.requiredProductIds || []) {
      assert.equal(
        hasProductId(order, productId),
        true,
        `El pedido debería contener ${productId}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
