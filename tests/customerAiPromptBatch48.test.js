import test from "node:test";
import assert from "node:assert/strict";

import { buildAiFallbackPromptInput } from "../src/ai/aiFallbackPrompt.js";

test("prompt IA fallback arma system y user", () => {
  const input = buildAiFallbackPromptInput({
    rawText: "me pinta una bacon doble",
    catalog: "- Bacon cheese doble; id=bacon_cheese_doble; aliases=bacon doble"
  });

  assert.equal(input.length, 2);
  assert.equal(input[0].role, "system");
  assert.equal(input[1].role, "user");
  assert.match(input[0].content, /catálogo/i);
  assert.match(input[0].content, /JSON válido/i);
  assert.match(input[0].content, /cantidades/i);
  assert.match(input[0].content, /ELEGIR_FORMA_PAGO/i);
  assert.match(input[0].content, /ELEGIR_DELIVERY/i);
  assert.match(input[0].content, /HABLAR_CON_PERSONA/i);
  assert.match(input[1].content, /me pinta una bacon doble/i);
  assert.match(input[1].content, /Bacon cheese doble/i);
});

test("prompt IA fallback contempla ambiguo e incompleto", () => {
  const input = buildAiFallbackPromptInput({
    rawText: "quiero nuggets",
    catalog: "- Nuggets x6; id=nuggets_x6\\n- Nuggets x12; id=nuggets_x12"
  });

  assert.match(input[0].content, /AMBIGUOUS/i);
  assert.match(input[0].content, /INCOMPLETE/i);
  assert.match(input[1].content, /seguridad/i);
});
