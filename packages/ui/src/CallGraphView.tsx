import {
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CallGraphResult, ChangedFunction } from "@callmap/core";
import { layoutGraph } from "@callmap/core";
import FunctionNode from "./FunctionNode";
import Codicon from "./Codicon";

const nodeTypes = { fn: FunctionNode };

interface Props {
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
  /** v0.5 — node ids that should render the pin overlay (bookmarked). */
  bookmarkedIds?: Set<string>;
  /** v0.5 — context-menu handler from the shell (used for "Bookmark"). */
  onContextMenu?: (fn: ChangedFunction, x: number, y: number) => void;
  /** v0.5 — whether to render the xyflow minimap. Default off. */
  showMinimap?: boolean;
  /** v0.5 — request the inline find-widget be opened from outside (Ctrl+F). */
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
}

export interface CallGraphViewHandle {
  centerOnNode: (id: string) => void;
  /** v0.5 — momentary halo around a node (used after a search-hit jump). */
  flashNode: (id: string) => void;
}

const CallGraphView = forwardRef<CallGraphViewHandle, Props>(function CallGraphView(
  props,
  ref
) {
  return (
    <ReactFlowProvider>
      <InnerGraph {...props} forwardedRef={ref} />
    </ReactFlowProvider>
  );
});

export default CallGraphView;

