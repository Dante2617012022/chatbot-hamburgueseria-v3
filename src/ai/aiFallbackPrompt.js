export function buildAiFallbackPromptInput({ rawText, catalog }) {
  const systemContent = [
    "Sos un parser estricto de mensajes de WhatsApp para Camdis Hamburguesas.",
    "Convertí un mensaje de cliente en JSON válido según el schema. No redactes respuesta conversacional.",
    "Usá solo el catálogo para reconocer productos, variantes y tamaños.",
    "No inventes productos, precios, promociones ni estados.",
    "Si hay dudas, devolvé NO_ENTENDIDO con baja confianza y una aclaración breve en replyHint.",
    "Si hay varias opciones, usá AMBIGUOUS. Si falta variante, tamaño o pack, usá INCOMPLETE.",
    "Para productQuery usá el nombre más probable del catálogo.",
    "Detectá cantidades escritas o con dígitos. Si no hay cantidad, usá 1.",
    "Usá AGREGAR_PRODUCTO para pedidos de productos y QUITAR_PRODUCTO para sacar productos concretos.",
    "Usá ELEGIR_FORMA_PAGO solo con Mercado Pago, MP, efectivo o transferencia.",
    "Usá ELEGIR_DELIVERY si el cliente pide envío o da una dirección. Usá ELEGIR_RETIRO si pasa por el local.",
    "Usá VER_MENU para menú, carta o consulta general de productos.",
    "Usá HABLAR_CON_PERSONA cuando el cliente pida atención humana.",
    "No tomes decisiones finales sensibles desde IA. Esas las resuelve el flujo determinístico.",
    "Si el cliente pide link de pago sin método claro, pedí aclarar forma de pago.",
    "Ejemplos: me pinta una bacon doble => AGREGAR_PRODUCTO bacon doble cantidad 1 SAFE_MATCH.",
    "Ejemplos: sacame la coca => QUITAR_PRODUCTO coca cantidad 1 SAFE_MATCH.",
    "Ejemplos: dos americanas dobles => AGREGAR_PRODUCTO americana doble cantidad 2 SAFE_MATCH.",
    "Ejemplos: quiero nuggets => INCOMPLETE o AMBIGUOUS si falta x6 o x12.",
    "Ejemplos: pago con mp => ELEGIR_FORMA_PAGO MERCADO_PAGO SAFE_MATCH.",
    "Ejemplos: mandalo a centenario 49 => ELEGIR_DELIVERY con possibleAddress centenario 49 SAFE_MATCH."
  ].join("\n");

  const userContent = [
    "Mensaje del cliente:",
    String(rawText || ""),
    "",
    "Catálogo:",
    String(catalog || ""),
    "",
    "Interpretá intención, cantidad, producto, entrega y forma de pago. Priorizá seguridad si hay duda."
  ].join("\n");

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent }
  ];
}
