// Collapsible 240px sidebar — content depends on which Activity Bar
// view is active. Width transition is driven from IdeShell so the
// editor area gets the freed space.

import { useEffect, useMemo, useState } from "react";
import Codicon, { type CodiconName } from "./Codicon";
import type { ActivityView } from "./ActivityBar";
import type { Bookmark, CallGraphResult, ChangedFunction, RecentPr } from "@callmap/core";
import {
  detectLanguage,
  groupLabel,
  languageGroup,
  type Language,
  type LanguageGroup,
} from "@callmap/core";
import type { HostBindings } from "./host";

interface Props {
  view: ActivityView;
  graph: CallGraphResult | null;
  onOpenPr: (url: string) => void;
  onSelectFile: (file: string) => void;
  onSelectFunction: (fn: ChangedFunction) => void;
  activeFile: string | null;
  recentVersion: number; // bump from parent to force a refresh after a load
  // v0.3: language filter — which groups are currently visible. Empty
  // set means "show all" (the default).
  langFilter: Set<LanguageGroup>;
  onToggleLang: (g: LanguageGroup) => void;
  onResetLangs: () => void;
  /** v0.4: host-supplied callbacks (recent storage, PAT, etc.). */
  host: HostBindings;
  /** v0.5 — bookmarks for the active PR. Empty array when no PR loaded. */
  bookmarks: Bookmark[];
  onJumpToBookmark: (b: Bookmark) => void;
  onRemoveBookmark: (b: Bookmark) => void;
  onClearBookmarks: () => void;
}

export default function Sidebar({
  view,
  graph,
  onOpenPr,
  onSelectFile,
  onSelectFunction,
  activeFile,
  recentVersion,
  langFilter,
  onToggleLang,
  onResetLangs,
  host,
  bookmarks,
  onJumpToBookmark,
  onRemoveBookmark,
  onClearBookmarks,
}: Props) {
  const title = TITLES[view];
  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col border-r border-ide-border bg-sidebar"
      aria-label={title}
    >
      <div className="flex h-9 shrink-0 items-center justify-between px-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {title}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {view === "pr" && (
          <PrExplorer
            graph={graph}
            onSelectFile={onSelectFile}
            onSelectFunction={onSelectFunction}
            activeFile={activeFile}
          />
        )}
        {view === "recent" && <RecentList onOpen={onOpenPr} version={recentVersion} host={host} />}
        {view === "bookmarks" && (
          <BookmarksPane
            graph={graph}
            bookmarks={bookmarks}
            onJump={onJumpToBookmark}
            onRemove={onRemoveBookmark}
            onClearAll={onClearBookmarks}
          />
        )}
        {view === "languages" && (
          <LanguagesPane
            graph={graph}
            langFilter={langFilter}
            onToggleLang={onToggleLang}
            onResetLangs={onResetLangs}
          />
        )}
        {view === "settings" && <SettingsPane host={host} />}
      </div>
    </aside>
  );
}

const TITLES: Record<ActivityView, string> = {
  pr: "PR Explorer",
  recent: "Recent PRs",
  bookmarks: "Bookmarks",
  languages: "Languages",
  settings: "Settings",
};

// ── PR Explorer ─────────────────────────────────────────────────────
function PrExplorer({
  graph,
  onSelectFile,
  onSelectFunction,
  activeFile,
}: {
  graph: CallGraphResult | null;
  onSelectFile: (file: string) => void;
  onSelectFunction: (fn: ChangedFunction) => void;
  activeFile: string | null;
}) {
  const byFile = useMemo(() => groupByFile(graph?.functions ?? []), [graph]);

  if (!graph) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-secondary">
        No PR loaded yet. Paste a URL on the editor pane to begin.
      </div>
    );
  }

  if (byFile.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-secondary">
        No supported source changes in this PR.
      </div>
    );
  }

  return (
    <ul className="py-1">
      {byFile.map(({ file, fns }) => (
        <FileRow
          key={file}
          file={file}
          fns={fns}
          active={activeFile === file}
          onSelectFile={() => onSelectFile(file)}
          onSelectFunction={onSelectFunction}
        />
      ))}
    </ul>
  );
}

