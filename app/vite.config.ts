import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: false,
        // SSE passthrough: tell any upstream buffering layer (nginx/proxies
        // in front of http-proxy) not to buffer, and ensure the response
        // headers flush immediately so the browser sees each event as it
        // arrives from the Bun server. Without this, Vite's dev proxy
        // byte-batches SSE and the UI phase label lags several minutes
        // behind the backend (backprop-4, BUG-4, spec-ui.md R010).
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["x-accel-buffering"] = "no";
            proxyRes.headers["cache-control"] = "no-cache, no-transform";
          });
        },
      },
    },
  },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
  },
});
