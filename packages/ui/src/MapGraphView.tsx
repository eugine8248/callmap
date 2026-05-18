// v1.1.0 — "Map" view: a force-directed, Obsidian-style graph render.
//
// Props match CallGraphView so the IdeShell can swap the two renderers
// behind a `mode` flag without prop-rewiring. Both consume the same
// `selectedId`, `onSelect`, `bookmarkedIds`, and `findOpen` state, so
// click-to-isolate, the source panel, and the find widget all keep
// working in Map mode.
//
// Architecture:
//   • useForceLayout runs d3-force in-process (until v1.1.3 swaps in a
//     Worker for ≥100-node graphs).
//   • Nodes carry a clusterId = source file path; cluster halos are
//     convex hulls expanded by 24px with a 10% kind-tinted fill.
//   • Per-cluster filename label floats at the centroid, faded.
//   • Pan/zoom via simple SVG transform on the root <g>. We compute
//     visible labels as a function of zoom level.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CallGraphResult, ChangedFunction } from "@callmap/core";
import MapNode from "./MapNode";
import {
  mapNodeRadius,
  curveControlPoint,
  particlesForNodeCount,
  ZOOM_PARTICLE_OFF,
  ZOOM_PARTICLE_ON,
} from "./mapConstants";
import MapEdge from "./MapEdge";
import { useForceLayout, type ForceNodeInput, type ForceLinkInput } from "./useForceLayout";
import { useReducedMotion } from "./useReducedMotion";
import Codicon from "./Codicon";

export interface MapGraphViewHandle {
  centerOnNode: (id: string) => void;
  flashNode: (id: string) => void;
}

interface Props {
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
  bookmarkedIds?: Set<string>;
  onContextMenu?: (fn: ChangedFunction, x: number, y: number) => void;
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
  /**
   * v1.1.1 — When set, overrides the matchMedia-detected reduced-motion
   * preference. Leave undefined to let the hook honor the OS setting.
   */
  reducedMotion?: boolean;
}

// v1.1.2 — The per-edge particle count is now defined in
// ./mapConstants so both the 2D and 3D Map views can share it without
// dragging each other into the same Rollup chunk. Re-exported here so
// existing callers (the index barrel) keep working.
export { DEFAULT_PARTICLES_PER_EDGE } from "./mapConstants";
const PARTICLE_DURATION_MS = 4000;
const PARTICLE_HOVER_DURATION_MS = 2000;
const SETTLE_SKIP_THRESHOLD = 150;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const HALO_RECOMPUTE_EVERY = 4; // throttle convex-hull pass

// Pretty-truncate a file path to its last two segments. Matches the
// FunctionNode header convention so the same mental model carries.
function shortenFilePath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return parts.slice(-2).join("/");
}

// Convex hull via Andrew's monotone chain. Robust enough for the small
// cluster sizes we'll see (1–30 nodes typical).
function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Expand a polygon outward along its vertex normals by `pad` px. For
// cluster halos a simple per-vertex outward shove (away from centroid)
// is good enough and won't self-intersect at our cluster sizes.
function expandHull(hull: Array<{ x: number; y: number }>, pad: number) {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}

function hullToPath(hull: Array<{ x: number; y: number }>): string {
  if (hull.length === 0) return "";
  let d = `M${hull[0].x},${hull[0].y}`;
  for (let i = 1; i < hull.length; i++) d += ` L${hull[i].x},${hull[i].y}`;
  d += " Z";
  return d;
}

function dominantKind(fns: ChangedFunction[]): string {
  const counts: Record<string, number> = {};
  for (const fn of fns) counts[fn.kind] = (counts[fn.kind] || 0) + 1;
  let best = "neutral";
  let bestN = -1;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestN) {
      best = k;
      bestN = counts[k];
    }
  }
  return best;
}

