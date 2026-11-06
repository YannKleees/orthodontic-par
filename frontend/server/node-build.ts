/**
 * =============================================================================
 * server/node-build.ts — Production entrypoint (HTTP server bootstrap)
 * =============================================================================
 * RESPONSIBILITIES
 *  - Instantiate the Express app via createServer().
 *  - Serve SPA static assets from the compiled dist path.
 *  - Provide React Router fallback to index.html for non-API routes.
 *  - Print helpful service URLs and implement graceful shutdown.
 *
 * RUNTIME CONTRACT
 *  - PORT is configurable via env; defaults to 3000.
 *  - API routes are reserved under /api and /health; these are excluded
 *    from SPA fallback to avoid masking missing endpoints.
 * =============================================================================
 */
import path from "path";
import { createServer } from "./index";
import * as express from "express";

const app = createServer();
const port = process.env.PORT || 3000;

// ── Resolve SPA dist directory (built client bundle) ───────────────
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// ── Serve static SPA assets (JS, CSS, images) ──────────────────────
app.use(express.static(distPath));

// ── React Router support: fallback to index.html for non-API paths ─
app.get("*", (req, res) => {
  // Preserve API semantics: do not shadow /api or /health with index.html
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

// ── Start HTTP listener and emit operator-friendly logs ────────────
app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// ── Cooperative shutdown (container-friendly) ──────────────────────
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
