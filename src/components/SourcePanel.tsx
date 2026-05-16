import { useMemo } from "react";
import type { ChangedFunction } from "../types";
import DiffBadge from "./DiffBadge";

interface Props {
  fn: ChangedFunction | null;
  onClose: () => void;
}

export default function SourcePanel({ fn, onClose }: Props) {
  if (!fn) return null;

  const lines = useMemo(() => fn.body.split("\n"), [fn.body]);
  const oldLines = useMemo(
    () => (fn.oldBody ? fn.oldBody.split("\n") : null),
    [fn.oldBody]
  );

  const showDiff = fn.kind === "changed" && oldLines;

  return (
    <aside className="flex h-full w-[480px] flex-col border-l border-slate-800 bg-slate-950">
      <header className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DiffBadge kind={fn.kind} size="md" />
            <h2 className="truncate font-mono text-sm font-semibold text-slate-100" title={fn.name}>
              {fn.name}
            </h2>
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-400" title={fn.file}>
            {fn.file}:{fn.startLine}–{fn.endLine}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        {showDiff ? (
          <DiffView before={oldLines!} after={lines} />
        ) : (
          <SingleView lines={lines} kind={fn.kind} />
        )}
      </div>
    </aside>
  );
}

function SingleView({ lines, kind }: { lines: string[]; kind: ChangedFunction["kind"] }) {
  const tint =
    kind === "added"
      ? "bg-green-500/5"
      : kind === "removed"
        ? "bg-red-500/5"
        : "";
  return (
    <pre className={`m-0 p-0 ${tint}`}>
      <code className="block font-mono text-[12px] leading-5">
        {lines.map((ln, i) => (
          <div key={i} className="flex">
            <span className="select-none w-10 shrink-0 pr-2 text-right text-slate-600">
              {i + 1}
            </span>
            <span className="whitespace-pre text-slate-200">{ln || " "}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

// Very small line-based diff (LCS). Enough for the "what changed in this fn"
// preview. v0.2 backlog: drop in diff-match-patch for word-level highlights.
function DiffView({ before, after }: { before: string[]; after: string[] }) {
  const ops = lcsDiff(before, after);
  return (
    <pre className="m-0 p-0">
      <code className="block font-mono text-[12px] leading-5">
        {ops.map((op, i) => {
          let bg = "";
          let prefix = " ";
          if (op.kind === "add") {
            bg = "bg-green-500/10";
            prefix = "+";
          } else if (op.kind === "del") {
            bg = "bg-red-500/10";
            prefix = "−";
          }
          return (
            <div key={i} className={`flex ${bg}`}>
              <span className="select-none w-6 shrink-0 text-center text-slate-500">{prefix}</span>
              <span className="whitespace-pre text-slate-200">{op.line || " "}</span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}

type DiffOp = { kind: "ctx" | "add" | "del"; line: string };

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "ctx", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "del", line: a[i] });
      i++;
    } else {
      ops.push({ kind: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ kind: "del", line: a[i++] });
  while (j < m) ops.push({ kind: "add", line: b[j++] });
  return ops;
}
