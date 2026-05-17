import { getCategories, loadMenu } from "./menuRepository.js";

export async function formatMenuForWhatsApp() {
  const menu = await loadMenu();
  const categories = await getCategories();

  const lines = [];

  lines.push(`*${menu.negocio?.nombre || "Menú"}*`);
  lines.push("");

  for (const category of categories) {
    const products = menu.productos.filter(
      (product) =>
        product.categoria === category.id &&
        product.disponible === true
    );

    if (products.length === 0) {
      continue;
    }

    lines.push(`${category.emoji || ""} *${category.nombre}*`);

    for (const product of products) {
      lines.push(`- ${product.nombre}: $${formatPrice(product.precio)}`);

      if (product.descripcion) {
        lines.push(`  ${product.descripcion}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}

export function formatProductSuggestions(suggestions = []) {
  if (suggestions.length === 0) {
    return "No encontré productos parecidos.";
  }

  const lines = ["¿Te referís a alguno de estos productos?"];

  suggestions.forEach((suggestion, index) => {
    lines.push(
      `${index + 1}. ${suggestion.nombre} - $${formatPrice(suggestion.precio)}`
    );
  });

  return lines.join("\n");
}

export function formatPrice(value) {
  return new Intl.NumberFormat("es-AR").format(value);
}
