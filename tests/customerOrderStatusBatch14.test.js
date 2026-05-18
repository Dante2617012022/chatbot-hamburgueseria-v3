import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";
import { clearPaymentRecordsForTests } from "../src/payments/paymentRepository.js";
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
    name: "1 - cliente consulta estado de pedido confirmado efectivo",
    phone: "3870000001",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "confirmo",
      "estado del pedido"
    ],
    expected: {
      status: "ESPERANDO_CONFIRMACION",
      replyIncludes: ["Esperando confirmación"]
    }
  },
  {
    name: "2 - cliente consulta estado de pedido pendiente de pago MP",
    phone: "3870000002",
    messages: [
      "quiero una cheese simple retiro mp",
      "confirmo",
      "estado del pedido"
    ],
    expected: {
      status: "ESPERANDO_PAGO",
      replyIncludes: ["Esperando pago", "Mercado Pago"]
    }
  },
  {
    name: "3 - cliente consulta estado luego de pago aprobado dry run",
    phone: "3870000003",
    messages: [
      "quiero una bacon doble retiro mp",
      "confirmo"
    ],
    afterInitialFlow: async ({ order }) => {
      approveDryRunPaymentByOrderId(order.id);
    },
    finalMessages: [
      "estado del pedido"
    ],
    expected: {
      status: "PAGADO",
      replyIncludes: ["Pagado"]
    }
  },
  {
    name: "4 - admin pasa pedido a preparacion y cliente consulta estado",
    phone: "3870000004",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "confirmo"
    ],
    adminActions: [
      "preparar"
    ],
    finalMessages: [
      "estado del pedido"
    ],
    expected: {
      status: "EN_PREPARACION",
      replyIncludes: ["En preparación"]
    }
  },
  {
    name: "5 - admin marca listo y cliente pregunta si ya esta listo",
    phone: "3870000005",
    messages: [
      "quiero una cheese simple retiro efectivo",
      "confirmo"
    ],
    adminActions: [
      "preparar",
      "listo"
    ],
    finalMessages: [
      "ya esta listo?"
    ],
    expected: {
      status: "LISTO",
      replyIncludes: ["Listo"]
    }
  },
  {
    name: "6 - admin marca delivery en camino y cliente pregunta",
    phone: "3870000006",
    messages: [
      "quiero una bacon doble delivery a san martin 789 pago efectivo",
      "confirmo"
    ],
    adminActions: [
      "preparar",
      "listo",
      "camino"
    ],
    finalMessages: [
      "lo vienen trayendo?"
    ],
    expected: {
      status: "EN_CAMINO",
      replyIncludes: ["En camino"]
    }
  },
  {
    name: "7 - admin marca entregado y cliente consulta estado",
    phone: "3870000007",
    messages: [
      "quiero una araka doble delivery a san martin 789 pago efectivo",
      "confirmo"
    ],
    adminActions: [
      "preparar",
      "listo",
      "camino",
      "entregado"
    ],
    finalMessages: [
      "estado"
    ],
    expected: {
      status: "ENTREGADO",
      replyIncludes: ["Entregado"]
    }
  },
  {
    name: "8 - cliente pregunta cuanto falta con pedido confirmado",
    phone: "3870000008",
    messages: [
      "quiero una crispy simple retiro efectivo",
      "confirmo",
      "cuanto falta"
    ],
    expected: {
      status: "ESPERANDO_CONFIRMACION",
      replyIncludesAny: ["Esperando confirmación", "todavía", "local"]
    }
  },
  {
    name: "9 - cliente pide ver pedido y recibe resumen",
    phone: "3870000009",
    messages: [
      "quiero una bacon doble retiro efectivo",
      "ver pedido"
    ],
    expected: {
      status: "ARMANDO_PEDIDO",
      replyIncludes: ["Bacon cheese doble", "Total"]
    }
  },
  {
    name: "10 - cliente sin productos pregunta estado",
    phone: "3870000010",
    messages: [
      "estado del pedido"
    ],
    expected: {
      status: "CREADO",
      itemCount: 0,
      replyIncludesAny: ["Todavía no", "no tenés", "pedido activo"]
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

    assert.ok(lastResult, "El flujo inicial debe devolver resultado");
    assert.ok(lastResult.order, "Debe existir un pedido");

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

    if ("itemCount" in scenario.expected) {
      assert.equal(
        order.items.length,
        scenario.expected.itemCount,
        `Cantidad de items incorrecta. Pedido final: ${JSON.stringify(order, null, 2)}`
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
  });
}
