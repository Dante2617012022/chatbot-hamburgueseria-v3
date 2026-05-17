import { loadBusinessHours } from "./businessHoursRepository.js";
import {
  getSetting,
  setSetting
} from "../storage/settingsRepository.js";

const BUSINESS_OPEN_OVERRIDE_KEY = "BUSINESS_OPEN_OVERRIDE";

export const BUSINESS_OPEN_OVERRIDE = Object.freeze({
  AUTO: "AUTO",
  OPEN: "OPEN",
  CLOSED: "CLOSED"
});

export function setBusinessOpenOverride(value) {
  if (!Object.values(BUSINESS_OPEN_OVERRIDE).includes(value)) {
    throw new Error(`Valor inválido para apertura manual: ${value}`);
  }

  return setSetting(BUSINESS_OPEN_OVERRIDE_KEY, value);
}

export function getBusinessOpenOverride() {
  return getSetting(BUSINESS_OPEN_OVERRIDE_KEY, BUSINESS_OPEN_OVERRIDE.AUTO);
}

export async function getBusinessAvailability({ now = new Date() } = {}) {
  const override = getBusinessOpenOverride();

  if (override === BUSINESS_OPEN_OVERRIDE.OPEN) {
    return {
      isOpen: true,
      source: "MANUAL_OPEN",
      reason: "El local fue abierto manualmente por un admin.",
      acceptsScheduledOrders: false,
      nextOpenText: null
    };
  }

  if (override === BUSINESS_OPEN_OVERRIDE.CLOSED) {
    return {
      isOpen: false,
      source: "MANUAL_CLOSED",
      reason: "El local fue cerrado manualmente por un admin.",
      acceptsScheduledOrders: false,
      nextOpenText: null
    };
  }

  const config = await loadBusinessHours();
  const dayKey = getDayKey(now, config.timezone);
  const currentMinutes = getMinutesInTimezone(now, config.timezone);
  const ranges = config.weeklySchedule[dayKey] || [];

  const isOpen = ranges.some((range) =>
    isMinuteInsideRange(currentMinutes, range.open, range.close)
  );

  return {
    isOpen,
    source: "SCHEDULE",
    reason: isOpen ? "El local está abierto por horario." : "El local está cerrado por horario.",
    acceptsScheduledOrders: Boolean(config.acceptsScheduledOrders),
    dayKey,
    currentTime: minutesToHHMM(currentMinutes),
    nextOpenText: isOpen ? null : findNextOpenText(config, dayKey)
  };
}

export async function formatBusinessAvailability() {
  const availability = await getBusinessAvailability();

  const lines = [];

  lines.push("*Horario del local*");
  lines.push("");
  lines.push(`Estado: ${availability.isOpen ? "ABIERTO" : "CERRADO"}`);
  lines.push(`Fuente: ${availability.source}`);
  lines.push(`Motivo: ${availability.reason}`);

  if (availability.currentTime) {
    lines.push(`Hora local: ${availability.currentTime}`);
  }

  if (availability.nextOpenText) {
    lines.push(`Próxima apertura: ${availability.nextOpenText}`);
  }

  return lines.join("\n");
}

function getDayKey(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone
  });

  return formatter.format(date).toLowerCase();
}

function getMinutesInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return hour * 60 + minute;
}

function isMinuteInsideRange(currentMinutes, open, close) {
  const openMinutes = hhmmToMinutes(open);
  const closeMinutes = hhmmToMinutes(close);

  if (openMinutes <= closeMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }

  return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
}

function hhmmToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToHHMM(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function findNextOpenText(config, currentDayKey) {
  const dayOrder = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];

  const startIndex = dayOrder.indexOf(currentDayKey);

  for (let offset = 0; offset < dayOrder.length; offset++) {
    const dayKey = dayOrder[(startIndex + offset) % dayOrder.length];
    const ranges = config.weeklySchedule[dayKey] || [];

    if (ranges.length > 0) {
      return `${translateDay(dayKey)} a las ${ranges[0].open}`;
    }
  }

  return "No hay horarios cargados.";
}

function translateDay(dayKey) {
  const labels = {
    monday: "lunes",
    tuesday: "martes",
    wednesday: "miércoles",
    thursday: "jueves",
    friday: "viernes",
    saturday: "sábado",
    sunday: "domingo"
  };

  return labels[dayKey] || dayKey;
}
