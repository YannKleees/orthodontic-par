import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Dev server on :8080. /api and /static go to the Express backend on :8000.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api":    { target: BACKEND, changeOrigin: true },
      "/static": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },
});
