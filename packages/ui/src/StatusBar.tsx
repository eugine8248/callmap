// 22px tall full-width status bar. Three regions (left/center/right)
// mirror VS Code. Background turns amber when the GitHub rate-limit
// drops below 100 — the warning pattern users already know.

import Codicon from "./Codicon";
import type { RateLimit, CallGraphResult } from "@callmap/core";
import type { Theme } from "./theme";

interface Props {
  graph: CallGraphResult | null;
  rate: RateLimit | null;
  theme: Theme;
  onToggleTheme: () => void;
  onBackHome: (() => void) | null;
  /** v0.5 — minimap visibility toggle (status-bar entry on the right). */
  minimapVisible: boolean;
  onToggleMinimap: () => void;
  /** v1.1 — current graph view mode (Review / Map / Map 3D). */
  viewMode: "review" | "map" | "map3d";
  onToggleViewMode: () => void;
}

export default function StatusBar({
  graph,
  rate,
  theme,
  onToggleTheme,
  onBackHome,
  minimapVisible,
  onToggleMinimap,
  viewMode,
  onToggleViewMode,
}: Props) {
  const warn = !!rate && rate.remaining < 100;
  return (
    <footer
      className={[
        "flex h-[22px] shrink-0 items-center justify-between px-2 text-[11px] text-text-on-status",
        warn ? "bg-status-bar-warn" : "bg-status-bar",
      ].join(" ")}
      aria-label="Status bar"
    >
      <div className="flex items-center gap-3">
        {onBackHome && (
          <button
            onClick={onBackHome}
            className="flex items-center gap-1 hover:opacity-80"
            data-tooltip="Back to Welcome"
            aria-label="Back to Welcome"
          >
            <Codicon name="arrow-left" size={12} />
            <span>Home</span>
          </button>
        )}
        <div className="flex items-center gap-1">
          <Codicon name="git-branch" size={12} />
          {graph ? (
            <span className="tabular-nums">
              {graph.pr.owner}/{graph.pr.repo} #{graph.pr.number}
            </span>
          ) : (
            <span>no PR loaded</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {graph && (
          <span className="tabular-nums">
            {functionCount(graph)} funcs{languageBreakdown(graph)} · {graph.edges.length} edges
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {graph && (
          <button
            onClick={onToggleViewMode}
            className="flex items-center gap-1 hover:opacity-80"
            data-tooltip={
              viewMode === "review"
                ? "Switch to Map view (Ctrl+Shift+G)"
                : viewMode === "map"
                  ? "Switch to Review view (Ctrl+Shift+G)"
                  : "3D map (gg toggles)"
            }
            aria-label="Toggle graph view mode"
          >
            <Codicon
              name={viewMode === "review" ? "callmap-logo" : viewMode === "map3d" ? "globe" : "network"}
              size={12}
            />
            <span>
              {viewMode === "review" ? "Review" : viewMode === "map3d" ? "Map · 3D" : "Map"}
            </span>
          </button>
        )}
        {graph && (
          <button
            onClick={onToggleMinimap}
            className="flex items-center gap-1 hover:opacity-80"
            data-tooltip={minimapVisible ? "Hide minimap (Ctrl+Shift+M)" : "Show minimap (Ctrl+Shift+M)"}
            aria-label="Toggle minimap"
            aria-pressed={minimapVisible}
          >
            <Codicon name="map" size={12} />
            <span>{minimapVisible ? "Minimap" : "Minimap"}</span>
            {minimapVisible && (
              <span className="opacity-80" aria-hidden="true">●</span>
            )}
          </button>
        )}
        <div className="flex items-center gap-1" data-tooltip="GitHub API rate limit">
          <Codicon name="zap" size={12} />
          {rate ? (
            <span className="tabular-nums">
              GH {rate.remaining}/{rate.limit}
            </span>
          ) : (
            <span>GH —/—</span>
          )}
        </div>
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 hover:opacity-80"
          data-tooltip={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          aria-label="Toggle theme"
        >
          <Codicon name={theme === "dark" ? "sun" : "moon"} size={12} />
        </button>
      </div>
    </footer>
  );
}

// Exclude external placeholder nodes from the "funcs" total so the count
// reflects code-in-the-PR rather than synthesized stubs.
function functionCount(graph: CallGraphResult): number {
  return graph.functions.filter((f) => f.kind !== "external").length;
}

// "5 funcs (3 ts · 2 py) · 3 edges" — only render when ≥2 langs present.
function languageBreakdown(graph: CallGraphResult): string {
  const byLang = graph.stats.byLanguage ?? {};
  const entries = Object.entries(byLang).filter(([, n]) => n > 0);
  if (entries.length < 2) return "";
  entries.sort((a, b) => b[1] - a[1]);
  return ` (${entries.map(([lang, n]) => `${n} ${lang}`).join(" · ")})`;
}
