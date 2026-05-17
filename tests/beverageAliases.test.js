import test from "node:test";
import assert from "node:assert/strict";

import { findBestProduct } from "../src/menu/productMatcher.js";
import { resetSessionsForTests } from "../src/storage/sessionStore.js";

test("findBestProduct detecta coca grande como bebida 1.5l", async () => {
  resetSessionsForTests();

  const result = await findBestProduct("coca grande");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "bebida_15l");
});

test("findBestProduct detecta gaseosa grande como bebida 1.5l", async () => {
  resetSessionsForTests();

  const result = await findBestProduct("gaseosa grande");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "bebida_15l");
});

test("findBestProduct detecta coca lata como bebida lata", async () => {
  resetSessionsForTests();

  const result = await findBestProduct("coca lata");

  assert.equal(result.ok, true);
  assert.equal(result.product.id, "lata");
});
