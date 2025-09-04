// server/server.ts (bootstrap only)
import Fastify from "fastify";
import cors from "@fastify/cors";
import { PORT } from "./config.ts";
import { closePool } from "./db.ts";
import { registerIngestRoutes } from "./routes/ingest.ts";
import { registerRfpRoutes } from "./routes/rfp.ts";
import { registerDebugRoutes } from "./routes/debug.ts";

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Health check
  app.get("/healthz", async () => ({ status: "ok" }));

  // Centralized error handler
  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "Route error");
    reply.code(500).send({ error: err.message, code: (err as any).code });
  });

  // Routes
  await registerIngestRoutes(app);
  await registerRfpRoutes(app);
  await registerDebugRoutes(app);

  // Start server
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`API listening on http://localhost:${PORT}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down...");
    try { await app.close(); } catch {}
    try { await closePool(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
