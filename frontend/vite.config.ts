import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
     // forward every /static/... request to the Express backend
     "/static": {
       target: "http://localhost:8000",
       changeOrigin: true,
       secure: false,
       rewrite: (path) => path,  // Don't rewrite the path
       configure: (proxy, _options) => {
         proxy.on('error', (err, _req, _res) => {
           console.log('Proxy error:', err);
         });
         proxy.on('proxyReq', (proxyReq, req, _res) => {
           console.log('Proxying:', req.method, req.url, '→', proxyReq.path);
         });
         proxy.on('proxyRes', (proxyRes, req, _res) => {
           console.log('Proxied response:', req.url, proxyRes.statusCode);
         });
       },
     },
     // Also proxy /api requests
     "/api": {
       target: "http://localhost:8000",
       changeOrigin: true,
       secure: false,
       rewrite: (path) => path,
     },
   },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
