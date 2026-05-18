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
    name: "1 - producto ambiguo, acepta sugerencia con si",
    phone: "3820000001",
    messages: [
      "quiero una americana",
      "si",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredAnyProductIds: ["americana_20_simple", "americana_20_doble", "americana_20_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "2 - producto ambiguo, acepta con dale",
    phone: "3820000002",
    messages: [
      "quiero una big",
      "dale",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredAnyProductIds: ["big_camdis_simple", "big_camdis_doble", "big_camdis_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "3 - producto ambiguo, elige la doble",
    phone: "3820000003",
    messages: [
      "quiero una cheese",
      "la doble",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_doble"],
      forbiddenProductIds: ["cheeseburger_simple", "cheeseburger_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "4 - producto ambiguo, elige la triple",
    phone: "3820000004",
    messages: [
      "quiero una bacon",
      "triple",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_triple"],
      forbiddenProductIds: ["bacon_cheese_simple", "bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - elige primera sugerencia",
    phone: "3820000005",
    messages: [
      "quiero una cuarto",
      "la primera",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredAnyProductIds: ["cuarto_a_simple", "cuarto_a_doble", "cuarto_a_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - elige segunda sugerencia",
    phone: "3820000006",
    messages: [
      "quiero una onion",
      "la segunda",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredAnyProductIds: ["onion_simple", "onion_doble", "onion_triple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "7 - no esa no, luego elige otra variante",
    phone: "3820000007",
    messages: [
      "quiero una araka",
      "no esa no, la triple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_triple"],
      forbiddenProductIds: ["araka_simple", "araka_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "8 - confirmacion corta ok despues de datos completos",
    phone: "3820000008",
    messages: [
      "quiero una crispy simple retiro efectivo",
      "ok"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - ok mandalo despues de delivery pendiente",
    phone: "3820000009",
    messages: [
      "quiero una bacon doble",
      "delivery",
      "belgrano 450",
      "mp",
      "ok mandalo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "10 - dale asi despues de editar producto",
    phone: "3820000010",
    messages: [
      "quiero una cheese simple",
      "mejor bacon doble",
      "retiro efectivo",
      "dale asi"
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

    if (scenario.expected.requiredAnyProductIds) {
      assert.equal(
        scenario.expected.requiredAnyProductIds.some((productId) => hasProductId(order, productId)),
        true,
        `El pedido debería contener alguno de ${scenario.expected.requiredAnyProductIds.join(", ")}. Items: ${JSON.stringify(order.items, null, 2)}`
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
