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
    // v0.5 — raise the chunk-size warning to 500 KB. The lazy
    // CallGraphView chunk (xyflow + dagre + highlight.js subset) is
    // intentionally bigger than the initial bundle so we don't want a
    // false-alarm warning at every build. The numbers we actually care
    // about — initial chunk under 300 KB gzip — are tracked in
    // AUTOMATION_LOG.md.
    chunkSizeWarningLimit: 600,
  },
  // Don't pre-bundle web-tree-sitter — it needs to load its own WASM at runtime
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
