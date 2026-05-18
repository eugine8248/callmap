# callmap v1.2 — Component Map (delta)

Only components touched by v1.2 are listed. All other v1.1 components are unchanged.

## MapEdge (modified)
- **Type:** SVG fragment (memoized)
- **New props:**
  - `curved: boolean` — when true, render quadratic Bezier instead of straight line
  - `controlX: number` — Bezier control point X (only used when `curved`)
  - `controlY: number` — Bezier control point Y (only used when `curved`)
- **States:** unchanged (ambient | highlighted | faded | external)
- **Used in:** MapGraphView
- **Notes:** When `curved`, `d = "M x1,y1 Q controlX,controlY x2,y2"`. `<mpath href={"#"+id}>` automatically picks up the curve for particles.

## MapGraphView (modified)
- **Type:** SVG container + force-simulation host
- **New responsibilities:**
  - Compute per-edge `curved` + `controlX/Y` in the `edgeRender` memo. Cross-cluster detection compares `sourceNode.cluster` vs `targetNode.cluster` already present in the force-layout result.
  - Track `particlesEnabledByZoom` boolean derived from transform scale with hysteresis at 0.5 / 0.55.
  - Compute `effectiveParticlesPerEdge = particlesForNodeCount(nodeCount)` from `mapConstants.ts` (M4).
  - Combine: `particles = particlesEnabledByZoom && !reducedMotion ? effectiveParticlesPerEdge : 0`
  - Tab key handling: when no selection, advance through nodes sorted by `(file, line, qualifiedName)`. Maintain `focusedNodeId` separate from `selectedNodeId`. Enter promotes focused → selected.
- **States:** unchanged
- **Notes:** Tab handler must not collide with the find-widget focus or the source-panel close button. Use `event.target` instance-of check — only intercept Tab when target is inside the map container AND not inside an input.

## Map3DView (modified)
- **Type:** Lazy React component wrapping `react-force-graph-3d`
- **New responsibilities (M5):**
  - Compute per-cluster lattice anchors as a Map<clusterId, {ax, ay, az}>.
  - Inject `d3Force` for `forceX`, `forceY`, `forceZ`, each strength 0.18, value = lookup by node's clusterId.
  - Fallback to default forces when C=1.
- **M3 import audit:**
  - Drop deep imports from `three/examples/jsm/*` unless required.
  - Verify `import ForceGraph3D from 'react-force-graph-3d'` is the only entry point and the bundler is not pulling in `2d` siblings.
  - Confirm `linkDirectionalParticles` is supplied at the value `effectiveParticlesPerEdge` (M4); when 0, the upstream library skips its internal particle setup.
- **States:** unchanged
- **Notes:** No new public props.

## GraphModeShell (modified — M7)
- **Type:** view-mode router with crossfade
- **New responsibilities:**
  - Mount a single `<span role="status" aria-live="polite" className="map-aria-live">` that mirrors the current `viewMode`.
  - On mode change, update text to `"Map view"`, `"Review view"`, or `"3D view"`. Polite live region fires on update.
  - When the lazy `Map3DView` Suspense fallback resolves (use a useEffect on a child-rendered sentinel or a Suspense+resolve callback), update text to `"3D view loaded"`.
- **Notes:** Only one live region in the whole app. Don't duplicate in MapGraphView.

## mapConstants.ts (modified)
- **Type:** module
- **New exports:**
  - `function particlesForNodeCount(n: number): number` — returns 3 / 1 / 0 per the M4 ladder.
  - `const ZOOM_PARTICLE_OFF = 0.5` and `const ZOOM_PARTICLE_ON = 0.55` (hysteresis thresholds).
  - `const CURVE_OFFSET_MAX = 60` (px, max perpendicular offset).
  - `const CURVE_OFFSET_RATIO = 0.25` (multiplier on edge length).
- **Notes:** Pure consts + one helper; no React, no side effects. Bundle size impact: < 1 KB.

## styles.css (modified)
- **New rule:** `.map-aria-live` — see ux-flow.md M7 for full CSS.
- **New rule:** `.map-node-focused-ring` — dashed `2 2`, `--accent` at 50% opacity, drawn as separate `<circle>` element with `pointer-events: none`.
- **No new keyframes.**

## keymap.ts (modified)
- **New entry:** Tab / Shift+Tab in Map mode are tracked, but the actual key handling stays inside MapGraphView (window-level capture remains; keymap.ts is the source of truth for help-text).
- **New entry:** `Enter` (Map mode, focused-node-set) → `node.open-source`.

## useForceLayout.ts (modified)
- Already exposes `cluster` per node in v1.1 (used for forceX/Y).
- No changes needed for 2D.
- For 3D usage (M5): expose the same cluster + anchor data shape so Map3DView can build the lattice without duplicating the cluster discovery code. New optional 3rd argument or return field carrying `clusterAnchors3D: Map<clusterId, {ax, ay, az}>` computed lazily.

## forceLayout.worker.ts (unchanged for v1.2)
The worker continues to handle ≥ 100 node 2D simulations. Curved edges are a render-time decision; the worker doesn't need to know.

---

## Component count
- Modified: 6 source files + 1 css + 1 keymap
- New: 0
- Removed: 0

## Platform variations
None — all changes are renderer-side (works identically in Tauri webview and VS Code webview).

## Cybersecurity surface impact
Zero new IPC, zero new file-system access, zero new network endpoints, zero new dependencies (the audit in M3 will likely *remove* dep surface). Cybersec gate should clear on a confirmation-only review.
