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
    name: "1 - confirma pero cambia producto a triple",
    phone: "3840000001",
    messages: [
      "quiero una bacon simple retiro efectivo",
      "confirmo pero cambiala a triple"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_triple"],
      forbiddenProductIds: ["bacon_cheese_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "2 - corrige pago efectivo no mp",
    phone: "3840000002",
    messages: [
      "quiero una cheese simple retiro mp",
      "perdon efectivo no mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "3 - corrige delivery a retiro",
    phone: "3840000003",
    messages: [
      "quiero una bacon doble delivery a belgrano 450 pago efectivo",
      "era retiro no delivery",
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
    name: "4 - corrige retiro a delivery con direccion",
    phone: "3840000004",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "era delivery no retiro, mandalo a belgrano 450",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: "belgrano 450",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "5 - no confirma todavia y luego confirma",
    phone: "3840000005",
    messages: [
      "quiero una cheese simple retiro efectivo",
      "no confirme todavia",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - agrega otra igual y cambia pago a mp",
    phone: "3840000006",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "mandame otra igual y cambio a mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      requiredQuantityByProductId: {
        bacon_cheese_doble: 2
      },
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "7 - cambia producto y pago en el mismo mensaje",
    phone: "3840000007",
    messages: [
      "quiero una crispy simple retiro efectivo",
      "cambiala a bacon doble y pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      forbiddenProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "8 - corrige pago y entrega juntos",
    phone: "3840000008",
    messages: [
      "quiero una onion doble delivery a belgrano 450 mp",
      "perdon era transferencia y retiro",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_doble"],
      deliveryType: "RETIRO",
      deliveryAddress: null,
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - no confirmes todavia y agrega papas",
    phone: "3840000009",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "no confirmes todavia, agregame papas",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      requiredAnyProductIds: ["papas_clasicas", "papas_gratinadas", "papas_americanas", "papas_extra", "papas_chicas", "papas_grandes", "papas"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "10 - confirma pero cambia pago a mp",
    phone: "3840000010",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "confirmo pero pago con mp"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
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

    if (scenario.expected.deliveryAddressIncludes) {
      assert.ok(
        String(order.deliveryAddress || "").includes(scenario.expected.deliveryAddressIncludes),
        `La dirección debería incluir ${scenario.expected.deliveryAddressIncludes}. Pedido final: ${JSON.stringify(order, null, 2)}`
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

    for (const [productId, quantity] of Object.entries(scenario.expected.requiredQuantityByProductId || {})) {
      assert.equal(
        getProductQuantity(order, productId),
        quantity,
        `Cantidad incorrecta para ${productId}. Items: ${JSON.stringify(order.items, null, 2)}`
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

function getProductQuantity(order, productId) {
  return order.items
    .filter((item) => item.productId === productId)
    .reduce((total, item) => total + item.quantity, 0);
}
