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
    name: "1 - producto, retiro y efectivo en un solo mensaje",
    phone: "3819000001",
    messages: [
      "quiero una bacon doble para retirar y pago efectivo",
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
    name: "2 - producto, delivery con dirección y MP en un solo mensaje",
    phone: "3819000002",
    messages: [
      "mandame una cheese simple a belgrano 450 pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "3 - dos productos, retiro y transferencia en un solo mensaje",
    phone: "3819000003",
    messages: [
      "quiero una onion triple con papas retiro transferencia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_triple", "papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "4 - hamburguesa, bebida, delivery y efectivo en un solo mensaje",
    phone: "3819000004",
    messages: [
      "una araka doble y coca grande delivery a san martin 1200 efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_doble", "bebida_15l"],
      deliveryType: "DELIVERY",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - nuggets, lata, retiro y efectivo en un solo mensaje",
    phone: "3819000005",
    messages: [
      "nuggets x12 y una lata para llevar pago en efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["nuggets_x12", "lata"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - producto con typo, delivery abreviado y transferencia",
    phone: "3819000006",
    messages: [
      "kiero una bcon doble t paso dire mitre 555 transf",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - varias hamburguesas, retiro y MP",
    phone: "3819000007",
    messages: [
      "dos americanas dobles y papas lo paso a buscar mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["americana_20_doble", "papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      itemQuantities: [
        { productId: "americana_20_doble", quantity: 2 }
      ]
    }
  },
  {
    name: "8 - producto, retiro y pago al retirar",
    phone: "3819000008",
    messages: [
      "quiero una big camdis triple retiro pago al retirar",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["big_camdis_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - bebida y papas con delivery y MP",
    phone: "3819000009",
    messages: [
      "coca grande y papas mandalo a avenida siempre viva 123 mercado pago",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bebida_15l", "papas_clasicas"],
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "10 - cambio de producto, retiro y efectivo en secuencia corta",
    phone: "3819000010",
    messages: [
      "quiero una cheese simple",
      "mejor bacon doble retiro efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      forbiddenProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
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

    for (const productId of scenario.expected.requiredProductIds || []) {
      assert.equal(
        hasProductId(order, productId),
        true,
        `El pedido debería contener ${productId}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    for (const productId of scenario.expected.forbiddenProductIds || []) {
      assert.equal(
        hasProductId(order, productId),
        false,
        `El pedido no debería contener ${productId}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    for (const expectedQuantity of scenario.expected.itemQuantities || []) {
      const item = order.items.find((currentItem) =>
        currentItem.productId === expectedQuantity.productId
      );

      assert.ok(
        item,
        `No encontré item ${expectedQuantity.productId}. Items: ${JSON.stringify(order.items, null, 2)}`
      );

      assert.equal(
        item.quantity,
        expectedQuantity.quantity,
        `Cantidad incorrecta para ${expectedQuantity.productId}. Items: ${JSON.stringify(order.items, null, 2)}`
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
