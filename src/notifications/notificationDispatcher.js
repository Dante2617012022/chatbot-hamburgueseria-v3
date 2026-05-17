import {
  getPendingLocalNotifications,
  markLocalNotificationFailed,
  markLocalNotificationSent
} from "./notificationRepository.js";

export async function dispatchPendingLocalNotifications({
  channel = process.env.LOCAL_NOTIFICATION_CHANNEL || "INTERNAL",
  limit = 20,
  dryRun = process.env.LOCAL_NOTIFICATION_DRY_RUN === "true",
  sendText = null
} = {}) {
  const pendingNotifications = getPendingLocalNotifications({ limit });

  const filteredNotifications = pendingNotifications.filter((notification) => {
    if (channel === "ALL") {
      return true;
    }

    return notification.channel === channel;
  });

  const results = [];

  for (const notification of filteredNotifications) {
    try {
      const shouldSimulate = dryRun || notification.channel === "INTERNAL";

      if (shouldSimulate) {
        const sentNotification = markLocalNotificationSent(notification.id);

        results.push({
          ok: true,
          dryRun: true,
          notification: sentNotification
        });

        continue;
      }

      if (!sendText) {
        throw new Error("sendText es obligatorio para enviar notificaciones reales.");
      }

      if (!notification.destination) {
        throw new Error("La notificación no tiene destino.");
      }

      await sendText({
        destination: notification.destination,
        message: notification.message,
        notification
      });

      const sentNotification = markLocalNotificationSent(notification.id);

      results.push({
        ok: true,
        dryRun: false,
        notification: sentNotification
      });
    } catch (error) {
      const failedNotification = markLocalNotificationFailed(
        notification.id,
        error.message
      );

      results.push({
        ok: false,
        error: error.message,
        notification: failedNotification
      });
    }
  }

  return {
    totalPending: pendingNotifications.length,
    totalMatched: filteredNotifications.length,
    totalProcessed: results.length,
    results
  };
}
