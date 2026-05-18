import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { clearPaymentRecordsForTests, getPaymentRecordByOrderId } from "../src/payments/paymentRepository.js";
import { approveDryRunPaymentByOrderId } from "../src/payments/paymentService.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const ADMIN_PHONE = "5493810000000";
process.env.OWNER_PHONE = ADMIN_PHONE;

const scenarios = [
  {
    name: "1 - flujo real delivery MP con direccion corregida y link reenviado",
    phone: "3880000001",
    messages: [
      "hola quiero una bacon",
      "la doble",
      "delivery a belgrano 450 pago con mp",
      "me equivoque, era san martin 123 no belgrano 450",
      "referencia porton negro",
      "confirmo",
      "pasame el link"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 123", "porton negro"],
      deliveryAddressNotIncludes: ["belgrano 450"],
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago"],
      paymentRecord: true
    }
  },
  {
    name: "2 - flujo real retiro efectivo con cambio de variante y consulta estado",
    phone: "3880000002",
    messages: [
      "buenas quiero una bacon simple",
      "mejor triple",
      "retiro efectivo",
      "confirmo",
      "estado del pedido"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_triple"],
      forbiddenProductIds: ["bacon_cheese_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      replyIncludes: ["Esperando confirmación"]
    }
  },
  {
    name: "3 - flujo real transferencia con direccion, correccion y comprobante",
    phone: "3880000003",
    messages: [
      "quiero una crispy simple",
      "delivery",
      "belgrano 450",
      "me equivoque, era san martin 123 no belgrano 450",
      "referencia casa con reja negra",
      "transferencia",
      "confirmo",
      "te mando comprobante"
    ],
    expected: {
      requiredProductIds: ["camdis_crispy_simple"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 123", "casa con reja negra"],
      deliveryAddressNotIncludes: ["belgrano 450"],
      paymentMethod: "TRANSFERENCIA",
      status: "ESPERANDO_CONFIRMACION",
      replyIncludesAny: ["comprobante", "revisamos", "persona"]
    }
  },
  {
    name: "4 - flujo real cliente no confirma todavia agrega papas y despues confirma",
    phone: "3880000004",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "no confirmes todavia, agregame papas",
      "ver pedido",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      requiredAnyProductIds: ["papas_clasicas", "papas_gratinadas", "papas_americanas", "papas_extra"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      replyIncludes: ["Pedido confirmado"]
    }
  },
  {
    name: "5 - flujo real MP falla y cambia a efectivo antes de confirmar",
    phone: "3880000005",
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
    name: "6 - flujo real pedido pagado y luego estado pagado",
    phone: "3880000006",
    messages: [
      "quiero una araka doble retiro mp",
      "confirmo"
    ],
    afterInitialFlow: async ({ order }) => {
      approveDryRunPaymentByOrderId(order.id);
    },
    finalMessages: [
      "estado del pedido"
    ],
    expected: {
      requiredProductIds: ["araka_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "PAGADO",
      replyIncludes: ["Pagado"]
    }
  },
  {
    name: "7 - flujo real admin avanza estados y cliente consulta en camino",
    phone: "3880000007",
    messages: [
      "quiero una bacon doble delivery a san martin 789 pago efectivo",
      "confirmo"
    ],
    adminActions: ["preparar", "listo", "camino"],
    finalMessages: [
      "lo vienen trayendo?"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      deliveryType: "DELIVERY",
      deliveryAddressIncludes: ["san martin 789"],
      paymentMethod: "EFECTIVO",
      status: "EN_CAMINO",
      replyIncludes: ["En camino"]
    }
  },
  {
    name: "8 - flujo real cambia producto y pago en confirmacion",
    phone: "3880000008",
    messages: [
      "quiero una crispy simple retiro efectivo",
      "confirmo pero cambiala a bacon doble y pago con mp"
    ],
    expected: {
      requiredProductIds: ["bacon_cheese_doble"],
      forbiddenProductIds: ["camdis_crispy_simple"],
      deliveryType: "RETIRO",
      paymentMethod: "MERCADO_PAGO",
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Link de pago Mercado Pago"],
      paymentRecord: true
    }
  },
  {
    name: "9 - flujo real cancela y luego consulta estado sin pedido activo",
    phone: "3880000009",
    messages: [
      "quiero una onion doble retiro efectivo",
      "me arrepenti",
      "estado del pedido"
    ],
    expected: {
      deliveryType: null,
      paymentMethod: null,
      status: "CREADO",
      replyIncludes: ["Todavía no tenés"]
    }
  },
  {
    name: "10 - flujo real vacia pedido y empieza otro",
    phone: "3880000010",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "saca todo",
      "quiero una cheese simple",
      "retiro efectivo",
      "confirmo"
    ],
    expected: {
      requiredProductIds: ["cheeseburger_simple"],
      forbiddenProductIds: ["bacon_cheese_doble"],
      deliveryType: "RETIRO",
      paymentMethod: "EFECTIVO",
      status: "ESPERANDO_CONFIRMACION",
      replyIncludes: ["Pedido confirmado"]
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

    if (scenario.afterInitialFlow) {
      await scenario.afterInitialFlow({ order: lastResult.order });
    }

    if (scenario.adminActions) {
      for (const action of scenario.adminActions) {
        const shortOrderId = lastResult.order.id.slice(0, 8);
        const adminResult = await handleCustomerMessage({
          customerPhone: ADMIN_PHONE,
          messageText: `/admin ${action} ${shortOrderId}`
        });

        assert.ok(
          adminResult.reply.includes("Pedido actualizado"),
          `El comando admin debería actualizar el pedido. Reply: ${adminResult.reply}`
        );
      }
    }

    for (const messageText of scenario.finalMessages || []) {
      lastResult = await handleCustomerMessage({
        customerPhone: scenario.phone,
        messageText
      });
    }

    const order = lastResult.order;
    const reply = lastResult.reply || "";

    assert.equal(
      order.status,
      scenario.expected.status,
      `Estado incorrecto. Pedido final: ${JSON.stringify(order, null, 2)} Reply: ${reply}`
    );

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

    for (const part of scenario.expected.deliveryAddressIncludes || []) {
      assert.ok(
        String(order.deliveryAddress || "").toLowerCase().includes(part),
        `La dirección debería incluir ${part}. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

    for (const part of scenario.expected.deliveryAddressNotIncludes || []) {
      assert.equal(
        String(order.deliveryAddress || "").toLowerCase().includes(part),
        false,
        `La dirección no debería incluir ${part}. Pedido final: ${JSON.stringify(order, null, 2)}`
      );
    }

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

    for (const expectedText of scenario.expected.replyIncludes || []) {
      assert.ok(
        reply.includes(expectedText),
        `La respuesta debería incluir "${expectedText}". Reply: ${reply}`
      );
    }

    if (scenario.expected.replyIncludesAny) {
      assert.equal(
        scenario.expected.replyIncludesAny.some((text) =>
          reply.toLowerCase().includes(text.toLowerCase())
        ),
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

    if (scenario.expected.paymentRecord) {
      const payment = getPaymentRecordByOrderId(order.id);
      assert.ok(payment, `Debe existir registro de pago para ${order.id}`);
      assert.equal(payment.status, "PENDING");
      assert.ok(payment.initPoint, "Debe existir initPoint de Mercado Pago");
    }
  });
}

function hasProductId(order, productId) {
  return order.items.some((item) => item.productId === productId);
}
