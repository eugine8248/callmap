// v1.1.0 — Orb node for the Map view. Sized by degree, colored by
// diff kind, dimmed for external nodes. Selected node gets the accent
// ring; click-to-isolate fades non-neighbors to 0.25.
//
// v1.1.1 will add the idle breathing + hover halo here; v1.1.2 adds
// the selected-throb. We pre-wire CSS classes so those phases only
// touch styles.css.

import { memo } from "react";
import type { ChangedFunction } from "@callmap/core";
import { mapNodeRadius, mapNodeColorVar } from "./mapConstants";

// Re-export so existing imports `import { mapNodeRadius } from
// "./MapNode"` keep working in MapGraphView.tsx without a sweep.
export {
  mapNodeRadius,
  mapNodeColorVar,
  MAP_NODE_BASE_RADIUS,
  MAP_NODE_RADIUS_STEP,
  MAP_NODE_RADIUS_CAP,
} from "./mapConstants";

interface Props {
  fn: ChangedFunction;
  x: number;
  y: number;
  degree: number;
  selected: boolean;
  /**
   * v1.2 — Tab-focused but not yet selected. Rendered with a 50%-opacity
   * dashed `--accent` ring so the user can tell the focus moved without
   * confusing it with the solid selection ring.
   */
  focused?: boolean;
  bookmarked: boolean;
  /** Non-neighbor when something else is selected. */
  dimmed: boolean;
  /** v1.1.1+ — disable animation classes when prefers-reduced-motion. */
  reducedMotion: boolean;
  /** v1.1.2 — pulse selected node body. */
  animateSettle: boolean;
  /** Map of breathing delays so phases differ per node — pre-seeded by parent. */
  breathingDelay: number;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Label is fully visible on hover regardless of zoom. */
  labelOpacity: number;
  /** Show label string (truncated function name). */
  label: string;
}

function MapNodeImpl({
  fn,
  x,
  y,
  degree,
  selected,
  focused = false,
  bookmarked,
  dimmed,
  reducedMotion,
  animateSettle,
  breathingDelay,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  labelOpacity,
  label,
}: Props) {
  const r = mapNodeRadius(degree);
  const isExternal = fn.kind === "external";
  const colorVar = mapNodeColorVar(fn.kind);
  // External nodes are dimmed to 0.3, dimmed-by-isolation drops to 0.25,
  // both: multiplicative.
  let opacity = 1;
  if (isExternal) opacity *= 0.3;
  if (dimmed) opacity *= 0.25;
  const showRing = selected;
  const ariaLabel = `${fn.qualifiedName || fn.name} — ${fn.file}:${fn.startLine} — ${fn.kind}`;

  const groupClass = [
    "map-node",
    reducedMotion ? "" : "map-node--anim",
    selected ? "map-node--selected" : "",
    dimmed ? "map-node--dim" : "",
    isExternal ? "map-node--external" : "",
    animateSettle ? "map-node--settle" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      transform={`translate(${x},${y})`}
      className={groupClass}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="button"
      aria-label={ariaLabel}
      tabIndex={-1}
      style={{
        cursor: "pointer",
        opacity,
        filter: dimmed ? "saturate(0.4)" : undefined,
        ["--map-node-color" as string]: `var(${colorVar})`,
        ["--map-node-radius" as string]: `${r}px`,
        ["--breathing-delay" as string]: `${breathingDelay}s`,
        transition: "opacity 200ms ease-out, filter 200ms ease-out",
      }}
    >
      {/* Selected ring — drawn behind the orb so the throb halo (v1.1.2) can layer between */}
      {showRing && (
        <circle
          r={r + 4}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          className="map-node__ring"
        />
      )}
      {/* v1.2 — Focus ring (Tab-focused, not yet selected). Dashed +
          half-opacity so the user can distinguish from the selection
          state. Only renders when `focused && !selected`. */}
      {focused && !selected && (
        <circle
          r={r + 4}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="2 2"
          opacity={0.5}
          className="map-node__focus-ring"
          pointerEvents="none"
        />
      )}
      {/* Hover halo — pre-rendered, opacity 0 by default, CSS bumps on :hover */}
      <circle r={r + 10} fill={`var(${colorVar})`} className="map-node__hover-halo" />
      {/* Throb glow — only visible when .map-node--selected and reducedMotion=false */}
      <circle r={r + 8} fill={`var(${colorVar})`} className="map-node__throb" />
      {/* The orb itself. Animation class applies breathing. */}
      <circle
        r={r}
        fill={`var(${colorVar})`}
        stroke={`var(${colorVar})`}
        strokeOpacity={0.4}
        strokeWidth={1}
        className="map-node__orb"
      />
      {bookmarked && (
        <circle
          r={3}
          cx={r * 0.7}
          cy={-r * 0.7}
          fill="var(--accent)"
          stroke="var(--bg-editor)"
          strokeWidth={1}
        />
      )}
      {/* Label */}
      <text
        x={0}
        y={r + 12}
        textAnchor="middle"
        fontFamily="Cascadia Mono, Consolas, monospace"
        fontSize={11}
        fill="var(--text-primary)"
        opacity={labelOpacity}
        pointerEvents="none"
        className="map-node__label"
      >
        {label}
      </text>
    </g>
  );
}

export default memo(MapNodeImpl);
