import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BUSINESS_HOURS_PATH = path.join(
  process.cwd(),
  "data",
  "businessHours.json"
);

let cachedBusinessHours = null;

export async function loadBusinessHours({ forceReload = false } = {}) {
  if (cachedBusinessHours && !forceReload) {
    return cachedBusinessHours;
  }

  const businessHoursPath =
    process.env.BUSINESS_HOURS_PATH || DEFAULT_BUSINESS_HOURS_PATH;

  const raw = await readFile(businessHoursPath, "utf8");
  const businessHours = JSON.parse(raw);

  validateBusinessHours(businessHours);

  cachedBusinessHours = businessHours;
  return businessHours;
}

function validateBusinessHours(businessHours) {
  if (!businessHours || typeof businessHours !== "object") {
    throw new Error("businessHours no es válido.");
  }

  if (!businessHours.timezone) {
    throw new Error("businessHours debe tener timezone.");
  }

  if (!businessHours.weeklySchedule || typeof businessHours.weeklySchedule !== "object") {
    throw new Error("businessHours debe tener weeklySchedule.");
  }
}
