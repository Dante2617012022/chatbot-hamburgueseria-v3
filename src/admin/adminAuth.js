export function getAdminPhones() {
  const phones = new Set();

  const ownerPhone = process.env.OWNER_PHONE;

  if (ownerPhone) {
    phones.add(normalizePhone(ownerPhone));
  }

  const adminPhones = process.env.ADMIN_PHONES || "";

  for (const phone of adminPhones.split(",")) {
    const normalized = normalizePhone(phone);

    if (normalized) {
      phones.add(normalized);
    }
  }

  return Array.from(phones).filter(Boolean);
}

export function isAdminPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return false;
  }

  return getAdminPhones().includes(normalizedPhone);
}

export function normalizePhone(phone) {
  if (!phone) {
    return "";
  }

  return String(phone).replace(/\D/g, "");
}
