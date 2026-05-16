import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CallGraphResult, ChangedFunction } from "../types";
import { layoutGraph } from "../lib/graphLayout";
import FunctionNode from "./FunctionNode";

const nodeTypes = { fn: FunctionNode };

interface Props {
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
}

export default function CallGraphView({ graph, selectedId, onSelect }: Props) {
  const initial = useMemo(() => {
    const rawNodes: Node[] = graph.functions.map((fn) => ({
      id: fn.id,
      type: "fn",
      data: fn as unknown as Record<string, unknown>,
      position: { x: 0, y: 0 },
    }));
    const rawEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: false,
    }));
    return { nodes: layoutGraph(rawNodes, rawEdges), edges: rawEdges };
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);

  // Re-layout when the source graph changes (e.g. user loads a new PR)
  useEffect(() => {
    setNodes(initial.nodes);
  }, [initial.nodes, setNodes]);

  // Highlight the currently selected node
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => ({ ...n, selected: n.id === selectedId }))
    );
  }, [selectedId, setNodes]);

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    const fn = node.data as unknown as ChangedFunction;
    onSelect(fn);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={() => onSelect(null)}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} color="#1e293b" />
      <Controls className="!bg-slate-900 !border-slate-800" />
      <MiniMap
        nodeColor={(n) => {
          const fn = n.data as unknown as ChangedFunction | undefined;
          switch (fn?.kind) {
            case "added":
              return "#22c55e";
            case "removed":
              return "#ef4444";
            case "changed":
              return "#f59e0b";
            default:
              return "#64748b";
          }
        }}
        maskColor="rgba(2, 6, 23, 0.7)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}
