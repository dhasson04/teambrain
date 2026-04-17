import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves at https://<user>.github.io/<repo>/
  // For dev (localhost), base must stay "/"
  base: mode === "production" ? "/teambrain/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
