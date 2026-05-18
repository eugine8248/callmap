// v1.1.0 — Mode router for the graph area. Hosts both CallGraphView
// (Review mode) and MapGraphView (Map view) and cross-fades between
// them on a ~250ms opacity transition. The non-active view is
// suspended (returned null) so we don't pay a re-render cost on the
// hidden tree once the transition completes.
//
// v1.1.4 will introduce a third mode = "map3d" loaded behind a
// dynamic import. The router shape is unchanged from this phase.
//
// v1.2 — Adds a visually-hidden aria-live="polite" region that
// announces "Map view", "Review view", or "3D view loaded" on each
// mode change so screen-reader users get an audible signal that the
// renderer just swapped. The element is the only live region in the
// app; MapGraphView and CallGraphView's existing live regions are
// scoped to find-widget status text only.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { CallGraphResult, ChangedFunction } from "@callmap/core";
import type { CallGraphViewHandle } from "./CallGraphView";

// Both views are loaded lazily so neither pins itself into the initial
// chunk. We use React.lazy with the same Suspense boundary so a mode
// flip never blocks render.
const CallGraphViewLazy = lazy(() => import("./CallGraphView"));
const MapGraphViewLazy = lazy(() => import("./MapGraphView"));
// v1.1.4 — 3D view lives behind a dynamic import. We wrap it in
// React.lazy so React handles the Suspense boundary, but we only let
// it construct when mode === "map3d" so the chunk is fetched on demand.
const Map3DViewLazy = lazy(() => import("./Map3DView"));

export type GraphMode = "review" | "map" | "map3d";

export interface GraphModeShellProps {
  mode: GraphMode;
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
  bookmarkedIds?: Set<string>;
  onContextMenu?: (fn: ChangedFunction, x: number, y: number) => void;
  showMinimap?: boolean;
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
  reducedMotion?: boolean;
  /** Forwarded only to the Review-mode renderer; Map mode has its own ref. */
  reviewRef?: React.RefObject<CallGraphViewHandle>;
}

const CROSSFADE_MS = 250;

export default function GraphModeShell({
  mode,
  graph,
  selectedId,
  onSelect,
  bookmarkedIds,
  onContextMenu,
  showMinimap,
  findOpen,
  onFindOpenChange,
  reducedMotion = false,
  reviewRef,
}: GraphModeShellProps) {
  // Track the previous mode so we can render both during a crossfade.
  const [renderMode, setRenderMode] = useState<GraphMode>(mode);
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === renderMode) return;
    setFading(true);
    timer.current && clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRenderMode(mode);
      setFading(false);
    }, CROSSFADE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [mode, renderMode]);

  // v1.2 — aria-live announcement on mode flip. The empty-string reset
  // tick that fires immediately before the new value is important: some
  // screen readers de-duplicate identical strings, so writing "" first
  // ensures a re-announce when the user toggles back to a mode they
  // were just on (e.g. map → review → map).
  const [liveText, setLiveText] = useState("");
  useEffect(() => {
    const label =
      mode === "review"
        ? "Review view"
        : mode === "map"
          ? "Map view"
          : "3D view loaded";
    setLiveText("");
    const t = setTimeout(() => setLiveText(label), 50);
    return () => clearTimeout(t);
  }, [mode]);

  const Loader = (
    <div className="flex h-full items-center justify-center bg-editor text-[13px] text-text-secondary">
      <div className="flex items-center gap-2 font-mono">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        <span>{mode === "map3d" ? "Loading 3D…" : "Preparing graph…"}</span>
      </div>
    </div>
  );

  // During a crossfade, render the outgoing view at opacity 0 (over
  // ~250ms) while the incoming view fades in.
  const outgoingOpacity = fading ? 0 : 1;
  const incomingOpacity = fading ? 1 : 1;

  return (
    <div className="relative h-full w-full" style={{ overflow: "hidden" }}>
      {/* v1.2 — Visually-hidden live region. Polite politeness so it
          waits until the user is idle to announce. role="status" makes
          it implicit aria-live=polite; we set both explicitly to be
          extra-safe across screen-reader implementations. */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="map-aria-live"
      >
        {liveText}
      </span>
      {/* Outgoing view */}
      <div
        className="absolute inset-0"
        style={{
          opacity: outgoingOpacity,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          pointerEvents: fading ? "none" : "auto",
        }}
      >
        <Suspense fallback={Loader}>
          {renderMode === "review" && (
            <CallGraphViewLazy
              ref={reviewRef}
              graph={graph}
              selectedId={selectedId}
              onSelect={onSelect}
              bookmarkedIds={bookmarkedIds}
              onContextMenu={onContextMenu}
              showMinimap={showMinimap}
              findOpen={findOpen}
              onFindOpenChange={onFindOpenChange}
            />
          )}
          {renderMode === "map" && (
            <MapGraphViewLazy
              graph={graph}
              selectedId={selectedId}
              onSelect={onSelect}
              bookmarkedIds={bookmarkedIds}
              onContextMenu={onContextMenu}
              findOpen={findOpen}
              onFindOpenChange={onFindOpenChange}
              reducedMotion={reducedMotion}
            />
          )}
          {renderMode === "map3d" && (
            <Map3DViewLazy
              graph={graph}
              selectedId={selectedId}
              onSelect={onSelect}
              bookmarkedIds={bookmarkedIds}
              reducedMotion={reducedMotion}
            />
          )}
        </Suspense>
      </div>

      {/* Incoming view (only mounted while fading) */}
      {fading && mode !== renderMode && (
        <div
          className="absolute inset-0"
          style={{
            opacity: incomingOpacity,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        >
          <Suspense fallback={Loader}>
            {mode === "review" && (
              <CallGraphViewLazy
                ref={reviewRef}
                graph={graph}
                selectedId={selectedId}
                onSelect={onSelect}
                bookmarkedIds={bookmarkedIds}
                onContextMenu={onContextMenu}
                showMinimap={showMinimap}
                findOpen={findOpen}
                onFindOpenChange={onFindOpenChange}
              />
            )}
            {mode === "map" && (
              <MapGraphViewLazy
                graph={graph}
                selectedId={selectedId}
                onSelect={onSelect}
                bookmarkedIds={bookmarkedIds}
                onContextMenu={onContextMenu}
                findOpen={findOpen}
                onFindOpenChange={onFindOpenChange}
                reducedMotion={reducedMotion}
              />
            )}
            {mode === "map3d" && (
              <Map3DViewLazy
                graph={graph}
                selectedId={selectedId}
                onSelect={onSelect}
                bookmarkedIds={bookmarkedIds}
                reducedMotion={reducedMotion}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );
}
