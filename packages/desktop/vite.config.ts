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
    // v1.1.4 — Map3DView (three.js + react-force-graph-3d + d3-force-3d)
    // is intentionally 1.3 MB raw / 368 KB gzip. The chunk only loads
    // after the `gg` easter egg, so we raise the warning to 1500 KB
    // and document the size in V11_REPORT.md.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // v1.1.0 — Force MapGraphView (and its d3-force dep) into a
        // dedicated lazy chunk. The default Rollup heuristic inlines
        // a small lazy module when only one importer references it
        // through React.lazy, which would pull d3-force into the
        // initial bundle. The id-based manualChunks below splits any
        // module whose path mentions the Map graph stack OR d3-force
        // into a single `MapGraphView` chunk that's only fetched when
        // the user flips to Map mode.
        manualChunks(id: string) {
          if (
            id.includes("/d3-force/") ||
            id.endsWith("/MapGraphView.tsx") ||
            id.endsWith("/MapNode.tsx") ||
            id.endsWith("/MapEdge.tsx") ||
            id.endsWith("/useForceLayout.ts")
          ) {
            return "MapGraphView";
          }
          // v1.1.4 — 3D map chunk. three.js (+ examples), d3-force-3d,
          // react-force-graph-3d, and three-render-objects all live
          // here so they're only fetched after the `gg` easter egg.
          //
          // v1.2 — Split `three` into its own sub-chunk so the
          // browser fetches it in parallel with the wrapper code on
          // cold-cache. `three` is ~140 KB gzip on its own; isolating
          // it lets the wrapper (`react-force-graph-3d` + d3 force
          // helpers) finish parsing while three.js is still on the wire.
          if (
            id.includes("/three/") ||
            id.includes("/three-")
          ) {
            return "three";
          }
          if (
            id.endsWith("/Map3DView.tsx") ||
            id.includes("/d3-force-3d/") ||
            id.includes("/react-force-graph") ||
            id.includes("/d3-quadtree/") ||
            id.includes("/d3-binarytree/") ||
            id.includes("/d3-octree/")
          ) {
            return "Map3DView";
          }
          return undefined;
        },
      },
    },
  },
  // Don't pre-bundle web-tree-sitter — it needs to load its own WASM at runtime
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
