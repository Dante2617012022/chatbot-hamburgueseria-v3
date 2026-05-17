import { getDatabase } from "../storage/database.js";

export function savePaymentRecord({
  orderId,
  customerPhone = null,
  provider = "MERCADO_PAGO",
  preferenceId = null,
  paymentId = null,
  externalReference = null,
  status = "PENDING",
  initPoint = null,
  sandboxInitPoint = null,
  amount,
  currency = "ARS",
  raw = null
}) {
  if (!orderId) {
    throw new Error("orderId es obligatorio.");
  }

  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("amount debe ser un entero mayor o igual a 0.");
  }

  const now = new Date().toISOString();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO payment_records (
      order_id,
      customer_phone,
      provider,
      preference_id,
      payment_id,
      external_reference,
      status,
      init_point,
      sandbox_init_point,
      amount,
      currency,
      raw_json,
      created_at,
      updated_at
    )
    VALUES (
      @orderId,
      @customerPhone,
      @provider,
      @preferenceId,
      @paymentId,
      @externalReference,
      @status,
      @initPoint,
      @sandboxInitPoint,
      @amount,
      @currency,
      @rawJson,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(order_id) DO UPDATE SET
      customer_phone = excluded.customer_phone,
      provider = excluded.provider,
      preference_id = excluded.preference_id,
      payment_id = excluded.payment_id,
      external_reference = excluded.external_reference,
      status = excluded.status,
      init_point = excluded.init_point,
      sandbox_init_point = excluded.sandbox_init_point,
      amount = excluded.amount,
      currency = excluded.currency,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run({
    orderId,
    customerPhone,
    provider,
    preferenceId,
    paymentId,
    externalReference,
    status,
    initPoint,
    sandboxInitPoint,
    amount,
    currency,
    rawJson: raw ? JSON.stringify(raw) : null,
    createdAt: now,
    updatedAt: now
  });

  return getPaymentRecordByOrderId(orderId);
}

export function getPaymentRecordByOrderId(orderId) {
  if (!orderId) {
    return null;
  }

  const db = getDatabase();

  const row = db
    .prepare(`
      SELECT
        id,
        order_id,
        customer_phone,
        provider,
        preference_id,
        payment_id,
        external_reference,
        status,
        init_point,
        sandbox_init_point,
        amount,
        currency,
        raw_json,
        created_at,
        updated_at
      FROM payment_records
      WHERE order_id = ?
    `)
    .get(orderId);

  return row ? mapPaymentRow(row) : null;
}

export function updatePaymentStatusByOrderId({
  orderId,
  status,
  paymentId = null,
  raw = null
}) {
  if (!orderId) {
    throw new Error("orderId es obligatorio.");
  }

  if (!status) {
    throw new Error("status es obligatorio.");
  }

  const db = getDatabase();

  db.prepare(`
    UPDATE payment_records
    SET
      status = @status,
      payment_id = COALESCE(@paymentId, payment_id),
      raw_json = COALESCE(@rawJson, raw_json),
      updated_at = @updatedAt
    WHERE order_id = @orderId
  `).run({
    orderId,
    status,
    paymentId,
    rawJson: raw ? JSON.stringify(raw) : null,
    updatedAt: new Date().toISOString()
  });

  return getPaymentRecordByOrderId(orderId);
}

export function clearPaymentRecordsForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM payment_records").run();
}

function mapPaymentRow(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    customerPhone: row.customer_phone,
    provider: row.provider,
    preferenceId: row.preference_id,
    paymentId: row.payment_id,
    externalReference: row.external_reference,
    status: row.status,
    initPoint: row.init_point,
    sandboxInitPoint: row.sandbox_init_point,
    amount: row.amount,
    currency: row.currency,
    raw: row.raw_json ? JSON.parse(row.raw_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
