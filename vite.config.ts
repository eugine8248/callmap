import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and won't change it
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Treat .wasm files in public/ as assets, served verbatim
  build: {
    target: "es2022",
    sourcemap: false,
  },
  // Don't pre-bundle web-tree-sitter — it needs to load its own WASM at runtime
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
