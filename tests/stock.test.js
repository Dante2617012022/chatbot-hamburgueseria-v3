import test from "node:test";
import assert from "node:assert/strict";

import { handleCustomerMessage } from "../src/bot/messageHandler.js";
import { handleAdminCommand } from "../src/admin/adminCommands.js";
import { findBestProduct } from "../src/menu/productMatcher.js";
import { getProducts } from "../src/menu/menuRepository.js";
import {
  formatStockStatus,
  setProductAvailabilityByQuery
} from "../src/menu/stockService.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

const ADMIN_PHONE = "5491111111111";
const NORMAL_PHONE = "3819999999";

function setAdminEnv() {
  process.env.OWNER_PHONE = ADMIN_PHONE;
  process.env.ADMIN_PHONES = ADMIN_PHONE;
}

test("setProductAvailabilityByQuery marca producto como agotado", async () => {
  resetSessionsForTests();

  const result = await setProductAvailabilityByQuery({
    query: "bacon doble",
    available: false,
    reason: "Sin stock"
  });

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "bacon_cheese_doble");
  assert.equal(result.product.disponible, false);

  const availableProducts = await getProducts();

  assert.equal(
    availableProducts.some((product) => product.id === "bacon_cheese_doble"),
    false
  );
});

test("findBestProduct detecta producto agotado", async () => {
  resetSessionsForTests();

  await setProductAvailabilityByQuery({
    query: "bacon doble",
    available: false
  });

  const result = await findBestProduct("bacon doble");

  assert.equal(result.ok, false);
  assert.equal(result.status, "PRODUCT_UNAVAILABLE");
  assert.equal(result.product.id, "bacon_cheese_doble");
});

test("cliente no puede agregar producto agotado", async () => {
  resetSessionsForTests();

  await setProductAvailabilityByQuery({
    query: "bacon doble",
    available: false
  });

  const result = await handleCustomerMessage({
    customerPhone: NORMAL_PHONE,
    messageText: "quiero una bacon doble"
  });

  assert.equal(result.order.items.length, 0);
  assert.match(result.reply, /no está disponible/);
});

test("admin puede marcar producto agotado y disponible", async () => {
  resetSessionsForTests();
  setAdminEnv();

  const agotado = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin agotado bacon doble"
  });

  assert.match(agotado.reply, /agotado/);

  let match = await findBestProduct("bacon doble");
  assert.equal(match.status, "PRODUCT_UNAVAILABLE");

  const disponible = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin disponible bacon doble"
  });

  assert.match(disponible.reply, /disponible/);

  match = await findBestProduct("bacon doble");
  assert.equal(match.ok, true);
});

test("admin puede consultar stock", async () => {
  resetSessionsForTests();
  setAdminEnv();

  await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin agotado bacon doble"
  });

  const result = await handleAdminCommand({
    customerPhone: ADMIN_PHONE,
    messageText: "/admin stock"
  });

  assert.match(result.reply, /Estado de stock/);
  assert.match(result.reply, /Bacon cheese doble/);
});

test("formatStockStatus muestra que no hay agotados", async () => {
  resetSessionsForTests();

  const text = await formatStockStatus();

  assert.match(text, /No hay productos marcados como agotados/);
});
