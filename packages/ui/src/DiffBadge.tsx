import type { ChangeKind } from "@callmap/core";

// Token-driven so themes flip cleanly. v0.1 kept ad-hoc Tailwind colors;
// v0.2 references the diff CSS vars so the badges match graph nodes
// and source-panel tinting under both light and dark themes.

const STYLES: Record<ChangeKind, { label: string; varName: string; sym: string }> = {
  added: { label: "added", varName: "--diff-added", sym: "+" },
  removed: { label: "removed", varName: "--diff-removed", sym: "−" },
  changed: { label: "changed", varName: "--diff-changed", sym: "~" },
  unchanged: { label: "context", varName: "--diff-neutral", sym: "·" },
  neutral: { label: "context", varName: "--diff-neutral", sym: "·" },
  external: { label: "ext", varName: "--diff-neutral", sym: "↗" },
};

export default function DiffBadge({ kind, size = "sm" }: { kind: ChangeKind; size?: "sm" | "md" }) {
  const s = STYLES[kind];
  const pad = size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm font-mono font-semibold ${pad}`}
      style={{
        color: `var(${s.varName})`,
        background: `var(${s.varName}-bg)`,
        border: `1px solid var(${s.varName})`,
      }}
    >
      <span aria-hidden="true">{s.sym}</span>
      <span>{s.label}</span>
    </span>
  );
}
