// v1.1.0 — Force-directed layout hook for the Map view.
//
// Wraps a d3-force simulation. Each node carries a `clusterId` (the
// source file path) and the simulation pulls same-cluster nodes toward
// a shared cluster anchor. This keeps callers + callees of the same
// file visually grouped, like Obsidian's graph view.
//
// Lifecycle:
//   1. Build a Map<clusterId, {x,y}> with anchors laid out on a grid.
//   2. Hand d3 a copy of nodes (it mutates `.x`/`.y` on each tick).
//   3. On every tick, copy positions into local state via React's
//      setState. Component reads positions per node by id.
//   4. Forces tuned so a graph of ≤100 nodes settles in ~1.5s.
//
// We expose:
//   • positions: Record<nodeId, {x,y}>
//   • clusters:  Map<clusterId, {x,y,nodeIds[]}> for halo + label
//   • settled:   boolean — true once alpha < alphaMin
//
// v1.1.3 will swap the in-line simulation for a Web Worker when
// graph.functions.length >= 100. The hook's external contract stays
// identical; only the internal driver changes.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

// v1.1.3 — Threshold above which the force simulation moves off the
// main thread into a Web Worker. Below this we keep the simpler inline
// path so small graphs don't pay the worker spin-up tax (~20ms).
const WORKER_NODE_THRESHOLD = 100;

export interface ForceNodeInput {
  id: string;
  clusterId: string;
  radius: number;
}

export interface ForceLinkInput {
  source: string;
  target: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  clusterId: string;
  radius: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface NodePos {
  id: string;
  x: number;
  y: number;
}

export interface ClusterInfo {
  id: string;
  cx: number;
  cy: number;
  nodeIds: string[];
}

export interface ForceLayoutResult {
  positions: Map<string, NodePos>;
  clusters: Map<string, ClusterInfo>;
  settled: boolean;
  /** Bumps every animation frame so consumers re-render. Drives the React tick. */
  tick: number;
}

interface Options {
  /** Width / height of the viewport in CSS pixels (used for centering forces). */
  width: number;
  height: number;
  /** Skip the layout if ≥ this many nodes — caller likely runs a worker. */
  inlineCutoff?: number;
}

/**
 * Position cluster anchors on a square-ish grid centered on (cx, cy). The
 * grid cell size scales with node count so dense clusters don't overlap.
 */
function gridLayoutAnchors(
  clusterIds: string[],
  cellSize: number,
  cx: number,
  cy: number,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const n = clusterIds.length;
  if (n === 0) return map;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const offsetX = cx - ((cols - 1) * cellSize) / 2;
  const offsetY = cy - ((rows - 1) * cellSize) / 2;
  clusterIds.forEach((id, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    map.set(id, { x: offsetX + c * cellSize, y: offsetY + r * cellSize });
  });
  return map;
}

export function useForceLayout(
  nodes: ForceNodeInput[],
  links: ForceLinkInput[],
  opts: Options,
): ForceLayoutResult {
  const { width, height, inlineCutoff = Infinity } = opts;
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const rafRef = useRef<number | null>(null);
  // We keep positions in a ref between ticks so we can read in render
  // without forcing a re-render on every tick. The tick counter below
  // drives the render cadence.
  const positionsRef = useRef<Map<string, NodePos>>(new Map());
  const clustersRef = useRef<Map<string, ClusterInfo>>(new Map());
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);

  // Stable hash so we only restart the simulation when the actual graph
  // shape changes (not every reference shuffle from React).
  const shape = useMemo(() => {
    return (
      nodes
        .map((n) => `${n.id}#${n.clusterId}#${n.radius}`)
        .join("|") +
      "/" +
      links.map((l) => `${l.source}>${l.target}`).join("|")
    );
  }, [nodes, links]);

