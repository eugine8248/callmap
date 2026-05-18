// v1.1.4 — 3D map view (easter egg). Filled in by phase 1.1.4.
// Until then this stub exports a placeholder component so the dynamic
// import in GraphModeShell type-checks. The real implementation pulls
// `react-force-graph-3d` and `three` via a separate dynamic import so
// they only enter the bundle when the user presses `gg`.

import type { CallGraphResult, ChangedFunction } from "@callmap/core";

interface Props {
  graph: CallGraphResult;
  selectedId: string | null;
  onSelect: (fn: ChangedFunction | null) => void;
  bookmarkedIds?: Set<string>;
  reducedMotion?: boolean;
}

export default function Map3DView(_props: Props) {
  return (
    <div className="flex h-full items-center justify-center bg-editor text-[13px] text-text-secondary font-mono">
      3D view loading…
    </div>
  );
}
