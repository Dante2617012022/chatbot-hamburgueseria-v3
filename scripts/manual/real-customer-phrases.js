import { handleCustomerMessage } from "../../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const scenarios = [
  {
    name: "Frase natural - bacon doble",
    messages: [
      "me haces una doble con bacon",
      "retiro por el local",
      "pago efectivo",
      "confirmo"
    ]
  },
  {
    name: "Frase natural - americanas dobles y papas",
    messages: [
      "voy a querer que me preparen dos americanas dobles y una papas clasicas",
      "lo paso a buscar",
      "pago en efectivo",
      "confirmo"
    ]
  },
  {
    name: "Multi producto - hamburguesa y bebida",
    messages: [
      "quiero una onion doble y una coca grande",
      "mandalo a avenida siempre viva 123",
      "te pago con mp",
      "confirmo"
    ]
  },
  {
    name: "Editar pedido - sacar bebida",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "sacame la coca",
      "retiro",
      "efectivo",
      "confirmo"
    ]
  },
  {
    name: "Editar pedido - dejar solo hamburguesas",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "agregame papas y una coca grande",
      "dejame solo las hamburguesas",
      "retiro por el local",
      "pago efectivo",
      "confirmo"
    ]
  },
  {
    name: "Cantidad parcial - sacar una cheese",
    messages: [
      "sumame 2 cheese simple",
      "sacame una cheese simple",
      "lo paso a buscar",
      "pago efectivo",
      "confirmo"
    ]
  },
  {
    name: "Delivery natural",
    messages: [
      "quiero una big camdis triple",
      "mandalo a avenida siempre viva 123",
      "transferencia",
      "confirmo"
    ]
  },
  {
    name: "Pedir total antes de confirmar",
    messages: [
      "quiero una araka triple",
      "agregame papas clasicas",
      "cuanto es todo?",
      "retiro",
      "pago efectivo",
      "confirmo"
    ]
  },
  {
    name: "Cancelar y volver a pedir",
    messages: [
      "quiero una bacon doble",
      "agregame papas y una coca grande",
      "borra todo",
      "quiero una cheese simple",
      "retiro",
      "efectivo",
      "confirmo"
    ]
  },
  {
    name: "Humano",
    messages: [
      "quiero hablar con una persona"
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
      console.log("ENTREGA:", lastResult.order.deliveryType);
      console.log("PAGO:", lastResult.order.paymentMethod);
      console.log("ESTADO:", lastResult.order.status);
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

console.log("\n✅ Prueba de frases reales finalizada");
