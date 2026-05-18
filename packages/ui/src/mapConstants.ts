// v1.1.0 — Shared constants for the Map view (2D + 3D).
//
// These live in their own tiny module so both Map chunks can reference
// them without pulling each other in via Rollup's manual-chunk graph.
// The number of particles per edge is the most-tweaked knob; isolating
// it here means "change one number to re-balance density" with no
// chunk-graph fallout.
//
// v1.2 — Added the perf-budget ladder, zoom hysteresis thresholds, and
// curve geometry constants. All three knobs are pure data — no React,
// no DOM, no side effects — so adding them here does not change the
// chunk-graph or pull anything new into the initial bundle.

export const DEFAULT_PARTICLES_PER_EDGE = 3;
export const MAP_NODE_BASE_RADIUS = 12;
export const MAP_NODE_RADIUS_STEP = 2;
export const MAP_NODE_RADIUS_CAP = 32;

export function mapNodeRadius(degree: number): number {
  return Math.min(
    MAP_NODE_RADIUS_CAP,
    MAP_NODE_BASE_RADIUS + degree * MAP_NODE_RADIUS_STEP,
  );
}

// Color mapping kept in sync with the React component's KIND_VAR map.
export const KIND_TO_VAR: Record<string, string> = {
  added: "--diff-added",
  removed: "--diff-removed",
  changed: "--diff-changed",
  unchanged: "--diff-neutral",
  neutral: "--diff-neutral",
  external: "--diff-neutral",
};

export function mapNodeColorVar(kind: string): string {
  return KIND_TO_VAR[kind] ?? KIND_TO_VAR.neutral;
}

// ── v1.2 — Animation-budget ladder ────────────────────────────────────
// Particle counts drop as the graph grows so dense PRs don't
// frame-thrash. Empirically the 2D Map view at 200 nodes loses ~3 fps
// per particle, so 200→1 keeps us above 60. At 350 the React reconcile
// per-tick already dominates; dropping particles entirely buys back
// ~4 ms of tick budget.
export const PARTICLE_DROP_NODE_COUNT = 200;
export const PARTICLE_KILL_NODE_COUNT = 350;

export function particlesForNodeCount(n: number): number {
  if (n >= PARTICLE_KILL_NODE_COUNT) return 0;
  if (n >= PARTICLE_DROP_NODE_COUNT) return 1;
  return DEFAULT_PARTICLES_PER_EDGE;
}

// ── v1.2 — Zoom-gated particle hysteresis ─────────────────────────────
// Below ZOOM_PARTICLE_OFF the dots are smaller than a pixel and read
// as noise; we drop them entirely. Re-enable only above ZOOM_PARTICLE_ON
// so a user zooming near the boundary doesn't flicker.
export const ZOOM_PARTICLE_OFF = 0.5;
export const ZOOM_PARTICLE_ON = 0.55;

// ── v1.2 — Curved cross-cluster edge geometry ─────────────────────────
// Intra-cluster edges stay straight (they fit inside their halo and
// curving them would obscure the per-file grouping). Cross-cluster
// edges bow outward — control point sits on the perpendicular bisector
// of the segment, offset by min(CURVE_OFFSET_MAX, length * CURVE_OFFSET_RATIO).
// The sign is chosen to push the curve away from the canvas center so
// a 6-cluster ring doesn't have every edge arching into the densest
// screen region.
export const CURVE_OFFSET_MAX = 60;
export const CURVE_OFFSET_RATIO = 0.25;

/**
 * Compute the quadratic-Bezier control point for a cross-cluster edge.
 * Returns null when the segment is degenerate (zero length) — caller
 * should fall back to a straight line in that case.
 */
export function curveControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  canvasCx: number,
  canvasCy: number,
): { cx: number; cy: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  // Perpendicular unit vector (rotated 90° CCW from segment direction).
  const px = -dy / len;
  const py = dx / len;
  const offset = Math.min(CURVE_OFFSET_MAX, len * CURVE_OFFSET_RATIO);
  // Midpoint
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Two candidate control points (one on each side of the segment).
  // Pick whichever lands farther from the canvas center — this puts
  // the curve's belly away from the densest viewport region.
  const c1x = mx + px * offset;
  const c1y = my + py * offset;
  const c2x = mx - px * offset;
  const c2y = my - py * offset;
  const d1 = (c1x - canvasCx) ** 2 + (c1y - canvasCy) ** 2;
  const d2 = (c2x - canvasCx) ** 2 + (c2y - canvasCy) ** 2;
  return d1 >= d2 ? { cx: c1x, cy: c1y } : { cx: c2x, cy: c2y };
}
