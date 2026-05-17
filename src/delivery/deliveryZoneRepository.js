import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DELIVERY_ZONES_PATH = path.join(
  process.cwd(),
  "data",
  "deliveryZones.json"
);

let cachedDeliveryZones = null;

export async function loadDeliveryZones({ forceReload = false } = {}) {
  if (cachedDeliveryZones && !forceReload) {
    return cachedDeliveryZones;
  }

  const deliveryZonesPath =
    process.env.DELIVERY_ZONES_PATH || DEFAULT_DELIVERY_ZONES_PATH;

  const raw = await readFile(deliveryZonesPath, "utf8");
  const config = JSON.parse(raw);

  validateDeliveryZones(config);

  cachedDeliveryZones = config;
  return config;
}

export async function getActiveDeliveryZones() {
  const config = await loadDeliveryZones();

  if (!config.activo) {
    return [];
  }

  return (config.zonas || []).filter((zone) => zone.activo === true);
}

function validateDeliveryZones(config) {
  if (!config || typeof config !== "object") {
    throw new Error("deliveryZones no es válido.");
  }

  if (!Array.isArray(config.zonas)) {
    throw new Error("deliveryZones debe tener un array zonas.");
  }

  for (const zone of config.zonas) {
    if (!zone.id) {
      throw new Error("Hay una zona de delivery sin id.");
    }

    if (!zone.nombre) {
      throw new Error(`La zona ${zone.id} no tiene nombre.`);
    }

    if (!Array.isArray(zone.alias)) {
      throw new Error(`La zona ${zone.id} debe tener alias.`);
    }
  }
}
