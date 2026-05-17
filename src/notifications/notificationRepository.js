import { getDatabase } from "../storage/database.js";

export function saveLocalNotification({
  orderId,
  customerPhone = null,
  type,
  channel = "INTERNAL",
  destination = null,
  status = "PENDING",
  message,
  payload = null,
  errorMessage = null
}) {
  if (!orderId) {
    throw new Error("orderId es obligatorio.");
  }

  if (!type) {
    throw new Error("type es obligatorio.");
  }

  if (!message) {
    throw new Error("message es obligatorio.");
  }

  const now = new Date().toISOString();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO local_notifications (
      order_id,
      customer_phone,
      type,
      channel,
      destination,
      status,
      message,
      payload_json,
      error_message,
      created_at,
      updated_at,
      sent_at
    )
    VALUES (
      @orderId,
      @customerPhone,
      @type,
      @channel,
      @destination,
      @status,
      @message,
      @payloadJson,
      @errorMessage,
      @createdAt,
      @updatedAt,
      @sentAt
    )
    ON CONFLICT(order_id, type) DO UPDATE SET
      customer_phone = excluded.customer_phone,
      channel = excluded.channel,
      destination = excluded.destination,
      status = excluded.status,
      message = excluded.message,
      payload_json = excluded.payload_json,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at,
      sent_at = excluded.sent_at
  `).run({
    orderId,
    customerPhone,
    type,
    channel,
    destination,
    status,
    message,
    payloadJson: payload ? JSON.stringify(payload) : null,
    errorMessage,
    createdAt: now,
    updatedAt: now,
    sentAt: status === "SENT" ? now : null
  });

  return getLocalNotificationByOrderAndType(orderId, type);
}

export function getLocalNotificationByOrderAndType(orderId, type) {
  const db = getDatabase();

  const row = db
    .prepare(`
      SELECT
        id,
        order_id,
        customer_phone,
        type,
        channel,
        destination,
        status,
        message,
        payload_json,
        error_message,
        created_at,
        updated_at,
        sent_at
      FROM local_notifications
      WHERE order_id = ?
        AND type = ?
    `)
    .get(orderId, type);

  return row ? mapNotificationRow(row) : null;
}

export function getNotificationsByOrderId(orderId) {
  const db = getDatabase();

  return db
    .prepare(`
      SELECT
        id,
        order_id,
        customer_phone,
        type,
        channel,
        destination,
        status,
        message,
        payload_json,
        error_message,
        created_at,
        updated_at,
        sent_at
      FROM local_notifications
      WHERE order_id = ?
      ORDER BY id ASC
    `)
    .all(orderId)
    .map(mapNotificationRow);
}

export function getPendingLocalNotifications({ limit = 50 } = {}) {
  const db = getDatabase();

  return db
    .prepare(`
      SELECT
        id,
        order_id,
        customer_phone,
        type,
        channel,
        destination,
        status,
        message,
        payload_json,
        error_message,
        created_at,
        updated_at,
        sent_at
      FROM local_notifications
      WHERE status = 'PENDING'
      ORDER BY id ASC
      LIMIT ?
    `)
    .all(limit)
    .map(mapNotificationRow);
}

export function markLocalNotificationSent(notificationId) {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE local_notifications
    SET status = 'SENT',
        updated_at = @now,
        sent_at = @now
    WHERE id = @notificationId
  `).run({
    notificationId,
    now
  });

  return getLocalNotificationById(notificationId);
}

export function markLocalNotificationFailed(notificationId, errorMessage) {
  const db = getDatabase();

  db.prepare(`
    UPDATE local_notifications
    SET status = 'FAILED',
        error_message = @errorMessage,
        updated_at = @updatedAt
    WHERE id = @notificationId
  `).run({
    notificationId,
    errorMessage,
    updatedAt: new Date().toISOString()
  });

  return getLocalNotificationById(notificationId);
}

export function getLocalNotificationById(notificationId) {
  const db = getDatabase();

  const row = db
    .prepare(`
      SELECT
        id,
        order_id,
        customer_phone,
        type,
        channel,
        destination,
        status,
        message,
        payload_json,
        error_message,
        created_at,
        updated_at,
        sent_at
      FROM local_notifications
      WHERE id = ?
    `)
    .get(notificationId);

  return row ? mapNotificationRow(row) : null;
}

export function clearLocalNotificationsForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM local_notifications").run();
}

function mapNotificationRow(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    customerPhone: row.customer_phone,
    type: row.type,
    channel: row.channel,
    destination: row.destination,
    status: row.status,
    message: row.message,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at
  };
}
