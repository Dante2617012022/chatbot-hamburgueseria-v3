import { z } from "zod";

export const CustomerIntentSchema = z.enum([
  "VER_MENU",
  "AGREGAR_PRODUCTO",
  "QUITAR_PRODUCTO",
  "MODIFICAR_PRODUCTO",
  "PEDIR_TOTAL",
  "CONFIRMAR_PEDIDO",
  "CANCELAR_PEDIDO",
  "CONSULTAR_HORARIO",
  "CONSULTAR_ENVIO",
  "ENVIAR_DIRECCION",
  "ELEGIR_RETIRO",
  "ELEGIR_DELIVERY",
  "ELEGIR_FORMA_PAGO",
  "HABLAR_CON_PERSONA",
  "NO_ENTENDIDO"
]);

export const ParsedMessageSchema = z.object({
  rawText: z.string(),
  normalizedText: z.string(),
  intent: CustomerIntentSchema,
  confidence: z.number().min(0).max(1),
  status: z.string(),
  entities: z.record(z.string(), z.unknown()).default({}),
  replyHint: z.string().nullable().optional()
});

export function validateParsedMessage(parsedMessage) {
  return ParsedMessageSchema.parse(parsedMessage);
}
