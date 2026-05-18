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
    name: "1 - quita una bebida y conserva hamburguesa y papas",
    phone: "3814000001",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame la coca",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredItems: ["bacon", "papas"],
      forbiddenItems: ["coca", "gaseosa"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "2 - quita cantidad parcial de hamburguesas",
    phone: "3814000002",
    messages: [
      "sumame 4 camdis crispy simple",
      "sacame 2 crispy",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      itemQuantities: [
        { text: "crispy", quantity: 2 }
      ],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "3 - deja solo hamburguesas",
    phone: "3814000003",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "agregame papas y una coca grande",
      "dejame solo las hamburguesas",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    expected: {
      requiredItems: ["bacon", "cheese"],
      forbiddenItems: ["papas", "coca", "gaseosa"],
      minItems: 2,
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "4 - deja solo papas",
    phone: "3814000004",
    messages: [
      "quiero una onion doble",
      "agregame papas y una coca grande",
      "sacame todo menos las papas",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredItems: ["papas"],
      forbiddenItems: ["onion", "coca", "gaseosa"],
      minItems: 1,
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - cancela todo y empieza pedido nuevo",
    phone: "3814000005",
    messages: [
      "quiero una cheese simple",
      "agregame papas",
      "cancelar pedido",
      "quiero una bacon doble",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredItems: ["bacon"],
      forbiddenItems: ["cheeseburger", "papas"],
      minItems: 1,
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - cambia de pago Mercado Pago a efectivo",
    phone: "3814000006",
    messages: [
      "quiero una araka triple",
      "lo paso a buscar",
      "pago con mp",
      "mejor efectivo",
      "confirmo"
    ],
    expected: {
      requiredItems: ["araka"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - cambia de efectivo a Mercado Pago",
    phone: "3814000007",
    messages: [
      "quiero una big camdis triple",
      "delivery a belgrano 450",
      "efectivo",
      "mejor mp",
      "confirmo"
    ],
    expected: {
      requiredItems: ["big"],
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "8 - agrega otra unidad después de pedir una",
    phone: "3814000008",
    messages: [
      "quiero una cheese simple",
      "agregame otra cheese simple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      itemQuantities: [
        { text: "cheese", quantity: 2 }
      ],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - saca una unidad usando frase natural",
    phone: "3814000009",
    messages: [
      "quiero 3 bacon doble",
      "sacame una bacon",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      itemQuantities: [
        { text: "bacon", quantity: 2 }
      ],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "10 - cambia retiro a delivery con dirección natural",
    phone: "3814000010",
    messages: [
      "quiero una cuarto a doble",
      "retiro",
      "mejor mandalo a san martin 1200",
      "transferencia",
      "confirmo"
    ],
    expected: {
      requiredItems: ["cuarto"],
      deliveryType: "DELIVERY",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
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

    if (scenario.expected.minItems) {
      assert.ok(
        order.items.length >= scenario.expected.minItems,
        `Items insuficientes. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

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
