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
    name: "1 - cambia cheese simple por bacon doble",
    phone: "3816000001",
    messages: [
      "quiero una cheese simple",
      "cambiame la cheese por bacon doble",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      forbiddenProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "2 - en vez de coca grande pone lata",
    phone: "3816000002",
    messages: [
      "quiero una bacon doble",
      "agregame una coca grande",
      "en vez de coca poneme una lata",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble", "lata"],
      forbiddenProductIds: ["bebida_15l"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "3 - cambia papas por nuggets x12",
    phone: "3816000003",
    messages: [
      "quiero una onion doble",
      "agregame papas",
      "cambia las papas por nuggets x12",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_doble", "nuggets_x12"],
      forbiddenProductIds: ["papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "4 - araka doble pasa a araka triple",
    phone: "3816000004",
    messages: [
      "quiero una araka doble",
      "mejor hacela triple",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_triple"],
      forbiddenProductIds: ["araka_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - onion triple pasa a onion doble",
    phone: "3816000005",
    messages: [
      "quiero una onion triple",
      "no la triple no, la doble",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_doble"],
      forbiddenProductIds: ["onion_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - cheese simple pasa a cheese doble",
    phone: "3816000006",
    messages: [
      "quiero una cheese simple",
      "mejor hacela doble",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_doble"],
      forbiddenProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - bacon doble pasa a bacon simple",
    phone: "3816000007",
    messages: [
      "quiero una bacon doble",
      "mejor simple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_simple"],
      forbiddenProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "8 - cuarto doble pasa a cuarto triple",
    phone: "3816000008",
    messages: [
      "quiero una cuarto doble",
      "cambiala por cuarto triple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cuarto_a_triple"],
      forbiddenProductIds: ["cuarto_a_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - lata pasa a coca grande",
    phone: "3816000009",
    messages: [
      "quiero una cheese simple",
      "agregame una lata",
      "mejor coca grande",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple", "bebida_15l"],
      forbiddenProductIds: ["lata"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "10 - nuggets x6 pasa a nuggets x12",
    phone: "3816000010",
    messages: [
      "quiero nuggets x6",
      "mejor nuggets x12",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["nuggets_x12"],
      forbiddenProductIds: ["nuggets_x6"],
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

    assert.ok(
      order.total > 0,
      `Total inválido. Pedido final: ${JSON.stringify(order, null, 2)}`
    );
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
