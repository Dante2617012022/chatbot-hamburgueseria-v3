import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { clearPaymentRecordsForTests, getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import { approveDryRunPaymentByOrderId, createPaymentPreferenceForOrder } from "../src/payments/paymentService.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const scenarios = [
  {
    name: "1 - mercado pago confirma y genera link dry run",
    phone: "3860000001",
    messages: [
      "quiero una bacon doble retiro mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago", "dry-run"]
    }
  },
  {
    name: "2 - pasame el link reenvia link de pago pendiente",
    phone: "3860000002",
    messages: [
      "quiero una cheese simple retiro mp",
      "confirmo",
      "pasame el link"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago"]
    }
  },
  {
    name: "3 - no duplica preferencia pendiente al pedir link otra vez",
    phone: "3860000003",
    messages: [
      "quiero una bacon doble retiro mp",
      "confirmo"
    ],
    afterFlow: async ({ order }) => {
      const firstPayment = getPaymentRecordByOrderId(order.id);
      const secondPreference = await createPaymentPreferenceForOrder(order);
      const secondPayment = getPaymentRecordByOrderId(order.id);

      assert.ok(firstPayment, "Debe existir un pago");
      assert.equal(secondPreference.alreadyExists, true);
      assert.equal(secondPayment.id, firstPayment.id);
      assert.equal(secondPayment.initPoint, firstPayment.initPoint);
    },
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "4 - aprobar pago dry run marca pedido como pagado",
    phone: "3860000004",
    messages: [
      "quiero una bacon doble retiro mp",
      "confirmo"
    ],
    afterFlow: async ({ order }) => {
      const result = approveDryRunPaymentByOrderId(order.id);

      assert.equal(result.orderUpdated, true);
      assert.equal(result.order.status, "PAGADO");
      assert.equal(result.payment.status, "APPROVED");
    },
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO"
    }
  },
  {
    name: "5 - ya pague sin pago aprobado no marca pagado",
    phone: "3860000005",
    messages: [
      "quiero una onion doble retiro mp",
      "confirmo",
      "ya pague"
    ],
    expected: {
      requiredProductIds: ["onion_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Cuando el pago esté aprobado", "Mercado Pago"]
    }
  },
  {
    name: "6 - comprobante por transferencia mantiene espera de confirmacion",
    phone: "3860000006",
    messages: [
      "quiero una crispy simple retiro transferencia",
      "confirmo",
      "te mando comprobante"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      replyIncludesAny: ["comprobante", "persona", "revisa", "revisamos"]
    }
  },
  {
    name: "7 - efectivo al retirar confirma sin link de pago",
    phone: "3860000007",
    messages: [
      "quiero una bacon doble pago al retirar",
      "retiro",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      replyNotIncludes: ["Link de pago Mercado Pago"]
    }
  },
  {
    name: "8 - no me anda mercado pago cambia a efectivo",
    phone: "3860000008",
    messages: [
      "quiero una cheese simple retiro mp",
      "no me anda mercado pago, pago efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      replyNotIncludes: ["Link de pago Mercado Pago"]
    }
  },
  {
    name: "9 - cambia transferencia a mercado pago y confirma con link",
    phone: "3860000009",
    messages: [
      "quiero una bacon doble retiro transferencia",
      "mejor pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago"]
    }
  },
  {
    name: "10 - mercado pago delivery con direccion queda esperando pago",
    phone: "3860000010",
    messages: [
      "quiero una araka doble delivery a san martin 789 pago con mp",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["araka_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 789"],
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago"]
    }
  }
];

for (const scenario of scenarios) {
  test(scenario.name, async () => {
    resetSessionsForTests();
    clearPaymentRecordsForTests();

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
    const reply = lastResult.reply || "";

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

    if (scenario.expected.deliveryAddressIncludes) {
      for (const part of scenario.expected.deliveryAddressIncludes) {
        assert.ok(
          String(order.deliveryAddress || "").toLowerCase().includes(part),
          `La dirección debería incluir ${part}. Pedido final: ${JSON.stringify(order, null, 2)}`
        );
      }
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

    for (const expectedText of scenario.expected.replyIncludes || []) {
      assert.ok(
        reply.includes(expectedText),
        `La respuesta debería incluir "${expectedText}". Reply: ${reply}`
      );
    }

    if (scenario.expected.replyIncludesAny) {
      assert.equal(
        scenario.expected.replyIncludesAny.some((text) => reply.toLowerCase().includes(text.toLowerCase())),
        true,
        `La respuesta debería incluir alguno de ${scenario.expected.replyIncludesAny.join(", ")}. Reply: ${reply}`
      );
    }

    for (const unexpectedText of scenario.expected.replyNotIncludes || []) {
      assert.equal(
        reply.includes(unexpectedText),
        false,
        `La respuesta no debería incluir "${unexpectedText}". Reply: ${reply}`
      );
    }

    if (scenario.expected.paymentMethod === "MERCADO_PAGO") {
      const payment = getPaymentRecordByOrderId(order.id);
      assert.ok(payment, `Debe existir registro de pago para ${order.id}`);
      assert.equal(payment.status, "PENDING");
      assert.ok(payment.initPoint, "Debe existir initPoint de Mercado Pago");
    }

    if (scenario.afterFlow) {
      await scenario.afterFlow({ order, lastResult });
    }
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
