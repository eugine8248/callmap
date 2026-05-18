// v1.2 — Minimal ambient declarations for d3-force-3d.
//
// The library ships ES modules with JSDoc only — no TypeScript types
// or @types package on npm. We only consume `forceX`, `forceY`, and
// `forceZ`, each returning a force function with a `.strength(n)`
// chainable. The full API surface is much larger; we declare just what
// `Map3DView.tsx` references so the chunk impact is exactly zero
// (declaration files are erased at build time).

declare module "d3-force-3d" {
  type ForceFn<Node> = ((alpha: number) => void) & {
    initialize?: (nodes: Node[]) => void;
  };

  interface PositionForce<Node> extends ForceFn<Node> {
    strength(s: number): PositionForce<Node>;
    strength(): number;
  }

  export function forceX<Node = unknown>(
    x: number | ((node: Node) => number),
  ): PositionForce<Node>;
  export function forceY<Node = unknown>(
    y: number | ((node: Node) => number),
  ): PositionForce<Node>;
  export function forceZ<Node = unknown>(
    z: number | ((node: Node) => number),
  ): PositionForce<Node>;
}
