import Fuse from "fuse.js";
import { getProducts } from "./menuRepository.js";
import { normalizeText } from "../utils/textNormalizer.js";

const DEFAULT_MIN_CONFIDENCE = 0.65;
const DEFAULT_AUTO_CONFIDENCE = 0.85;

function buildSearchDocuments(products) {
  return products.map((product) => ({
    ...product,
    searchableName: normalizeText(product.nombre),
    searchableAlias: (product.alias || []).map((alias) => normalizeText(alias))
  }));
}

function createFuse(products) {
  const documents = buildSearchDocuments(products);

  return new Fuse(documents, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.45,
    minMatchCharLength: 2,
    keys: [
      {
        name: "searchableName",
        weight: 0.7
      },
      {
        name: "searchableAlias",
        weight: 0.3
      }
    ]
  });
}

function scoreToConfidence(score) {
  if (typeof score !== "number") {
    return 0;
  }

  return Number((1 - score).toFixed(2));
}

function formatProduct(product) {
  return {
    id: product.id,
    nombre: product.nombre,
    categoria: product.categoria,
    descripcion: product.descripcion,
    precio: product.precio,
    disponible: product.disponible,
    stockReason: product.stockReason || null
  };
}

function findExactProduct(products, normalizedQuery) {
  return products.find((product) => {
    const normalizedName = normalizeText(product.nombre);
    const normalizedAliases = (product.alias || []).map((alias) =>
      normalizeText(alias)
    );

    return (
      normalizedName === normalizedQuery ||
      normalizedAliases.includes(normalizedQuery)
    );
  });
}

export async function findBestProduct(
  query,
  {
    minConfidence = DEFAULT_MIN_CONFIDENCE,
    autoConfidence = DEFAULT_AUTO_CONFIDENCE,
    maxSuggestions = 3,
    onlyAvailable = true
  } = {}
) {
  let normalizedQuery = normalizeText(query);
  normalizedQuery = normalizeVariantCorrectionQuery(normalizedQuery);

  if (!normalizedQuery) {
    return {
      ok: false,
      status: "EMPTY_QUERY",
      confidence: 0,
      product: null,
      suggestions: []
    };
  }

  const allProducts = await getProducts({ onlyAvailable: false });
  const exactProduct = findExactProduct(allProducts, normalizedQuery);

  if (exactProduct) {
    if (onlyAvailable && exactProduct.disponible !== true) {
      const suggestions = await buildAvailableSuggestions(normalizedQuery, maxSuggestions);

      return {
        ok: false,
        status: "PRODUCT_UNAVAILABLE",
        confidence: 1,
        product: formatProduct(exactProduct),
        suggestions
      };
    }

    return {
      ok: true,
      status: "AUTO_MATCH",
      confidence: 1,
      product: formatProduct(exactProduct),
      suggestions: [
        {
          id: exactProduct.id,
          nombre: exactProduct.nombre,
          precio: exactProduct.precio,
          confidence: 1
        }
      ]
    };
  }

  const products = onlyAvailable
    ? allProducts.filter((product) => product.disponible === true)
    : allProducts;

  const fuse = createFuse(products);
  const results = fuse.search(normalizedQuery);

  if (results.length === 0) {
    return {
      ok: false,
      status: "NOT_FOUND",
      confidence: 0,
      product: null,
      suggestions: []
    };
  }

  const best = results[0];
  const second = results[1];

  const bestConfidence = scoreToConfidence(best.score);
  const secondConfidence = second ? scoreToConfidence(second.score) : 0;

  const suggestions = results.slice(0, maxSuggestions).map((result) => ({
    id: result.item.id,
    nombre: result.item.nombre,
    precio: result.item.precio,
    confidence: scoreToConfidence(result.score)
  }));

  if (onlyAvailable && best.item.disponible !== true) {
    return {
      ok: false,
      status: "PRODUCT_UNAVAILABLE",
      confidence: bestConfidence,
      product: formatProduct(best.item),
      suggestions: await buildAvailableSuggestions(normalizedQuery, maxSuggestions)
    };
  }

  if (bestConfidence < minConfidence) {
    return {
      ok: false,
      status: "LOW_CONFIDENCE",
      confidence: bestConfidence,
      product: null,
      suggestions
    };
  }

  const isAmbiguous =
    second &&
    second.item.id !== best.item.id &&
    secondConfidence >= minConfidence &&
    Math.abs(bestConfidence - secondConfidence) <= 0.08;

  if (isAmbiguous) {
    return {
      ok: false,
      status: "AMBIGUOUS",
      confidence: bestConfidence,
      product: null,
      suggestions
    };
  }

  return {
    ok: true,
    status:
      bestConfidence >= autoConfidence ? "AUTO_MATCH" : "NEEDS_CONFIRMATION",
    confidence: bestConfidence,
    product: formatProduct(best.item),
    suggestions
  };
}

function normalizeVariantCorrectionQuery(normalizedQuery) {
  const cleanedQuery = String(normalizedQuery || "")
    .replace(/\bcomun\b/g, "simple")
    .replace(/\bcomún\b/g, "simple")
    .replace(/\s+no\s+(doble|triple)\b/g, "")
    .replace(/\bcamdis\s+americana\b/g, "americana")
    .replace(/\bhamburguesa\s+americana\b/g, "americana")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanedQuery === "americana" || cleanedQuery === "americanas") {
    return "americana simple";
  }

  return cleanedQuery;
}

async function buildAvailableSuggestions(normalizedQuery, maxSuggestions) {
  const availableProducts = await getProducts({ onlyAvailable: true });
  const fuse = createFuse(availableProducts);

  return fuse
    .search(normalizedQuery)
    .slice(0, maxSuggestions)
    .map((result) => ({
      id: result.item.id,
      nombre: result.item.nombre,
      precio: result.item.precio,
      confidence: scoreToConfidence(result.score)
    }));
}
