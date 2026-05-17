import express from "express";

import {
  approveDryRunPaymentByOrderId,
  processMercadoPagoWebhook
} from "../payments/paymentService.js";
import { logger } from "../utils/logger.js";
import { getDatabase } from "../storage/database.js";
import { dispatchPendingLocalNotifications } from "../notifications/notificationDispatcher.js";

export function createHttpServer() {
  const app = express();

  app.use(express.json({
    limit: "1mb"
  }));

  app.get("/health", (req, res) => {
    let databaseOk = false;

    try {
      const db = getDatabase();
      const row = db.prepare("SELECT 1 AS ok").get();
      databaseOk = row?.ok === 1;
    } catch {
      databaseOk = false;
    }

    res.json({
      ok: databaseOk,
      service: "chatbot-hamburgueseria-v3",
      database: databaseOk ? "ok" : "error",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  app.post("/webhooks/mercadopago", async (req, res) => {
    try {
      const result = await processMercadoPagoWebhook({
        query: req.query,
        body: req.body
      });

      logger.info(
        {
          result
        },
        "Webhook Mercado Pago procesado."
      );

      res.status(200).json({
        ok: true,
        result
      });
    } catch (error) {
      logger.error(
        {
          error: error.message,
          stack: error.stack
        },
        "Error procesando webhook de Mercado Pago."
      );

      res.status(500).json({
        ok: false,
        error: "WEBHOOK_PROCESSING_ERROR"
      });
    }
  });

  app.post("/dev/notifications/dispatch", async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({
          ok: false,
          error: "NOT_ALLOWED_IN_PRODUCTION"
        });
      }

      const result = await dispatchPendingLocalNotifications({
        channel: req.body?.channel || "INTERNAL",
        dryRun: true
      });

      res.json({
        ok: true,
        result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  });

  app.post("/dev/payments/:orderId/approve", (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({
          ok: false,
          error: "NOT_ALLOWED_IN_PRODUCTION"
        });
      }

      const result = approveDryRunPaymentByOrderId(req.params.orderId);

      res.json({
        ok: true,
        result
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message
      });
    }
  });

  return app;
}

export function startHttpServer({ port = process.env.PORT || 3000 } = {}) {
  const app = createHttpServer();

  const server = app.listen(port, () => {
    logger.info(`Servidor HTTP iniciado en puerto ${port}.`);
  });

  return server;
}
