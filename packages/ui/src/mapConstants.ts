// v1.1.0 — Shared constants for the Map view (2D + 3D).
//
// These live in their own tiny module so both Map chunks can reference
// them without pulling each other in via Rollup's manual-chunk graph.
// The number of particles per edge is the most-tweaked knob; isolating
// it here means "change one number to re-balance density" with no
// chunk-graph fallout.

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
