import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { ChangedFunction } from "@callmap/core";
import { languageLabel } from "@callmap/core";
import Codicon from "./Codicon";
import DiffBadge from "./DiffBadge";

// Color comes from CSS vars so dark/light flip is just a data-theme swap.
const KIND_VAR: Record<string, string> = {
  added: "--diff-added",
  removed: "--diff-removed",
  changed: "--diff-changed",
  unchanged: "--diff-neutral",
  neutral: "--diff-neutral",
  external: "--diff-neutral",
};

// v0.5 — node data carries two extra hidden flags injected by
// CallGraphView: `__bookmarked` (render pin overlay) and `__flashing`
// (render brief halo after a search-hit jump).
interface NodeData extends ChangedFunction {
  __bookmarked?: boolean;
  __flashing?: boolean;
}

function FunctionNodeImpl({ data, selected }: NodeProps) {
  const fn = data as unknown as NodeData;
  const v = KIND_VAR[fn.kind] ?? KIND_VAR.neutral;
  const isExternal = fn.kind === "external";
  const ambiguousNote =
    fn.disambiguated === false && fn.ambiguousCallees && fn.ambiguousCallees.length > 0
      ? `Ambiguous callee(s): ${fn.ambiguousCallees.join(", ")} — name-only resolution can't pick one of N functions.`
      : null;

  // v0.5 — halo. We use box-shadow rings so the layout doesn't reflow.
  // Halo > selected > base.
  let boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  if (fn.__flashing) {
    boxShadow = "0 0 0 3px var(--accent), 0 0 14px 4px rgba(0, 122, 204, 0.55), 0 2px 6px rgba(0,0,0,0.4)";
  } else if (selected) {
    boxShadow = "0 0 0 2px var(--accent), 0 2px 6px rgba(0,0,0,0.4)";
  }

  return (
    <div
      className="group relative rounded-sm shadow-md transition-shadow"
      style={{
        width: 220,
        background: "var(--bg-panel)",
        border: isExternal
          ? `1px dashed var(${v})`
          : `1px solid var(${v})`,
        boxShadow,
        opacity: fn.kind === "removed" ? 0.7 : isExternal ? 0.55 : 1,
      }}
      title={ambiguousNote ?? undefined}
    >
      <Handle type="target" position={Position.Top} style={{ background: "var(--diff-neutral)" }} />
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <div
          className="truncate font-mono text-[13px] font-semibold text-text-primary"
          title={fn.name}
        >
          {fn.name}
        </div>
        <div className="flex items-center gap-1">
          {!isExternal && <LangChip lang={fn.language} />}
          <DiffBadge kind={fn.kind} />
        </div>
      </div>
      <div
        className="truncate px-3 pb-2 pt-0.5 font-mono text-[11px] text-text-secondary"
        title={isExternal ? "External callee — not in this PR's changed-files set" : `${fn.file}:${fn.startLine}`}
      >
        {isExternal
          ? "external · v0.5 keeps node, body lives outside PR"
          : `${fn.file.split("/").slice(-2).join("/")}:${fn.startLine}`}
      </div>
      {ambiguousNote && (
        <div
          className="truncate border-t border-ide-border px-3 py-1 font-mono text-[10px]"
          style={{ color: "var(--diff-changed)" }}
          title={ambiguousNote}
        >
          ⚠ ambiguous
        </div>
      )}
      {/* v0.5 — bookmark pin glyph, top-right corner */}
      {fn.__bookmarked && (
        <span
          aria-label="Bookmarked"
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-text-on-status shadow-sm"
          title="Bookmarked"
        >
          <Codicon name="pin" size={10} />
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--diff-neutral)" }} />
    </div>
  );
}

function LangChip({ lang }: { lang: ChangedFunction["language"] }) {
  if (!lang || lang === "unknown") return null;
  return (
    <span
      className="rounded-sm border px-1 font-mono text-[9px] uppercase tracking-wide text-text-secondary"
      style={{ borderColor: "var(--border)" }}
      title={`Language: ${languageLabel(lang)}`}
    >
      {languageLabel(lang)}
    </span>
  );
}

export default memo(FunctionNodeImpl);
