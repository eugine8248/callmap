# callmap — Automation Log

Started: 2026-05-16
Mode: Autonomous build v0.1 → v1.0. No per-version approval; user-action items live in `NEEDS_APPROVAL.md`.

**Product:** Open-source desktop callgraph viewer for code reviewers. Paste a GitHub PR URL → see the delta callgraph (added/removed/changed functions + their callers/callees).

**Stack:** Tauri 2 + React 18 + TS + Tailwind 3 + xyflow + dagre + web-tree-sitter. MIT license.

**Visual identity:** VS Code IDE style — dark sidebar, breadcrumb, file-tree nav, monospace, command palette, status bar. Sleek and lightweight.

---

## v0.1 — Core flow (PR-delta callgraph)
- Status: ✅ **complete** 2026-05-16 (commit `02c7530`, MIT)
- Verified end-to-end on `sindresorhus/p-queue#245`: 5 nodes (1 added, 1 removed, 3 changed), 3 edges, dagre layout, source panel works.
- Build artifacts: `callmap.exe` **4.6 MB**, `.msi` **2.5 MB**, NSIS **1.8 MB** (50× smaller than Electron equivalent).
- Workarounds applied: `npm install --ignore-scripts` (esbuild postinstall hack on Windows bash), Rust 1.84 → 1.95 (Tauri 2 deps need edition2024), real PNG/ICO icons synthesized.
- Followups baked into v0.2 backlog: name-only call resolution (no type/scope), GitHub files-list pagination (≤100 files), PAT in localStorage not OS keychain, xyflow chunk size (~177 KB gzip).

## v0.2 — VS Code IDE-style reskin + keyboard UX
- Status: ✅ **complete** 2026-05-16
- New components: IdeShell, ActivityBar, Sidebar (PR Explorer · Recent PRs · Bookmarks placeholder · Settings), StatusBar, Breadcrumbs, CommandPalette (3 modes: > commands · @ symbols · plain quick-open · fuzzy), Codicon (26 hand-rolled monochrome SVGs, ~2KB inline)
- New libs: keymap.ts (cross-platform Ctrl↔⌘ matcher), theme.ts, external.ts
- Shortcuts wired: Ctrl+Shift+P (palette) · Ctrl+P (quick-open recents) · Ctrl+T (jump-to-function, centers viewport) · Ctrl+B (sidebar) · Esc (close source panel)
- Color tokens via CSS vars; dark default, Monaco Light alt; FOUC-free bootstrap script
- Bundle: 182KB → 191KB gzip JS (+5%, well under 250KB ceiling)
- Data layer untouched; old route components removed

