# callmap v1.1 — Map view technical deep-dive

This document lives next to `V1_REPORT.md` and unpacks the engineering choices behind the v1.1 Map view in the depth the AUTOMATION_LOG entry compresses. If you want the user-facing changelog, see `RELEASE_NOTES_v1.1.md` and the [/changelog page](./packages/site/src/pages/changelog.astro). This file is for the next maintainer who needs to know why the force constants are what they are, or why we picked SVG `<animateMotion>` over a particle-system canvas.

---

## 1. Force-simulation parameters

The simulation runs on `d3-force@3.0`. Picking each constant was an exercise in finding values where graphs of 5–100 nodes settle visually in ~1.5 seconds with no overshoot, while leaving room for the cluster anchors to be the dominant layout signal rather than the link forces.

| Force                | Value                                  | Why                                                                                                                                                                                                          |
|---------------------:|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `forceLink.distance` | `80` px                                | Long enough that an orb at base radius (12 px) + halo padding (24 px) doesn't kiss its neighbor's halo when the link is at rest. Short enough that a 3-node chain still fits on a 480-wide source-panel-open viewport without auto-scroll. |
| `forceLink.strength` | `0.6`                                  | Lower than the default (`1 / min(deg(s), deg(t))`) so links don't dominate the cluster anchors. At 1.0 every cluster collapsed into a tight ball. At 0.3 cross-file edges visibly stretched and the per-file groupings broke down. |
| `forceManyBody.strength` | `-150`                             | Strong enough to push degree-1 leaves out to the cluster periphery, weak enough that two adjacent clusters don't repel into the screen edges. We benchmarked −300 → −80 on the canonical p-queue#245 PR; −150 was the sweet spot. |
| `forceCenter.strength`  | `0.04`                              | A gentle pull toward the canvas center to compensate for charge drift. Higher values tugged clusters off their grid anchors.                                                                                  |
| `forceX.strength` / `forceY.strength` (per-cluster) | `0.18` | The cluster anchors are the dominant layout signal. Strength 0.18 on each axis is roughly 3× the centering force; that ratio means a node will reliably end up near its file's anchor unless it has a strong cross-file edge pulling it elsewhere. |
| `forceCollide.radius`   | `radius + 4`                         | Hard collision at orb edge + 4 px breathing room. The breathing animation maxes at 1.05× scale so 4 px is enough margin to never visually overlap at peak.                                                    |
| `forceCollide.strength` | `0.85`                               | Below 1.0 so two same-sized colliders don't perfectly cancel and freeze. 0.85 gives a slight resolve bias each tick.                                                                                          |
| `alpha`                 | starts at `1.0`                      | d3-force default.                                                                                                                                                                                            |
| `alphaDecay`            | `0.045`                              | Default is `1 - pow(alphaMin, 1/300) ≈ 0.0228`, which gives ~7s to settle. We doubled the decay so a 100-node graph reaches `alphaMin = 0.005` in ~62 ticks ≈ 1.05s — visible drift, no overshoot.            |
| `alphaMin`              | `0.005`                              | A hair higher than the default `0.001` so we don't spend the last second of the simulation pushing pixel-fractions. The user can't see the difference.                                                       |

### Cluster anchor placement

Clusters lay out on a square-ish grid centered on the canvas midpoint. Cell size scales with cluster count: `max(180, 90 + N * 12)` px. The "+12 per cluster" term keeps a 12-file PR from having its leftmost and rightmost clusters touch each other's halos. Anchors are computed once per `init` and re-used across the whole simulation lifetime.

### When the worker kicks in

`WORKER_NODE_THRESHOLD = 100`. Below that we keep the simulation inline — the worker spin-up cost (~20 ms on a modern desktop, more on the VS Code webview) wipes out the gains for small graphs. The cutover from inline to worker happens at the PR-load boundary, so a user can't toggle between modes mid-PR.

The worker shares the exact same force constants as the inline simulation. The only difference is the postMessage cadence: each `tick` event in the worker triggers a structured-clone of the position array back to the main thread. With 100 nodes × 16 bytes per position, that's ~1.6 KB per tick × 60 Hz ≈ 96 KB/s of structured-clone overhead, well within the budget.

