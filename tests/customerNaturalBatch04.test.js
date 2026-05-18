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
    name: "1 - agrega una más del mismo producto",
    phone: "3815000001",
    messages: [
      "quiero una cheese simple",
      "agregame una mas",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      itemQuantities: [
        { text: "cheese", quantity: 2 }
      ]
    }
  },
  {
    name: "2 - agrega otra del mismo producto",
    phone: "3815000002",
    messages: [
      "quiero una bacon doble",
      "sumame otra",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      itemQuantities: [
        { text: "bacon", quantity: 2 }
      ]
    }
  },
  {
    name: "3 - sin la coca equivale a quitar coca",
    phone: "3815000003",
    messages: [
      "quiero una onion doble",
      "agregame papas y una coca grande",
      "sin la coca",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["onion", "papas"],
      forbiddenItems: ["coca", "gaseosa"]
    }
  },
  {
    name: "4 - cuanto me queda muestra total sin cambiar pedido",
    phone: "3815000004",
    messages: [
      "quiero una araka triple",
      "cuanto me queda",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["araka"]
    }
  },
  {
    name: "5 - para llevar se interpreta como retiro",
    phone: "3815000005",
    messages: [
      "quiero una big camdis triple",
      "para llevar",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["big"]
    }
  },
  {
    name: "6 - dale asi nomas confirma pedido",
    phone: "3815000006",
    messages: [
      "quiero una cuarto a doble",
      "retiro",
      "efectivo",
      "dale asi nomas"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["cuarto"]
    }
  },
  {
    name: "7 - pago al retirar se interpreta como efectivo",
    phone: "3815000007",
    messages: [
      "quiero una camdis crispy doble",
      "retiro",
      "pago al retirar",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["crispy"]
    }
  },
  {
    name: "8 - efectivo cuando llegue se interpreta como efectivo",
    phone: "3815000008",
    messages: [
      "quiero una bacon doble",
      "delivery a belgrano 450",
      "efectivo cuando llegue",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredItems: ["bacon"]
    }
  },
  {
    name: "9 - mandame lo mismo suma otra unidad",
    phone: "3815000009",
    messages: [
      "quiero una cheese simple",
      "mandame lo mismo",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      itemQuantities: [
        { text: "cheese", quantity: 2 }
      ]
    }
  },
  {
    name: "10 - listo asi confirma pedido",
    phone: "3815000010",
    messages: [
      "quiero una onion triple con papas",
      "delivery a san martin 1200",
      "mercado pago",
      "listo asi"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      requiredItems: ["onion", "papas"]
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
      order.deliveryType,
      scenario.expected.deliveryType,
      `Entrega incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    assert.equal(
      order.paymentMethod,
      scenario.expected.paymentMethod,
      `Pago incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    assert.equal(
      order.status,
      scenario.expected.status,
      `Estado incorrecto. Pedido final: ${JSON.stringify(order, null, 2)}`
    );

    for (const text of scenario.expected.requiredItems || []) {
      assert.equal(
        hasItemContaining(order, text),
        true,
        `El pedido debería contener ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    for (const text of scenario.expected.forbiddenItems || []) {
      assert.equal(
        hasItemContaining(order, text),
        false,
        `El pedido no debería contener ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    for (const expectedQuantity of scenario.expected.itemQuantities || []) {
      const item = order.items.find((currentItem) =>
        String(currentItem.name || "")
          .toLowerCase()
          .includes(expectedQuantity.text.toLowerCase())
      );

      assert.ok(
        item,
        `No encontré item con texto ${expectedQuantity.text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );

      assert.equal(
        item.quantity,
        expectedQuantity.quantity,
        `Cantidad incorrecta para ${expectedQuantity.text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    assert.ok(
      order.total > 0,
      `Total inválido. Pedido final: ${JSON.stringify(order, null, 2)}`
    );
  });
}

function hasItemContaining(order, text) {
  return order.items.some((item) =>
    String(item.name || "")
      .toLowerCase()
      .includes(text.toLowerCase())
  );
}
