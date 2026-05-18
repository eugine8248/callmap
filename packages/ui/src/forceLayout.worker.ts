// v1.1.3 — Web Worker entry for the d3-force simulation.
//
// Why a worker? Force simulation on a 200-node graph blocks the main
// thread ~5ms per tick × 60Hz = 300ms/s of jank, on top of React's own
// render cost. Spinning the d3 ticker in a worker lets the main thread
// keep paint smooth even on the slowest visited PRs.
//
// Wire protocol (host → worker):
//   { type: 'init', payload: { nodes, links, width, height } }
//   { type: 'stop' }
//
// Wire protocol (worker → host):
//   { type: 'tick',    payload: { positions: [{id,x,y}...] } }
//   { type: 'settled' }
//
// Lifecycle:
//   • Host posts `init` with the structural inputs. Worker spins up a
//     fresh simulation. Each d3 'tick' triggers a batched postMessage
//     with the entire position array — small (≤ 200 nodes × 16 bytes ≈
//     3 KB) so structured-clone overhead is negligible.
//   • Host posts `stop` to halt the simulation early (mode flip / new
//     PR / unmount).

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

interface SimNode extends SimulationNodeDatum {
  id: string;
  clusterId: string;
  radius: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export interface ForceWorkerInitMsg {
  type: "init";
  nodes: Array<{ id: string; clusterId: string; radius: number }>;
  links: Array<{ source: string; target: string }>;
  width: number;
  height: number;
}
export interface ForceWorkerStopMsg {
  type: "stop";
}
export type ForceWorkerInbound = ForceWorkerInitMsg | ForceWorkerStopMsg;

export interface ForceWorkerTickMsg {
  type: "tick";
  positions: Array<{ id: string; x: number; y: number }>;
}
export interface ForceWorkerSettledMsg {
  type: "settled";
  positions: Array<{ id: string; x: number; y: number }>;
}
export type ForceWorkerOutbound = ForceWorkerTickMsg | ForceWorkerSettledMsg;

let sim: Simulation<SimNode, SimLink> | null = null;
let simNodes: SimNode[] = [];

function gridLayoutAnchors(
  clusterIds: string[],
  cellSize: number,
  cx: number,
  cy: number,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (clusterIds.length === 0) return map;
  const cols = Math.max(1, Math.ceil(Math.sqrt(clusterIds.length)));
  const offsetX = cx - ((cols - 1) * cellSize) / 2;
  const offsetY = cy - ((Math.ceil(clusterIds.length / cols) - 1) * cellSize) / 2;
  clusterIds.forEach((id, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    map.set(id, { x: offsetX + c * cellSize, y: offsetY + r * cellSize });
  });
  return map;
}

function flushPositions(kind: "tick" | "settled") {
  const positions = simNodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }));
  const msg: ForceWorkerOutbound = { type: kind, positions };
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = (e: MessageEvent<ForceWorkerInbound>) => {
  const msg = e.data;
  if (msg.type === "stop") {
    sim?.stop();
    sim = null;
    simNodes = [];
    return;
  }
  if (msg.type === "init") {
    sim?.stop();
    sim = null;

    const { nodes, links, width, height } = msg;
    const cx = width / 2;
    const cy = height / 2;
    const clusterIds = Array.from(new Set(nodes.map((n) => n.clusterId)));
    const cellSize = Math.max(180, 90 + clusterIds.length * 12);
    const anchorPos = gridLayoutAnchors(clusterIds, cellSize, cx, cy);

    simNodes = nodes.map((n) => ({
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

    sim = forceSimulation<SimNode>(simNodes)
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
      .alphaDecay(0.045)
      .alphaMin(0.005);

    sim.on("tick", () => flushPositions("tick"));
    sim.on("end", () => flushPositions("settled"));
    // Initial flush so the host can paint even before the first tick.
    flushPositions("tick");
  }
};

// Export the message types so the host can import them for type
// safety. The worker bundle itself doesn't ship this `export {}` line
// because Vite's worker bundler strips dangling exports.
export {};
