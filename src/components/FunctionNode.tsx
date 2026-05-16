import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { ChangedFunction } from "../types";
import DiffBadge from "./DiffBadge";

const BORDER: Record<string, string> = {
  added: "border-green-500/60 bg-green-500/5",
  removed: "border-red-500/60 bg-red-500/5 opacity-70",
  changed: "border-amber-500/60 bg-amber-500/5",
  unchanged: "border-slate-700 bg-slate-900",
  neutral: "border-slate-700 bg-slate-900",
};

function FunctionNodeImpl({ data, selected }: NodeProps) {
  const fn = data as unknown as ChangedFunction;
  const border = BORDER[fn.kind] ?? BORDER.neutral;
  return (
    <div
      className={`group rounded-md border ${border} ${selected ? "ring-2 ring-sky-400" : ""} px-3 py-2 shadow-md transition-colors`}
      style={{ width: 220 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-mono text-sm font-semibold text-slate-100" title={fn.name}>
          {fn.name}
        </div>
        <DiffBadge kind={fn.kind} />
      </div>
      <div
        className="mt-1 truncate text-[11px] text-slate-400"
        title={`${fn.file}:${fn.startLine}`}
      >
        {fn.file.split("/").slice(-2).join("/")}:{fn.startLine}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
}

export default memo(FunctionNodeImpl);
