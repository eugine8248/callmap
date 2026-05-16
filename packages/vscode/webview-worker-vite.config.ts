// v0.5 — Standalone build for the parse worker chunk.
//
// VS Code webviews instantiate this script as `new Worker(uri)` where
// `uri` is an asWebviewUri pointing at media/parseWorker.js. We emit it
// as a classic IIFE so the webview doesn't need ESM module-worker
// support (which would require `worker-src 'self' blob:` plus a
// `{ type: 'module' }` constructor option that isn't on every browser
// runtime VS Code uses).

import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "media"),
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, "../core/src/parseWorker.ts"),
      formats: ["iife"],
      name: "callmapParseWorker",
      fileName: () => "parseWorker.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "parseWorker.js",
        inlineDynamicImports: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
