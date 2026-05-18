// v1.1.0 — Edge for the Map view. SVG path with a per-edge gradient
// stroke (source-color → target-color). Particle flow lands in v1.1.2;
// we already give the path a stable `id` so the <animateMotion> can
// attach via mpath.
//
// We intentionally render edges as straight lines for v1.1.0. Curving
// them via a quadratic control point would obscure cluster hulls.

import { memo } from "react";
import { mapNodeColorVar } from "./MapNode";

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

  return (
    <g className="map-edge" style={{ transition: "opacity 200ms ease-out" }}>
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
        d={`M${x1},${y1} L${x2},${y2}`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={external && !highlighted ? "3 3" : undefined}
        fill="none"
        opacity={opacity}
        pointerEvents="none"
      />
    </g>
  );
}

export default memo(MapEdgeImpl);
