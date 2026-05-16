import DiffBadge from "./DiffBadge";

export default function LegendBar({ stats }: {
  stats: { added: number; removed: number; changed: number; contextNodes: number; externalNodes?: number };
}) {
  return (
    <div className="pointer-events-auto rounded-sm border border-ide-border bg-panel/95 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
        Legend
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <DiffBadge kind="added" />
          <span className="tabular-nums text-text-primary">{stats.added}</span>
        </div>
        <div className="flex items-center gap-2">
          <DiffBadge kind="changed" />
          <span className="tabular-nums text-text-primary">{stats.changed}</span>
        </div>
        <div className="flex items-center gap-2">
          <DiffBadge kind="removed" />
          <span className="tabular-nums text-text-primary">{stats.removed}</span>
        </div>
        <div className="flex items-center gap-2">
          <DiffBadge kind="neutral" />
          <span className="tabular-nums text-text-primary">{stats.contextNodes}</span>
        </div>
        {(stats.externalNodes ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <DiffBadge kind="external" />
            <span className="tabular-nums text-text-primary">{stats.externalNodes}</span>
          </div>
        )}
      </div>
    </div>
  );
}
