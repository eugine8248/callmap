// v0.5 main shell. Owns the IDE layout (Activity Bar / Sidebar /
// Editor / Status Bar), keyboard dispatch (command palette, quick-
// open, jump-to-function, sidebar/source toggles, theme, minimap,
// inline find), bookmarks lifecycle, and the PR loading lifecycle.
//
// v0.4 ported into @callmap/ui. Platform-specific behavior (open in
// browser, recent storage, PAT, bookmarks) is delegated to a
// HostBindings prop so the same shell renders inside the Tauri desktop
// app and the VS Code webview without code duplication.
//
// v0.5 changes:
//   • code-split CallGraphView (xyflow + dagre dependencies) behind
//     React.lazy so the initial bundle stays under 300 KB gzip
//   • Bookmarks pane wired (Ctrl+right-click → Bookmark)
//   • Minimap toggle (Ctrl+Shift+M, status-bar entry, palette)
//   • Inline find-widget (Ctrl+F when graph is focused)
//   • Migration toast when a desktop user's PAT moves to the OS keychain

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildCallGraphFromPrUrl,
  type BuildProgress,
  GithubError,
  getLastRateLimit,
  type RateLimit,
  type Bookmark,
  type CallGraphResult,
  type ChangedFunction,
  type RecentPr,
  languageGroup,
  type LanguageGroup,
} from "@callmap/core";
import { applyInitialTheme, getTheme, toggleTheme, type Theme } from "./theme";
import { KEYMAP, matchShortcut, type CommandId } from "./keymap";
import type { HostBindings } from "./host";

import ActivityBar, { type ActivityView } from "./ActivityBar";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import Breadcrumbs from "./Breadcrumbs";
import CommandPalette, { type CommandItem, type PaletteMode } from "./CommandPalette";
import type { CallGraphViewHandle } from "./CallGraphView";
import LegendBar from "./LegendBar";
import EmptyState from "./EmptyState";
import PrInputForm, { type PrInputFormHandle } from "./PrInputForm";
import Codicon from "./Codicon";

// v0.5 — Lazy-load the graph stack. CallGraphView pulls in xyflow +
// dagre (~177KB gzip combined) which is the single biggest chunk in
// the app. Splitting it lets the welcome pane render with a tiny
// initial bundle (< 150 KB target). SourcePanel similarly pulls in
// highlight.js so we lazy-load it on demand too.
//
// v1.1.0 — Graph rendering goes through GraphModeShell, which itself
// React.lazy-loads both CallGraphView and MapGraphView. This keeps
// d3-force out of the initial chunk and only fetches it when the user
// flips to Map mode for the first time.
const GraphModeShellLazy = lazy(() => import("./GraphModeShell"));
const SourcePanelLazy = lazy(() => import("./SourcePanel"));

export interface IdeShellProps {
  /** Platform-specific callbacks supplied by the host. */
  host: HostBindings;
  /**
   * Optional initial PR URL. Desktop deep-links read it from the URL hash;
   * the VS Code panel passes it in directly when the user already supplied
   * one via the openPR command.
   */
  initialUrl?: string | null;
}

const MINIMAP_KEY = "callmap.ui.minimapVisible";
// v1.1 — persist the current graph-rendering mode so a reload lands on
// the same view the user chose. Values: "review" | "map" | "map3d".
// The 3D bucket is the easter-egg path; we only return to it on reload
// if the user explicitly enabled it.
const VIEW_MODE_KEY = "callmap.ui.viewMode";
const TOAST_TIMEOUT_MS = 5500;
const GG_KEYPRESS_WINDOW_MS = 400; // v1.1.4 — "gg" sequence window

interface ToastState {
  id: number;
  text: string;
}

