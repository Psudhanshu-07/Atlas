import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Cloned repos live under .codeatlas/ inside the project root. Without this
    // the watcher fires on every file a clone writes and forces a full reload.
    watch: {
      ignored: ["**/.codeatlas/**", "**/dist/**", "**/.tmp/**"],
    },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
  },
  // Static files live at the repository root, one level above this config.
  publicDir: "../public",
});
