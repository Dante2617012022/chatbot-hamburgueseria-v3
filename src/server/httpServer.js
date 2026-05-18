import express from "express";

import {
  approveDryRunPaymentByOrderId,
  processMercadoPagoWebhook
} from "../payments/paymentService.js";
import { validateMercadoPagoWebhookSignature } from "../payments/mercadoPagoWebhookSecurity.js";
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
      const signatureValidation = validateMercadoPagoWebhookSignature({
        query: req.query,
        body: req.body,
        headers: req.headers
      });

      if (!signatureValidation.ok) {
        logger.warn(
          { status: signatureValidation.status },
          "Webhook Mercado Pago rechazado por firma inválida."
        );

        return res.status(401).json({
          ok: false,
          error: "INVALID_WEBHOOK_SIGNATURE"
        });
      }

      const result = await processMercadoPagoWebhook({
        query: req.query,
        body: req.body
      });

      logger.info(
        {
          result,
          signatureStatus: signatureValidation.status
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
      const devAccess = validateDevEndpointAccess(req);

      if (!devAccess.ok) {
        return res.status(devAccess.statusCode).json({
          ok: false,
          error: devAccess.error
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
      const devAccess = validateDevEndpointAccess(req);

      if (!devAccess.ok) {
        return res.status(devAccess.statusCode).json({
          ok: false,
          error: devAccess.error
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

function validateDevEndpointAccess(req) {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      statusCode: 403,
      error: "NOT_ALLOWED_IN_PRODUCTION"
    };
  }

  const token = process.env.DEV_ENDPOINT_TOKEN;

  if (!token) {
    return {
      ok: true,
      statusCode: 200,
      error: null
    };
  }

  const receivedToken =
    req.get("x-dev-token") ||
    req.query?.dev_token ||
    req.body?.devToken ||
    null;

  if (receivedToken !== token) {
    return {
      ok: false,
      statusCode: 401,
      error: "INVALID_DEV_TOKEN"
    };
  }

  return {
    ok: true,
    statusCode: 200,
    error: null
  };
}