const MapGraphView = forwardRef<MapGraphViewHandle, Props>(function MapGraphView(
  {
    graph,
    selectedId,
    onSelect,
    bookmarkedIds,
    onContextMenu,
    findOpen = false,
    onFindOpenChange,
    reducedMotion: reducedMotionProp,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // v1.1.1 — Resolve reduced-motion lazily. The host can pass an
  // override (used in some VS Code panels that disable webview animations
  // globally); otherwise we fall back to the media-query hook.
  const systemReduced = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? systemReduced;
  const [size, setSize] = useState({ w: 960, h: 720 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resize observer — keeps the simulation centered as the user drags
  // the source-panel divider.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute degree (callers + callees) per node from the edge list.
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of graph.edges) {
      m.set(e.source, (m.get(e.source) || 0) + 1);
      m.set(e.target, (m.get(e.target) || 0) + 1);
    }
    return m;
  }, [graph.edges]);

  // Force-input nodes — clusterId = file path so same-file functions
  // cluster together. External nodes get their own "external" cluster
  // so they float together on the periphery instead of being scattered.
  const forceNodes: ForceNodeInput[] = useMemo(
    () =>
      graph.functions.map((fn) => ({
        id: fn.id,
        clusterId: fn.kind === "external" ? "__external__" : fn.file,
        radius: mapNodeRadius(degreeMap.get(fn.id) || 0),
      })),
    [graph.functions, degreeMap],
  );

  const forceLinks: ForceLinkInput[] = useMemo(
    () => graph.edges.map((e) => ({ source: e.source, target: e.target })),
    [graph.edges],
  );

  const { positions, clusters, tick } = useForceLayout(forceNodes, forceLinks, {
    width: size.w,
    height: size.h,
  });

  // Neighbor map for click-to-isolate. Mirrors CallGraphView's adjacency
  // logic; sharing the structure would mean re-routing through core.
  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [graph.edges]);

  // Cached cluster halos. Recompute on every Nth tick to amortize cost.
  const haloCacheRef = useRef<{
    tick: number;
    halos: Array<{ id: string; path: string; cx: number; cy: number; kind: string; label: string }>;
  }>({ tick: -1, halos: [] });
  const halos = useMemo(() => {
    if (tick - haloCacheRef.current.tick < HALO_RECOMPUTE_EVERY) {
      return haloCacheRef.current.halos;
    }
    const computed: typeof haloCacheRef.current.halos = [];
    for (const [id, cluster] of clusters) {
      if (cluster.nodeIds.length < 2) continue; // singletons don't get a halo
      const pts = cluster.nodeIds
        .map((nid) => positions.get(nid))
        .filter((p): p is { id: string; x: number; y: number } => !!p);
      if (pts.length < 2) continue;
      const fns = cluster.nodeIds
        .map((nid) => graph.functions.find((f) => f.id === nid))
        .filter((f): f is ChangedFunction => !!f);
      const hull = expandHull(convexHull(pts), 24);
      const kind = dominantKind(fns);
      const label = id === "__external__" ? "external" : shortenFilePath(id);
      computed.push({
        id,
        path: hullToPath(hull),
        cx: cluster.cx,
        cy: cluster.cy,
        kind,
        label,
      });
    }
    haloCacheRef.current = { tick, halos: computed };
    return computed;
  }, [tick, clusters, positions, graph.functions]);

  // Zoom-adaptive label opacity. Three tiers:
  //   k < 0.7  → 0
  //   0.7..1.2 → 0.4
  //   k ≥ 1.2  → 1.0
  // Hovered node forces opacity to 1 regardless.
  const baseLabelOpacity =
    transform.k < 0.7 ? 0 : transform.k < 1.2 ? 0.4 : 1.0;

  // Pan: drag with left mouse on the pane (not on a node).
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  function onPaneMouseDown(e: React.MouseEvent) {
    if ((e.target as Element).closest(".map-node")) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      setTransform((t) => ({
        ...t,
        x: dragRef.current!.tx + (e.clientX - dragRef.current!.x),
        y: dragRef.current!.ty + (e.clientY - dragRef.current!.y),
      }));
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Wheel zoom around the cursor.
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.001);
    setTransform((t) => {
      const nextK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, k: nextK };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Pan correction so the point under the cursor stays put.
      const ratio = nextK / t.k;
      return {
        x: mx - (mx - t.x) * ratio,
        y: my - (my - t.y) * ratio,
        k: nextK,
      };
    });
  }

  // Fit-on-mount + when shape changes: center the graph in the viewport.
  // We delay one frame so the simulation has its first positions.
  const fitOnce = useRef(false);
  useEffect(() => {
    fitOnce.current = false;
  }, [graph]);
  useEffect(() => {
    if (fitOnce.current) return;
    if (positions.size === 0) return;
    // Bounding box of all positions
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const pad = 80;
    const k = Math.min(
      (size.w - pad * 2) / w,
      (size.h - pad * 2) / h,
      1.0,
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      x: size.w / 2 - cx * k,
      y: size.h / 2 - cy * k,
      k,
    });
    // Mark fitted only after we have at least 4 ticks so the layout is
    // close to stable — otherwise the first paint zooms way in on the
    // initial centered burst.
    if (tick > 6) fitOnce.current = true;
  }, [positions, size, tick, graph]);

  // Click handlers.
  // v1.1.1 — On every click we trigger the ripple effect. We append a
  // dedicated <circle> to the clicked node group and drive its radius
  // + opacity via Web Animations API. Removing the element on `finish`
  // is cheaper than maintaining ripple state in React.
  function spawnRipple(target: SVGGElement) {
    if (reducedMotion) return;
    const svgNS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", "1");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "var(--map-node-color, currentColor)");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("class", "map-node__ripple-anim");
    circle.style.pointerEvents = "none";
    target.appendChild(circle);
    // Drive the radius + opacity in a rAF loop. We can't use a CSS
    // transition on the SVG `r` attribute (only Chromium 84+ animates
    // it via WAAPI, but other engines need the explicit numeric tween)
    // so we do the cheap manual sweep — 600ms is a single ease-out.
    const start = performance.now();
    const DURATION = 600;
    const MAX_R = 200;
    function step(now: number) {
      const t = Math.min(1, (now - start) / DURATION);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const r = ease * MAX_R;
      const opacity = 0.55 * (1 - ease);
      circle.setAttribute("r", r.toFixed(1));
      circle.setAttribute("opacity", opacity.toFixed(3));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        circle.remove();
      }
    }
    requestAnimationFrame(step);
  }

  const onNodeClick = useCallback(
    (fn: ChangedFunction) => (e: React.MouseEvent) => {
      e.stopPropagation();
      const g = (e.currentTarget as SVGGElement) ?? null;
      if (g) spawnRipple(g);
      onSelect(fn);
    },
    // We deliberately exclude spawnRipple from deps — it closes over
    // reducedMotion which is captured at call time via the ref-free
    // closure. ESLint wants it but adding spawnRipple bloats the
    // memo cache without changing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSelect, reducedMotion],
  );
  const onNodeContext = useCallback(
    (fn: ChangedFunction) => (e: React.MouseEvent) => {
      if (!onContextMenu) return;
      e.preventDefault();
      onContextMenu(fn, e.clientX, e.clientY);
    },
    [onContextMenu],
  );

  // Center the camera on a node — keep zoom but pan so the node sits
  // at the canvas midpoint.
  const centerOnNode = useCallback(
    (id: string) => {
      const p = positions.get(id);
      if (!p) return;
      setTransform((t) => ({
        x: size.w / 2 - p.x * t.k,
        y: size.h / 2 - p.y * t.k,
        k: Math.max(t.k, 1.2),
      }));
    },
    [positions, size],
  );

  const flashNode = useCallback((id: string) => {
    setFlashingId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashingId(null), 1100);
  }, []);

  useImperativeHandle(ref, () => ({ centerOnNode, flashNode }), [centerOnNode, flashNode]);

  // v1.1.3 — Keyboard navigation. With a node selected:
  //   Tab        → next-by-degree neighbor
  //   Shift+Tab  → previous-by-degree neighbor
  //   Enter      → already opens source panel via onSelect — we re-fire
  //                so the host re-centers on the current selection.
  //   Esc        → clear selection (IdeShell handles Esc globally, but
  //                we re-implement here when our container has focus so
  //                the find widget isn't the only consumer).
  //
  // v1.2 — When nothing is selected, Tab cycles every node in a
  // deterministic order `(file, startLine, qualifiedName)`. This lets a
  // keyboard-only user walk the whole graph without first having to
  // click a node. Enter on the Tab-focused node promotes it to selected
  // and opens the source panel.
  const lastNeighborRef = useRef<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  // Global deterministic order — recomputed only when the function set
  // changes. Sort by (file ASC, startLine ASC, qualifiedName ASC).
  const globalOrder = useMemo(() => {
    return graph.functions
      .slice()
      .sort((a, b) => {
        const af = a.file || "";
        const bf = b.file || "";
        if (af !== bf) return af.localeCompare(bf);
        const al = a.startLine ?? 0;
        const bl = b.startLine ?? 0;
        if (al !== bl) return al - bl;
        return (a.qualifiedName || a.name).localeCompare(b.qualifiedName || b.name);
      })
      .map((fn) => fn.id);
  }, [graph.functions]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Don't fight with text inputs.
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.closest("[data-find-widget]") ||
        target?.closest("[data-palette]")
      ) {
        return;
      }
      // Only react when our container is in focus / the user has the
      // map open. The `data-map-graph` selector keeps us out of the
      // Review-mode key handling.
      const inMap = !!containerRef.current && containerRef.current.contains(target as Node);
      if (!inMap && document.activeElement !== document.body) return;

      if (e.key === "Tab" && selectedId !== null) {
        e.preventDefault();
        const nbrs = neighborMap.get(selectedId);
        if (!nbrs || nbrs.size === 0) return;
        const ordered = Array.from(nbrs).sort((a, b) => {
          const da = degreeMap.get(a) || 0;
          const db = degreeMap.get(b) || 0;
          // Higher degree first; stable tiebreak by id so the cycle is
          // deterministic across renders.
          return db - da || a.localeCompare(b);
        });
        const fns = graph.functions;
        // The "previously focused" index is tracked on the ref so
        // Shift+Tab walks the list backwards from the same anchor.
        let idx = ordered.indexOf(lastNeighborRef.current || "");
        if (idx < 0) idx = e.shiftKey ? ordered.length - 1 : -1;
        idx = e.shiftKey
          ? (idx - 1 + ordered.length) % ordered.length
          : (idx + 1) % ordered.length;
        const nextId = ordered[idx];
        lastNeighborRef.current = nextId;
        const fn = fns.find((f) => f.id === nextId);
        if (fn) {
          onSelect(fn);
          centerOnNode(nextId);
          flashNode(nextId);
        }
        return;
      }

      // v1.2 — Global Tab cycle when nothing is selected. Walk every
      // node in (file, line, qname) order. Tab focuses; Enter promotes
      // focus → selection.
      if (e.key === "Tab" && selectedId === null && globalOrder.length > 0) {
        e.preventDefault();
        const cur = focusedNodeId;
        let idx = cur ? globalOrder.indexOf(cur) : -1;
        if (idx < 0) idx = e.shiftKey ? globalOrder.length - 1 : -1;
        idx = e.shiftKey
          ? (idx - 1 + globalOrder.length) % globalOrder.length
          : (idx + 1) % globalOrder.length;
        const nextId = globalOrder[idx];
        setFocusedNodeId(nextId);
        centerOnNode(nextId);
        flashNode(nextId);
        return;
      }

      // v1.2 — Enter promotes the Tab-focused node to selected, which
      // triggers IdeShell's source-panel open via onSelect.
      if (e.key === "Enter" && focusedNodeId && selectedId === null) {
        const fn = graph.functions.find((f) => f.id === focusedNodeId);
        if (fn) {
          e.preventDefault();
          onSelect(fn);
          setFocusedNodeId(null);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    focusedNodeId,
    neighborMap,
    degreeMap,
    graph.functions,
    globalOrder,
    onSelect,
    centerOnNode,
    flashNode,
  ]);
  // Reset the neighbor cursor whenever selection changes — Tab always
  // restarts from the highest-degree neighbor for a freshly-picked node.
  useEffect(() => {
    lastNeighborRef.current = null;
    // Clearing selection should also clear the Tab-focused state so
    // subsequent Tab starts from the top of the global order.
    if (selectedId !== null) setFocusedNodeId(null);
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Stable per-node breathing-delay seed so each orb has a phase offset
  // that doesn't shift on every render.
  const breathingDelays = useMemo(() => {
    const m = new Map<string, number>();
    for (const fn of graph.functions) {
      // Deterministic delay from id so React tests / re-mounts produce
      // the same pattern.
      let h = 0;
      for (let i = 0; i < fn.id.length; i++) h = (h * 31 + fn.id.charCodeAt(i)) | 0;
      const phase = (Math.abs(h) % 3000) / 1000;
      m.set(fn.id, phase);
    }
    return m;
  }, [graph.functions]);

  // v1.2 — Hysteresis state for zoom-gated particles. Particles turn
  // OFF when scale drops below ZOOM_PARTICLE_OFF (0.5); they only turn
  // back ON above ZOOM_PARTICLE_ON (0.55). A single boolean ref + state
  // pair drives a re-render only on the transition, not on every wheel
  // event.
  const [particlesEnabledByZoom, setParticlesEnabledByZoom] = useState(true);
  useEffect(() => {
    if (particlesEnabledByZoom && transform.k < ZOOM_PARTICLE_OFF) {
      setParticlesEnabledByZoom(false);
    } else if (!particlesEnabledByZoom && transform.k > ZOOM_PARTICLE_ON) {
      setParticlesEnabledByZoom(true);
    }
  }, [transform.k, particlesEnabledByZoom]);

  // v1.2 — Node-id → clusterId lookup for cross-cluster edge detection.
  // forceNodes already carries clusterId; we project it into a Map so
  // edgeRender can do O(1) lookups instead of O(N) scans.
  const nodeClusterMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of forceNodes) m.set(n.id, n.clusterId);
    return m;
  }, [forceNodes]);

  // v1.2 — Node-id → ChangedFunction lookup. The old code re-scanned
  // graph.functions per edge per render (O(E*F)). Hoisting to a Map
  // keeps the edge memo at O(E).
  const functionMap = useMemo(() => {
    const m = new Map<string, ChangedFunction>();
    for (const fn of graph.functions) m.set(fn.id, fn);
    return m;
  }, [graph.functions]);

  // Edge prep: precompute per-edge endpoint coords + highlight state.
  // v1.1.2 — additionally compute per-edge particle count + duration.
  // Particles drop to 0 when the user has reduced-motion preference,
  // when zoom is too small for the dots to be visible (k < 0.5), or
  // when this edge is currently faded by the click-to-isolate state.
  // Hover (either endpoint) drops the duration from 4000 → 2000ms.
  //
  // v1.2 — Added:
  //  • Quadratic-Bezier control point for cross-cluster edges (M1)
  //  • Zoom-gated particle disable with hysteresis (M2)
  //  • Per-node-count particle ladder via particlesForNodeCount (M4)
  const edgeRender = useMemo(() => {
    const isolating = selectedId !== null;
    const ladderParticles = particlesForNodeCount(graph.functions.length);
    const particleBase =
      reducedMotion || !particlesEnabledByZoom ? 0 : ladderParticles;
    const canvasCx = size.w / 2;
    const canvasCy = size.h / 2;
    return graph.edges.map((e, i) => {
      const sp = positions.get(e.source);
      const tp = positions.get(e.target);
      if (!sp || !tp) return null;
      const sourceFn = functionMap.get(e.source);
      const targetFn = functionMap.get(e.target);
      const touchesSel = isolating && (e.source === selectedId || e.target === selectedId);
      const hoverActive = hoveredId !== null && (e.source === hoveredId || e.target === hoveredId);
      // v1.2 — Curved when the edge crosses cluster boundaries. The
      // sourceFn / targetFn lookup uses the forceNodes clusterId which
      // matches v1.1's `__external__` bucket so external→internal edges
      // also bow.
      const sourceCluster = nodeClusterMap.get(e.source);
      const targetCluster = nodeClusterMap.get(e.target);
      const crossCluster =
        !!sourceCluster && !!targetCluster && sourceCluster !== targetCluster;
      let controlX: number | undefined;
      let controlY: number | undefined;
      if (crossCluster) {
        const cp = curveControlPoint(sp.x, sp.y, tp.x, tp.y, canvasCx, canvasCy);
        if (cp) {
          controlX = cp.cx;
          controlY = cp.cy;
        }
      }
      return {
        id: `me${i}`,
        x1: sp.x,
        y1: sp.y,
        x2: tp.x,
        y2: tp.y,
        controlX,
        controlY,
        sourceKind: sourceFn?.kind || "neutral",
        targetKind: targetFn?.kind || "neutral",
        external: !!e.external,
        highlighted: touchesSel,
        ambient: !isolating,
        faded: isolating && !touchesSel,
        particles: particleBase,
        particleDurationMs: hoverActive ? PARTICLE_HOVER_DURATION_MS : PARTICLE_DURATION_MS,
      };
    });
  }, [
    graph.edges,
    graph.functions.length,
    functionMap,
    nodeClusterMap,
    positions,
    selectedId,
    hoveredId,
    reducedMotion,
    particlesEnabledByZoom,
    size.w,
    size.h,
  ]);

  // Click-to-isolate dim flag per node.
  const focusSet = useMemo(() => {
    if (selectedId === null) return null;
    const s = new Set<string>();
    s.add(selectedId);
    const n = neighborMap.get(selectedId);
    if (n) for (const id of n) s.add(id);
    return s;
  }, [selectedId, neighborMap]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: "var(--bg-editor)", cursor: dragRef.current ? "grabbing" : "default" }}
      onWheel={onWheel}
      onMouseDown={onPaneMouseDown}
      onClick={(e) => {
        // Click on empty canvas clears selection.
        if (!(e.target as Element).closest(".map-node")) {
          onSelect(null);
        }
      }}
      data-map-graph
    >
      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        style={{ display: "block" }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Cluster halos — drawn first so nodes float above them. */}
          {halos.map((h) => {
            const colorVar =
              h.kind === "added"
                ? "--diff-added-bg"
                : h.kind === "removed"
                  ? "--diff-removed-bg"
                  : h.kind === "changed"
                    ? "--diff-changed-bg"
                    : "--diff-neutral-bg";
            return (
              <g key={h.id} className="map-cluster">
                <path
                  d={h.path}
                  fill={`var(${colorVar})`}
                  opacity={0.45}
                  stroke="none"
                />
                <text
                  x={h.cx}
                  y={h.cy}
                  textAnchor="middle"
                  fontFamily="Cascadia Mono, Consolas, monospace"
                  fontSize={11}
                  fill="var(--text-secondary)"
                  opacity={Math.max(0.35, baseLabelOpacity * 0.7)}
                  pointerEvents="none"
                >
                  {h.label}
                </text>
              </g>
            );
          })}

          {/* Edges — drawn before nodes so nodes sit on top. */}
          {edgeRender.map((e) => (e ? <MapEdge key={e.id} {...e} /> : null))}

          {/* Nodes */}
          {graph.functions.map((fn) => {
            const p = positions.get(fn.id);
            if (!p) return null;
            const deg = degreeMap.get(fn.id) || 0;
            const sel = fn.id === selectedId;
            const dim = focusSet ? !focusSet.has(fn.id) : false;
            const flashing = fn.id === flashingId;
            const labelOp =
              hoveredId === fn.id || sel || fn.id === focusedNodeId
                ? 1
                : flashing
                  ? 1
                  : baseLabelOpacity;
            return (
              <MapNode
                key={fn.id}
                fn={fn}
                x={p.x}
                y={p.y}
                degree={deg}
                selected={sel}
                focused={fn.id === focusedNodeId}
                bookmarked={bookmarkedIds?.has(fn.id) === true}
                dimmed={dim}
                reducedMotion={reducedMotion}
                animateSettle={
                  !reducedMotion &&
                  graph.functions.length < SETTLE_SKIP_THRESHOLD
                }
                breathingDelay={breathingDelays.get(fn.id) || 0}
                onClick={onNodeClick(fn)}
                onContextMenu={onContextMenu ? onNodeContext(fn) : undefined}
                onMouseEnter={() => setHoveredId(fn.id)}
                onMouseLeave={() => setHoveredId((h) => (h === fn.id ? null : h))}
                labelOpacity={labelOp}
                label={fn.name}
              />
            );
          })}
        </g>
      </svg>

      {/* Zoom controls — tiny, bottom-left, matches xyflow control density */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-sm border border-ide-border bg-panel p-1 shadow-md">
        <button
          onClick={() =>
            setTransform((t) => ({ ...t, k: Math.min(MAX_ZOOM, t.k * 1.2) }))
          }
          className="rounded-sm px-2 py-0.5 text-[12px] text-text-secondary hover:bg-hover hover:text-text-primary"
          data-tooltip="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() =>
            setTransform((t) => ({ ...t, k: Math.max(MIN_ZOOM, t.k / 1.2) }))
          }
          className="rounded-sm px-2 py-0.5 text-[12px] text-text-secondary hover:bg-hover hover:text-text-primary"
          data-tooltip="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => {
            fitOnce.current = false;
            // Trigger a re-fit by nudging the tick.
            setTransform((t) => ({ ...t }));
          }}
          className="rounded-sm px-2 py-0.5 text-[10px] text-text-secondary hover:bg-hover hover:text-text-primary"
          data-tooltip="Fit view"
          aria-label="Fit view"
        >
          <Codicon name="map" size={10} />
        </button>
      </div>

      {/* The find-widget reuses CallGraphView's. To avoid duplicating
          the 100-line component we'll lift a shared FindWidget out as
          part of v1.1.0. For now we render a small affordance reminding
          users Ctrl+F still works — and we wire the open/close props. */}
      {findOpen && (
        <MapFindWidget
          functions={graph.functions}
          onClose={() => onFindOpenChange?.(false)}
          onJump={(fn) => {
            onSelect(fn);
            centerOnNode(fn.id);
            flashNode(fn.id);
          }}
        />
      )}
    </div>
  );
});

