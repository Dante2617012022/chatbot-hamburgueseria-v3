import { handleCustomerMessage } from "../../src/bot/messageHandler.js";
import { resetSessionsForTests } from "../../src/storage/sessionStore.js";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.MERCADOPAGO_DRY_RUN = "true";
process.env.LOCAL_NOTIFICATION_CHANNEL = "INTERNAL";
process.env.LOCAL_NOTIFICATION_DRY_RUN = "true";
process.env.ENABLE_AI_FALLBACK = "false";

const orders = [
  {
    name: "Pedido 1 - bacon doble delivery MP",
    phone: "3810000001",
    messages: [
      "pasame el menú",
      "mandame la doble con bacon",
      "agregame papas y una coca grande",
      "mandalo a avenida siempre viva 123",
      "te pago con mp",
      "dale confirmo"
    ]
  },
  {
    name: "Pedido 2 - americanas dobles y papas retiro efectivo",
    phone: "3810000002",
    messages: [
      "voy a querer que me preparen dos americanas dobles y una papas clasicas",
      "lo paso a buscar",
      "pago en efectivo",
      "confirmo"
    ]
  },
  {
    name: "Pedido 3 - cheese simple con bebida",
    phone: "3810000003",
    messages: [
      "quiero una cheese simple",
      "agregame una coca lata",
      "retiro por el local",
      "pago en efectivo",
      "confirmo"
    ]
  },
  {
    name: "Pedido 4 - big camdis triple delivery transferencia",
    phone: "3810000004",
    messages: [
      "quiero una big camdis triple",
      "delivery a avenida siempre viva 123",
      "te pago con transferencia",
      "confirmo"
    ]
  },
  {
    name: "Pedido 5 - papas y gaseosa grande",
    phone: "3810000005",
    messages: [
      "agregame papas y una gaseosa grande",
      "lo paso a buscar",
      "pago efectivo",
      "dale confirmo"
    ]
  },
  {
    name: "Pedido 6 - dos dobles una bacon y una cheese",
    phone: "3810000006",
    messages: [
      "quiero dos dobles una con bacon y una cheese",
      "mandalo a avenida siempre viva 123",
      "pago con mercado pago",
      "confirmo"
    ]
  },
  {
    name: "Pedido 7 - nuggets y lata",
    phone: "3810000007",
    messages: [
      "quiero nuggets x12",
      "sumame una lata",
      "retiro por el local",
      "pago en efectivo",
      "confirmo"
    ]
  },
  {
    name: "Pedido 8 - araka triple",
    phone: "3810000008",
    messages: [
      "quiero una araka triple",
      "agregame papas clasicas",
      "lo paso a buscar",
      "te pago con mp",
      "confirmo"
    ]
  },
  {
    name: "Pedido 9 - onion doble delivery",
    phone: "3810000009",
    messages: [
      "mandame una onion doble",
      "agregame una coca grande",
      "mandalo a avenida siempre viva 123",
      "pago efectivo",
      "confirmo"
    ]
  },
  {
    name: "Pedido 10 - cuarto A doble",
    phone: "3810000010",
    messages: [
      "quiero una cuarto a doble",
      "sumame papitas",
      "retiro",
      "transferencia",
      "confirmo"
    ]
  }
];

for (const orderTest of orders) {
  console.log("\n==================================================");
  console.log(orderTest.name);
  console.log("==================================================");

  resetSessionsForTests();

  let lastResult = null;

  for (const messageText of orderTest.messages) {
    lastResult = await handleCustomerMessage({
      customerPhone: orderTest.phone,
      messageText
    });

    console.log("\nCLIENTE:", messageText);
    console.log("INTENT:", lastResult.parsedMessage?.intent);
    console.log("STATUS:", lastResult.parsedMessage?.status);
    console.log("BOT:");
    console.log(lastResult.reply);
  }

  const order = lastResult?.order;

  console.log("\n--- RESULTADO FINAL ---");

  if (!order) {
    console.log("❌ No hay pedido final.");
    continue;
  }

  console.log("ID:", order.id);
  console.log("Estado:", order.status);
  console.log("Items:", order.items.length);
  console.log("Entrega:", order.deliveryType);
  console.log("Pago:", order.paymentMethod);
  console.log("Total:", order.total);

  const hasItems = order.items.length > 0;
  const hasDelivery = Boolean(order.deliveryType);
  const hasPayment = Boolean(order.paymentMethod);
  const hasTotal = order.total > 0;

  if (hasItems && hasDelivery && hasPayment && hasTotal) {
    console.log("✅ Pedido completo OK");
  } else {
    console.log("⚠️ Pedido incompleto o revisar flujo");
  }
}

console.log("\n✅ Prueba de 10 pedidos finalizada");
