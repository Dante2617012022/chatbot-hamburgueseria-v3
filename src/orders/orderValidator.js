import { isValidOrderStatus } from "./orderStatus.js";

export function assertValidOrder(order) {
  if (!order || typeof order !== "object") {
    throw new Error("El pedido no es válido.");
  }

  if (!order.id) {
    throw new Error("El pedido no tiene id.");
  }

  if (!isValidOrderStatus(order.status)) {
    throw new Error(`Estado de pedido inválido: ${order.status}`);
  }

  if (!Array.isArray(order.items)) {
    throw new Error("El pedido debe tener un array de items.");
  }
}

export function assertValidQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La cantidad debe ser un número entero mayor a 0.");
  }

  if (quantity > 50) {
    throw new Error("La cantidad es demasiado alta.");
  }
}

export function assertValidProductId(productId) {
  if (!productId || typeof productId !== "string") {
    throw new Error("El productId es obligatorio.");
  }
}
