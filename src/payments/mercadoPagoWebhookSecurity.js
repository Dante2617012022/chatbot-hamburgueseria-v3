import { createHmac, timingSafeEqual } from "node:crypto";

export function validateMercadoPagoWebhookSignature({
  query = {},
  body = {},
  headers = {},
  secret = process.env.MERCADOPAGO_WEBHOOK_SECRET,
  requireSignature = shouldRequireMercadoPagoSignature()
} = {}) {
  if (!requireSignature) {
    return {
      ok: true,
      status: "SIGNATURE_VALIDATION_SKIPPED"
    };
  }

  if (!secret) {
    return {
      ok: false,
      status: "MISSING_WEBHOOK_SECRET"
    };
  }

  const signatureHeader = getHeader(headers, "x-signature");
  const requestId = getHeader(headers, "x-request-id");

  if (!signatureHeader || !requestId) {
    return {
      ok: false,
      status: "MISSING_SIGNATURE_HEADERS"
    };
  }

  const signatureParts = parseSignatureHeader(signatureHeader);
  const timestamp = signatureParts.get("ts");
  const receivedSignature = signatureParts.get("v1");

  if (!timestamp || !receivedSignature) {
    return {
      ok: false,
      status: "INVALID_SIGNATURE_HEADER"
    };
  }

  const dataId = extractWebhookDataId({ query, body });

  if (!dataId) {
    return {
      ok: false,
      status: "MISSING_DATA_ID"
    };
  }

  const manifest = buildSignatureManifest({
    dataId,
    requestId,
    timestamp
  });

  const expectedSignature = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (!safeCompareHex(receivedSignature, expectedSignature)) {
    return {
      ok: false,
      status: "SIGNATURE_MISMATCH"
    };
  }

  return {
    ok: true,
    status: "OK"
  };
}

export function shouldRequireMercadoPagoSignature() {
  if (process.env.MERCADOPAGO_REQUIRE_WEBHOOK_SIGNATURE === "false") {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET);
}

export function extractWebhookDataId({ query = {}, body = {} } = {}) {
  const value =
    query?.["data.id"] ||
    query?.id ||
    query?.payment_id ||
    body?.data?.id ||
    body?.id ||
    body?.payment_id ||
    null;

  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

export function buildSignatureManifest({ dataId, requestId, timestamp }) {
  return `id:${dataId};request-id:${requestId};ts:${timestamp};`;
}

function parseSignatureHeader(signatureHeader) {
  const parts = new Map();

  for (const rawPart of String(signatureHeader).split(",")) {
    const [rawKey, ...rawValueParts] = rawPart.split("=");
    const key = rawKey?.trim();
    const value = rawValueParts.join("=").trim();

    if (key && value) {
      parts.set(key, value);
    }
  }

  return parts;
}

function getHeader(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

function safeCompareHex(received, expected) {
  const receivedValue = String(received || "");
  const expectedValue = String(expected || "");

  if (!/^[a-f0-9]+$/i.test(receivedValue)) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedValue, "hex");
  const expectedBuffer = Buffer.from(expectedValue, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
