import { readFile } from "node:fs/promises";
import path from "node:path";

import { getProductAvailabilityOverridesMap } from "./stockRepository.js";

const DEFAULT_MENU_PATH = path.join(process.cwd(), "data", "menu.json");

let cachedMenu = null;

export async function loadMenu({ forceReload = false } = {}) {
  if (cachedMenu && !forceReload) {
    return cachedMenu;
  }

  const menuPath = process.env.MENU_PATH || DEFAULT_MENU_PATH;
  const rawMenu = await readFile(menuPath, "utf8");
  const menu = JSON.parse(rawMenu);

  validateMenu(menu);

  cachedMenu = menu;
  return menu;
}

export async function getProducts({ onlyAvailable = true } = {}) {
  const menu = await loadMenu();
  const products = applyAvailabilityOverrides(menu.productos || []);

  if (!onlyAvailable) {
    return products;
  }

  return products.filter((product) => product.disponible === true);
}

export async function getProductById(productId) {
  const products = await getProducts({ onlyAvailable: false });
  return products.find((product) => product.id === productId) || null;
}

export async function getCategories() {
  const menu = await loadMenu();
  return [...(menu.categorias || [])].sort((a, b) => a.orden - b.orden);
}

export async function getBusinessConfig() {
  const menu = await loadMenu();
  return menu.negocio || {};
}

function applyAvailabilityOverrides(products) {
  const overrides = getProductAvailabilityOverridesMap();

  return products.map((product) => {
    const override = overrides.get(product.id);

    if (!override) {
      return { ...product };
    }

    return {
      ...product,
      disponible: override.available,
      stockReason: override.reason,
      stockUpdatedAt: override.updatedAt
    };
  });
}

function validateMenu(menu) {
  if (!menu || typeof menu !== "object") {
    throw new Error("El menú no es un objeto válido.");
  }

  if (!Array.isArray(menu.productos)) {
    throw new Error("El menú debe tener un array 'productos'.");
  }

  for (const product of menu.productos) {
    if (!product.id) {
      throw new Error("Hay un producto sin id.");
    }

    if (!product.nombre) {
      throw new Error(`El producto ${product.id} no tiene nombre.`);
    }

    if (typeof product.precio !== "number" || product.precio < 0) {
      throw new Error(`El producto ${product.id} tiene un precio inválido.`);
    }

    if (!product.categoria) {
      throw new Error(`El producto ${product.id} no tiene categoría.`);
    }

    if (!Array.isArray(product.alias)) {
      throw new Error(`El producto ${product.id} debe tener un array de alias.`);
    }
  }
}
