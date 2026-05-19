import { getProductById } from "../menu/menuRepository.js";

export const CHARGEABLE_EXTRA_NOTE_TO_PRODUCT_ID = {
  "extra queso": "queso_extra",
  "extra bacon": "bacon_extra",
  "extra carne": "carne_extra",
  "salsa extra": "salsa_extra"
};

export async function buildChargeableExtrasFromNotes(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return [];
  }

  const uniqueProductIds = [
    ...new Set(
      notes
        .map((note) => CHARGEABLE_EXTRA_NOTE_TO_PRODUCT_ID[note])
        .filter(Boolean)
    )
  ];

  const extras = [];

  for (const productId of uniqueProductIds) {
    const product = await getProductById(productId);

    if (!product || product.disponible !== true) {
      continue;
    }

    extras.push({
      productId: product.id,
      name: product.nombre,
      unitPrice: product.precio,
      quantity: 1,
      subtotal: product.precio
    });
  }

  return extras;
}

export function getItemExtrasUnitTotal(item) {
  if (!Array.isArray(item?.extras)) {
    return 0;
  }

  return item.extras.reduce((total, extra) => {
    return total + Number(extra.unitPrice || 0) * Number(extra.quantity || 1);
  }, 0);
}

export function calculateItemSubtotal(item) {
  const quantity = Number(item?.quantity || 0);
  const baseUnitPrice = Number(item?.unitPrice || 0);
  const extrasUnitTotal = getItemExtrasUnitTotal(item);

  return quantity * (baseUnitPrice + extrasUnitTotal);
}

export function normalizeExtras(extras) {
  if (!Array.isArray(extras)) {
    return [];
  }

  return extras
    .filter((extra) => extra?.productId && extra?.name)
    .map((extra) => ({
      productId: extra.productId,
      name: extra.name,
      unitPrice: Number(extra.unitPrice || 0),
      quantity: Number(extra.quantity || 1),
      subtotal: Number(extra.subtotal || extra.unitPrice || 0)
    }));
}
