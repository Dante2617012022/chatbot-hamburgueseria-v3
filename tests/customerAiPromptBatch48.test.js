import test from "node:test";
import assert from "node:assert/strict";

import { buildAiFallbackPromptInput } from "../src/ai/aiFallbackPrompt.js";

test("1 - arma mensajes system y user", () => {
  const input = buildAiFallbackPromptInput({
    rawText: "me pinta una bacon doble",
    catalog: "- Bacon cheese doble; id=bacon_cheese_doble; aliases=bacon doble"
  });

  assert.equal(input.length, 2);
  assert.equal(input[0].role, "system");
  assert.equal(input[1].role, "user");
  assert.match(input[1].content, /me pinta una bacon doble/i);
  assert.match(input[1].content, /Bacon cheese doble/i);
});

test("2 - incluye reglas clave del parser IA", () => {
  const input = buildAiFallbackPromptInput({
    rawText: "dos americanas dobles pago con mp",
    catalog: "- Americana 2.0 doble; id=americana_20_doble; aliases=americana doble"
  });

  const system = input[0].content;

  assert.match(system, /JSON válido/i);
  assert.match(system, /catálogo/i);
  assert.match(system, /cantidades/i);
  assert.match(system, /ELEGIR_FORMA_PAGO/i);
  assert.match(system, /ELEGIR_DELIVERY/i);
  assert.match(system, /HABLAR_CON_PERSONA/i);
});

test("3 - contempla ambiguedad e incompleto", () => {
  const input = buildAiFallbackPromptInput({
    rawText: "quiero nuggets",
    catalog: "- Nuggets x6; id=nuggets_x6\n- Nuggets x12; id=nuggets_x12"
  });

  const system = input[0].content;
  const user = input[1].content;

  assert.match(system, /AMBIGUOUS/i);
  assert.match(system, /INCOMPLETE/i);
  assert.match(user, /seguridad/i);
});
