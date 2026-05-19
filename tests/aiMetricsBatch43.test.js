import test from "node:test";
import assert from "node:assert/strict";

import {
  clearMessageEventsForTests,
  getAiMessageMetrics,
  saveMessageEvent
} from "../src/storage/messageRepository.js";
import { handleAdminCommand } from "../src/admin/adminCommands.js";

process.env.OWNER_PHONE = "5493810000000";

test("1 - getAiMessageMetrics resume eventos IA", () => {
  clearMessageEventsForTests();

  saveMessageEvent({
    customerPhone: "4081000001",
    direction: "IN",
    text: "me pinta una bacon",
    intent: "AGREGAR_PRODUCTO",
    status: "AI_FALLBACK_PRODUCT_MATCH",
    payload: {
      entities: {
        aiResolution: "SAFE_MATCH"
      }
    }
  });

  saveMessageEvent({
    customerPhone: "4081000002",
    direction: "IN",
    text: "quiero nuggets",
    intent: "NO_ENTENDIDO",
    status: "AI_INCOMPLETE",
    payload: {
      entities: {
        aiResolution: "INCOMPLETE"
      }
    }
  });

  saveMessageEvent({
    customerPhone: "4081000003",
    direction: "IN",
    text: "quiero algo raro",
    intent: "NO_ENTENDIDO",
    status: "NO_MATCH",
    payload: {}
  });

  const metrics = getAiMessageMetrics();

  assert.equal(metrics.aiTotal, 2);
  assert.equal(metrics.noEntendidoTotal, 2);
  assert.equal(metrics.byResolution.SAFE_MATCH, 1);
  assert.equal(metrics.byResolution.INCOMPLETE, 1);
  assert.equal(metrics.byStatus.AI_FALLBACK_PRODUCT_MATCH, 1);
  assert.equal(metrics.byStatus.AI_INCOMPLETE, 1);
});

test("2 - admin ia muestra resumen de IA", async () => {
  clearMessageEventsForTests();

  saveMessageEvent({
    customerPhone: "4081000004",
    direction: "IN",
    text: "quiero cheeseburger",
    intent: "NO_ENTENDIDO",
    status: "AI_AMBIGUOUS",
    payload: {
      entities: {
        aiResolution: "AMBIGUOUS"
      }
    }
  });

  const result = await handleAdminCommand({
    customerPhone: "5493810000000",
    messageText: "/admin ia"
  });

  assert.equal(result.allowed, true);
  assert.match(result.reply, /Métricas IA|Metricas IA/i);
  assert.match(result.reply, /AI_AMBIGUOUS/i);
  assert.match(result.reply, /AMBIGUOUS/i);
});
