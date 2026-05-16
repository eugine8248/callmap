// VS Code-style command palette. Three modes:
//   "command"  — all global commands
//   "files"    — quick-open recent PRs (Ctrl+P)
//   "symbols"  — jump to function in the loaded graph (Ctrl+T)
//
// The same modal renders all three; only the data source and result
// row template change. Fuzzy matching is the same lightweight scorer.

import { useEffect, useMemo, useRef, useState } from "react";
import Codicon, { type CodiconName } from "./Codicon";
import type { CommandId } from "./keymap";
import { KEYMAP, renderShortcut } from "./keymap";
import type { ChangedFunction, RecentPr } from "@callmap/core";

export type PaletteMode = "command" | "files" | "symbols";

export interface CommandItem {
  id: CommandId;
  title: string;
  hint?: string;
  icon?: CodiconName;
}

interface Props {
  mode: PaletteMode;
  commands: CommandItem[];
  recents: RecentPr[];
  functions: ChangedFunction[];
  onClose: () => void;
  onRunCommand: (id: CommandId) => void;
  onOpenRecent: (url: string) => void;
  onJumpToFunction: (fn: ChangedFunction) => void;
}

export default function CommandPalette({
  mode,
  commands,
  recents,
  functions,
  onClose,
  onRunCommand,
  onOpenRecent,
  onJumpToFunction,
}: Props) {
  const [q, setQ] = useState(mode === "command" ? ">" : mode === "symbols" ? "@" : "");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Place caret at the end after the mode prefix
    const len = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(len, len);
  }, [mode]);

  const placeholder =
    mode === "command"
      ? "Type a command…"
      : mode === "files"
        ? "Search recent PRs by name…"
        : "Jump to function…";

  // Strip mode prefix from the query so the user can still see it.
  const rawQuery = (() => {
    if (mode === "command" && q.startsWith(">")) return q.slice(1).trimStart();
    if (mode === "symbols" && q.startsWith("@")) return q.slice(1).trimStart();
    return q.trimStart();
  })();

  const results = useMemo(() => {
    if (mode === "command") {
      return scoreList(commands, rawQuery, (c) => c.title).map((r) => ({
        kind: "command" as const,
        item: r.item,
      }));
    }
    if (mode === "files") {
      return scoreList(recents, rawQuery, (r) => `${r.title} ${slug(r.url)}`).map((r) => ({
        kind: "file" as const,
        item: r.item,
      }));
    }
    return scoreList(functions, rawQuery, (f) => `${f.name} ${f.file}`).map((r) => ({
      kind: "symbol" as const,
      item: r.item,
    }));
  }, [mode, rawQuery, commands, recents, functions]);

  useEffect(() => {
    setCursor(0);
  }, [rawQuery, mode]);

  // Keep the cursor row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function commit(index: number) {
    const row = results[index];
    if (!row) return;
    if (row.kind === "command") onRunCommand(row.item.id);
    else if (row.kind === "file") onOpenRecent(row.item.url);
    else onJumpToFunction(row.item);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(cursor);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-ide-overlay pt-[18vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[600px] max-w-[90vw] overflow-hidden rounded-md border border-ide-border bg-panel shadow-2xl">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="w-full border-b border-ide-border bg-ide-input px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none"
          spellCheck={false}
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-text-secondary">No results</div>
          ) : (
            results.map((row, i) => {
              const active = i === cursor;
              return (
                <button
                  key={`${row.kind}-${i}`}
                  data-row={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(i)}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                    active ? "bg-selected text-text-primary" : "text-text-primary",
                  ].join(" ")}
                >
                  {row.kind === "command" && <CommandRowContent item={row.item} />}
                  {row.kind === "file" && <FileRowContent item={row.item} />}
                  {row.kind === "symbol" && <SymbolRowContent item={row.item} />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-ide-border bg-sidebar px-3 py-1 text-[10px] text-text-secondary">
          <span>
            {mode === "command"
              ? "Run a command"
              : mode === "files"
                ? "Open a recent PR"
                : "Jump to function in this PR"}
          </span>
          <span>↑↓ navigate · Enter select · Esc close</span>
        </div>
      </div>
    </div>
  );
}

function CommandRowContent({ item }: { item: CommandItem }) {
  return (
    <>
      <Codicon name={item.icon ?? "play"} size={14} />
      <span className="truncate">{item.title}</span>
      {item.hint && (
        <span className="truncate text-[11px] text-text-secondary">{item.hint}</span>
      )}
      <span className="ml-auto font-mono text-[11px] text-text-secondary">
        {renderShortcut(KEYMAP[item.id])}
      </span>
    </>
  );
}

function FileRowContent({ item }: { item: RecentPr }) {
  return (
    <>
      <Codicon name="git-pull-request" size={14} />
      <span className="truncate">
        {item.title === item.url ? slug(item.url) : item.title}
      </span>
      <span className="ml-auto truncate font-mono text-[11px] text-text-secondary">
        {slug(item.url)}
      </span>
    </>
  );
}

function SymbolRowContent({ item }: { item: ChangedFunction }) {
  return (
    <>
      <Codicon name="symbol-method" size={14} />
      <span className="truncate font-mono">{item.name}</span>
      <span className="ml-auto truncate font-mono text-[11px] text-text-secondary">
        {item.file.split("/").slice(-2).join("/")}:{item.startLine}
      </span>
    </>
  );
}

// ── tiny fuzzy scorer ───────────────────────────────────────────────
function scoreList<T>(items: T[], q: string, key: (t: T) => string): Array<{ item: T; score: number }> {
  if (!q) return items.map((item, i) => ({ item, score: -i })); // preserve order
  const ql = q.toLowerCase();
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const k = key(item).toLowerCase();
    const s = score(k, ql);
    if (s > -Infinity) scored.push({ item, score: s });
  }
  return scored.sort((a, b) => b.score - a.score);
}

function score(text: string, query: string): number {
  // Exact substring → big bonus + prefer earlier match
  const i = text.indexOf(query);
  if (i >= 0) return 100 - i;
  // Subsequence match: every query char must appear in order
  let ti = 0;
  let qi = 0;
  let s = 0;
  while (ti < text.length && qi < query.length) {
    if (text[ti] === query[qi]) {
      s += 1;
      qi++;
    }
    ti++;
  }
  return qi === query.length ? s - text.length * 0.01 : -Infinity;
}

function slug(url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? `${m[1]}/${m[2]} #${m[3]}` : url;
}
