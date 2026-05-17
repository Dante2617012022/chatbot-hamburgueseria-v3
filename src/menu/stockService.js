import { findBestProduct } from "./productMatcher.js";
import { getProductById, getProducts } from "./menuRepository.js";
import {
  getUnavailableProducts,
  setProductAvailability
} from "./stockRepository.js";
import { formatPrice } from "./menuFormatter.js";

export async function setProductAvailabilityByQuery({
  query,
  available,
  reason = null
}) {
  if (!query) {
    throw new Error("Tenés que indicar un producto.");
  }

  const productMatch = await findBestProduct(query, {
    onlyAvailable: false
  });

  if (!productMatch.ok || !productMatch.product) {
    return {
      ok: false,
      status: productMatch.status,
      product: null,
      suggestions: productMatch.suggestions || []
    };
  }

  const stock = setProductAvailability({
    productId: productMatch.product.id,
    available,
    reason
  });

  const updatedProduct = await getProductById(productMatch.product.id);

  return {
    ok: true,
    status: available ? "PRODUCT_AVAILABLE" : "PRODUCT_UNAVAILABLE",
    product: updatedProduct,
    stock
  };
}

export async function formatStockStatus() {
  const allProducts = await getProducts({ onlyAvailable: false });
  const unavailable = getUnavailableProducts();

  const lines = [];

  lines.push("*Estado de stock*");
  lines.push("");
  lines.push(`Productos totales: ${allProducts.length}`);
  lines.push(`Productos agotados: ${unavailable.length}`);

  if (unavailable.length === 0) {
    lines.push("");
    lines.push("No hay productos marcados como agotados.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("*Agotados:*");

  for (const item of unavailable) {
    const product = await getProductById(item.productId);

    lines.push(
      `- ${product?.nombre || item.productId} — $${formatPrice(product?.precio || 0)}`
    );

    if (item.reason) {
      lines.push(`  Motivo: ${item.reason}`);
    }
  }

  return lines.join("\n");
}
