import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { handleAdminCommand } from "../src/admin/adminCommands.js";
import { findDeliveryZoneByText } from "../src/delivery/deliveryZoneService.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ADMIN_PHONE = "5491111111111";
const NORMAL_PHONE = "3819999999";

function setAdminEnv() {
  process.env.OWNER_PHONE = ADMIN_PHONE;
  process.env.ADMIN_PHONES = ADMIN_PHONE;
}

test("findDeliveryZoneByText detecta zona por alias", async () => {
  const result = await findDeliveryZoneByText("delivery a avenida siempre viva 123");

  assert.equal(result.ok, true);
  assert.equal(result.zone.nombre, "Centro");
  assert.equal(result.deliveryCost, 0);
});

test("admin puede consultar zonas de delivery", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const result = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin zonas"
  });

  assert.match(result.reply, /Zonas de delivery/);
  assert.match(result.reply, /Costo de envío: \$0/);
});

test("delivery guarda dirección, zona y costo cero", async () => {
  resetSessionsForTests();

  await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "quiero una bacon doble"
  });

  const result = await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "delivery a avenida siempre viva 123"
  });

  assert.equal(result.order.deliveryType, "DELIVERY");
  assert.equal(result.order.deliveryAddress, "avenida siempre viva 123");
  assert.equal(result.order.deliveryZone, "Centro");
  assert.equal(result.order.deliveryCost, 0);
  assert.equal(result.order.total, 10000);
  assert.match(result.reply, /sin costo/);
});
