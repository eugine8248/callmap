# callmap v1.2 — Requirements
**Date:** 2026-05-18
**Mode:** Auto (incremental cycle on shipped v1.1.0)
**Author:** desktop-builder requirements-gatherer
**Inputs mined:** V11_REPORT.md §7 (followups), README.md "Roadmap" section, V1_REPORT.md, RELEASE_NOTES_v1.0.md, PM brief hints.

---

## Project Purpose
Ship v1.2 as a **Map-view polish + perf-budget** release that closes the highest-value followups V11_REPORT.md explicitly flagged, plus the three hints the user listed in the cycle brief. v1.2 is not a feature-expansion release (Rust/Java parsers, import-graph resolution, AI summaries are all in the README roadmap as v1.x / v2.x and stay out of scope). The cycle's success metric: every visible "tracked for v1.2" caveat in V11_REPORT can be deleted from the source comments after merge.

## Target Users
Code reviewers. No change from v1.1.

## Target Platforms
- Windows x64 (.exe NSIS + .msi)
- macOS universal (Apple Silicon + Intel) (.dmg)
- Linux x64 (.AppImage)
- VS Code extension (.vsix) — packaged for marketplace upload but publish still blocked on C1
- Min OS versions and arch matrix unchanged from v1.1.0

## Core Features

### Must-Have (v1.2 scope — picked from V11_REPORT §7 + brief hints)

