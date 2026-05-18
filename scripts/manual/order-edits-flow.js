import { handleCustomerMessage } from "../../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const scenarios = [
  {
    name: "Quitar papas de un pedido",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame las papas"
    ]
  },
  {
    name: "Quitar bebida de un pedido",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame la coca"
    ]
  },
  {
    name: "Cancelar pedido completo",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "cancelar pedido"
    ]
  },
  {
    name: "Borrar todo / empezar de nuevo",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "borra todo"
    ]
  },
  {
    name: "Sacar todo menos las papas",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame todo menos las papas"
    ]
  },
  {
    name: "Sacar papas y dejar hamburguesas",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "agregame papas y una coca grande",
      "sacame las papas y deja las hamburguesas"
    ]
  },
  {
    name: "Dejar solo hamburguesas",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "agregame papas y una coca grande",
      "dejame solo las hamburguesas"
    ]
  },
  {
    name: "Quitar cantidad parcial",
    messages: [
      "sumame 2 cheese simple",
      "sacame una cheese simple"
    ]
  }
];

for (const scenario of scenarios) {
  resetSessionsForTests();

  console.log("\n==================================================");
  console.log(scenario.name);
  console.log("==================================================");

  let lastResult = null;

  for (const messageText of scenario.messages) {
    lastResult = await handleCustomerMessage({
      customerPhone: "3819999999",
      messageText
    });

    console.log("\nCLIENTE:", messageText);
    console.log("INTENT:", lastResult.parsedMessage?.intent);
    console.log("STATUS:", lastResult.parsedMessage?.status);
    console.log("BOT:");
    console.log(lastResult.reply);

    if (lastResult.order) {
      console.log("ITEMS:", lastResult.order.items.map((item) => ({
        nombre: item.name || item.nombre || item.productName,
        cantidad: item.quantity,
        subtotal: item.subtotal
      })));
      console.log("TOTAL:", lastResult.order.total);
    }
  }

  console.log("\n--- FINAL ---");

  if (lastResult?.order) {
    console.log("Estado:", lastResult.order.status);
    console.log("Items finales:", lastResult.order.items.map((item) => ({
      nombre: item.name || item.nombre || item.productName,
      cantidad: item.quantity,
      subtotal: item.subtotal
    })));
    console.log("Total final:", lastResult.order.total);
  } else {
    console.log("Sin pedido activo.");
  }
}

console.log("\n✅ Prueba de edición de pedidos finalizada");
