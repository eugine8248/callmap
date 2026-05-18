# callmap v1.2.0 — Map view polish

callmap v1.2 is a focused polish release on top of v1.1's Map view. It
closes the highest-priority follow-ups from `V11_REPORT.md §7` and the
three engineering hints flagged in the v1.2 brief: curved/routed edges,
zoom-gated particles, and 3D chunk tuning. No new languages, no new
features beyond the renderer — those continue on the v1.x and v2.x
tracks documented in the README roadmap.

## What's new

### Curved cross-cluster edges (M1)
The 2D Map view now renders cross-cluster edges as quadratic Bezier
curves instead of straight lines. Intra-cluster edges stay straight so
the per-file groupings remain visually dense. Curve direction is
chosen so the control point sits *away from* the canvas center, which
keeps the densest part of the viewport readable in graphs with many
clusters. Particle flow (`<animateMotion mpath>`) follows the curve
for free — no separate particle-system code path.

### Zoom-gated particles (M2)
When the user zooms below 0.5 the particles read as noise rather than
flow. They now drop to zero at `scale < 0.5` and only return above
`scale > 0.55` (hysteresis prevents flicker near the boundary).

### Animation budget ladder (M4)
Particle count automatically de-escalates as the graph grows:
- `n < 200`: 3 particles per edge (unchanged)
- `200 ≤ n < 350`: 1 particle per edge
- `n ≥ 350`: 0 particles
The same ladder drives both the 2D Map's SVG `<animateMotion>` and the
3D view's `linkDirectionalParticles` so dense PRs hold 60 fps without
hand-tuning.

### Per-file cluster anchors in 3D (M5)
The 3D view now lays its clusters on a cube-ish lattice. Each cluster
gets an `(ax, ay, az)` anchor (lattice spacing matches the 2D grid
formula). `d3-force-3d`'s `forceX`/`forceY`/`forceZ` are injected into
the `react-force-graph-3d` instance via its `d3Force(name, fn)` API.
Result: same per-file clustering you see in 2D, in 3D.

### Global Tab cycle + Enter (M6)
With nothing selected, Tab now cycles every node in a deterministic
order — sorted by `(file, line, qualifiedName)` so the walk is
predictable across renders. The Tab-focused node gets a dashed
half-opacity ring so it's distinguishable from the solid selection
ring. Enter promotes the focused node to selected, which opens the
source panel. Shift+Tab walks backwards. Tab-while-selected still
cycles by-degree neighbours (v1.1 behaviour, unchanged).

### aria-live mode announcements (M7)
A visually-hidden `<span role="status" aria-live="polite">` now
announces `"Map view"`, `"Review view"`, or `"3D view loaded"` on
every mode flip and on the lazy 3D chunk's resolution. Screen-reader
users now get audible feedback when the renderer swaps under them.

### 3D chunk split (M3)
The combined `Map3DView` chunk (368 KB gzip in v1.1) is split into
two chunks in v1.2:
- `three.js` — 353.47 KB gzip
- `Map3DView` wrapper + `react-force-graph-3d` + d3-force-3d — 15.60 KB gzip

The combined cold-cache transfer is still ~369 KB gzip (three.js is
the floor), but the two chunks now fetch in parallel and cache
separately. A user toggling between 3D-loaded sessions hits the
`three.js` cache instead of re-downloading the whole pile.

## Compatibility

- No breaking changes to `@callmap/core`'s public API.
- No new IPC channels or Tauri commands.
- No new permissions, no new file-system access.
- All v1.1 keybindings still work. Two new bindings (Tab global, Enter)
  are append-only.

## Bundle sizes

| Artifact | v1.1 | v1.2 | Delta |
|----------|-----:|-----:|------:|
| Windows MSI | 2.85 MB | 2.97 MB | +0.12 MB |
| Windows NSIS .exe | 2.30 MB | 2.40 MB | +0.10 MB |
| VSIX | ~1 MB | 1.02 MB | flat |
| Initial JS bundle (gzip) | 153 KB | 153 KB | flat |
| 3D chunk family (gzip) | 368 KB (monolithic) | 369 KB (split: 354 + 16) | +1 KB |

## What's *not* in v1.2

Per requirements.md, the following remain on the roadmap and were not
shipped in v1.2:

- Rust + Java tree-sitter grammars (v1.x — README roadmap)
- Import-graph aware cross-file resolution (v1.x)
- One-hop external callee fetching (v1.x)
- AI-generated function summaries (v2.x)
- Code-signed installers (still pending Apple Developer + Windows EV
  certs — see NEEDS_APPROVAL.md)
- VS Code Marketplace publisher onboarding (NEEDS_APPROVAL C1)
- Docs domain (NEEDS_APPROVAL C2)
- 3D bookmark sprites (V11_REPORT §7 item 1 — v1.3 candidate)
- Settle-entrance batched fade-in (V11_REPORT §7 item 6 — v1.3
  candidate)

## Install

Same channels as v1.0/v1.1: download from the GitHub Releases page or
install the VS Code extension once published. Installers are still
unsigned — Windows SmartScreen / macOS Gatekeeper will warn on first
launch.

## Thanks

To everyone who paid attention to the v1.1 Map view's caveats long
enough to file the followups that became v1.2's scope.