## v0.3 — Multi-language + cross-file call resolution
- Status: ✅ **complete** 2026-05-16
- WASM grammars added: tree-sitter-python (476KB) + tree-sitter-go (236KB), lazy-loaded from public/
- Cross-file symbol table with qualified-name resolution (Class.method, Receiver.Method) — single-match resolves, multi-match shows ambiguity banner, out-of-PR calls render as dimmed external nodes with "ext" badge
- highlight.js (ts/js/py/go only) wired into source panel — bundle 179KB → 200.75KB gzip (+21.75KB, well under 350KB ceiling)
- Status bar language breakdown: `5 funcs (3 ts · 2 py) · 3 edges`
- Activity bar gets 5th view "Languages" — filterable graph by language subset
- Verified on real PRs: TS (sindresorhus/p-queue#245), Python (pallets/flask#6013), Go (spf13/cobra#2397)
- Followups: import-graph awareness (v0.4), one-hop external file fetching, code-split xyflow+dagre chunks

## v0.4 — VS Code extension port + npm-workspaces refactor
- Status: ✅ **complete** 2026-05-16
- Repo split into 4 npm workspaces under `packages/`:
  - `@callmap/core` — engine (parser, github fetch, diff, callgraph builder, dagre layout). Pure logic, no React, no Tauri, no VS Code. Hosts inject `setWasmLoader`, `setTokenProvider`, optional `setHttp`.
  - `@callmap/ui` — React shell (IdeShell + all 14 components from v0.3) plus theme, keymap, highlight. Owns `styles.css`. Takes `HostBindings` prop with `openExternal`, recent-PR storage, optional PAT input.
  - `@callmap/desktop` — Tauri shell. `src/main.tsx` mounts `<IdeShell host={desktopHost} />`. PAT in localStorage, openExternal via tauri-plugin-shell. `src-tauri/` moved here (Cargo workspace untouched).
  - `callmap-vscode` — VS Code extension. extension.ts registers `callmap.openPR`, `callmap.openCurrentRepoPR`, `callmap.openFromSelection`, `callmap.showRecent`; status-bar item. panel.ts hosts the singleton webview, proxies api.github.com requests through the extension host (CSP + auth). webview-src/main.tsx mounts the same `<IdeShell />` with vscodeHost bindings; HTTP proxied via postMessage, WASM grammars resolved via asWebviewUri.
- GitHub auth in VS Code: `vscode.authentication.getSession('github', ['repo'], { createIfNone: true })` — no PAT input rendered.
- Settings (`contributes.configuration`): theme (auto/dark/light), statusBar.enabled, recent.maxItems.
- Build outputs (Windows):
  - Desktop: `.msi` ~2.5 MB and `.exe` ~4.6 MB (≈ v0.3 size — bundle stayed at 692 KB JS + 33 KB CSS).
  - VS Code: `callmap-0.4.0.vsix` **625 KB** (15 files; main.js 657 KB bundles core+ui+react; 4 WASM grammars total ~2.6 MB plus runtime). Built via `vsce package --no-dependencies --skip-license`.
- Workarounds applied: `.npmrc` with `script-shell=bash` to work around npm 10.9 + Node 22 Windows quirk where `tsc.cmd` returns exit 1 despite success; `vsce --no-dependencies` to keep the vsix from walking up into the monorepo's hoisted node_modules.
- Followups baked into v0.5: bookmarks pane, full files-list pagination, marketplace publish (NEEDS_APPROVAL C1), code-split the React/xyflow chunk, OS-keychain PAT storage. Also: the `openFromSelection` SCM context menu only fires the input box today — wiring it to the GitHub PR extension's `getCurrentPullRequest` is best-effort and graceful-falls-back.

## v0.5 — Performance + search + jump-to-node + bookmarks
- Status: ✅ **complete** 2026-05-16
- Landed:
  - **WebWorker parsing** — `@callmap/core/parseWorker` runs tree-sitter parse + symbol extract off the main thread. New API: `setParseWorkerFactory()` + `wrapParseWorker()`. Desktop spawns via Vite `?worker&inline`; VS Code emits a standalone `media/parseWorker.js` classic-script chunk and spawns via `new Worker(asWebviewUri)`. Graceful fallback to inline path when no worker or factory throws. Status bar progress now reads `Parsing N / M files`.
  - **Inline find-widget (Ctrl+F)** — top-right slim overlay inside the graph, fuzzy match against `name + qualifiedName + file`, Up/Down/Enter step + center viewport, `{idx} of {N}` counter, Esc close. Halo ring on the active match. Ctrl+T command palette remains the alternative entry point.
  - **Minimap toggle** — xyflow `<MiniMap />` hidden by default. Toggleable from status-bar entry (right side, after rate limit), command palette ("View: Toggle Minimap"), or Ctrl+Shift+M. Persisted in `localStorage["callmap.ui.minimapVisible"]`.
  - **Bookmarks pane** — v0.2 placeholder wired. Right-click a node → "Bookmark" context menu (with "Remove Bookmark" toggle when already pinned). Pin glyph (Codicon, top-right corner). Pane shows count, list of `<name> @ <file>:<line>`, "Clear all". Per-PR storage keyed by `<owner>/<repo>#<number>`. Desktop persists via localStorage with that key prefix; VS Code persists via globalState (`callmap.bookmarks` map) so the pins survive workspace reload.
  - **Code-split** — `CallGraphView` (xyflow + dagre) and `SourcePanel` (highlight.js) are React.lazy chunks loaded only after the user fetches a PR. Tree-shaking required pulling `FunctionNode`/`CallGraphView`/`SourcePanel` out of the `@callmap/ui` index barrel so the static-export path didn't haul them back in. `Suspense` fallback uses the empty-state styling ("Preparing graph…"). Vite chunk-size warning silenced (raised to 600 KB on desktop) because the new initial bundle is well under the previous limit.
  - **OS-keychain PAT** — desktop only. Three new Tauri commands (`get_token` / `set_token` / `clear_token` in `src-tauri/src/lib.rs`) backed by the `keyring` crate (≈80 KB compiled, no extra deps to ship; Windows Credential Manager / macOS Keychain Services / Linux secret-service on Linux). One-shot localStorage → keychain migration on first launch fires a host-side `callmap:toast` event that the shell catches and renders as a bottom-center pill. `HostBindings.getToken/setToken` are now allowed to return Promises so the Settings pane awaits both.
  - **Full PR-files pagination** — `fetchChangedFiles` now follows `Link: <…>; rel="next"` headers via the new `ghFetchAllPages` helper, sequential (one in-flight request) to respect GitHub's secondary rate limits. Drops the v0.1 100-file ceiling.
- Verification:
  - `npm run typecheck` — clean across all 4 workspaces
  - `npm run build` — clean (desktop + vscode webview + vscode worker + extension TS)
  - `npm --workspace callmap-vscode run package` — `callmap-0.5.0.vsix` produced
  - `npm --workspace @callmap/desktop run tauri:build` — produced `.msi` + NSIS `.exe`
- Bundle sizes:
  - **Desktop initial chunk**: `dist/assets/index-*.js` 546.31 KB raw / **157.30 KB gzip** (under the 300 KB target)
  - **Desktop lazy CallGraphView**: 184.63 KB raw / **60.77 KB gzip** (xyflow + dagre, on-demand)
  - **Desktop lazy SourcePanel**: 44.18 KB / 14.34 KB gzip (highlight.js)
  - **VS Code initial chunk**: `media/main.js` 419.53 KB / **117.72 KB gzip**
  - **VS Code lazy CallGraphView**: 188.94 KB / **61.79 KB gzip**
  - **VS Code parse worker**: `media/parseWorker.js` 75.78 KB / **19.05 KB gzip**
  - **vsix**: `callmap-0.5.0.vsix` **644 KB** (19 files; 4 WASM grammars dominate)
  - **Desktop installers** (Windows x64): `.msi` **2.59 MB**, NSIS `.exe` **1.97 MB**, raw `callmap.exe` **4.99 MB**
- Workarounds:
  - The VS Code webview's lazy CSS asset was double-named `main.css` / `main2.css` in the first attempt — fixed with a smarter `assetFileNames` callback so the `CallGraphView` chunk gets its own deterministic `CallGraphView.css` next to `CallGraphView.js`.
  - Initial attempt at building the parse-worker via a Vite plugin's `closeBundle` hook (calling `vite.build()` directly) failed because the CJS-loaded Vite API doesn't expose `build` as a named export in our config-loader context. Switched to a separate `webview-worker-vite.config.ts` chained from the `package.json` `build` script (`build:webview && build:worker && compile`).
  - Tauri stale build cache from a previous misconfigured path (`callmap/src-tauri/...` from the pre-monorepo layout) made `cargo check` fail on first run — cleared `target/debug/build/callmap-*` + `target/debug/build/tauri-*` + `gen/schemas/*.json` and the build picked up cleanly.
- No items infeasible. Marketplace publish (NEEDS_APPROVAL C1) still blocked on user action — vsix sits ready.
- Followups baked into v1.0:
  - One-hop import-graph fetch (pull a file referenced by an unresolved external callee to surface its definition).
  - Stream parse results back as they complete instead of awaiting per-file — incremental graph build for super-large PRs.
  - Worker pool (today: one worker per build). For 200+ file PRs a 2- or 4-worker pool would meaningfully cut wall time on parsing.
  - Code-signed installer (separate v1.1 milestone).

## v1.0 — Launch package
- Status: queued
- Scope:
  - Docs site (Astro or Vite-SSG), screenshots, demo GIF
  - Show HN + Product Hunt launch copy (drafts written, posting timing is the user's call)
  - GitHub Sponsors button + "if you like this, audit your repo with GitAudit" cross-link
  - GitHub Actions: build + release pipeline (unsigned for v1.0, code-signed in v1.1)
- User action required: domain decision (callmap.dev recommended) + Show HN/PH submission timing — see NEEDS_APPROVAL.md C2, C3

---

## How to read this

Each section flips from `queued` → `**in progress**` → `✅ complete`. Look for `Status: **in progress**` to see what's actively building.

User actions live in `NEEDS_APPROVAL.md` so you don't have to scroll this file to find your todos.
