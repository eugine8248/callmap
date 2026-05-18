# callmap v1.2 — QA Report

**Date:** 2026-05-18
**Reviewer:** desktop-builder qa
**Build:** v1.2.0 from clean tree
**Verdict:** ✅ **PASS — ready for Package phase.**

---

## 1. Build verification

| Step | Result |
|------|--------|
| `npm run typecheck` (4 workspaces) | ✅ PASS — no TS errors |
| `npm -w @callmap/core run build` | ✅ PASS |
| `npm -w @callmap/desktop run build` | ✅ PASS, all chunks produced |
| `npm -w callmap-vscode run build` | ✅ PASS, webview + worker + extension all built |

## 2. Requirements coverage (M1–M7)

| ID | Description | Status | File(s) | Evidence |
|----|-------------|--------|---------|----------|
| M1 | Curved cross-cluster edges (2D) | ✅ COMPLETE | `MapEdge.tsx`, `MapGraphView.tsx`, `mapConstants.ts` | `MapGraphView.tsx:671` detects `crossCluster` via `nodeClusterMap` lookup; `MapEdge.tsx` renders `Q` Bezier when `controlX/Y` finite; particles inherit curve via `<mpath>` |
| M2 | Zoom < 0.5 particle gating (with hysteresis at 0.55) | ✅ COMPLETE | `MapGraphView.tsx`, `mapConstants.ts` | `MapGraphView.tsx:608-619` runs the hysteresis effect; `particleBase` zero-clamps when `particlesEnabledByZoom` is false |
| M3 | 3D chunk reduction | ⚠️ PARTIAL | `vite.config.ts`, `webview-vite.config.ts` | `three` split into separate chunk: wrapper dropped from monolithic 368 KB gzip to 15.60 KB; `three` is 353.47 KB gzip alone. Combined cold-cache: 369.07 KB (∼300 KB target missed by ~70 KB — three.js itself is the floor). Mitigation: parallel fetch + separate cacheability. Documented in security-review.md and ARCHITECTURE.md. **NOT a blocker**: brief allowed easter-egg-tier friction. |
| M4 | Animation budget ladder (3/1/0 at 0/200/350 nodes) | ✅ COMPLETE | `mapConstants.ts`, `MapGraphView.tsx`, `Map3DView.tsx` | `particlesForNodeCount(n)` returns 3/1/0; consumed by both 2D edge memo and 3D `linkDirectionalParticles` prop |
| M5 | Per-file cluster anchors in 3D (forceX/Y/Z lattice) | ✅ COMPLETE | `Map3DView.tsx`, `d3-force-3d.d.ts` | `cubeLatticeAnchors` computes cube lattice; injected via `fg.d3Force("clusterX/Y/Z", forceX/Y/Z(...).strength(0.18))`. C=1 fallback wipes any stale forces. `d3ReheatSimulation()` kicks immediately. |
| M6 | Global Tab cycle + Enter to open source panel | ✅ COMPLETE | `MapGraphView.tsx`, `MapNode.tsx`, `keymap.ts` | `globalOrder` sorted by `(file, startLine, qualifiedName)`. Tab cycles with Shift+Tab reverse; Enter promotes focused → selected. New `focused` prop on `MapNode` renders dashed 50%-opacity ring. keymap.ts surfaces `map.cycleNode` + `map.openFocusedSource`. |
| M7 | aria-live mode announcements | ✅ COMPLETE | `GraphModeShell.tsx`, `styles.css` | New `<span role="status" aria-live="polite" aria-atomic="true" className="map-aria-live">`. Text resets to `""` then writes `"Map view"` / `"Review view"` / `"3D view loaded"` with a 50ms delay so screen readers re-announce identical strings. `.map-aria-live` CSS class is the standard WCAG visually-hidden pattern. |

Nice-to-haves (N1, N2): NOT implemented in v1.2 (per requirements.md — explicitly deferred if scope tightened). No regression caused by their absence.

## 3. Regression checks (v1.1 affordances must still work)

