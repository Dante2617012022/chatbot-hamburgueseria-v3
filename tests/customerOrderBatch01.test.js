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
    name: "1 - bacon doble con papas y coca, delivery, Mercado Pago",
    phone: "3812000001",
    messages: [
      "mandame la doble con bacon",
      "agregame papas y una coca grande",
      "mandalo a avenida siempre viva 123",
      "te pago con mp",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      minItems: 2
    }
  },
  {
    name: "2 - dos americanas dobles con papas, retiro, efectivo",
    phone: "3812000002",
    messages: [
      "voy a querer dos americanas dobles y una papas clasicas",
      "lo paso a buscar",
      "pago en efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "3 - cheese simple con coca lata, retiro, efectivo",
    phone: "3812000003",
    messages: [
      "quiero una cheese simple",
      "agregame una coca lata",
      "retiro por el local",
      "pago en efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "4 - big camdis triple, delivery, transferencia",
    phone: "3812000004",
    messages: [
      "quiero una big camdis triple",
      "delivery a avenida siempre viva 123",
      "te pago con transferencia",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 1
    }
  },
  {
    name: "5 - papas y gaseosa grande, retiro, efectivo",
    phone: "3812000005",
    messages: [
      "agregame papas y una gaseosa grande",
      "lo paso a buscar",
      "pago efectivo",
      "dale confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "6 - dos dobles una bacon y una cheese, delivery, Mercado Pago",
    phone: "3812000006",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "mandalo a avenida siempre viva 123",
      "pago con mercado pago",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      minItems: 2
    }
  },
  {
    name: "7 - nuggets x12 con lata, retiro, efectivo",
    phone: "3812000007",
    messages: [
      "quiero nuggets x12",
      "sumame una lata",
      "retiro por el local",
      "pago en efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "8 - araka triple con papas, retiro, Mercado Pago",
    phone: "3812000008",
    messages: [
      "quiero una araka triple",
      "agregame papas clasicas",
      "lo paso a buscar",
      "te pago con mp",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      minItems: 2
    }
  },
  {
    name: "9 - onion doble con coca grande, delivery, efectivo",
    phone: "3812000009",
    messages: [
      "mandame una onion doble",
      "agregame una coca grande",
      "mandalo a avenida siempre viva 123",
      "pago efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "10 - cuarto A doble con papitas, retiro, transferencia",
    phone: "3812000010",
    messages: [
      "quiero una cuarto a doble",
      "sumame papitas",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
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

    assert.ok(
      order.items.length >= scenario.expected.minItems,
      `Items insuficientes. Items: ${JSON.stringify(order.items, null, 2)}`
    );

    assert.ok(
      order.total > 0,
      `Total inválido. Pedido final: ${JSON.stringify(order, null, 2)}`
    );
  });
}