function InnerGraph({
  graph,
  selectedId,
  onSelect,
  bookmarkedIds,
  onContextMenu,
  showMinimap = false,
  findOpen = false,
  onFindOpenChange,
  forwardedRef,
}: Props & { forwardedRef: React.ForwardedRef<CallGraphViewHandle> }) {
  // v0.5 — momentary halo state. Flips on briefly when flashNode() is
  // called so the user's eye lands on the highlighted node after a
  // search jump.
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initial = useMemo(() => {
    const positions = layoutGraph(
      graph.functions.map((fn) => ({ id: fn.id })),
      graph.edges.map((e) => ({ source: e.source, target: e.target }))
    );
    const posById = new Map(positions.map((p) => [p.id, p]));
    // v0.4: layoutGraph lives in @callmap/core and returns plain
    // {id,x,y,w,h} tuples — we map them onto xyflow Node[] here.
    const rawNodes: Node[] = graph.functions.map((fn) => {
      const p = posById.get(fn.id);
      return {
        id: fn.id,
        type: "fn",
        data: {
          ...(fn as unknown as Record<string, unknown>),
          // v0.5 — pass bookmark + flash state in via node.data so the
          // FunctionNode renderer can react without prop-drilling.
          __bookmarked: bookmarkedIds?.has(fn.id) === true,
          __flashing: false,
        },
        position: { x: p?.x ?? 0, y: p?.y ?? 0 },
        width: p?.width,
        height: p?.height,
      } as Node;
    });
    const rawEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: false,
      // v0.3: dim dashed line for unresolved-external call edges so the
      // viewer can distinguish "we found this call but the target lives
      // outside the PR" from "real edge within the changed set".
      style: e.external
        ? { strokeDasharray: "4 3", opacity: 0.55 }
        : undefined,
    }));
    return { nodes: rawNodes, edges: rawEdges };
    // bookmarkedIds is captured in data only at build time; updates flow
    // through the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, , onEdgesChange] = useEdgesState(initial.edges);
  const rf = useReactFlow();

  useEffect(() => {
    setNodes(initial.nodes);
  }, [initial.nodes, setNodes]);

  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === selectedId })));
  }, [selectedId, setNodes]);

  // v0.5 — merge bookmarked + flashing state into node.data when either changes.
  useEffect(() => {
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        data: {
          ...(n.data as Record<string, unknown>),
          __bookmarked: bookmarkedIds?.has(n.id) === true,
          __flashing: n.id === flashingId,
        },
      }))
    );
  }, [bookmarkedIds, flashingId, setNodes]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      centerOnNode: (id: string) => {
        const node = rf.getNode(id);
        if (!node) return;
        const x = (node.position.x ?? 0) + (node.width ?? 220) / 2;
        const y = (node.position.y ?? 0) + (node.height ?? 60) / 2;
        rf.setCenter(x, y, { zoom: 1.2, duration: 350 });
      },
      flashNode: (id: string) => {
        setFlashingId(id);
        if (flashTimeout.current) clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => setFlashingId(null), 1100);
      },
    }),
    [rf]
  );

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    const fn = node.data as unknown as ChangedFunction;
    onSelect(fn);
  };

  // v0.5 — context menu (right-click) on a node fires the host-supplied
  // handler so the shell can add "Bookmark" / "Remove bookmark" entries.
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (!onContextMenu) return;
      e.preventDefault();
      const fn = node.data as unknown as ChangedFunction;
      onContextMenu(fn, e.clientX, e.clientY);
    },
    [onContextMenu]
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu as unknown as NodeMouseHandler}
        onPaneClick={() => onSelect(null)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="var(--xyflow-grid)" />
        <Controls />
        {showMinimap && (
          <MiniMap
            nodeColor={(n) => {
              const fn = n.data as unknown as ChangedFunction | undefined;
              switch (fn?.kind) {
                case "added":
                  return "var(--diff-added)";
                case "removed":
                  return "var(--diff-removed)";
                case "changed":
                  return "var(--diff-changed)";
                default:
                  return "var(--diff-neutral)";
              }
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
            pannable
            zoomable
          />
        )}
      </ReactFlow>

      {/* v0.5 — inline find-widget (Ctrl+F). Rendered as an overlay so
          it doesn't reshape the layout and survives view re-mounts. */}
      {findOpen && (
        <FindWidget
          functions={graph.functions}
          onClose={() => onFindOpenChange?.(false)}
          onJump={(fn) => {
            onSelect(fn);
            const node = rf.getNode(fn.id);
            if (node) {
              const x = (node.position.x ?? 0) + (node.width ?? 220) / 2;
              const y = (node.position.y ?? 0) + (node.height ?? 60) / 2;
              rf.setCenter(x, y, { zoom: 1.3, duration: 280 });
            }
            setFlashingId(fn.id);
            if (flashTimeout.current) clearTimeout(flashTimeout.current);
            flashTimeout.current = setTimeout(() => setFlashingId(null), 1100);
          }}
        />
      )}
    </>
  );
}

// ── v0.5 — Inline find-widget ────────────────────────────────────────
// VS Code's editor-find aesthetic: slim 360-wide pill at top-right, slim
// monospace input, prev/next/×, "N of M" counter. Up/Down move through
// matches, Enter centers, Esc closes.

function FindWidget({
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

  // Focus on mount.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Fuzzy match — same scorer as the command palette, simplified inline
  // so the widget has zero deps on palette internals.
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
      // Subsequence match
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

  // Reset cursor when query changes.
  useEffect(() => {
    setIdx(0);
  }, [q]);

  // Live-jump as the user types — feels like VS Code's find, where the
  // editor scrolls to the current match while typing.
  useEffect(() => {
    if (matches[idx]) onJump(matches[idx]);
    // We deliberately exclude onJump from deps — it's a closure that
    // changes every render and would loop.
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
  const status =
    count === 0
      ? q ? "No results" : ""
      : `${idx + 1} of ${count}`;

  return (
    <div
      className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-sm border border-ide-border bg-panel px-2 py-1 shadow-md"
      style={{ minWidth: 320 }}
      data-find-widget
      // Stop graph keyboard handlers from firing while typing in here.
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
        onClick={() => {
          if (matches.length === 0) return;
          setIdx((c) => (c - 1 + matches.length) % matches.length);
        }}
        className="rounded-sm px-1 text-text-secondary hover:bg-hover hover:text-text-primary disabled:opacity-50"
        disabled={matches.length === 0}
        aria-label="Previous match"
        data-tooltip="Previous (Shift+Enter)"
      >
        <Codicon name="chevron-up" size={12} />
      </button>
      <button
        onClick={() => {
          if (matches.length === 0) return;
          setIdx((c) => (c + 1) % matches.length);
        }}
        className="rounded-sm px-1 text-text-secondary hover:bg-hover hover:text-text-primary disabled:opacity-50"
        disabled={matches.length === 0}
        aria-label="Next match"
        data-tooltip="Next (Enter)"
      >
        <Codicon name="chevron-down" size={12} />
      </button>
      <button
        onClick={onClose}
        className="rounded-sm px-1 text-text-secondary hover:bg-hover hover:text-text-primary"
        aria-label="Close find"
        data-tooltip="Close (Esc)"
      >
        <Codicon name="close" size={12} />
      </button>
    </div>
  );
}
