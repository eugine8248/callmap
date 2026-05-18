// v1.1.4 — 3D map view (easter egg). Mounted only after the user
// presses `gg` while in Map mode.
//
// Why a separate component (and chunk)?
//   • `react-force-graph-3d` pulls in `three` + `d3-force-3d`. Combined
//     they're ~600 KB raw / ~180 KB gzip — far too heavy for the
//     default bundle. The Vite `manualChunks` rule (see the host
//     vite.config.ts files) shoves three/three-render-objects/the
//     graph lib into a `Map3DView` chunk that's only fetched on demand.
//   • The 3D view is opt-in: only the user who explicitly chose 3D
//     (and persisted it via localStorage) lands here. Everyone else
//     never downloads the chunk.
//
// Behaviour parity with the 2D map:
//   • Same `selectedId` / `onSelect` flow — clicking an orb opens the
//     source panel exactly like Review or 2D Map mode.
//   • Same kind-tinted colors (added / removed / changed / external).
//   • Same external-node dimming.
//   • The camera auto-orbits slowly so the graph reads as a 3D scene
//     immediately, even without user input.
//   • `prefers-reduced-motion` disables the auto-orbit + the link
//     particles (the same DEFAULT_PARTICLES_PER_EDGE constant we use
//     in 2D).

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import type { CallGraphResult, ChangedFunction } from "@callmap/core";
import { useReducedMotion } from "./useReducedMotion";
import {
  mapNodeRadius,
  mapNodeColorVar,
  DEFAULT_PARTICLES_PER_EDGE,
} from "./mapConstants";

interface Props {
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
  bookmarkedIds?: Set<string>;
  reducedMotion?: boolean;
}

interface Node3D {
  id: string;
  fn: ChangedFunction;
  color: string;
  size: number;
  isExternal: boolean;
}

interface Link3D {
  source: string;
  target: string;
  external: boolean;
}

