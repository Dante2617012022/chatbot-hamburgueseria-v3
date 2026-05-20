function normalizeMixedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitMixedRemoveAndAddText(messageText) {
  const text = normalizeMixedText(messageText);

  const match = text.match(
    /^(.+?)\s+(?:y|e)\s+((?:agregame|agrega|sumame|suma|mandame|manda|dame|poneme|pone|pone)\b.+)$/
  );

  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  if (!/^(?:sacame|saca|quitame|quita|elimina|eliminame|borra|restale|sacale|bajale)\b/.test(match[1])) {
    return null;
  }

  return {
    removeText: match[1].trim(),
    addText: match[2].trim()
  };
}

export function cleanMixedProductActionText(messageText) {
  return normalizeMixedText(messageText)
    .replace(/\s+(?:y|e)\s+(?:pasame|pasar|mandame|manda|enviame|envia|genera|generame|dame)\b.*\b(link|pago|pagar|abonar|cobrar)\b.*$/g, "")
    .replace(/\s+(?:y|e)\s+(?:quiero\s+)?(?:pagar|abonar|pago)\b.*$/g, "")
    .replace(/\s+(?:y|e)\s+(?:efectivo|transferencia|mercado\s+pago|mercadopago|mp)\b.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeMixedActionText(messageText) {
  const text = normalizeMixedText(messageText);

  const hasAction = /\b(cambiame|cambia|cambiala|cambialo|sacame|saca|quitame|quita|elimina|eliminame|borra|restale|sacale|bajale|dejame|deja|agregame|agrega|sumame|suma|mandame|manda|dame|poneme|pone)\b/.test(text);

  const hasConnector = /\s+(?:y|e)\s+/.test(text);

  const hasPaymentCue =
    /\b(link|pagar|pago|abonar|cobrar|efectivo|transferencia|mercado\s+pago|mercadopago|mp)\b/.test(text);

  return hasAction && hasConnector && (
    hasPaymentCue ||
    splitMixedRemoveAndAddText(text) !== null
  );
}
