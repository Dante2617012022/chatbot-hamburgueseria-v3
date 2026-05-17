import { getDatabase } from "../storage/database.js";

export function setProductAvailability({
  productId,
  available,
  reason = null
}) {
  if (!productId) {
    throw new Error("productId es obligatorio.");
  }

  const db = getDatabase();

  db.prepare(`
    INSERT INTO product_availability (
      product_id,
      available,
      reason,
      updated_at
    )
    VALUES (
      @productId,
      @available,
      @reason,
      @updatedAt
    )
    ON CONFLICT(product_id) DO UPDATE SET
      available = excluded.available,
      reason = excluded.reason,
      updated_at = excluded.updated_at
  `).run({
    productId,
    available: available ? 1 : 0,
    reason,
    updatedAt: new Date().toISOString()
  });

  return getProductAvailability(productId);
}

export function getProductAvailability(productId) {
  if (!productId) {
    return null;
  }

  const db = getDatabase();

  const row = db
    .prepare(`
      SELECT product_id, available, reason, updated_at
      FROM product_availability
      WHERE product_id = ?
    `)
    .get(productId);

  return row ? mapAvailabilityRow(row) : null;
}

export function getProductAvailabilityOverridesMap() {
  const db = getDatabase();

  const rows = db
    .prepare(`
      SELECT product_id, available, reason, updated_at
      FROM product_availability
    `)
    .all();

  const map = new Map();

  for (const row of rows) {
    map.set(row.product_id, mapAvailabilityRow(row));
  }

  return map;
}

export function getUnavailableProducts() {
  const db = getDatabase();

  return db
    .prepare(`
      SELECT product_id, available, reason, updated_at
      FROM product_availability
      WHERE available = 0
      ORDER BY updated_at DESC
    `)
    .all()
    .map(mapAvailabilityRow);
}

export function clearProductAvailabilityForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM product_availability").run();
}

function mapAvailabilityRow(row) {
  return {
    productId: row.product_id,
    available: row.available === 1,
    reason: row.reason,
    updatedAt: row.updated_at
  };
}