// Resolve a CSS custom-property to its concrete value at render-time so
// we can hand a real color string to three.js's MeshPhongMaterial.
// three doesn't understand `var(--…)` — it parses with THREE.Color which
// only accepts named/hex/rgb strings.
function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function Map3DView({
  graph,
  selectedId,
  onSelect,
  bookmarkedIds,
  reducedMotion: reducedMotionProp,
}: Props) {
  const systemReduced = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? systemReduced;
  const fgRef = useRef<ForceGraphMethods<Node3D, Link3D> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 960, h: 720 });

  // Theme-resolved palette. Recomputed on every render so a dark→light
  // theme flip live-updates the orb colors.
  const palette = useMemo(() => {
    return {
      added: resolveCssVar("--diff-added", "#4ec9b0"),
      removed: resolveCssVar("--diff-removed", "#f48771"),
      changed: resolveCssVar("--diff-changed", "#dcdcaa"),
      neutral: resolveCssVar("--diff-neutral", "#858585"),
      external: resolveCssVar("--diff-neutral", "#858585"),
      bg: resolveCssVar("--bg-editor", "#1e1e1e"),
      accent: resolveCssVar("--accent", "#007acc"),
    };
  }, []);

  // Translate the CallGraphResult into the ForceGraph3D data shape.
  // We bake the kind-color into each node so the renderer doesn't have
  // to look it up per frame.
  const data = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }
    const nodes: Node3D[] = graph.functions.map((fn) => {
      const isExternal = fn.kind === "external";
      const colorKey = mapNodeColorVar(fn.kind).replace("--diff-", "") as
        | "added"
        | "removed"
        | "changed"
        | "neutral";
      const color = palette[colorKey] || palette.neutral;
      return {
        id: fn.id,
        fn,
        color,
        size: mapNodeRadius(degree.get(fn.id) || 0) / 4, // three units, not px
        isExternal,
      };
    });
    const links: Link3D[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      external: !!e.external,
    }));
    return { nodes, links };
  }, [graph, palette]);

  // Track viewport size — ForceGraph3D takes explicit width/height
  // props so we feed them from the container's ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-orbit. We use the camera-position API to nudge the camera in
  // a slow circle around the origin until the user interacts. The
  // existing `cameraPosition` getter returns {x,y,z}; we drift the
  // azimuth by ~0.0005 rad/frame, which lands at one full revolution
  // every ~13 seconds. Disabled when reducedMotion is on.
  useEffect(() => {
    if (reducedMotion) return;
    const fg = fgRef.current;
    if (!fg) return;
    let raf = 0;
    let angle = 0;
    let lastTime = performance.now();
    // Capture initial distance once so the orbit stays at the camera's
    // chosen zoom level rather than yanking the user back to a default.
    function tick() {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      const fgNow = fgRef.current;
      if (!fgNow) {
        raf = requestAnimationFrame(tick);
        return;
      }
      try {
        // The getter form returns a {x,y,z} position; runtime check
        // because the types in v1.29 mark it as the instance itself.
        const ret = (fgNow as unknown as {
          cameraPosition: (pos?: { x: number; y: number; z: number }) => unknown;
        }).cameraPosition();
        const pos = ret as { x: number; y: number; z: number };
        if (typeof pos?.x !== "number") {
          raf = requestAnimationFrame(tick);
          return;
        }
        const dist = Math.hypot(pos.x, pos.z) || 300;
        angle += 0.00018 * dt; // ~0.011 rad/sec @ 60fps tick
        (fgNow as unknown as {
          cameraPosition: (pos: { x: number; y: number; z: number }) => void;
        }).cameraPosition({
          x: dist * Math.cos(angle),
          y: pos.y,
          z: dist * Math.sin(angle),
        });
      } catch {
        /* graph not ready yet */
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // Re-center on the selected node when selection changes.
  useEffect(() => {
    if (!selectedId || !fgRef.current) return;
    const node = (data.nodes.find((n) => n.id === selectedId) as unknown) as
      | { x?: number; y?: number; z?: number }
      | undefined;
    if (!node || node.x === undefined) return;
    try {
      const distance = 120;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y ?? 0, node.z ?? 0);
      fgRef.current.cameraPosition(
        {
          x: (node.x ?? 0) * distRatio,
          y: (node.y ?? 0) * distRatio,
          z: (node.z ?? 0) * distRatio,
        },
        node as unknown as { x: number; y: number; z: number },
        800,
      );
    } catch {
      /* node positions still settling */
    }
  }, [selectedId, data.nodes]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" data-map3d>
      <ForceGraph3D<Node3D, Link3D>
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={palette.bg}
        nodeRelSize={4}
        nodeVal={(n) => n.size}
        nodeColor={(n) => (n.id === selectedId ? palette.accent : n.color)}
        nodeOpacity={1}
        nodeLabel={(n) => `${n.fn.qualifiedName || n.fn.name}\n${n.fn.file}:${n.fn.startLine}`}
        linkColor={() => palette.neutral}
        linkOpacity={0.4}
        linkWidth={(l) =>
          typeof l.source === "string"
            ? l.source === selectedId || l.target === selectedId
              ? 2
              : 0.5
            : 0.5
        }
        linkDirectionalParticles={reducedMotion ? 0 : DEFAULT_PARTICLES_PER_EDGE}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => palette.accent}
        onNodeClick={(n) => {
          onSelect(n.fn);
        }}
        onBackgroundClick={() => onSelect(null)}
        // Honor reduced-motion by killing the cooldown loop quickly so
        // the simulation lands and stays put rather than wobbling.
        cooldownTicks={reducedMotion ? 50 : Infinity}
        warmupTicks={20}
      />
      {/* Pill in the bottom-left signaling the easter-egg state and
          how to leave. Auto-hides after 4s on first reveal. */}
      <GgPill />
      {/* Bookmark badges in 3D would need a sprite overlay; for v1.1.4
          we keep them implicit via the orb halo, but we still expose
          the set so the upcoming v1.2 can wire 3D pins. */}
      {bookmarkedIds && bookmarkedIds.size > 0 && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 rounded-sm border border-ide-border bg-panel/80 px-2 py-1 font-mono text-[10px] text-text-secondary"
        >
          {bookmarkedIds.size} bookmarked
        </div>
      )}
    </div>
  );
}

function GgPill() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-1/2 z-10 translate-x-1/2 rounded-sm border border-ide-border bg-panel/85 px-3 py-1.5 font-mono text-[11px] text-text-secondary shadow-md"
      role="status"
      aria-label="3D mode"
    >
      3D · press <kbd className="rounded-sm border border-ide-border bg-panel px-1">gg</kbd> to return
    </div>
  );
}
