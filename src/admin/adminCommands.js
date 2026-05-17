import { isAdminPhone } from "./adminAuth.js";
import { getAllSessions } from "../storage/sessionStore.js";
import {
  getBotStatus,
  isBotPaused,
  setBotPaused
} from "../storage/settingsRepository.js";
import { getPendingLocalNotifications } from "../notifications/notificationRepository.js";
import { formatPrice } from "../menu/menuFormatter.js";
import { BUSINESS_OPEN_OVERRIDE, formatBusinessAvailability, setBusinessOpenOverride } from "../business/businessHoursService.js";
import { formatStockStatus, setProductAvailabilityByQuery } from "../menu/stockService.js";

export function isAdminCommand(messageText) {
  return typeof messageText === "string" &&
    messageText.trim().toLowerCase().startsWith("/admin");
}

export async function handleAdminCommand({
  customerPhone,
  messageText
}) {
  if (!isAdminPhone(customerPhone)) {
    return {
      handled: true,
      allowed: false,
      reply: "No tenés permisos para usar comandos admin."
    };
  }

  const command = parseAdminCommand(messageText);

  switch (command.name) {
    case "ayuda":
    case "help":
    case "":
      return adminReply(formatAdminHelp());

    case "estado":
      return adminReply(formatBotStatus());

    case "pausar":
      setBotPaused(true);
      return adminReply("Bot pausado. No se tomarán pedidos nuevos hasta usar /admin activar.");

    case "activar":
      setBotPaused(false);
      return adminReply("Bot activado. Ya puede volver a tomar pedidos.");

    case "pedidos":
      return adminReply(formatActiveOrders());

    case "stock":
      return adminReply(await formatStockStatus());

    case "agotado":
      return adminReply(await handleStockChange(command.args, false));

    case "disponible":
      return adminReply(await handleStockChange(command.args, true));

    case "horario":
      return adminReply(await formatBusinessAvailability());

    case "abrir":
      setBusinessOpenOverride(BUSINESS_OPEN_OVERRIDE.OPEN);
      return adminReply("Local marcado como *ABIERTO* manualmente.");

    case "cerrar":
      setBusinessOpenOverride(BUSINESS_OPEN_OVERRIDE.CLOSED);
      return adminReply("Local marcado como *CERRADO* manualmente.");

    case "automatico":
    case "auto":
      setBusinessOpenOverride(BUSINESS_OPEN_OVERRIDE.AUTO);
      return adminReply("Horario del local vuelto a modo *AUTOMÁTICO*.");

    case "pendientes":
    case "notificaciones":
      return adminReply(formatPendingNotifications());

    default:
      return adminReply(
        `Comando admin no reconocido: ${command.name}\n\n${formatAdminHelp()}`
      );
  }
}

export function shouldBlockCustomerMessages() {
  return isBotPaused();
}

function parseAdminCommand(messageText) {
  const normalized = String(messageText || "").trim();
  const parts = normalized.split(/\s+/);

  return {
    raw: normalized,
    name: (parts[1] || "ayuda").toLowerCase(),
    args: parts.slice(2)
  };
}

function adminReply(reply) {
  return {
    handled: true,
    allowed: true,
    reply
  };
}

async function handleStockChange(args, available) {
  const query = args.join(" ").trim();

  if (!query) {
    return available
      ? "Indicá el producto a marcar como disponible. Ejemplo: /admin disponible bacon doble"
      : "Indicá el producto a marcar como agotado. Ejemplo: /admin agotado bacon doble";
  }

  const result = await setProductAvailabilityByQuery({
    query,
    available,
    reason: available ? null : "Marcado manualmente por admin"
  });

  if (!result.ok) {
    return `No encontré el producto "${query}". Probá escribirlo de otra forma.`;
  }

  return available
    ? `Producto marcado como disponible: *${result.product.nombre}*.`
    : `Producto marcado como agotado: *${result.product.nombre}*.`;
}

function formatAdminHelp() {
  return [
    "*Comandos admin disponibles:*",
    "",
    "/admin ayuda",
    "/admin estado",
    "/admin pedidos",
    "/admin notificaciones",
    "/admin stock",
    "/admin agotado <producto>",
    "/admin disponible <producto>",
    "/admin horario",
    "/admin abrir",
    "/admin cerrar",
    "/admin automatico",
    "/admin pausar",
    "/admin activar"
  ].join("\n");
}

function formatBotStatus() {
  const botStatus = getBotStatus();
  const sessions = getAllSessions();
  const pendingNotifications = getPendingLocalNotifications();

  return [
    "*Estado del bot*",
    "",
    `Estado: ${botStatus.status}`,
    `Pedidos activos: ${sessions.length}`,
    `Notificaciones pendientes: ${pendingNotifications.length}`
  ].join("\n");
}

function formatActiveOrders() {
  const sessions = getAllSessions();

  if (sessions.length === 0) {
    return "No hay pedidos activos.";
  }

  const lines = ["*Pedidos activos:*", ""];

  for (const session of sessions.slice(0, 10)) {
    const order = session.order;

    lines.push(`Pedido: ${order.id}`);
    lines.push(`Teléfono: ${session.phone}`);
    lines.push(`Estado: ${order.status}`);
    lines.push(`Total: $${formatPrice(order.total || 0)}`);
    lines.push(`Items: ${order.items?.length || 0}`);
    lines.push("");
  }

  if (sessions.length > 10) {
    lines.push(`Mostrando 10 de ${sessions.length} pedidos activos.`);
  }

  return lines.join("\n").trim();
}

function formatPendingNotifications() {
  const notifications = getPendingLocalNotifications();

  if (notifications.length === 0) {
    return "No hay notificaciones pendientes.";
  }

  const lines = ["*Notificaciones pendientes:*", ""];

  for (const notification of notifications.slice(0, 10)) {
    lines.push(`ID: ${notification.id}`);
    lines.push(`Pedido: ${notification.orderId}`);
    lines.push(`Tipo: ${notification.type}`);
    lines.push(`Canal: ${notification.channel}`);
    lines.push(`Estado: ${notification.status}`);
    lines.push("");
  }

  if (notifications.length > 10) {
    lines.push(`Mostrando 10 de ${notifications.length} notificaciones pendientes.`);
  }

  return lines.join("\n").trim();
}
