/**
 * =============================================================================
 * server/index.ts — Express application factory
 * =============================================================================
 * PURPOSE
 *  - Construct and configure an Express application with CORS, JSON body
 *    parsing, and route composition for patients, visits, PAR components,
 *    reports, similarity search, and static file serving.
 *
 * ARCHITECTURE
 *  - “createServer” is a pure factory (no network side effects); callers
 *    decide the transport (e.g., HTTP listen) and deployment wiring.
 *  - Static artifacts are served from DATA_DIR under the “/static” prefix.
 *
 * RELIABILITY & INTEROP
 *  - Health endpoint (/api/ping) returns a stable JSON payload for uptime
 *    checks and CI smoke tests.
 *  - CORS is enabled for cross-origin frontends during local development.
 * =============================================================================
 */
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { router as patientsRouter } from "./routes/patients";
import { router as parComponentsRouter } from "./routes/par-components";
import { router as visitsRouter } from "./routes/visits";
import { router as reportsRouter } from "./routes/reports";
import { router as similarPatientsRouter } from "./routes/similar-patients";
import { router as uploadsRouter } from "./routes/uploads";
import { DATA_DIR }        from "../../backend/config.js";
import path from "path";

export function createServer() {
  const app = express();

  // ── Middleware: CORS + body parsers (JSON + URL-encoded) ─────────
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Liveness probe (used by uptime monitors and smoke tests) ─────
  app.get("/api/ping", (_req, res) => {
    res.json({ message: "Hello from Express server v2!" });
  });

  // ── Legacy sample route (kept for backward-compatibility) ────────
  app.get("/api/demo", handleDemo);

  // ── Primary API surface (REST resources) ─────────────────────────
  app.use("/api/patients", patientsRouter);
  app.use("/api/par-components", parComponentsRouter);
  app.use("/api/visits", visitsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/similar-patients", similarPatientsRouter);

  // ── Static artifacts (e.g., mosaics, PDFs) served under /static ─
  app.use("/static", express.static(DATA_DIR));

  return app;
}
