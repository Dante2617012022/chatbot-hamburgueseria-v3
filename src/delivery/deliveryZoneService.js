import { getActiveDeliveryZones, loadDeliveryZones } from "./deliveryZoneRepository.js";
import { normalizeText } from "../utils/textNormalizer.js";

export async function findDeliveryZoneByText(text) {
  const config = await loadDeliveryZones();
  const normalizedText = normalizeText(text);

  if (!config.activo) {
    return {
      ok: true,
      status: "DELIVERY_ZONES_DISABLED",
      zone: null,
      deliveryCost: 0,
      requiresKnownZone: false
    };
  }

  const zones = await getActiveDeliveryZones();

  for (const zone of zones) {
    const aliases = [zone.nombre, ...(zone.alias || [])];

    const matched = aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return normalizedAlias && normalizedText.includes(normalizedAlias);
    });

    if (matched) {
      return {
        ok: true,
        status: "ZONE_FOUND",
        zone,
        deliveryCost: 0,
        requiresKnownZone: Boolean(config.requiereZonaConocida)
      };
    }
  }

  return {
    ok: false,
    status: "ZONE_NOT_FOUND",
    zone: null,
    deliveryCost: 0,
    requiresKnownZone: Boolean(config.requiereZonaConocida)
  };
}

export async function formatDeliveryZones() {
  const config = await loadDeliveryZones();
  const zones = await getActiveDeliveryZones();

  const lines = [];

  lines.push("*Zonas de delivery*");
  lines.push("");
  lines.push(`Delivery activo: ${config.activo ? "Sí" : "No"}`);
  lines.push(`Costo de envío: $0`);
  lines.push(`Requiere zona conocida: ${config.requiereZonaConocida ? "Sí" : "No"}`);
  lines.push("");

  if (zones.length === 0) {
    lines.push("No hay zonas activas cargadas.");
    return lines.join("\n");
  }

  lines.push("*Zonas activas:*");

  for (const zone of zones) {
    lines.push(`- ${zone.nombre}`);
  }

  return lines.join("\n");
}
