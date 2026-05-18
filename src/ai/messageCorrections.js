import { CUSTOMER_INTENT } from "./intentTypes.js";
import { normalizeText } from "../utils/textNormalizer.js";

export function applyMessageCorrections(parsedMessage, messageText) {
  const deliveryAddress = extractDeliveryAddressFromNaturalMessage(messageText);

  if (deliveryAddress) {
    return {
      rawText: messageText || "",
      normalizedText: normalizeText(messageText),
      intent: CUSTOMER_INTENT.CHOOSE_DELIVERY,
      confidence: 0.95,
      status: "OK",
      entities: {
        deliveryType: "DELIVERY",
        possibleAddress: deliveryAddress
      },
      replyHint: null
    };
  }

  if (shouldCorrectMercadoPago(parsedMessage, messageText)) {
    return {
      ...parsedMessage,
      confidence: Math.max(parsedMessage.confidence || 0, 0.9),
      status: "OK",
      entities: {
        ...(parsedMessage.entities || {}),
        paymentMethod: "MERCADO_PAGO"
      },
      replyHint: null
    };
  }

  return parsedMessage;
}

function extractDeliveryAddressFromNaturalMessage(messageText) {
  const text = String(messageText || "").trim();

  const patterns = [
    /^(?:mejor\s+)?(?:mandalo|mandamelo|mandámelo|envialo|envíalo|enviamelo|envíamelo|llevalo|llévalo|llevamelo|llévamelo)\s+a\s+(.+)$/i,
    /^(?:va\s+con\s+)?(?:envio|envío|delivery)\s+a\s+(.+)$/i,
    /^(?:me lo mandas|me lo mandás|me lo envias|me lo enviás)\s+a\s+(.+)$/i,
    /^(?:lo quiero|lo necesito)\s+en\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function shouldCorrectMercadoPago(parsedMessage, messageText) {
  if (!parsedMessage) {
    return false;
  }

  if (parsedMessage.intent !== CUSTOMER_INTENT.CHOOSE_PAYMENT) {
    return false;
  }

  if (parsedMessage.entities?.paymentMethod) {
    return false;
  }

  const normalizedText = normalizeText(messageText);

  return (
    containsWholeWord(normalizedText, "mp") ||
    normalizedText.includes("mercado pago") ||
    normalizedText.includes("mercadopago")
  );
}

function containsWholeWord(text, word) {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s)${escapedWord}(?=\\s|$)`, "i");

  return regex.test(text);
}