export default MapGraphView;

// ── Find widget — lightweight parallel to the one in CallGraphView ──
// We keep a separate copy here so the Map view doesn't pull in xyflow
// types via the shared component. The behavior matches: live-jump as
// the user types, Up/Down/Enter, Esc close.

function MapFindWidget({
  functions,
  onClose,
  onJump,
}: {
  functions: ChangedFunction[];
  onClose: () => void;
  onJump: (fn: ChangedFunction) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const ql = q.toLowerCase();
    const scored: Array<{ fn: ChangedFunction; score: number }> = [];
    for (const fn of functions) {
      if (fn.kind === "external") continue;
      const text = `${fn.name} ${fn.qualifiedName} ${fn.file}`.toLowerCase();
      const i = text.indexOf(ql);
      if (i >= 0) {
        scored.push({ fn, score: 1000 - i });
        continue;
      }
      let ti = 0;
      let qi = 0;
      while (ti < text.length && qi < ql.length) {
        if (text[ti] === ql[qi]) qi++;
        ti++;
      }
      if (qi === ql.length) scored.push({ fn, score: 100 - text.length * 0.01 });
    }
    return scored.sort((a, b) => b.score - a.score).map((s) => s.fn);
  }, [q, functions]);

  useEffect(() => {
    setIdx(0);
  }, [q]);
  useEffect(() => {
    if (matches[idx]) onJump(matches[idx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, idx]);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      if (matches.length === 0) return;
      e.preventDefault();
      setIdx((c) => (c + 1) % matches.length);
    } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
      if (matches.length === 0) return;
      e.preventDefault();
      setIdx((c) => (c - 1 + matches.length) % matches.length);
    }
  }

  const count = matches.length;
  const status = count === 0 ? (q ? "No results" : "") : `${idx + 1} of ${count}`;
  return (
    <div
      className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-sm border border-ide-border bg-panel px-2 py-1 shadow-md"
      style={{ minWidth: 320 }}
      data-find-widget
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Codicon name="search" size={12} className="text-text-secondary" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        placeholder="Find function…"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-text-primary placeholder:text-text-disabled focus:outline-none"
      />
      <span
        className="select-none tabular-nums font-mono text-[10px] text-text-secondary"
        aria-live="polite"
      >
        {status}
      </span>
      <button
        onClick={onClose}
        className="rounded-sm px-1 text-text-secondary hover:bg-hover hover:text-text-primary"
        aria-label="Close find"
      >
        <Codicon name="close" size={12} />
      </button>
    </div>
  );
}
