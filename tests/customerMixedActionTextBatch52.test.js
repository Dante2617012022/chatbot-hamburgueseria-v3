import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanMixedProductActionText,
  looksLikeMixedActionText,
  splitMixedRemoveAndAddText
} from "../src/bot/mixedActionTextService.js";

test("1 - separa quitar y agregar en una frase mezclada", () => {
  const result = splitMixedRemoveAndAddText("sacame nuggets y agregame papas clasicas");

  assert.deepEqual(result, {
    removeText: "sacame nuggets",
    addText: "agregame papas clasicas"
  });
});

test("2 - limpia pedido de link dejando solo la acción de cambio", () => {
  const result = cleanMixedProductActionText("cambiame la coca por lata y pasame el link");

  assert.equal(result, "cambiame la coca por lata");
});

test("3 - limpia forma de pago dejando solo la acción de cantidad", () => {
  const result = cleanMixedProductActionText("dejame solo una y pago efectivo");

  assert.equal(result, "dejame solo una");
});

test("4 - detecta frases mezcladas con pago", () => {
  assert.equal(
    looksLikeMixedActionText("dejame solo una y pago efectivo"),
    true
  );

  assert.equal(
    looksLikeMixedActionText("cambiame la coca por lata y pasame el link"),
    true
  );
});

test("5 - no marca frase simple como mezclada", () => {
  assert.equal(looksLikeMixedActionText("quiero una bacon doble"), false);
});
