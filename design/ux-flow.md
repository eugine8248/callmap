# callmap v1.2 — UX Flow (incremental)

v1.2 introduces **no new windows, no new views, no new modals**. It refines existing 2D Map and 3D Map renderers and adds two accessibility wirings. Below documents only the deltas from v1.1.

## Window List (unchanged)
| Window | Type | Purpose |
|--------|------|---------|
| Main (IdeShell) | primary | All callgraph + Map view rendering |
| Source panel | inline slide-over (within Main) | Read-only source preview |
| Command palette | overlay | Keyboard-driven actions |
| Find widget | overlay | Function name search within graph |

## View Transitions (delta)
- **Mode flip (Review ↔ Map)** now emits an `aria-live="polite"` announcement: `"Map view"`, `"Review view"`, or `"3D view"`.
- **3D activation** (`gg` easter egg) is now announced through the same live region with `"3D view loaded"` after the Suspense chunk resolves.

## Navigation Map (no changes)
v1.1 wiring stands. The new aria-live status node is a sibling of GraphModeShell's content root and is `position: absolute; clip: rect(0 0 0 0)` so it's screen-reader-only.

## Keyboard Shortcuts Map (delta)

| Shortcut (mac) | Shortcut (win/linux) | Action | Where it works | Status |
|----------------|----------------------|--------|----------------|--------|
| Tab            | Tab                  | Cycle to next node, deterministic order `(file, line, qualifiedName)` when no selection; cycle by-degree neighbor when selection exists | 2D Map view focused | **v1.2 NEW (M6)** |
| Shift+Tab      | Shift+Tab            | Cycle backwards through the same order | 2D Map view focused | **v1.2 NEW (M6)** |
| Enter          | Enter                | Open source panel for the Tab-focused node | 2D Map view focused | **v1.2 NEW (M6)** |
| Esc            | Esc                  | Clear selection / focused node | Anywhere in Map | unchanged (v1.1) |
| Cmd+Shift+G    | Ctrl+Shift+G         | Toggle Review/Map view | global | unchanged (v1.1) |
| `g`,`g`        | `g`,`g`              | Activate 3D view (easter egg) | Map mode | unchanged (v1.1) |

## Drag-Drop / Right-Click (no changes)

## v1.2 Visual Behaviours

### M1 — Curved cross-cluster edges (2D)
- An edge is "cross-cluster" when its source-node and target-node belong to **different file clusters** (their cluster anchor IDs differ).
- Cross-cluster edges render as quadratic Bezier (single control point); intra-cluster edges remain straight.
- Control point geometry:
  - Midpoint M = ((x1+x2)/2, (y1+y2)/2)
  - Perpendicular unit vector P = (-dy/L, dx/L) where L = segment length
  - Offset magnitude k = `min(60, L * 0.25)`  (cap so a very long edge doesn't bow off-canvas)
  - Sign: choose the sign that puts the control point on the side **further from canvas center C**. This guarantees no edge bows through the densest screen region.
  - Control = M + sign * k * P
- SVG path becomes `M x1,y1 Q cx,cy x2,y2`.
- `<animateMotion mpath>` follows the curve automatically — no particle code change beyond the new `d` string.
- Hover / selection styling unchanged.

### M2 — Zoom-gated particles
- The current view-transform `scale` is already tracked in MapGraphView state (used for label opacity gating).
- New rule: when `scale < 0.5`, `particles = 0` regardless of edge state.
- Hysteresis: once particles are off, they only re-enable when `scale > 0.55`. State is a single boolean `particlesEnabledByZoom` driven by an effect on scale.

### M4 — Animation budget ladder
| Node count | Particles per edge (2D + 3D) |
|-----------:|-----------------------------:|
| n < 200    | 3 (current default) |
| 200 ≤ n < 350 | 1 |
| n ≥ 350    | 0 |
- 3D side: same ladder fed into `linkDirectionalParticles` on the `ForceGraph3D` instance (if the prop survives M3's chunk reduction — see component-map note on Map3DView).

### M5 — 3D cluster lattice
- Cube lattice with side length `S = ceil(C^(1/3))` clusters per axis.
- Lattice cell size = `max(180, 90 + N*12)` (same formula as 2D 2D grid; N = number of clusters).
- Origin is grid center; cluster i at lattice index `(ix, iy, iz)` anchors at `((ix - (S-1)/2) * cell, (iy - (S-1)/2) * cell, (iz - (S-1)/2) * cell)`.
- Each anchor injected via `forceX(ax)`, `forceY(ay)`, `forceZ(az)` with strength `0.18` (matches 2D).
- C=1 edge case: skip cluster forces entirely (let force-graph-3d's default forces handle the single-cluster case).

### M6 — Focus ring vs selection ring
- Today: selected node ring = `--accent`, full opacity, drawn behind orb.
- v1.2: introduce **tab-focused-but-not-selected** state = `--accent` ring at 50% opacity, dashed `2 2`.
- When user presses Enter on a focused node, focused becomes selected and ring becomes solid full-opacity (current v1.1 styling).

### M7 — aria-live announcements
- New `<span role="status" aria-live="polite" className="map-aria-live">` mounted inside `GraphModeShell.tsx`.
- Visual style: visually hidden via:
  ```css
  .map-aria-live {
    position: absolute;
    width: 1px; height: 1px;
    margin: -1px; padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  ```
- Content updates: `"Map view"` / `"Review view"` on mode toggle, `"3D view loaded"` when Map3DView resolves.
