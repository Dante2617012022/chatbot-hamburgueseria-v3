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
    name: "1 - doble con panceta, coca 1.5, delivery, MP",
    phone: "3813000001",
    messages: [
      "buenas me haces una doble con panceta",
      "tambien una coca de litro y medio",
      "va con envio a belgrano 450",
      "mp",
      "listo confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      minItems: 2
    }
  },
  {
    name: "2 - americana ambigua, acepta sugerencia, papas, retiro, efectivo",
    phone: "3813000002",
    messages: [
      "quiero una americana",
      "si",
      "con papas",
      "retiro",
      "efectivo",
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
    name: "3 - dos cheese dobles, sprite grande, cambia MP a transferencia",
    phone: "3813000003",
    messages: [
      "mandame dos cheese dobles",
      "sumale una sprite grande",
      "lo busco por el local",
      "pago con mp",
      "mejor transferencia",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2
    }
  },
  {
    name: "4 - big doble y papas, delivery natural, efectivo",
    phone: "3813000004",
    messages: [
      "quiero una big doble y papas",
      "me lo mandas a san martin 1200",
      "efectivo",
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
    name: "5 - onion triple con lata y papitas, retiro, ok",
    phone: "3813000005",
    messages: [
      "una onion triple con una lata y papitas",
      "retiro por el local",
      "pago en efectivo",
      "ok"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 3
    }
  },
  {
    name: "6 - quita coca antes de confirmar",
    phone: "3813000006",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame la coca",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 2,
      forbiddenItemText: "coca"
    }
  },
  {
    name: "7 - cambia retiro a delivery",
    phone: "3813000007",
    messages: [
      "quiero una cuarto doble",
      "retiro",
      "mejor mandalo a mitre 555",
      "pago efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 1
    }
  },
  {
    name: "8 - cancela y vuelve a pedir",
    phone: "3813000008",
    messages: [
      "quiero una cheese simple",
      "cancelar pedido",
      "quiero una bacon simple",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 1,
      requiredItemText: "bacon"
    }
  },
  {
    name: "9 - pide 3 crispy y quita una",
    phone: "3813000009",
    messages: [
      "sumame 3 camdis crispy simple",
      "sacame una crispy",
      "lo paso a buscar",
      "transferencia",
      "confirmo"
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      minItems: 1,
      expectedQuantityForText: {
        text: "crispy",
        quantity: 2
      }
    }
  },
  {
    name: "10 - papas y coca lata, delivery, Mercado Pago",
    phone: "3813000010",
    messages: [
      "dame unas papas clasicas y una coca lata",
      "delivery a 24 de septiembre 900",
      "mercado pago",
      "confirmo"
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
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

    if (scenario.expected.forbiddenItemText) {
      const text = scenario.expected.forbiddenItemText.toLowerCase();

      assert.equal(
        order.items.some((item) =>
          String(item.name || "").toLowerCase().includes(text)
        ),
        false,
        `El pedido no debería contener ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    if (scenario.expected.requiredItemText) {
      const text = scenario.expected.requiredItemText.toLowerCase();

      assert.equal(
        order.items.some((item) =>
          String(item.name || "").toLowerCase().includes(text)
        ),
        true,
        `El pedido debería contener ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }

    if (scenario.expected.expectedQuantityForText) {
      const { text, quantity } = scenario.expected.expectedQuantityForText;

      const item = order.items.find((currentItem) =>
        String(currentItem.name || "")
          .toLowerCase()
          .includes(text.toLowerCase())
      );

      assert.ok(
        item,
        `No encontré item con texto ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );

      assert.equal(
        item.quantity,
        quantity,
        `Cantidad incorrecta para ${text}. Items: ${JSON.stringify(order.items, null, 2)}`
      );
    }
  });
}