**M1. Curved / routed edges in the 2D Map view** *(brief hint #1, blocks the v1.1 comment in `MapEdge.tsx` that says "Curving them via a quadratic control point would obscure cluster hulls")*
- Add a quadratic-Bezier curve when an edge crosses **outside its source/target's cluster convex hull bbox** (the edge is "cross-cluster"). Intra-cluster edges stay straight to preserve density legibility.
- The `<animateMotion mpath>` particle path picks up the curve for free — the whole reason the v1.1 brief picked animateMotion was so that v1.2 could do this without a particle-system rewrite.
- Control point: 25% perpendicular offset on the segment midpoint, sign chosen so the curve bows **away from** the canvas center (so a 6-cluster ring doesn't have all edges arching into the middle).
- Re-validate hull computation does not visibly hitch — V11_REPORT §5 says convex-hull is ~0.8 ms throttled to every 4 ticks; curve recompute joins that throttle.

**M2. Zoom-gated particle rendering** *(brief hint #2, explicitly noted in V11_REPORT.md §2 as "Future: zoom < 0.5 ... not yet applied to particles")*
- When the view transform's scale is `< 0.5`, drop `particles` to 0 for all edges.
- Add hysteresis: re-enable at `> 0.55` to avoid flicker when the user zooms near the boundary.
- Wire through the existing `edgeRender` memo in MapGraphView; no new prop on MapEdge.

**M3. 3D chunk size tuning** *(brief hint #3, V11_REPORT.md §3 says the chunk is 367.88 KB gzip and no hard cap was set)*
- Audit `Map3DView.tsx` imports for tree-shake leaks. Specifically: confirm we only import the three.js modules `react-force-graph-3d` actually re-exports, and drop any deep `three/examples/jsm/*` paths we don't use.
- Target: bring gzip chunk from ~368 KB to **≤ 300 KB**. If the cap can't be hit without dropping a feature, accept the smallest reduction we can prove and document the leak source.
- Side improvement: split `react-force-graph-3d` from `three` into separate manual chunks so cold-cache fetch parallelizes.

**M4. Animation budget enforcement** *(V11_REPORT §7 item 5)*
- At ≥ 200 nodes, drop `DEFAULT_PARTICLES_PER_EDGE` from 3 → 1 automatically.
- At ≥ 350 nodes, drop to 0 (rely on edge stroke + hover speed-up only).
- New shared helper `particlesForNodeCount(n)` in `mapConstants.ts` so 2D and 3D use the same ladder.
- Counterpart for `linkDirectionalParticles` on the 3D path uses the same ladder.

**M5. Per-file cluster anchors in 3D** *(V11_REPORT §7 item 3 — quoted as a "v1.2 followup" in the report itself)*
- Port the 2D `forceX`/`forceY` per-cluster anchor approach to `d3-force-3d`'s `forceX` / `forceY` / `forceZ`.
- Grid layout becomes a cube-ish lattice: clusters anchor on a √³(C) lattice centered on origin, lattice spacing scales with cluster count using the same `max(180, 90 + N*12)` rule scaled by 1.0 (3D nodes use the same orb diameter).
- `react-force-graph-3d` supports custom `d3Force` injection per simulation dim — no fork needed.

**M6. Global keyboard Tab cycle in 2D** *(V11_REPORT §7 item 2)*
- When **no node is selected**, Tab cycles every node in a deterministic order: sort by `(file, line)` ascending, then by `qualifiedName`. Shift+Tab walks backwards.
- When a node IS selected, current "neighbors by-degree" behavior stays.
- Esc clears selection (already wired).
- Enter on a Tab-focused node opens the source panel (Enter binding was flagged unwired in V11_REPORT §4 — explicit accessibility ask, wire it).

**M7. Mode crossfade aria-live announcement** *(V11_REPORT §7 item 4)*
- Add a `role="status"` `aria-live="polite"` element to `GraphModeShell.tsx` that updates with `"Map view"` or `"Review view"` on each toggle.
- Same element used for "3D view enabled" on `gg` activation.

### Nice-to-Have (defer if scope creeps)

**N1. Bookmarks in 3D** (V11_REPORT §7 item 1) — render a sprite at the orb position with the pin glyph. Sprite asset is reusable from the 2D path (small SVG → PNG transcode at build time). If M1–M7 land in budget, fold this in. Otherwise it's a v1.3 candidate.

**N2. Settle entrance batched fade-in** (V11_REPORT §7 item 6) — first 50 nodes fade immediately, rest in a second wave. Pure perf-feel work, only useful at ≥ 150 nodes which most real PRs don't hit.

### Out of Scope (deferred to v1.x / v2.x per README roadmap)
- Rust + Java parsers (README "v1.x")
- Import-graph aware cross-file resolution (README "v1.x")
- One-hop external callee fetching (README "v1.x")
- AI-generated function summaries (README "v2.x")
- Code signing — `C1` style external NEEDS_APPROVAL; v1.0 README claimed v1.1 would sign, v1.1 did not, this remains user-action and is **not** v1.2 scope unless user supplies certs mid-cycle.
- VS Code Marketplace publisher onboarding (`C1` in NEEDS_APPROVAL.md — user-owned)
- Docs domain (`C2` — user-owned)

## Framework
- Tauri 2 (unchanged from v1.1)
- Frontend: React 18 + TypeScript + Vite
- Backend: Rust (Tauri shell) + Node.js (VS Code extension host)

## Phases
Discovery → Design → Build → QA → Package (default).

## Design Preferences
- Inherit v1.1 — VS Code-flavored dark UI, diff-palette colors, no new branding.
- Curved edges (M1) must NOT introduce new colors. Reuse the existing edge gradient stops.
- Aria-live status element (M7) is visually hidden (`.visually-hidden` class — add if not present in styles.css).

## Connectivity
Online only (GitHub REST API). Unchanged.

## File System Access
None added in v1.2.

## OS Integration
None added in v1.2. The existing Tauri menu, status bar, and command palette are unchanged.

## Auto-Update
Not in v1.2 scope (would need code-signing infrastructure that is still `NEEDS_APPROVAL`-blocked).

## Local Database
None.

## External APIs
GitHub REST (unchanged).

## Authentication
GitHub PAT in desktop, host session reuse in VS Code — unchanged.

## Packaging & Distribution
- Same artifact set as v1.1: NSIS + MSI for Windows, DMG for macOS universal, AppImage for Linux, VSIX for VS Code.
- Versions bumped 1.1.0 → 1.2.0 across all `package.json` files, `Cargo.toml`, and `tauri.conf.json`.

## Timeline & Constraints

### Bundle-size budgets (hard)
- 3D chunk gzip: **≤ 300 KB** (down from 367.88 KB) — M3 success criterion
- Desktop installer total: ≤ 3 MB raw, ≤ 7 MB DMG
- VSIX size: ≤ 700 KB (was 644 KB at v1.0, drift OK if particles helper adds < 1 KB)

### Performance budgets (carried from V11_REPORT §5)
- 100-node first settled paint ≤ 1.6 s (was 1.45 s)
- Idle CPU during pulse ≤ 5% at 100 nodes
- 60 fps must hold through 250 nodes (the v1.1 ceiling). With M4 the new ceiling target is **350 nodes** at 60 fps.

### Accessibility
- All v1.1 affordances continue to pass.
- M6 + M7 close two of the four "❌"-marked rows in V11_REPORT §4.
- WCAG AA color contrast preserved on curved edges (M1 should not alter stroke opacity).

### Compat / regression
- No breaking changes to `@callmap/core` public API.
- No new keymap clashes — M6 (Tab) already works at the window level; ensure source-panel close button etc. still tabbable.

---

## Risks / open issues for downstream specialists

1. **Curve direction sign** (M1): UX-Designer must decide whether the perpendicular offset bows away from canvas center, away from the **midpoint of the two cluster centroids**, or always to the +y side. Recommendation: away from canvas center for visual symmetry. Confirm in design phase.
2. **3D cluster lattice degenerates at C=1** (M5): if a PR touches one file, there's nothing to anchor. Fall back to the existing no-cluster forces.
3. **Tab-cycle focus ring vs. selection ring** (M6): the focus ring and selection ring use the same `--accent` color today. Need a distinct unselected-but-focused state. UX-Designer to spec.
4. **3D chunk reduction may require dropping `linkDirectionalParticles`** (M3): if particles are pulled in from a sub-module of three, dropping them might be the cheapest path to ≤ 300 KB. Trade-off acceptable since M4's ladder already kills 3D particles at high node counts.

---

## Handoff
Next specialist: **ux-designer**. Read this file fully, with priority on M1 (curve geometry), M5 (3D lattice layout), and M6/M7 (a11y wiring). The cybersecurity gate runs unchanged at end of Build — no new IPC, no new file-system, no new secrets in v1.2, so v1.2 should clear cybersec on a confirmation review only.