| v1.1 feature | Inspection result |
|--------------|-------------------|
| 2D Map view force simulation | Unchanged (`useForceLayout.ts` not modified except untouched in v1.2) |
| Per-cluster halos (convex hulls) | Unchanged (`MapGraphView.tsx` hull code untouched) |
| Click-to-isolate (focusSet) | Unchanged |
| Find widget (Ctrl+F) | Unchanged |
| 3D auto-orbit | Unchanged |
| Settle entrance animation | Unchanged |
| Reduced-motion gating | Unchanged + extended: M4 ladder respects reducedMotion flag |
| Per-node breathing | Unchanged |
| Selected-node throb | Unchanged (selection ring still solid full-opacity per spec) |
| Tab-cycle by-degree neighbor when selected | Unchanged — v1.2 only ADDS the no-selection global path |
| Esc clears selection (IdeShell global) | Unchanged |
| `gg` easter egg → 3D | Unchanged |
| Status-bar pill `Map / Review` toggle | Unchanged |
| Ctrl+Shift+G mode toggle | Unchanged |

**No regression observed.**

## 4. Build artifact verification

Desktop build output:
| Chunk | Raw | Gzip | Lazy? |
|-------|-----|------|-------|
| `index.html` | 1.03 KB | 0.54 KB | — |
| `index` (main) | 527.76 KB | 152.76 KB | initial |
| `core` | 2.44 KB | 0.98 KB | lazy |
| `GraphModeShell` | 2.97 KB | 1.09 KB | lazy |
| `MapGraphView` | 44.37 KB | 16.08 KB | lazy |
| **`Map3DView`** | **50.08 KB** | **15.60 KB** | lazy (gg only) |
| **`three`** (NEW) | **1,305.42 KB** | **353.47 KB** | lazy (gg only) |
| `CallGraphView` | 158.30 KB | 51.66 KB | lazy |
| `SourcePanel` | 44.28 KB | 14.39 KB | lazy |
| `forceLayout.worker` | 16.00 KB | — | worker |
| `CallGraphView.css` | 15.85 KB | 2.66 KB | lazy |
| `index.css` | 21.93 KB | 5.72 KB | initial |

**Initial bundle (index.js + index.css): 549.69 KB raw / 158.48 KB gzip.** That's below the v0.5 "initial chunk under 300 KB gzip" budget and unchanged from v1.1 in the initial-load path.

**3D chunk family**: 1,355.50 KB raw / 369.07 KB gzip across the `three` + `Map3DView` pair (vs v1.1's 1,353.09 KB / 367.88 KB monolithic). Net +1.19 KB gzip from the chunk-split boilerplate, in exchange for parallel fetch + separate cacheability.

## 5. Build warnings (informational)

- `Circular chunk: Map3DView -> MapGraphView -> Map3DView` — pre-existing in v1.1, caused by `mapConstants` being shared. Harmless: chunk loader resolves both before init. Not blocking ship.
- `Circular chunk: Map3DView -> three -> Map3DView` — caused by the new chunk split; same harmless pattern as above.
- `Use of eval` warnings from web-tree-sitter — pre-existing in v1.0+. Not v1.2 introduced.
- Astro `[MODULE_TYPELESS_PACKAGE_JSON]` warning — docs site only, not v1.2 introduced.

## 6. Findings

| ID | Severity | Title | Disposition |
|----|----------|-------|-------------|
| QA-1 | None — Informational | M3 missed 300 KB gzip aspirational target by ~70 KB | Documented in ARCHITECTURE.md §"Bundle-size budget vs M3 target" and security-review.md. Not a regression; v1.1's 3D chunk was 368 KB gzip and the v1.2 split changes the distribution, not the floor (three.js itself). |

Zero blocking findings. Zero High. Zero Medium. Zero Low.

## 7. Out-of-sandbox tests (deferred to user)

The QA cannot launch the Tauri window or the VS Code extension webview from this environment. The following should be smoke-tested manually before public release:

- [ ] Launch desktop app (`npm run tauri:dev`); load any PR; flip to Map view via Ctrl+Shift+G
- [ ] In Map view: zoom out to k < 0.5 — particles should disappear; zoom in past 0.55 — particles return
- [ ] Click an empty area; press Tab — focused node should advance through global order with dashed half-opacity ring
- [ ] Press Enter — source panel should open for the focused node
- [ ] Load a multi-file PR; observe curved edges between clusters and straight edges within clusters
- [ ] Press `g`, `g` to enable 3D — observe per-file cube-lattice clustering (vs v1.1's blob)
- [ ] Use a screen reader (NVDA / VoiceOver) and toggle modes — should hear "Map view" / "Review view" / "3D view loaded"
- [ ] At ≥200 nodes synthetic PR: 2D should reduce to 1 particle per edge automatically

## 8. Handoff

QA gate cleared. Cycle proceeds to Package without revisions. No Debugger loop required.