export default function IdeShell({ host, initialUrl = null }: IdeShellProps) {
  // ── Layout state ────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ActivityView>("pr");
  const [sourceWidth, setSourceWidth] = useState(480);
  const [theme, setThemeState] = useState<Theme>("dark");
  const [showLegend, setShowLegend] = useState(host.defaultShowLegend ?? true);
  const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null);
  const [minimapVisible, setMinimapVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MINIMAP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [findOpen, setFindOpen] = useState(false);
  // v1.1 — view-mode state. We hydrate from localStorage and persist
  // every change. The 3D bucket only survives a reload if the user
  // explicitly chose it — see the keypress sequence further down.
  const [viewMode, setViewMode] = useState<import("./GraphModeShell").GraphMode>(() => {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      if (v === "map" || v === "map3d") return v;
    } catch {
      /* noop */
    }
    return "review";
  });

  // ── PR state ────────────────────────────────────────────────────
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialUrl);
  const [graph, setGraph] = useState<CallGraphResult | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChangedFunction | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [rate, setRate] = useState<RateLimit | null>(getLastRateLimit());
  const [recentVersion, setRecentVersion] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  // v0.3: language filter for the Languages activity-bar pane. An empty
  // set means "show all languages" — the default after every PR load.
  const [langFilter, setLangFilter] = useState<Set<LanguageGroup>>(new Set());

  // ── v0.5 — bookmarks state ──────────────────────────────────────
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    fn: ChangedFunction;
    x: number;
    y: number;
  } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Refs ────────────────────────────────────────────────────────
  const graphRef = useRef<CallGraphViewHandle>(null);
  const inputRef = useRef<PrInputFormHandle>(null);

  // ── Theme bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    applyInitialTheme();
    setThemeState(getTheme());
  }, []);

  // ── Persist minimap preference ──────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(MINIMAP_KEY, minimapVisible ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [minimapVisible]);

  // ── v1.1 — Persist view-mode preference ─────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* noop */
    }
  }, [viewMode]);

  // ── Deep-link bootstrap ─────────────────────────────────────────
  // Desktop: v0.1 bookmarks live as /graph?url=… and arrive here via
  // the App.tsx redirect that rewrites them to /?url=…
  // VS Code: the host passes initialUrl directly via props; we still
  // run this effect so window-hash deep links work in either context.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialUrl) return; // host already gave us a URL — skip hash parsing
    // HashRouter places the search params after the # so URLSearchParams(window.location.search) misses them.
    const hash = window.location.hash;
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : window.location.search.slice(1);
    const sp = new URLSearchParams(q);
    const url = sp.get("url");
    if (url) setCurrentUrl(url);
    // run-once: deep-link only on first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PR loader effect ────────────────────────────────────────────
  useEffect(() => {
    if (!currentUrl) return;
    let cancelled = false;
    setError(null);
    setGraph(null);
    setSelected(null);
    setActiveFile(null);
    setProgress({ phase: "meta", message: "Starting…" });

    buildCallGraphFromPrUrl(currentUrl, (p) => {
      if (!cancelled) {
        setProgress(p);
        setRate(getLastRateLimit());
      }
    })
      .then((g) => {
        if (cancelled) return;
        setGraph(g);
        setProgress(null);
        setRate(getLastRateLimit());
        setLangFilter(new Set()); // v0.3: reset filter on every PR load
        host.addRecentPr({ url: currentUrl, title: g.pr.title, loadedAt: Date.now() });
        setRecentVersion((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof GithubError && e.isRateLimit
            ? host.supportsPatInput
              ? "GitHub rate limit hit. Add a Personal Access Token in Settings (sidebar gear icon) to raise the limit to 5000/hr."
              : "GitHub rate limit hit. Open VS Code's Accounts menu and sign in with GitHub to raise the limit to 5000/hr."
            : e instanceof Error
              ? e.message
              : String(e)
        );
        setProgress(null);
        setRate(getLastRateLimit());
      });

    return () => {
      cancelled = true;
    };
  }, [currentUrl, reloadKey]);

  // ── Bookmarks reload when PR changes ────────────────────────────
  // The host stores bookmarks per-PR. When the graph (re)loads we ask
  // the host for the bookmarks attached to this prKey.
  const prKey = graph
    ? `${graph.pr.owner}/${graph.pr.repo}#${graph.pr.number}`
    : null;
  useEffect(() => {
    if (!prKey) {
      setBookmarks([]);
      return;
    }
    setBookmarks(host.getBookmarks(prKey));
  }, [prKey, host]);

  // ── Recent PRs feed (sidebar + palette) ─────────────────────────
  const recents: RecentPr[] = useMemo(
    () => host.getRecentPrs(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recentVersion, host]
  );

  // ── Toast helper ────────────────────────────────────────────────
  // Hosts (specifically the desktop keychain migration) can fire a
  // toast via window event 'callmap:toast'. We listen here so the
  // shell owns the visual treatment.
  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ text: string }>;
      if (!ce.detail?.text) return;
      const id = Date.now();
      setToast({ id, text: ce.detail.text });
      setTimeout(() => {
        setToast((t) => (t && t.id === id ? null : t));
      }, TOAST_TIMEOUT_MS);
    }
    window.addEventListener("callmap:toast", onToast as EventListener);
    return () => window.removeEventListener("callmap:toast", onToast as EventListener);
  }, []);

  // ── Commands ────────────────────────────────────────────────────
  const COMMAND_ITEMS: CommandItem[] = useMemo(
    () => [
      { id: "pr.focusInput", title: "Load PR…", hint: "Focus the PR URL input", icon: "git-pull-request" },
      { id: "sidebar.toggle", title: "Toggle Sidebar", icon: "chevron-left" },
      { id: "theme.toggle", title: "Toggle Theme (Dark / Light)", icon: "sun" },
      { id: "legend.toggle", title: "Show / Hide Legend", icon: "info" },
      { id: "minimap.toggle", title: "View: Toggle Minimap", icon: "map" },
      // v1.1 — Map view entries. We expose three palette commands:
      // the toggle (the muscle-memory entry), plus the two explicit
      // "switch to X" so users can land on either mode without
      // having to guess what the current mode is.
      { id: "viewMode.toggle", title: "View: Toggle Map", icon: "network" },
      { id: "viewMode.map", title: "View: Switch to Map mode", icon: "network" },
      { id: "viewMode.review", title: "View: Switch to Review mode", icon: "callmap-logo" },
      { id: "search.openInGraph", title: "Find in Graph…", icon: "search" },
      { id: "bookmarks.show", title: "Show Bookmarks Pane", icon: "bookmark" },
      { id: "recent.clear", title: "Clear Recent PRs", icon: "trash" },
      { id: "pr.openInBrowser", title: "Open GitHub PR in Browser", icon: "link-external" },
      { id: "pr.reload", title: "Reload Current PR", icon: "refresh" },
    ],
    []
  );

  const runCommand = useCallback(
    (id: CommandId) => {
      switch (id) {
        case "palette.open":
          setPaletteMode("command");
          return;
        case "palette.quickOpen":
          setPaletteMode("files");
          return;
        case "palette.jumpToFunction":
          setPaletteMode("symbols");
          return;
        case "sidebar.toggle":
          setSidebarCollapsed((c) => !c);
          return;
        case "theme.toggle": {
          const next = toggleTheme();
          setThemeState(next);
          return;
        }
        case "source.close":
          setSelected(null);
          return;
        case "legend.toggle":
          setShowLegend((s) => !s);
          return;
        case "minimap.toggle":
          setMinimapVisible((m) => !m);
          return;
        case "viewMode.toggle":
          // The toggle hop is binary between Review and Map; the 3D
          // bucket is reachable only through the gg easter egg.
          setViewMode((m) => (m === "review" ? "map" : "review"));
          return;
        case "viewMode.review":
          setViewMode("review");
          return;
        case "viewMode.map":
          setViewMode("map");
          return;
        case "search.openInGraph":
          if (graph && graph.functions.length > 0) {
            setPaletteMode(null);
            setFindOpen(true);
          }
          return;
        case "bookmarks.show":
          setSidebarCollapsed(false);
          setActiveView("bookmarks");
          return;
        case "recent.clear":
          host.clearRecentPrs();
          setRecentVersion((v) => v + 1);
          return;
        case "pr.openInBrowser":
          if (graph?.pr.url) host.openExternal(graph.pr.url);
          return;
        case "pr.reload":
          if (currentUrl) setReloadKey((k) => k + 1);
          return;
        case "pr.focusInput":
          // Closing the palette before focusing lets the input grab focus.
          setPaletteMode(null);
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
      }
    },
    [graph, currentUrl, host]
  );

  // ── Global keymap ───────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't swallow shortcuts when the user is mid-typing in the
      // palette — the palette has its own handler. Same for the
      // find-widget.
      const target = e.target as HTMLElement | null;
      const isInPalette = !!target?.closest("[data-palette]");
      const isInFindWidget = !!target?.closest("[data-find-widget]");

      // Source-panel close (Esc) — only when source is open and palette is closed
      if (!paletteMode && !isInPalette && !isInFindWidget && matchShortcut(e, KEYMAP["source.close"]!)) {
        if (findOpen) {
          // Esc in graph context first closes the find-widget.
          e.preventDefault();
          setFindOpen(false);
          return;
        }
        if (contextMenu) {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
        if (selected) {
          e.preventDefault();
          setSelected(null);
          return;
        }
      }

      // Palette/global shortcuts work everywhere (including inside text inputs)
      for (const id of [
        "palette.open",
        "palette.quickOpen",
        "palette.jumpToFunction",
        "sidebar.toggle",
        "minimap.toggle",
        "search.openInGraph",
        "viewMode.toggle",
      ] as const) {
        const s = KEYMAP[id];
        if (s && matchShortcut(e, s)) {
          // Ctrl+F inside a text input (e.g. the PR URL field) should
          // still fall through to the browser default *unless* we have
          // a graph rendered.
          if (id === "search.openInGraph") {
            const isText =
              target?.tagName === "INPUT" ||
              target?.tagName === "TEXTAREA" ||
              (target as HTMLElement | null)?.isContentEditable;
            if (isText && !target?.closest("[data-graph]")) return;
            if (!graph || graph.functions.length === 0) return;
          }
          e.preventDefault();
          runCommand(id);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteMode, selected, contextMenu, findOpen, graph, runCommand]);

  // ── v1.1.4 — gg easter egg ──────────────────────────────────────
  // Press 'g' twice within 400ms while in Map mode to flip to the 3D
  // view (loaded behind a dynamic import). A second `gg` returns to
  // 2D. We track the timestamp of the previous 'g' in a ref so we
  // don't spam re-renders. Skipped while the palette / find widget /
  // any text input is focused so the sequence doesn't fight with
  // normal typing.
  const lastGRef = useRef<number>(0);
  useEffect(() => {
    function onG(e: KeyboardEvent) {
      if (e.key !== "g" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        lastGRef.current = 0;
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        (target as HTMLElement | null)?.isContentEditable ||
        target?.closest("[data-palette]") ||
        target?.closest("[data-find-widget]")
      ) {
        lastGRef.current = 0;
        return;
      }
      // Easter egg only active when we're already in Map mode (2D
      // or 3D). From Review mode 'g' is a no-op so the user doesn't
      // get a surprise transition from the typing-on-canvas reflex.
      if (viewMode === "review") return;
      const now = performance.now();
      if (now - lastGRef.current < GG_KEYPRESS_WINDOW_MS) {
        lastGRef.current = 0;
        setViewMode((m) => (m === "map3d" ? "map" : "map3d"));
      } else {
        lastGRef.current = now;
      }
    }
    window.addEventListener("keydown", onG);
    return () => window.removeEventListener("keydown", onG);
  }, [viewMode]);

  // ── Sidebar callbacks ───────────────────────────────────────────
  function onSelectActivity(v: ActivityView) {
    setActiveView(v);
  }

  function onOpenPr(url: string) {
    setPaletteMode(null);
    setCurrentUrl(url);
  }

  function onJumpToFunction(fn: ChangedFunction) {
    setPaletteMode(null);
    setSelected(fn);
    setActiveFile(fn.file);
    graphRef.current?.centerOnNode(fn.id);
    graphRef.current?.flashNode(fn.id);
  }

  function onSelectFile(file: string) {
    setActiveFile(file);
  }

  function onSelectFunctionFromTree(fn: ChangedFunction) {
    setSelected(fn);
    setActiveFile(fn.file);
    graphRef.current?.centerOnNode(fn.id);
  }

  function onToggleLang(g: LanguageGroup) {
    setLangFilter((prev) => {
      // Empty filter == "show all". First toggle starts a fresh allow-list
      // initialized to the full set of present languages, then removes
      // the clicked language so the UI's pressed state stays intuitive.
      if (prev.size === 0) {
        const all = new Set<LanguageGroup>();
        for (const fn of graph?.functions ?? []) {
          if (fn.kind === "external") continue;
          all.add(languageGroup(fn.language));
        }
        all.delete(g);
        return all;
      }
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function onResetLangs() {
    setLangFilter(new Set());
  }

  // ── v0.5 — bookmark mutations ──────────────────────────────────
  const bookmarkedIds = useMemo(() => new Set(bookmarks.map((b) => b.nodeId)), [bookmarks]);

  function toggleBookmark(fn: ChangedFunction) {
    if (!prKey) return;
    const exists = bookmarkedIds.has(fn.id);
    if (exists) {
      host.removeBookmark(prKey, fn.id);
      setBookmarks((bs) => bs.filter((b) => b.nodeId !== fn.id));
      return;
    }
    const entry: Bookmark = {
      prKey,
      nodeId: fn.id,
      name: fn.qualifiedName || fn.name,
      file: fn.file,
      startLine: fn.startLine,
      addedAt: Date.now(),
    };
    host.addBookmark(entry);
    setBookmarks((bs) => [entry, ...bs.filter((b) => b.nodeId !== fn.id)]);
  }

  function onJumpToBookmark(b: Bookmark) {
    const fn = graph?.functions.find((f) => f.id === b.nodeId);
    if (!fn) return;
    setSelected(fn);
    setActiveFile(fn.file);
    graphRef.current?.centerOnNode(fn.id);
    graphRef.current?.flashNode(fn.id);
  }

  function onRemoveBookmark(b: Bookmark) {
    if (!prKey) return;
    host.removeBookmark(prKey, b.nodeId);
    setBookmarks((bs) => bs.filter((x) => x.nodeId !== b.nodeId));
  }

  function onClearBookmarks() {
    if (!prKey) return;
    host.clearBookmarks(prKey);
    setBookmarks([]);
  }

  // ── Language filter — derive a filtered view of the graph. ──────
  // When `langFilter` is empty we pass the graph through unchanged.
  // Otherwise we keep nodes whose language group is in the filter
  // (externals tag along with their owning language) and drop edges
  // pointing to absent nodes.
  const filteredGraph = useMemo<CallGraphResult | null>(() => {
    if (!graph) return null;
    if (langFilter.size === 0) return graph;
    const keep = new Set<string>();
    for (const fn of graph.functions) {
      const g = languageGroup(fn.language);
      // Keep externals only when their language tag is visible.
      if (langFilter.has(g)) keep.add(fn.id);
    }
    const fns = graph.functions.filter((f) => keep.has(f.id));
    const edges = graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    return { ...graph, functions: fns, edges };
  }, [graph, langFilter]);

  // ── Editor body ─────────────────────────────────────────────────
  const hasContent = !!filteredGraph && filteredGraph.functions.length > 0;

  return (
    <div className="flex h-full flex-col bg-editor text-text-primary">
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          active={activeView}
          collapsed={sidebarCollapsed}
          onSelect={onSelectActivity}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        />
        <div
          className="sidebar-collapse overflow-hidden"
          style={{ width: sidebarCollapsed ? 0 : 240 }}
        >
          <Sidebar
            view={activeView}
            graph={filteredGraph}
            onOpenPr={onOpenPr}
            onSelectFile={onSelectFile}
            onSelectFunction={onSelectFunctionFromTree}
            activeFile={activeFile}
            recentVersion={recentVersion}
            langFilter={langFilter}
            onToggleLang={onToggleLang}
            onResetLangs={onResetLangs}
            host={host}
            bookmarks={bookmarks}
            onJumpToBookmark={onJumpToBookmark}
            onRemoveBookmark={onRemoveBookmark}
            onClearBookmarks={onClearBookmarks}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Breadcrumbs pr={graph?.pr ?? null} activeFile={activeFile} openExternal={host.openExternal} />

          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-w-0 flex-1 flex-col" data-graph>
              {progress && <ProgressOverlay p={progress} />}
              {error && !progress && (
                <EmptyState title="Couldn't load this PR" hint={error} />
              )}
              {!currentUrl && (
                <WelcomePane
                  onSubmit={onOpenPr}
                  recents={recents}
                  inputRef={inputRef}
                />
              )}
              {graph && graph.functions.length === 0 && !progress && !error && (
                <EmptyState
                  title="No supported source changes found"
                  hint="callmap parses .ts/.tsx/.js/.jsx/.py/.go. PRs touching only other languages won't render."
                />
              )}
              {graph && filteredGraph && filteredGraph.functions.length === 0 && graph.functions.length > 0 && !progress && !error && (
                <EmptyState
                  title="Language filter hides every node"
                  hint="Toggle a language back on in the Languages pane to show its functions."
                />
              )}
              {hasContent && (
                <Suspense fallback={<GraphChunkLoader />}>
                  <GraphModeShellLazy
                    mode={viewMode}
                    reviewRef={graphRef}
                    graph={filteredGraph!}
                    selectedId={selected?.id ?? null}
                    onSelect={(fn) => {
                      setSelected(fn);
                      if (fn) setActiveFile(fn.file);
                    }}
                    bookmarkedIds={bookmarkedIds}
                    onContextMenu={(fn, x, y) => setContextMenu({ fn, x, y })}
                    showMinimap={minimapVisible}
                    findOpen={findOpen}
                    onFindOpenChange={setFindOpen}
                  />
                  {showLegend && (
                    <div className="pointer-events-none absolute bottom-3 left-3">
                      <LegendBar stats={filteredGraph!.stats} />
                    </div>
                  )}
                </Suspense>
              )}
            </div>

            {selected && (
              <>
                <ResizeDivider width={sourceWidth} onResize={setSourceWidth} />
                <div
                  className="shrink-0 border-l border-ide-border"
                  style={{ width: sourceWidth }}
                >
                  <Suspense fallback={<PanelLoader />}>
                    <SourcePanelLazy fn={selected} onClose={() => setSelected(null)} />
                  </Suspense>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <StatusBar
        graph={filteredGraph}
        rate={rate}
        theme={theme}
        onToggleTheme={() => runCommand("theme.toggle")}
        onBackHome={currentUrl ? () => {
          setCurrentUrl(null);
          setGraph(null);
          setSelected(null);
          setActiveFile(null);
          setError(null);
          setLangFilter(new Set());
        } : null}
        minimapVisible={minimapVisible}
        onToggleMinimap={() => runCommand("minimap.toggle")}
        viewMode={viewMode}
        onToggleViewMode={() => runCommand("viewMode.toggle")}
      />

      {paletteMode && (
        <div data-palette>
          <CommandPalette
            mode={paletteMode}
            commands={COMMAND_ITEMS}
            recents={recents}
            functions={filteredGraph?.functions ?? []}
            onClose={() => setPaletteMode(null)}
            onRunCommand={runCommand}
            onOpenRecent={onOpenPr}
            onJumpToFunction={onJumpToFunction}
          />
        </div>
      )}

      {/* v0.5 — context menu on node right-click */}
      {contextMenu && (
        <ContextMenu
          fn={contextMenu.fn}
          x={contextMenu.x}
          y={contextMenu.y}
          bookmarked={bookmarkedIds.has(contextMenu.fn.id)}
          onClose={() => setContextMenu(null)}
          onToggleBookmark={() => {
            toggleBookmark(contextMenu.fn);
            setContextMenu(null);
          }}
        />
      )}

      {/* v0.5 — host-fired toast (e.g. keychain migration notice) */}
      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto rounded-sm border border-ide-border bg-panel px-3 py-2 text-[12px] text-text-primary shadow-lg">
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Context menu (v0.5) ───────────────────────────────────────────
// Lightweight VS Code-style popup. Click outside to dismiss. Renders at
// the supplied screen coords; the parent shell tracks contextMenu state.
function ContextMenu({
  fn,
  x,
  y,
  bookmarked,
  onClose,
  onToggleBookmark,
}: {
  fn: ChangedFunction;
  x: number;
  y: number;
  bookmarked: boolean;
  onClose: () => void;
  onToggleBookmark: () => void;
}) {
  // Click anywhere outside the menu to close.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-context-menu]")) onClose();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // Clamp to viewport so the menu doesn't open off-screen.
  const w = 220;
  const h = 84;
  const clampedX = Math.min(typeof window !== "undefined" ? window.innerWidth - w - 4 : x, x);
  const clampedY = Math.min(typeof window !== "undefined" ? window.innerHeight - h - 4 : y, y);

  return (
    <div
      data-context-menu
      className="fixed z-40 overflow-hidden rounded-sm border border-ide-border bg-panel shadow-2xl"
      style={{ left: clampedX, top: clampedY, width: w }}
    >
      <div className="border-b border-ide-border bg-sidebar px-3 py-1.5 text-[11px] text-text-secondary">
        <span className="truncate font-mono">{fn.qualifiedName || fn.name}</span>
      </div>
      <button
        onClick={onToggleBookmark}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-text-primary hover:bg-hover"
      >
        <Codicon name={bookmarked ? "bookmark-filled" : "bookmark"} size={14} />
        <span>{bookmarked ? "Remove Bookmark" : "Bookmark"}</span>
      </button>
    </div>
  );
}

// ── Graph chunk loader (v0.5) ────────────────────────────────────
function GraphChunkLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-editor text-[13px] text-text-secondary">
      <div className="flex items-center gap-2 font-mono">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        <span>Preparing graph…</span>
      </div>
    </div>
  );
}

function PanelLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-panel text-[12px] text-text-secondary">
      Loading…
    </div>
  );
}

// ── Welcome pane (VS Code "Get Started" feel) ─────────────────────
function WelcomePane({
  onSubmit,
  recents,
  inputRef,
}: {
  onSubmit: (url: string) => void;
  recents: RecentPr[];
  inputRef: React.RefObject<PrInputFormHandle>;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto bg-editor px-8">
      <div className="w-full max-w-2xl py-10">
        <div className="flex items-center gap-3 text-text-primary">
          <Codicon name="callmap-logo" size={36} />
          <div>
            <h1 className="text-[28px] font-light leading-tight">callmap</h1>
            <p className="text-[13px] text-text-secondary">
              PR-delta callgraphs for code reviewers
            </p>
          </div>
        </div>

        <div className="mt-8">
          <PrInputForm ref={inputRef} onSubmit={onSubmit} busy={false} />
        </div>

        {recents.length > 0 && (
          <div className="mt-10">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Recent
            </div>
            <ul className="divide-y divide-ide-border rounded-sm border border-ide-border">
              {recents.slice(0, 8).map((r) => (
                <li
                  key={r.url}
                  className="cursor-pointer px-3 py-2 hover:bg-hover"
                  onClick={() => onSubmit(r.url)}
                >
                  <div className="truncate text-[13px] text-text-primary">
                    {r.title === r.url ? slug(r.url) : r.title}
                  </div>
                  <div className="truncate font-mono text-[11px] text-text-secondary">
                    {slug(r.url)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-4 text-[11px] text-text-disabled">
          <span>
            <kbd className="rounded-sm border border-ide-border bg-panel px-1.5 py-0.5 font-mono">
              {macOrCtrl()}P
            </kbd>{" "}
            quick-open recent PRs
          </span>
          <span>
            <kbd className="rounded-sm border border-ide-border bg-panel px-1.5 py-0.5 font-mono">
              {macOrCtrl()}⇧P
            </kbd>{" "}
            command palette
          </span>
          <span>
            <kbd className="rounded-sm border border-ide-border bg-panel px-1.5 py-0.5 font-mono">
              {macOrCtrl()}F
            </kbd>{" "}
            find in graph
          </span>
          <span>
            <kbd className="rounded-sm border border-ide-border bg-panel px-1.5 py-0.5 font-mono">
              {macOrCtrl()}B
            </kbd>{" "}
            toggle sidebar
          </span>
        </div>
      </div>
    </div>
  );
}

function macOrCtrl(): string {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
}

function slug(url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? `${m[1]}/${m[2]} #${m[3]}` : url;
}

// ── Progress overlay ──────────────────────────────────────────────
function ProgressOverlay({ p }: { p: BuildProgress }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-editor/85 text-[13px] text-text-primary">
      <div className="font-mono">{p.message}</div>
      {p.total && (
        <div className="text-[11px] text-text-secondary tabular-nums">
          {p.current}/{p.total}
        </div>
      )}
    </div>
  );
}

// ── Drag divider ──────────────────────────────────────────────────
function ResizeDivider({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const dragging = useRef(false);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (!dragging.current) return;
      // Window width minus mouse-x = source panel width.
      const next = Math.min(900, Math.max(280, window.innerWidth - e.clientX));
      onResize(next);
    }
    function up() {
      dragging.current = false;
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onResize]);

  return (
    <div
      className="resize-divider shrink-0"
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = "col-resize";
      }}
      role="separator"
      aria-label="Resize source panel"
      style={{ width: 4, height: "100%" }}
      // Width param consumed for prop completeness — actual width is on the
      // adjacent SourcePanel wrapper.
      data-width={width}
    />
  );
}
