// Vite config for the webview bundle. The output is loaded by the
// extension via `asWebviewUri` inside a strict-CSP iframe, so we set
// the build output names to fixed paths the panel template references.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// Best-effort plugin to copy the WASM grammar files into media/ at
// build time. The desktop's public/ ships them already; we mirror that
// layout under media/ so asWebviewUri can resolve them.
function copyWasm() {
  return {
    name: "callmap-copy-wasm",
    closeBundle() {
      const src = path.resolve(__dirname, "../desktop/public");
      const dest = path.resolve(__dirname, "media");
      if (!fs.existsSync(src)) return;
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        if (!f.endsWith(".wasm")) continue;
        fs.copyFileSync(path.join(src, f), path.join(dest, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyWasm()],
  // The webview HTML is rendered by the extension, not by Vite, so we
  // build the entry as a library-style bundle with deterministic names.
  build: {
    outDir: "media",
    emptyOutDir: false, // keep the .wasm files we copy in postbuild
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, "webview-src/main.tsx"),
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "[name].js",
        // v0.5 — Rollup uses this for *every* emitted asset, including
        // stylesheets pulled in by lazy chunks (xyflow's CSS lives
        // inside the CallGraphView chunk and gets emitted alongside).
        // We name the entry CSS deterministically; everything else
        // keeps the chunk-derived name so `CallGraphView.css` shows up
        // next to `CallGraphView.js` and the runtime <link> injection
        // can find it via the source-relative path.
        assetFileNames: (info) => {
          const n = info.name ?? "";
          if (n === "main.css" || n === "index.css") return "main.css";
          return "[name][extname]";
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
