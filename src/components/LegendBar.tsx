import DiffBadge from "./DiffBadge";

export default function LegendBar({ stats }: {
  stats: { added: number; removed: number; changed: number; contextNodes: number };
}) {
  return (
    <div className="pointer-events-auto rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Legend
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2"><DiffBadge kind="added" /> <span className="text-slate-300">{stats.added}</span></div>
        <div className="flex items-center gap-2"><DiffBadge kind="changed" /> <span className="text-slate-300">{stats.changed}</span></div>
        <div className="flex items-center gap-2"><DiffBadge kind="removed" /> <span className="text-slate-300">{stats.removed}</span></div>
        <div className="flex items-center gap-2"><DiffBadge kind="neutral" /> <span className="text-slate-300">{stats.contextNodes}</span></div>
      </div>
    </div>
  );
}