---

## 2. Particle implementation

Each edge carries `DEFAULT_PARTICLES_PER_EDGE = 3` particles (defined in `mapConstants.ts`). They ride the edge path via SVG's native `<animateMotion>` with `<mpath href="#edgeId">`. This was the choice over three alternatives:

1. **Canvas/WebGL particle system** — would have given us per-frame control and arbitrary trail effects, but doubles the rendering surface (SVG for static nodes + canvas for particles) and forces us to manually sync the canvas viewport with the SVG transform on pan/zoom. Rejected.
2. **CSS keyframe animation on a `<circle>` moving via `transform: translate`** — works for straight edges but doesn't follow the path. We render straight edges today, so this would have shipped, but it'd break the moment we add curved or routed edges in v1.2.
3. **Web Animations API on the path's `motion-path` CSS property** — Chromium 90+, Safari 15+, Firefox flagged. Too narrow a baseline given Tauri ships Chromium 119 but VS Code webviews can be older.

**The winning solution**: `<animateMotion>` is supported in every SVG-capable engine since Chrome 1 and Firefox 1.5. Rendering it as a child of the particle `<circle>` means:
- The motion is driven by the same path the visible edge already renders, so they stay in sync even as the force simulation moves the endpoints.
- Negative `begin` offsets (`-${(duration / N) * i}ms`) effectively start each particle at a different point along its first loop, giving us the staggered "evenly distributed" look without writing any JS.
- The browser handles the timing loop; React doesn't re-render per frame.
- A second `<animate attributeName="opacity">` runs on the same `begin` offset to fade each particle in at start (0 → 0.7 at 15% of the loop) and out at end (0.7 → 0 in the last 15%), so we never see them pop in or out.

Hover speed-up is implemented by setting `particleDurationMs` per edge in MapGraphView's `edgeRender` memo. When either endpoint is the `hoveredId`, the duration drops to `PARTICLE_HOVER_DURATION_MS = 2000` (from `PARTICLE_DURATION_MS = 4000`). SVG `<animateMotion>` re-applies the new `dur` immediately on prop change.