  useEffect(() => {
    // Stop any prior simulation.
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    positionsRef.current = new Map();
    clustersRef.current = new Map();
    setSettled(false);

    if (nodes.length === 0) {
      setTick((t) => t + 1);
      return;
    }
    if (nodes.length >= inlineCutoff) {
      // Caller is responsible for the worker path. We still emit empty
      // positions so the consumer renders nothing rather than stale data.
      setTick((t) => t + 1);
      return;
    }

    // ── v1.1.3 — Worker path for large graphs ─────────────────────
    // We try to spawn a module Worker via Vite's `new URL` form. If
    // that throws (CSP, or running under a host that doesn't allow
    // module workers — e.g. older VS Code webviews) we silently fall
    // back to the inline simulation path below.
    if (nodes.length >= WORKER_NODE_THRESHOLD) {
      let worker: Worker | null = null;
      try {
        worker = new Worker(
          new URL("./forceLayout.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch (err) {
        // Fall through to the inline path.
        console.warn("[callmap] force-layout worker init failed, running inline:", err);
        worker = null;
      }
      if (worker) {
        const w = worker;
        const clusterNodes = new Map<string, string[]>();
        for (const n of nodes) {
          if (!clusterNodes.has(n.clusterId)) clusterNodes.set(n.clusterId, []);
          clusterNodes.get(n.clusterId)!.push(n.id);
        }
        w.onmessage = (e: MessageEvent) => {
          const data = e.data as {
            type: "tick" | "settled";
            positions: Array<{ id: string; x: number; y: number }>;
          };
          const map = new Map<string, NodePos>();
          for (const p of data.positions) map.set(p.id, p);
          // Recompute cluster centroids in the main thread — cheap
          // (O(nodes)) compared to the full simulation.
          const clusters = new Map<string, ClusterInfo>();
          for (const [cid, ids] of clusterNodes) {
            let sx = 0;
            let sy = 0;
            let count = 0;
            for (const nid of ids) {
              const p = map.get(nid);
              if (!p) continue;
              sx += p.x;
              sy += p.y;
              count++;
            }
            if (count === 0) continue;
            clusters.set(cid, {
              id: cid,
              cx: sx / count,
              cy: sy / count,
              nodeIds: ids,
            });
          }
          positionsRef.current = map;
          clustersRef.current = clusters;
          setTick((t) => t + 1);
          if (data.type === "settled") setSettled(true);
        };
        w.postMessage({
          type: "init",
          nodes: nodes.map((n) => ({
            id: n.id,
            clusterId: n.clusterId,
            radius: n.radius,
          })),
          links: links.map((l) => ({ source: l.source, target: l.target })),
          width,
          height,
        });
        return () => {
          try {
            w.postMessage({ type: "stop" });
          } catch {
            /* worker already terminated */
          }
          w.terminate();
        };
      }
      // worker = null path: fall through to inline.
    }

    const clusterIds = Array.from(new Set(nodes.map((n) => n.clusterId)));
    // Cluster spacing — wider apart when there are more clusters so a
    // 10-file PR doesn't pile every halo on top of the next.
    const cellSize = Math.max(180, 90 + clusterIds.length * 12);
    const cx = width / 2;
    const cy = height / 2;
    const anchorPos = gridLayoutAnchors(clusterIds, cellSize, cx, cy);

    // Build d3 inputs. Spawn every node at the canvas center so they
    // visibly drift outward into their cluster anchors — this is the
    // "settle entrance" effect v1.1.2 leans on.
    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      clusterId: n.clusterId,
      radius: n.radius,
      x: cx,
      y: cy,
    }));
    const simLinks: SimLink[] = links.map((l) => ({
      source: l.source,
      target: l.target,
    }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(80)
          .strength(0.6),
      )
      .force("charge", forceManyBody<SimNode>().strength(-150))
      .force("center", forceCenter(cx, cy).strength(0.04))
      .force(
        "clusterX",
        forceX<SimNode>((d) => anchorPos.get(d.clusterId)?.x ?? cx).strength(0.18),
      )
      .force(
        "clusterY",
        forceY<SimNode>((d) => anchorPos.get(d.clusterId)?.y ?? cy).strength(0.18),
      )
      .force(
        "collide",
        forceCollide<SimNode>((d) => d.radius + 4).strength(0.85),
      )
      .alpha(1)
      .alphaDecay(0.045) // ~1.5s to alphaMin=0.001 — feels right for ≤100 nodes
      .alphaMin(0.005);

    simRef.current = sim;

    const flush = () => {
      const next = new Map<string, NodePos>();
      const clusterNodes = new Map<string, string[]>();
      for (const n of simNodes) {
        next.set(n.id, { id: n.id, x: n.x ?? 0, y: n.y ?? 0 });
        if (!clusterNodes.has(n.clusterId)) clusterNodes.set(n.clusterId, []);
        clusterNodes.get(n.clusterId)!.push(n.id);
      }
      const clusters = new Map<string, ClusterInfo>();
      for (const [id, ids] of clusterNodes) {
        let sx = 0;
        let sy = 0;
        for (const nid of ids) {
          const p = next.get(nid)!;
          sx += p.x;
          sy += p.y;
        }
        clusters.set(id, {
          id,
          cx: sx / ids.length,
          cy: sy / ids.length,
          nodeIds: ids,
        });
      }
      positionsRef.current = next;
      clustersRef.current = clusters;
    };

    // Initial flush so the first paint isn't (0,0).
    flush();
    setTick((t) => t + 1);

    sim.on("tick", () => {
      // Throttle to one React update per animation frame — d3 ticks at
      // ~60Hz but React batches via rAF anyway, and our halo recompute
      // is bounded by `tick % 4`.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        flush();
        setTick((t) => t + 1);
      });
    });
    sim.on("end", () => {
      flush();
      setSettled(true);
      setTick((t) => t + 1);
    });

    return () => {
      sim.stop();
      simRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // We deliberately key the effect on `shape` (the structural hash)
    // rather than on the array references, because the parent often
    // hands us a freshly mapped array each render even when the graph
    // didn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, width, height, inlineCutoff]);

  // No deps array means consumers can read these refs whenever the
  // tick counter changes — the values come straight from the refs.
  return {
    positions: positionsRef.current,
    clusters: clustersRef.current,
    settled,
    tick,
  };
}
