// Run dagre over the xyflow nodes/edges and write back positions.
// Top-down (TB) for callgraph readability: callers above, callees below.

import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

export function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80, marginx: 24, marginy: 24 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      // xyflow needs width/height for the bounding box if measured is not available
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    } as Node;
  });
}

export const LAYOUT_NODE_WIDTH = NODE_WIDTH;
export const LAYOUT_NODE_HEIGHT = NODE_HEIGHT;