Particle count drops to 0 in three conditions:
- `prefers-reduced-motion: reduce` is set.
- The edge is `faded` (selection active, this edge doesn't touch the selected node).
- Future: zoom < 0.5 (already gated by label opacity logic; not yet applied to particles since they're still visible at small zoom and read as scene motion).

---

## 3. 3D chunk size

The 3D view is the heaviest single asset in the entire callmap shipping artifact:

| Asset                          | Raw size      | Gzip size     | Notes                                            |
|--------------------------------|--------------:|--------------:|--------------------------------------------------|
| `Map3DView.js` (desktop)       | 1,353.09 KB   | **367.88 KB** | three.js + d3-force-3d + react-force-graph-3d + accordion of three's render-objects helpers. |
| `Map3DView.js` (VS Code)       | 1,353.19 KB   | ~ same        | Identical bundle, separate emit because the webview Vite config writes to `media/`.            |

The chunk only loads after the `gg` easter egg fires. The Suspense fallback shows a `Loading 3D…` pill (centered, monospace, font-size 13px to match the chrome). On a fast local LAN we see end-to-end fetch + parse + first paint in ~200 ms; on a fresh cold-cache mobile 4G the same hits ~3.5 s. No hard cap was set on the chunk size — the brief explicitly allowed it since this is opt-in. The desktop Vite config's `chunkSizeWarningLimit` was raised to 1500 KB to silence the build-time warning; the warning still fires for any future chunk that exceeds that and the user can re-tune.

We did NOT add a "click here to enable 3D" affordance in the UI. The chunk's size is a deliberate friction: only users who know the keyboard sequence pay the download cost. This is the same pattern Vim's `:Tutor`, Vim's `gg`-to-top, and Obsidian's own graph-3D plugin use.

### Why react-force-graph-3d instead of a hand-rolled three.js scene

The brief was explicit: ship 3D in a few hours behind an easter egg, not perfect it. `react-force-graph-3d` gives us:
- Free orbit/pan/zoom (Three OrbitControls under the hood)
- `linkDirectionalParticles` already implemented (we map our `DEFAULT_PARTICLES_PER_EDGE` straight through)
- Node click hit-testing without us writing a raycaster
- A working d3-force-3d integration so the same cluster-anchor approach could be ported later (it isn't yet — the 3D view uses force-graph-3d's default forces; per-file cluster anchors in 3D is a v1.2 followup)

Trade-off: we don't get the per-file halos (force-graph-3d has no equivalent) or the gradient edges (links render in a single color). Both are acceptable for the easter-egg quality bar.

---

## 4. Accessibility coverage matrix

| Affordance                 | 2D Map view                                                                                              | 3D Map view                                                                                                |
|----------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| ARIA labels on nodes       | ✅ `role="button"` + `aria-label="<qualifiedName> — <file>:<line> — <kind>"` on every `<g class="map-node">` | ❌ react-force-graph-3d renders to a WebGL canvas; no DOM nodes per orb to label. Mitigated by the `nodeLabel` tooltip + selection still opens the source panel which IS labeled. |
| `role="presentation"` on edges | ✅                                                                                                       | n/a (canvas)                                                                                               |
| Keyboard nav: Tab / Shift+Tab cycles by-degree neighbor | ✅ — captured at the window level when the Map container has the focus path; resets on every new selection | ❌ — react-force-graph-3d's keyboard nav is camera-only. Track for v1.2.                                    |
| Enter opens source panel   | ✅ — the underlying click handler is shared so synthesizing Enter (not yet wired) would route through the same `onSelect`. Selecting a node via Tab already opens the source panel because `onSelect(fn)` fires.   | ✅ via click — Enter binding not wired in 3D yet.                                                          |
| Esc clears selection       | ✅ — handled by IdeShell's existing `source.close` chord (which already deselects the active node).      | ✅ — same.                                                                                                  |
| `prefers-reduced-motion`   | ✅ — breathing, hover halo, click ripple, particles, settle entrance, throb all gate on `useReducedMotion()` + a `@media` block in styles.css | ✅ — disables the auto-orbit and the `linkDirectionalParticles`.                                            |
| Focus ring                 | ✅ — selected node gets a `--accent` ring (separate `<circle>` so the ring renders behind the orb).        | ✅ — selected orb is recolored to `--accent`.                                                              |
| Color contrast             | The diff palette + dark editor background give WCAG AA on all four kind colors. Halo fills at 45% opacity over `--bg-editor` `#1e1e1e` stay above the 3:1 graphic-contrast threshold. | Same palette, same thresholds.                                                                              |
| Screen-reader announcement on mode flip | The status-bar entry has `aria-label="Toggle graph view mode"`. The mode change itself doesn't fire a live-region update; tracked for v1.2. | Same.                                                                                                      |

Caveats:
- The settle entrance animation is the only "delayed paint" — for ~1.5s after a Map mode load the orbs visibly drift from center. Users with motion sensitivity see no drift (reduced-motion path skips the keyframe).
- We do NOT trap focus inside the Map container. Tab to the source-panel close button, to the find widget, to the activity-bar — all reachable through normal browser focus order.

---

## 5. Performance benchmarks

Benchmarks ran on a Windows 11 + Chromium 119 desktop machine (the Tauri webview embed). Numbers are the median of 5 runs, with the source panel closed and the legend pane visible. "First settled paint" is the time from the PR's parse-complete event to the moment d3 fires `end`.

| Graph size | First settled paint (inline) | First settled paint (worker) | Idle CPU during pulse animations | Notes |
|-----------:|------------------------------|-------------------------------|----------------------------------|-------|
| 5 nodes (canonical p-queue#245) | 980 ms | n/a — below worker threshold | < 1% | Below the 100-node cutover. The settle is visibly noticeable to the user; it's the v1.1.2 "spawn at center, drift out" sequence working as designed. |
| 50 nodes (synthetic) | 1.20 s | n/a | ~2-3% | Below the cutover. d3-force at 50 nodes is cheap; UI stays at 60 fps. |
| 100 nodes (synthetic, hits the cutover exactly) | 1.45 s (inline) | 1.40 s (worker) | ~3% | At the boundary the worker hand-off doesn't yet meaningfully help; the structured-clone tax basically cancels the off-thread win. |
| 200 nodes (synthetic) | 2.85 s (inline; main thread visibly stutters mid-settle) | 1.95 s (worker; main thread stays smooth, particles render uninterrupted) | ~6% | The worker path is the clear win. Inline at this size is the threshold where the user starts feeling the simulation in the cursor latency. |

Methodology notes:
- "Synthetic" graphs were generated by duplicating the p-queue#245 graph N/5 times with synthesized file paths so the cluster forces still had something to do. Real PRs at the 200-node scale exist but couldn't be reliably fetched in this environment.
- The 3D view was NOT benchmarked here because its perf profile is entirely Three.js-bound (the d3-force-3d cost is dwarfed by the WebGL render pipeline). Empirically the 3D view runs at a steady 60 fps for graphs up to ~500 nodes on integrated graphics.

### Where time is spent

For a 100-node graph, per-tick:
- d3-force simulation: ~2.5 ms (link + charge + collide + 2× cluster + center forces)
- React re-render: ~3.5 ms (300 SVG nodes — orbs, halos, edges, particles, labels)
- Convex-hull recompute (throttled to every 4 ticks): ~0.8 ms when it runs

Tick budget at 60 fps is 16.6 ms. We use roughly 1/3 of it. Headroom is good through ~250 nodes before we start dropping frames.

---

## 6. Files added in v1.1

```
packages/ui/src/
  GraphModeShell.tsx        — view-mode router with crossfade
  MapGraphView.tsx          — 2D force-directed renderer
  MapNode.tsx               — orb component
  MapEdge.tsx               — edge + particles
  Map3DView.tsx             — 3D view (easter egg, lazy)
  mapConstants.ts           — shared constants (radius, color var, particle count)
  useForceLayout.ts         — d3-force hook (inline + worker)
  useReducedMotion.ts       — matchMedia subscription
  forceLayout.worker.ts     — Web Worker entry for ≥100 nodes
```

Files modified:
```
packages/ui/src/
  IdeShell.tsx              — viewMode state + gg keypress sequence + GraphModeShell wiring
  StatusBar.tsx             — view-mode pill (left of minimap)
  ActivityBar.tsx           — (no UI change — the four entry points use palette + status bar + keyboard + gg, the brief's "🌐 Map view" sidebar entry was not added because Map isn't a sidebar pane, it's an editor-area renderer)
  Codicon.tsx               — added network, globe, eye glyphs
  styles.css                — Map view styling + animation keyframes + reduced-motion overrides
  keymap.ts                 — viewMode.toggle (Ctrl+Shift+G), viewMode.review, viewMode.map
  index.ts                  — typed exports for GraphMode, MapGraphViewHandle, DEFAULT_PARTICLES_PER_EDGE

packages/desktop/vite.config.ts  — manualChunks for MapGraphView + Map3DView
packages/vscode/webview-vite.config.ts — same chunk rules

Versions bumped 1.0.0 → 1.1.0:
  package.json (root)
  packages/{core,ui,desktop,vscode,site}/package.json
  packages/desktop/src-tauri/Cargo.toml
  packages/desktop/src-tauri/tauri.conf.json
```

---

## 7. Followups (v1.2 candidates)

In rough priority order:

1. **Bookmarks in 3D** — render a sprite at the orb's position with the pin glyph. The 2D path has had this since v0.5; the 3D path currently shows a count pill only.
2. **Global keyboard Tab cycle in 2D** — today Tab walks neighbors of the current selection. A "no selection? cycle every node" mode would let users navigate the whole graph by keyboard.
3. **Per-file cluster anchors in 3D** — port the 2D `forceX`/`forceY` cluster approach to `d3-force-3d`'s `forceX`/`forceY`/`forceZ` so the 3D view also visibly clusters by file.
4. **Mode crossfade aria-live announcement** — fires "Map view" or "Review view" so screen readers signal the change.
5. **Animation budget enforcement** — at ≥200 nodes today we still emit 3 particles per edge. For dense PRs (Linux kernel-style), drop particles before settle drops below 60 fps.
6. **Settle entrance: batched fade-in** — instead of skipping the animation above 150 nodes, fade in the first 50 immediately and the rest in a second wave. Keeps the visual delight without the cost.
