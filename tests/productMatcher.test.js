import test from "node:test";
import assert from "node:assert/strict";

import { findBestProduct } from "../src/menu/productMatcher.js";
import { loadMenu, getProducts } from "../src/menu/menuRepository.js";
import { formatMenuForWhatsApp } from "../src/menu/menuFormatter.js";

test("loadMenu carga el menú real correctamente", async () => {
  const menu = await loadMenu({ forceReload: true });

  assert.ok(menu);
  assert.equal(menu.negocio.nombre, "Camdis Hamburguesas");
  assert.ok(Array.isArray(menu.productos));
  assert.ok(menu.productos.length > 0);
});

test("getProducts devuelve productos disponibles", async () => {
  const products = await getProducts();

  assert.ok(products.length > 0);
  assert.ok(products.every((product) => product.disponible === true));
});

test("findBestProduct encuentra Cheeseburger simple", async () => {
  const result = await findBestProduct("cheese simple");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "cheeseburger_simple");
});

test("findBestProduct encuentra Bacon cheese doble por alias", async () => {
  const result = await findBestProduct("bacon doble");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "bacon_cheese_doble");
});

test("findBestProduct encuentra Papas clasicas aunque escriban papitas", async () => {
  const result = await findBestProduct("papitas");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "papas_clasicas");
});

test("findBestProduct encuentra Big camdis triple", async () => {
  const result = await findBestProduct("big camdis triple");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "big_camdis_triple");
});

test("findBestProduct encuentra bebida 1.5l", async () => {
  const result = await findBestProduct("litro y medio");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "bebida_15l");
});

test("findBestProduct devuelve EMPTY_QUERY si no hay texto", async () => {
  const result = await findBestProduct("");

  assert.equal(result.ok, false);
  assert.equal(result.status, "EMPTY_QUERY");
});

test("formatMenuForWhatsApp genera texto de menú real", async () => {
  const formattedMenu = await formatMenuForWhatsApp();

  assert.match(formattedMenu, /Camdis Hamburguesas/);
  assert.match(formattedMenu, /Cheeseburger simple/);
  assert.match(formattedMenu, /Big camdis triple/);
  assert.match(formattedMenu, /Papas clasicas/);
});
