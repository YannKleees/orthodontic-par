/**
 * =============================================================================
 * vite.config.server.ts — Vite build configuration for the Node server
 * =============================================================================
 * GOALS
 *  - Build a clean ESM server bundle suitable for Node 22 runtimes.
 *  - Externalize Node built-ins and key dependencies to reduce bundle size
 *    and preserve native module resolution semantics.
 *  - Provide path aliases for isomorphic/shared code and client imports.
 *
 * OUTPUT
 *  - Emits dist/server/production.mjs with source maps for operability.
 *  - SSR mode enabled to prevent client transforms on server code.
 *
 * SECURITY/INTEGRITY
 *  - process.env.NODE_ENV is pinned to "production" at build time to ensure
 *    consistent prod code paths (e.g., logging, error handling).
 * =============================================================================
 */
import { defineConfig } from "vite";
import path from "path";

// Server build configuration
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
        "fs",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        // External dependencies that should not be bundled
        "express",
        "cors",
      ],
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false, // Keep readable for debugging/observability
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
