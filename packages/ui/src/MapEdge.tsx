// v1.1.0 — Edge for the Map view. SVG path with a per-edge gradient
// stroke (source-color → target-color). Particle flow lands in v1.1.2;
// we already give the path a stable `id` so the <animateMotion> can
// attach via mpath.
//
// v1.2 — Cross-cluster edges now render as a quadratic Bezier. The
// caller (MapGraphView) supplies a precomputed control point; we keep
// the geometry math in mapConstants so MapEdge stays render-only.
// Because <animateMotion mpath> follows the path attribute verbatim,
// particles automatically ride the curve with no extra code.

import { memo } from "react";
import { mapNodeColorVar } from "./mapConstants";

interface Props {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceKind: string;
  targetKind: string;
  external: boolean;
  /** True when one endpoint is the selected node — promote color/opacity. */
  highlighted: boolean;
  /** True when nothing is selected — base styling. */
  ambient: boolean;
  /** True when selection is active but this edge is not adjacent — dim hard. */
  faded: boolean;
  /**
   * v1.1.2 — Particle count for this edge. 0 = particles disabled (used
   * when reduced-motion is on, when zoom is too small to be visible, or
   * when a perf budget forces us to drop them).
   */
  particles: number;
  /**
   * v1.1.2 — Per-edge animation duration. Drops to 2000ms when the user
   * hovers either endpoint. The transition is driven by CSS keyframe
   * `animation-duration` updating mid-animation.
   */
  particleDurationMs: number;
  /**
   * v1.2 — Quadratic-Bezier control point for cross-cluster edges.
   * When both `controlX` and `controlY` are finite numbers the path
   * is rendered as `M x1,y1 Q controlX,controlY x2,y2`. Otherwise the
   * path is the straight line used in v1.1.
   *
   * The `<animateMotion mpath>` element references the same path id so
   * particles automatically follow the curve.
   */
  controlX?: number;
  controlY?: number;
}

function MapEdgeImpl({
  id,
  x1,
  y1,
  x2,
  y2,
  sourceKind,
  targetKind,
  external,
  highlighted,
  ambient,
  faded,
  particles,
  particleDurationMs,
  controlX,
  controlY,
}: Props) {
  const sourceColor = `var(${mapNodeColorVar(sourceKind)})`;
  const targetColor = `var(${mapNodeColorVar(targetKind)})`;
  const gradientId = `grad-${id}`;
  // Edge opacity tiers per spec:
  //   • ambient (no selection):       0.30
  //   • highlighted (touches sel):    1.00 + accent
  //   • faded (other edge, sel set):  0.08
  //   • external w/o selection:       extra 0.6× multiplier
  let opacity = 0.3;
  if (highlighted) opacity = 1;
  else if (faded) opacity = 0.08;
  else if (external && ambient) opacity = 0.18;
  const stroke = highlighted ? "var(--accent)" : `url(#${gradientId})`;
  const strokeWidth = highlighted ? 1.5 : 0.9;

  // v1.2 — curved when caller supplied a control point.
  const curved =
    typeof controlX === "number" &&
    typeof controlY === "number" &&
    Number.isFinite(controlX) &&
    Number.isFinite(controlY);
  const d = curved
    ? `M${x1},${y1} Q${controlX},${controlY} ${x2},${y2}`
    : `M${x1},${y1} L${x2},${y2}`;

  return (
    <g
      className="map-edge"
      role="presentation"
      aria-hidden="true"
      style={{ transition: "opacity 200ms ease-out" }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        >
          <stop offset="0%" stopColor={sourceColor} />
          <stop offset="100%" stopColor={targetColor} />
        </linearGradient>
      </defs>
      <path
        id={id}
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={external && !highlighted ? "3 3" : undefined}
        fill="none"
        opacity={opacity}
        pointerEvents="none"
      />
      {/* v1.1.2 — Particle flow. We render N small circles, each riding
          the edge path via <animateMotion mpath>. Begin offsets are
          staggered so the particles are evenly distributed along the
          path. Faded edges drop their particles entirely so the screen
          isn't a soup of dots when the user has a selection.
          dx = (duration / N), so for N=3 + 4000ms we begin at 0s, 1.33s, 2.67s.

          v1.2 — When the path is curved, <animateMotion mpath> follows
          the Bezier automatically; no extra code needed here. */}
      {!faded && particles > 0 && (
        <>
          {Array.from({ length: particles }, (_, i) => {
            const stagger = (particleDurationMs / particles) * i;
            return (
              <circle
                key={`p${id}-${i}`}
                r={2}
                fill="rgba(255,255,255,0.9)"
                opacity={highlighted ? 1 : 0.7}
                className="map-edge-particle"
                pointerEvents="none"
              >
                <animateMotion
                  dur={`${particleDurationMs}ms`}
                  begin={`${-stagger}ms`}
                  repeatCount="indefinite"
                  rotate="auto"
                  keyTimes="0;1"
                  keyPoints="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#${id}`} />
                </animateMotion>
                {/* Fade in at start, out at end — the opacity keyframes
                    are tied to the same begin offset so each particle's
                    visibility hump matches its motion phase. */}
                <animate
                  attributeName="opacity"
                  dur={`${particleDurationMs}ms`}
                  begin={`${-stagger}ms`}
                  repeatCount="indefinite"
                  values={highlighted ? "0;1;1;0" : "0;0.7;0.7;0"}
                  keyTimes="0;0.15;0.85;1"
                />
              </circle>
            );
          })}
        </>
      )}
    </g>
  );
}

export default memo(MapEdgeImpl);
