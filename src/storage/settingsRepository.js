import { getDatabase } from "./database.js";

export function setSetting(key, value) {
  if (!key) {
    throw new Error("key es obligatorio.");
  }

  const db = getDatabase();

  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({
    key,
    value: String(value),
    updatedAt: new Date().toISOString()
  });

  return getSetting(key);
}

export function getSetting(key, defaultValue = null) {
  if (!key) {
    return defaultValue;
  }

  const db = getDatabase();

  const row = db
    .prepare("SELECT key, value, updated_at FROM app_settings WHERE key = ?")
    .get(key);

  if (!row) {
    return defaultValue;
  }

  return row.value;
}

export function setBotPaused(isPaused) {
  return setSetting("BOT_PAUSED", isPaused ? "true" : "false");
}

export function isBotPaused() {
  return getSetting("BOT_PAUSED", "false") === "true";
}

export function getBotStatus() {
  return {
    paused: isBotPaused(),
    status: isBotPaused() ? "PAUSADO" : "ACTIVO"
  };
}

export function clearSettingsForTests() {
  const db = getDatabase();
  db.prepare("DELETE FROM app_settings").run();
}
