import { useMemo } from "react";
import type { ChangedFunction } from "@callmap/core";
import { languageLabel } from "@callmap/core";
import DiffBadge from "./DiffBadge";
import Codicon from "./Codicon";
import { highlightLines } from "./highlight";

interface Props {
  fn: ChangedFunction | null;
  onClose: () => void;
}

export default function SourcePanel({ fn, onClose }: Props) {
  if (!fn) return null;

  const lines = useMemo(() => fn.body.split("\n"), [fn.body]);
  const highlighted = useMemo(
    () => highlightLines(fn.body, fn.language),
    [fn.body, fn.language]
  );
  const oldHighlighted = useMemo(
    () => (fn.oldBody ? highlightLines(fn.oldBody, fn.language) : null),
    [fn.oldBody, fn.language]
  );
  const oldLines = useMemo(
    () => (fn.oldBody ? fn.oldBody.split("\n") : null),
    [fn.oldBody]
  );

  const showDiff = fn.kind === "changed" && oldLines;
  const isExternal = fn.kind === "external";

  return (
    <aside className="flex h-full w-full flex-col bg-editor">
      <header className="flex items-start justify-between gap-2 border-b border-ide-border bg-sidebar px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DiffBadge kind={fn.kind} size="md" />
            {!isExternal && fn.language !== "unknown" && (
              <span
                className="rounded-sm border border-ide-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-secondary"
                title={`Language: ${languageLabel(fn.language)}`}
              >
                {languageLabel(fn.language)}
              </span>
            )}
            <h2 className="truncate font-mono text-[13px] font-semibold text-text-primary" title={fn.name}>
              {fn.name}
            </h2>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-text-secondary" title={fn.file}>
            {isExternal
              ? "external · not in the changed-files set"
              : `${fn.file}:${fn.startLine}–${fn.endLine}`}
          </div>
          {fn.disambiguated === false && fn.ambiguousCallees && fn.ambiguousCallees.length > 0 && (
            <div
              className="mt-1 text-[11px]"
              style={{ color: "var(--diff-changed)" }}
              title="Name-only resolution can't pick a single target"
            >
              ⚠ ambiguous callee(s): {fn.ambiguousCallees.join(", ")}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-sm p-1 text-text-secondary hover:bg-hover hover:text-text-primary"
          aria-label="Close (Esc)"
          data-tooltip="Close (Esc)"
        >
          <Codicon name="close" size={14} />
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        {showDiff ? (
          <DiffView before={oldLines!} after={lines} beforeHl={oldHighlighted!} afterHl={highlighted} />
        ) : (
          <SingleView lines={lines} highlighted={highlighted} kind={fn.kind} />
        )}
      </div>
    </aside>
  );
}

function SingleView({
  lines,
  highlighted,
  kind,
}: {
  lines: string[];
  highlighted: string[];
  kind: ChangedFunction["kind"];
}) {
  const tintVar =
    kind === "added"
      ? "var(--diff-added-bg)"
      : kind === "removed"
        ? "var(--diff-removed-bg)"
        : "transparent";
  return (
    <pre className="m-0 p-0" style={{ background: tintVar }}>
      <code className="hljs block font-mono text-[12px] leading-5">
        {lines.map((ln, i) => (
          <div key={i} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-text-disabled">
              {i + 1}
            </span>
            <span
              className="whitespace-pre"
              dangerouslySetInnerHTML={{ __html: highlighted[i] || (ln ? "" : "&nbsp;") }}
            />
          </div>
        ))}
      </code>
    </pre>
  );
}

// Line-based LCS diff — same algorithm as v0.2. v0.3 wraps each line with
// the pre-highlighted HTML so the diff still has syntax color.
function DiffView({
  before,
  after,
  beforeHl,
  afterHl,
}: {
  before: string[];
  after: string[];
  beforeHl: string[];
  afterHl: string[];
}) {
  const ops = lcsDiff(before, after, beforeHl, afterHl);
  return (
    <pre className="m-0 p-0">
      <code className="hljs block font-mono text-[12px] leading-5">
        {ops.map((op, i) => {
          let bg = "transparent";
          let prefix = " ";
          let prefixColor = "var(--text-disabled)";
          if (op.kind === "add") {
            bg = "var(--diff-added-bg)";
            prefix = "+";
            prefixColor = "var(--diff-added)";
          } else if (op.kind === "del") {
            bg = "var(--diff-removed-bg)";
            prefix = "−";
            prefixColor = "var(--diff-removed)";
          }
          return (
            <div key={i} className="flex" style={{ background: bg }}>
              <span
                className="w-6 shrink-0 select-none text-center"
                style={{ color: prefixColor }}
              >
                {prefix}
              </span>
              <span
                className="whitespace-pre"
                dangerouslySetInnerHTML={{ __html: op.html || "&nbsp;" }}
              />
            </div>
          );
        })}
      </code>
    </pre>
  );
}

type DiffOp = { kind: "ctx" | "add" | "del"; html: string };

function lcsDiff(a: string[], b: string[], aHl: string[], bHl: string[]): DiffOp[] {
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
      ops.push({ kind: "ctx", html: bHl[j] ?? a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "del", html: aHl[i] ?? a[i] });
      i++;
    } else {
      ops.push({ kind: "add", html: bHl[j] ?? b[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ kind: "del", html: aHl[i] ?? a[i] }); i++; }
  while (j < m) { ops.push({ kind: "add", html: bHl[j] ?? b[j] }); j++; }
  return ops;
}
