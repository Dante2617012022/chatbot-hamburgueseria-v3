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
    name: "1 - kiero bacon doble, coca grnade, mp",
    phone: "3818000001",
    messages: [
      "kiero una bcon doble",
      "sumame una coca grnade",
      "mndalo a belgrano 450",
      "mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble", "bebida_15l"],
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "2 - qiero cheese simple con papass retiro efectivo",
    phone: "3818000002",
    messages: [
      "qiero una chese simple",
      "agregame papass",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple", "papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "3 - dos americnas dobles y papas",
    phone: "3818000003",
    messages: [
      "dos americnas dobles y papas",
      "lo paso a buscar",
      "pago efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["americana_20_doble", "papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      itemQuantities: [
        { productId: "americana_20_doble", quantity: 2 }
      ]
    }
  },
  {
    name: "4 - nugget 12 y latita",
    phone: "3818000004",
    messages: [
      "quiero nugget 12",
      "una latita",
      "retira",
      "efectivo",
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
    name: "5 - big camdiss trple delivery transferencia",
    phone: "3818000005",
    messages: [
      "quiero una big camdiss trple",
      "delivery a san martin 1200",
      "transf",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["big_camdis_triple"],
      deliveryType: "DELIVERY",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "6 - araka tripl con papas y mercado pago escrito raro",
    phone: "3818000006",
    messages: [
      "una araka tripl con papas",
      "retiro",
      "mpago",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_triple", "papas_clasicas"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "7 - onion dble, cambiar a triple con typo",
    phone: "3818000007",
    messages: [
      "quiero una onion dble",
      "mejor trple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["onion_triple"],
      forbiddenProductIds: ["onion_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "8 - cuarto doble con envio abreviado",
    phone: "3818000008",
    messages: [
      "kiero cuarto doble",
      "t paso dire mitre 555",
      "efvo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cuarto_a_doble"],
      deliveryType: "DELIVERY",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION"
    }
  },
  {
    name: "9 - crispy simple, otra, sacar una",
    phone: "3818000009",
    messages: [
      "qiero crispy simple",
      "otra",
      "sacame una cripsy",
      "retiro",
      "transfer",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      itemQuantities: [
        { productId: "camdis_crispy_simple", quantity: 1 }
      ]
    }
  },
  {
    name: "10 - bebida grande y papas sin hamburguesa",
    phone: "3818000010",
    messages: [
      "coca grnde y papas",
      "lo busco",
      "efect",
      "ok"
    ],
    expected: {
      requiredProductIds: ["bebida_15l", "papas_clasicas"],
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
