// Public API for @callmap/core.
//
// The package is the UI-free engine: GitHub fetch, tree-sitter parse,
// per-file diff, PR-wide call resolution, and dagre layout. Hosts inject
// a token provider (PAT on desktop, OAuth session on VS Code) and a
// WASM loader (the runtime + grammar blobs live wherever the host can
// reach them — public/ on the desktop, media/ in the extension).

// ── GitHub helpers ─────────────────────────────────────────────────
export {
  fetchPullRequest,
  fetchFileContent,
  fetchPrMeta,
  fetchChangedFiles,
  fetchFileAtSha,
  parsePrUrl,
  listOpenPullRequests,
  setTokenProvider,
  setHttp,
  getLastRateLimit,
  GithubError,
  isSupportedSource,
} from "./github";
export type { HttpFetcher, HttpResponse, PrUrlParts, RateLimit } from "./github";

// ── Language ───────────────────────────────────────────────────────
export {
  detectLanguage,
  grammarFor,
  languageGroup,
  languageLabel,
  groupLabel,
  isSupported,
  isSupportedFilename,
} from "./language";
export type { Language, GrammarKey, LanguageGroup } from "./language";

// ── Parser ─────────────────────────────────────────────────────────
export {
  parseSource,
  extractFunctions,
  getFunctionsInTree,
  getParser,
  setWasmLoader,
} from "./parser";
export type { RawFn, RawCall, WasmLoader } from "./parser";

// ── Parse worker (v0.5) ────────────────────────────────────────────
// The worker source module itself is at "@callmap/core/parseWorker" —
// hosts import it with their bundler's worker syntax (Vite's
// `?worker&inline`, the VS Code webview's `asWebviewUri`, etc.) and
// hand the constructed Worker to `wrapParseWorker`.
export {
  wrapParseWorker,
  setParseWorkerFactory,
  getParseWorkerFactory,
} from "./parseWorkerClient";
export type {
  ParseWorkerClient,
  ParseWorkerLike,
  ParseWorkerFactory,
} from "./parseWorkerClient";

// ── Builder + diff ────────────────────────────────────────────────
export {
  buildCallgraph,
  buildCallGraphFromPrUrl,
} from "./callgraphBuilder";
export type { BuildProgress, ProgressCb } from "./callgraphBuilder";

export { analyzeDiff, diffFile } from "./diffAnalyzer";
export type { DiffInput } from "./diffAnalyzer";

// ── Layout ─────────────────────────────────────────────────────────
export {
  layoutGraph,
  LAYOUT_NODE_WIDTH,
  LAYOUT_NODE_HEIGHT,
} from "./graphLayout";
export type { LayoutNodeInput, LayoutEdgeInput, LayoutPosition } from "./graphLayout";

// ── Types ──────────────────────────────────────────────────────────
export * from "./types";
