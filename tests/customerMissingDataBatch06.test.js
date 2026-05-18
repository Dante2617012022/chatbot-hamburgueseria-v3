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
    name: "1 - confirma sin entrega y luego completa retiro y pago",
    phone: "3817000001",
    messages: [
      "quiero una bacon doble",
      "confirmo",
      "retiro",
      "efectivo",
      "confirmo"
    ],
    checks: [
      {
        index: 1,
        replyIncludes: "delivery"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["bacon_cheese_doble"]
    }
  },
  {
    name: "2 - confirma sin pago y luego completa efectivo",
    phone: "3817000002",
    messages: [
      "quiero una cheese simple",
      "retiro",
      "confirmo",
      "efectivo",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "forma de pago"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["cheeseburger_simple"]
    }
  },
  {
    name: "3 - delivery sin dirección, luego pasa dirección y paga MP",
    phone: "3817000003",
    messages: [
      "quiero una onion doble",
      "delivery",
      "confirmo",
      "belgrano 450",
      "mercado pago",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "dirección"
      }
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      requiredProductIds: ["onion_doble"]
    }
  },
  {
    name: "4 - confirma pedido vacío y luego arma pedido completo",
    phone: "3817000004",
    messages: [
      "confirmo",
      "quiero una araka triple",
      "retiro",
      "transferencia",
      "confirmo"
    ],
    checks: [
      {
        index: 0,
        replyIncludes: "Todavía no tenés productos"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["araka_triple"]
    }
  },
  {
    name: "5 - da pago antes de entrega, luego retiro y confirma",
    phone: "3817000005",
    messages: [
      "quiero una big camdis triple",
      "efectivo",
      "confirmo",
      "lo paso a buscar",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "delivery"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["big_camdis_triple"]
    }
  },
  {
    name: "6 - da entrega antes de producto y luego completa",
    phone: "3817000006",
    messages: [
      "retiro",
      "confirmo",
      "quiero una cuarto a doble",
      "efectivo",
      "confirmo"
    ],
    checks: [
      {
        index: 1,
        replyIncludes: "Todavía no tenés productos"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["cuarto_a_doble"]
    }
  },
  {
    name: "7 - delivery con dirección, confirma sin pago, luego paga transferencia",
    phone: "3817000007",
    messages: [
      "quiero una camdis crispy doble",
      "mandalo a san martin 1200",
      "confirmo",
      "transferencia",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "forma de pago"
      }
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["camdis_crispy_doble"]
    }
  },
  {
    name: "8 - cliente cambia de delivery incompleto a retiro",
    phone: "3817000008",
    messages: [
      "quiero una americana doble",
      "delivery",
      "confirmo",
      "mejor retiro",
      "efectivo",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "dirección"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      requiredProductIds: ["americana_20_doble"]
    }
  },
  {
    name: "9 - cliente confirma antes de elegir pago y luego elige MP",
    phone: "3817000009",
    messages: [
      "quiero nuggets x12",
      "retiro",
      "confirmo",
      "mp",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "forma de pago"
      }
    ],
    expected: {
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      requiredProductIds: ["nuggets_x12"]
    }
  },
  {
    name: "10 - producto y pago, confirma, luego delivery con dirección y confirma",
    phone: "3817000010",
    messages: [
      "quiero una bacon simple",
      "mercado pago",
      "confirmo",
      "delivery a mitre 555",
      "confirmo"
    ],
    checks: [
      {
        index: 2,
        replyIncludes: "delivery"
      }
    ],
    expected: {
      deliveryType: "DELIVERY",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      requiredProductIds: ["bacon_cheese_simple"]
    }
  }
];

for (const scenario of scenarios) {
  test(scenario.name, async () => {
    resetSessionsForTests();

    const results = [];

    for (const messageText of scenario.messages) {
      const result = await handleCustomerMessage({
        customerPhone: scenario.phone,
        messageText
      });

      results.push(result);
    }

    for (const check of scenario.checks || []) {
      const reply = results[check.index]?.reply || "";

      assert.equal(
        reply.toLowerCase().includes(check.replyIncludes.toLowerCase()),
        true,
        `La respuesta ${check.index} debería incluir "${check.replyIncludes}". Respuesta: ${reply}`
      );
    }

    const lastResult = results.at(-1);

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

    assert.ok(
      order.total > 0,
      `Total inválido. Pedido final: ${JSON.stringify(order, null, 2)}`
    );
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
