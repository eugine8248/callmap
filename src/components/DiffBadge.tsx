import type { ChangeKind } from "../types";

const STYLES: Record<ChangeKind, { label: string; bg: string; fg: string; sym: string }> = {
  added: { label: "added", bg: "bg-green-500/20", fg: "text-green-300", sym: "+" },
  removed: { label: "removed", bg: "bg-red-500/20", fg: "text-red-300", sym: "−" },
  changed: { label: "changed", bg: "bg-amber-500/20", fg: "text-amber-300", sym: "~" },
  unchanged: { label: "context", bg: "bg-slate-500/20", fg: "text-slate-300", sym: "·" },
  neutral: { label: "context", bg: "bg-slate-500/20", fg: "text-slate-300", sym: "·" },
};

export default function DiffBadge({ kind, size = "sm" }: { kind: ChangeKind; size?: "sm" | "md" }) {
  const s = STYLES[kind];
  const pad = size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-mono font-semibold ${pad} ${s.bg} ${s.fg}`}
    >
      <span aria-hidden="true">{s.sym}</span>
      <span>{s.label}</span>
    </span>
  );
}