function FileRow({
  file,
  fns,
  active,
  onSelectFile,
  onSelectFunction,
}: {
  file: string;
  fns: ChangedFunction[];
  active: boolean;
  onSelectFile: () => void;
  onSelectFunction: (fn: ChangedFunction) => void;
}) {
  const [open, setOpen] = useState(true);
  const short = file.split("/").slice(-1)[0];
  const dir = file.split("/").slice(0, -1).join("/");
  const lang = fns.find((f) => f.language)?.language ?? detectLanguage(file);
  return (
    <li>
      <button
        onClick={() => {
          setOpen((o) => !o);
          onSelectFile();
        }}
        className={[
          "flex w-full items-center gap-1 px-2 py-[3px] text-left text-[13px]",
          active ? "bg-selected text-text-primary" : "text-text-primary hover:bg-hover",
        ].join(" ")}
      >
        <Codicon name={open ? "chevron-down" : "chevron-right"} size={14} />
        <Codicon name={iconForLang(lang)} size={14} />
        <span className="truncate font-mono">{short}</span>
        {dir && (
          <span className="ml-1 truncate text-[11px] text-text-secondary">{dir}</span>
        )}
        <span className="ml-auto text-[11px] text-text-secondary">{fns.length}</span>
      </button>
      {open && (
        <ul>
          {fns.map((fn) => (
            <li key={fn.id}>
              <button
                onClick={() => onSelectFunction(fn)}
                className="flex w-full items-center gap-1.5 py-[2px] pl-7 pr-2 text-left text-[12px] text-text-primary hover:bg-hover"
              >
                <DiffDot kind={fn.kind} />
                <span className="truncate font-mono">{fn.qualifiedName || fn.name}</span>
                <span className="ml-auto text-[10px] text-text-disabled">L{fn.startLine}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function iconForLang(lang: Language): CodiconName {
  switch (lang) {
    case "py":
      return "file-py";
    case "go":
      return "file-go";
    case "ts":
    case "tsx":
      return "file-ts";
    case "js":
    case "jsx":
      return "file-js";
    default:
      return "file";
  }
}

function DiffDot({ kind }: { kind: ChangedFunction["kind"] }) {
  const color =
    kind === "added"
      ? "var(--diff-added)"
      : kind === "removed"
        ? "var(--diff-removed)"
        : kind === "changed"
          ? "var(--diff-changed)"
          : "var(--diff-neutral)";
  return (
    <span
      aria-hidden="true"
      style={{ background: color }}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
    />
  );
}

function groupByFile(fns: ChangedFunction[]): Array<{ file: string; fns: ChangedFunction[] }> {
  const map = new Map<string, ChangedFunction[]>();
  for (const fn of fns) {
    // External placeholders don't have a real file — group under "(external)"
    if (fn.kind === "external") continue;
    const arr = map.get(fn.file) ?? [];
    arr.push(fn);
    map.set(fn.file, arr);
  }
  return Array.from(map.entries())
    .map(([file, fns]) => ({ file, fns: fns.sort((a, b) => a.startLine - b.startLine) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

// ── Languages pane ──────────────────────────────────────────────────
// v0.3 entry point. Displays the per-language function counts produced
// by callgraphBuilder.stats.byLanguage and lets the user toggle each
// language on/off to filter the graph.
function LanguagesPane({
  graph,
  langFilter,
  onToggleLang,
  onResetLangs,
}: {
  graph: CallGraphResult | null;
  langFilter: Set<LanguageGroup>;
  onToggleLang: (g: LanguageGroup) => void;
  onResetLangs: () => void;
}) {
  if (!graph) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-secondary">
        Load a PR first to see its language mix.
      </div>
    );
  }
  // Aggregate from the live function set so the count reflects whatever
  // filter is currently active (or, when nothing is filtered, the full
  // PR breakdown).
  const counts = useMemo(() => {
    const m: Record<LanguageGroup, number> = { ts: 0, js: 0, py: 0, go: 0, unknown: 0 };
    for (const fn of graph.functions) {
      if (fn.kind === "external") continue;
      m[languageGroup(fn.language)]++;
    }
    return m;
  }, [graph]);
  const present = (["ts", "js", "py", "go"] as LanguageGroup[]).filter(
    (g) => counts[g] > 0
  );
  if (present.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-secondary">
        No detected languages in this PR.
      </div>
    );
  }
  const filtered = langFilter.size > 0;
  return (
    <div className="py-1">
      <ul>
        {present.map((g) => {
          const active = !filtered || langFilter.has(g);
          return (
            <li key={g}>
              <button
                onClick={() => onToggleLang(g)}
                className={[
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                  active ? "text-text-primary" : "text-text-disabled",
                  "hover:bg-hover",
                ].join(" ")}
                aria-pressed={active}
              >
                <Codicon name={iconForGroup(g)} size={14} />
                <span className="font-mono">{groupLabel(g)}</span>
                <span className="ml-auto tabular-nums text-[11px] text-text-secondary">
                  {counts[g]}
                </span>
                {active ? null : (
                  <span className="text-[10px] uppercase tracking-wider text-text-disabled">
                    hidden
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 px-3">
        <button
          onClick={onResetLangs}
          disabled={!filtered}
          className="text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Show all
        </button>
      </div>
      <p className="mt-3 px-3 text-[11px] text-text-disabled">
        Toggle a language to hide its nodes from the graph. v0.4 will add
        per-language stats and an import-graph option.
      </p>
    </div>
  );
}

function iconForGroup(g: LanguageGroup): CodiconName {
  switch (g) {
    case "py":
      return "file-py";
    case "go":
      return "file-go";
    case "ts":
      return "file-ts";
    case "js":
      return "file-js";
    default:
      return "file";
  }
}

// ── Recent PRs ──────────────────────────────────────────────────────
function RecentList({
  onOpen,
  version,
  host,
}: {
  onOpen: (url: string) => void;
  version: number;
  host: HostBindings;
}) {
  const [items, setItems] = useState<RecentPr[]>([]);
  useEffect(() => {
    setItems(host.getRecentPrs());
  }, [version, host]);

  if (items.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-secondary">
        No recent PRs yet. Load one from the editor pane and it'll show up here.
      </div>
    );
  }

  return (
    <ul className="py-1">
      {items.map((it) => (
        <li key={it.url} className="group flex items-center hover:bg-hover">
          <button
            onClick={() => onOpen(it.url)}
            className="min-w-0 flex-1 px-3 py-1.5 text-left"
          >
            <div className="truncate text-[12px] text-text-primary">
              {it.title === it.url ? formatSlug(it.url) : it.title}
            </div>
            <div className="truncate font-mono text-[10px] text-text-secondary">
              {formatSlug(it.url)}
            </div>
          </button>
          <button
            onClick={() => {
              host.removeRecentPr(it.url);
              setItems(host.getRecentPrs());
            }}
            className="hidden h-6 w-6 items-center justify-center text-text-secondary hover:text-text-primary group-hover:flex"
            data-tooltip="Remove from list"
            aria-label="Remove from list"
          >
            <Codicon name="close" size={12} />
          </button>
        </li>
      ))}
      <li className="mt-2 px-3">
        <button
          onClick={() => {
            host.clearRecentPrs();
            setItems([]);
          }}
          className="text-[11px] text-text-secondary hover:text-text-primary"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}

function formatSlug(url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? `${m[1]}/${m[2]} #${m[3]}` : url;
}

// ── Bookmarks pane (v0.5) ──────────────────────────────────────────
// Per-PR list of pinned function nodes. The pane displays a count, the
// entries themselves, and a "Clear all" link. Each row is keyed by the
// node id so the same function can't be double-bookmarked.
function BookmarksPane({
  graph,
  bookmarks,
  onJump,
  onRemove,
  onClearAll,
}: {
  graph: CallGraphResult | null;
  bookmarks: Bookmark[];
  onJump: (b: Bookmark) => void;
  onRemove: (b: Bookmark) => void;
  onClearAll: () => void;
}) {
  if (!graph) {
    return (
      <div className="px-4 py-4 text-center text-[12px] text-text-secondary">
        <Codicon name="bookmark" size={24} />
        <div className="mt-2">No PR loaded</div>
        <div className="mt-1 text-[11px] text-text-disabled">
          Load a PR, then right-click a function node to bookmark it.
        </div>
      </div>
    );
  }
  if (bookmarks.length === 0) {
    return (
      <div className="px-4 py-4 text-center text-[12px] text-text-secondary">
        <Codicon name="bookmark" size={24} />
        <div className="mt-2">No bookmarks yet</div>
        <div className="mt-1 text-[11px] text-text-disabled">
          Right-click a node in the graph and choose <em>Bookmark</em>.
        </div>
      </div>
    );
  }
  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-[11px] text-text-secondary tabular-nums">
        {bookmarks.length} bookmark{bookmarks.length === 1 ? "" : "s"} in this PR
      </div>
      <ul>
        {bookmarks.map((b) => (
          <li key={b.nodeId} className="group flex items-center hover:bg-hover">
            <button
              onClick={() => onJump(b)}
              className="min-w-0 flex-1 px-3 py-1.5 text-left"
              title={`${b.file}:${b.startLine}`}
            >
              <div className="flex items-center gap-2">
                <Codicon name="bookmark-filled" size={12} />
                <span className="truncate font-mono text-[12px] text-text-primary">
                  {b.name}
                </span>
              </div>
              <div className="truncate pl-[18px] font-mono text-[10px] text-text-secondary">
                {b.file}:{b.startLine}
              </div>
            </button>
            <button
              onClick={() => onRemove(b)}
              className="hidden h-6 w-6 items-center justify-center text-text-secondary hover:text-text-primary group-hover:flex"
              data-tooltip="Remove bookmark"
              aria-label="Remove bookmark"
            >
              <Codicon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 px-3">
        <button
          onClick={onClearAll}
          className="text-[11px] text-text-secondary hover:text-text-primary"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

// ── Settings pane ───────────────────────────────────────────────────
// v0.4: the host decides whether to show a PAT field at all. The VS Code
// extension delegates GitHub auth to vscode.authentication and renders
// an explanatory note instead.
function SettingsPane({ host }: { host: HostBindings }) {
  if (!host.supportsPatInput) {
    return (
      <div className="px-4 py-3 text-[12px] text-text-primary">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          GitHub authentication
        </div>
        <p className="text-text-secondary">
          callmap uses your VS Code GitHub sign-in (the same session powering
          the Pull Requests view). Open the Accounts menu in the activity bar
          to sign in or switch accounts — no PAT required.
        </p>
      </div>
    );
  }
  // v0.5 — getToken can now return a Promise (keychain-backed on desktop).
  // We resolve it once on mount and clear the local field on theme/host change.
  const [token, setLocalToken] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(host.getToken()).then((t) => {
      if (!cancelled) setLocalToken(t ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [host]);

  async function save() {
    await Promise.resolve(host.setToken(token));
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1200);
  }

  return (
    <div className="px-4 py-3 text-[12px] text-text-primary">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        GitHub PAT
      </div>
      <p className="text-text-secondary">
        Raises the API limit from 60 to 5000 requests / hour. Only the{" "}
        <code className="font-mono text-text-primary">public_repo</code> scope is needed.
      </p>
      <input
        type="password"
        value={token}
        onChange={(e) => setLocalToken(e.target.value)}
        placeholder="ghp_…"
        className="mt-2 w-full rounded-sm border border-ide-border bg-ide-input px-2 py-1 font-mono text-[12px] text-text-primary placeholder:text-text-disabled focus:border-ide-border-focus focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={save}
          className="rounded-sm bg-accent px-3 py-1 text-[12px] font-semibold text-text-on-status hover:bg-accent-hover"
        >
          Save
        </button>
        {savedHint && <span className="text-[11px] text-diff-added">Saved.</span>}
      </div>
    </div>
  );
}
