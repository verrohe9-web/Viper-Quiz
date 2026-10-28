import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { darajaPaymentAdapter } from "../services/darajaPaymentAdapter";
import { airtelPaymentAdapter } from "../services/airtelPaymentAdapter";
import { gameRoomManager } from "../services/gameRoom";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Daraja callback boundary. Disabled until a callback URL and merchant configuration are explicitly enabled.
  app.post("/api/payments/daraja/callback", async (req, res) => {
    if (process.env.DARAJA_CALLBACK_ENABLED !== "true") {
      return res.status(503).json({ accepted: false, code: "DARAJA_CALLBACK_DISABLED" });
    }
    try {
      const { getDb } = await import("../db");
      const { gamePayments } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const callback = req.body as { Body?: { stkCallback?: { MerchantRequestID?: unknown } } };
      const providerRequestId = typeof callback?.Body?.stkCallback?.MerchantRequestID === "string" ? callback.Body.stkCallback.MerchantRequestID.trim() : "";
      if (!db || !providerRequestId) return res.status(400).json({ accepted: false, message: "Missing Daraja MerchantRequestID." });
      const [payment] = await db.select().from(gamePayments).where(eq(gamePayments.providerRequestId, providerRequestId)).limit(1);
      if (!payment || !payment.walletPhone) return res.status(404).json({ accepted: false, message: "Unknown Daraja payment request." });
      const reconciled = darajaPaymentAdapter.reconcileCallback(req.body, { providerRequestId, amountMinor: payment.amountMinor, currency: payment.currency, phoneNumber: payment.walletPhone });
      if (!reconciled.accepted) return res.status(400).json({ accepted: false, message: reconciled.reason });
      const updatedPool = gameRoomManager.applyDarajaPaymentStatus(payment.roomCode, payment.playerId, reconciled.status === "paid", reconciled.providerRequestId, reconciled.providerTransactionId);
      if (!updatedPool) return res.status(409).json({ accepted: false, message: "Payment no longer matches an active waiting-room participant." });
      await db.update(gamePayments).set({ status: reconciled.status, providerTransactionId: reconciled.providerTransactionId ?? null, paidAt: reconciled.status === "paid" ? new Date() : null }).where(eq(gamePayments.id, payment.id));
      return res.json({ accepted: true, status: reconciled.status });
    } catch (error) {
      console.error("[Daraja] Callback reconciliation failed", error);
      return res.status(500).json({ accepted: false, message: "Callback reconciliation failed." });
    }
  });

  app.post("/api/payments/airtel/callback", async (req, res) => {
    if (process.env.AIRTEL_CALLBACK_ENABLED !== "true") {
      return res.status(503).json({ accepted: false, code: "AIRTEL_CALLBACK_DISABLED" });
    }
    try {
      const payload = req.body;
      const providerRequestId = typeof payload?.providerRequestId === "string" ? payload.providerRequestId.trim() : "";
      if (!providerRequestId) {
        return res.status(400).json({ accepted: false, message: "Missing Airtel providerRequestId." });
      }

      const reconciled = airtelPaymentAdapter.reconcileCallback(payload, {
        providerRequestId,
        amountMinor: 0,
        currency: "KES",
        phoneNumber: "",
      });
      if (!reconciled.accepted) {
        return res.status(400).json({ accepted: false, message: reconciled.reason });
      }
      return res.json({ accepted: true, status: reconciled.status });
    } catch (error) {
      console.error("[Airtel] Callback reconciliation failed", error);
      return res.status(500).json({ accepted: false, message: "Callback reconciliation failed." });
    }
  });

  app.get("/api/payments/paystack/callback", async (req, res) => {
    const reference = typeof req.query.reference === "string" ? req.query.reference : typeof req.query.trxref === "string" ? req.query.trxref : "";
    if (!/^vq_[a-f0-9]{32}$/.test(reference)) {
      return res.status(400).send("Invalid Paystack reference.");
    }
    try {
      const { getDb } = await import("../db");
      const { gamePayments } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(503).send("Payment storage is unavailable.");
      const [payment] = await db.select().from(gamePayments).where(and(
        eq(gamePayments.providerRequestId, reference),
        eq(gamePayments.provider, "paystack"),
      )).limit(1);
      if (!payment) return res.status(404).send("Paystack payment attempt not found.");

      const destination = new URL(`/room/${encodeURIComponent(payment.roomCode)}`, process.env.PAYSTACK_CALLBACK_URL);
      destination.searchParams.set("paystack_reference", reference);
      return res.redirect(303, destination.toString());
    } catch (error) {
      console.error("[Paystack] Callback redirect failed", error);
      return res.status(500).send("Could not return to the game room.");
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
