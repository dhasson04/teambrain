import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  // Optional GitHub Pages subpath deploy: /teambrain/deep-dive/
  base: mode === "production" ? "/teambrain/deep-dive/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
