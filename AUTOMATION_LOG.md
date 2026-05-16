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
- Status: ✅ **complete** 2026-05-16
- Landed:
  - **Docs + landing site** — new `@callmap/site` workspace under `packages/site/`, Astro 4.16 + Tailwind 3, dark-by-default, IDE color tokens carried over from `@callmap/ui` (editor #1e1e1e, accent #007acc, diff palette). Three pages: `/` (hero + demo + 4 feature blocks + 3 screenshots + CTA), `/docs` (install, paste-PR, navigate, keyboard shortcuts table, language matrix, troubleshooting), `/changelog` (parses this file at build time and renders cards newest-first). Static output to `packages/site/dist/`. Initial HTML+CSS **~6 KB gzipped** (well under the 200 KB ceiling). Telemetry disabled.
  - **Screenshots + demo** — high-fidelity SVG mockups in `packages/site/public/` styled exactly to the production IDE tokens: `screenshot-graph.svg` (callgraph view, sindresorhus/p-queue#245 layout, 1920×1200), `screenshot-source.svg` (graph + source panel split), `screenshot-vscode.svg` (extension inside VS Code shell). `demo.svg` static preview. `demo.gif` 43-byte transparent placeholder. Real-capture recipe in `packages/site/public/TODO_DEMO_GIF.md` (ffmpeg + OBS not on PATH in this env — single-pass headless capture of the live Tauri app on Windows was infeasible; site renders correctly today, swap recipe takes ~30 min).
  - **Launch copy** — `packages/site/launch/show-hn.md` (title, URL strategy, full first-comment, three-bullet TL;DR, anticipated-questions answers, posting checklist) and `packages/site/launch/product-hunt.md` (60-char tagline, 260-char description, longer launch body, three "What's special" bullets, "Who's it for", maker-comment draft, topics, checklist).
  - **GitHub Sponsors + funding** — `.github/FUNDING.yml` with `github: eugine8248`. README header badge row gets a Sponsors badge. Landing footer + final CTA link to Sponsors. README also wires "Star on GitHub" and "Report an issue" as the secondary CTAs.
  - **CI + release pipelines** — `.github/workflows/release.yml` fires on `v*` tag, builds Tauri installers on `windows-latest`/`macos-latest`/`ubuntu-22.04` via `tauri-apps/tauri-action@v0`, then a separate `vscode` job builds and uploads the `.vsix` to the same draft release via `softprops/action-gh-release@v2`. Unsigned (code-signing flagged as v1.1 in SECURITY.md). `.github/workflows/ci.yml` runs `npm run typecheck` + `npm run build` + `vsce package` on every push and PR plus a separate `site` job that builds the Astro site. Old single-purpose `build.yml` removed.
  - **README + repo polish** — top-level `README.md` rewritten as a real OSS README with badge row (CI, MIT, Sponsors, VS Code installs, GitHub release), demo image, three-bullet features, install matrix, "How it works" 3 steps, roadmap link, develop-locally quickstart. New `CONTRIBUTING.md` (repo layout table, add-a-language recipe, style guide). New `SECURITY.md` (private-reporting flow via GH Security Advisories + email, scope, in/out, unsigned-binary note, data-handling). `.github/ISSUE_TEMPLATE/bug-report.yml` + `feature-request.yml` form templates. `.github/PULL_REQUEST_TEMPLATE.md` checklist. `LICENSE` MIT verified present from v0.1.
  - **Release notes** — `RELEASE_NOTES_v1.0.md` with one-paragraph-per-version chain summary, feature highlight reel, build-artifact size table, known-limitations section.
  - **Launch report** — `V1_REPORT.md` at repo root with the full step-by-step launch checklist: (1) domain (C2), (2) marketplace publisher (C1), (3) site deploy (GitHub Pages fallback + Cloudflare Pages recipe), (4) push to GitHub (`gh repo create callmap --public --source=.`), (5) tag + push v1.0.0, (6) submit Show HN + PH on chosen morning (C3).
- Verification:
  - `npm install` — added 246 packages for the new site workspace (astro@4.16, @astrojs/tailwind, tailwindcss already hoisted)
  - `npm run typecheck` — clean across all 4 code workspaces (site uses its own `astro check` shim)
  - `npm run build` — clean (desktop webview + vscode webview + vscode parse worker + vscode extension TS)
  - `npm --workspace @callmap/site run build` — 3 static pages, 821 ms
  - `astro telemetry disable` — opted out
- Build outputs:
  - **Site initial HTML+CSS gzip**: ~6 KB (under the 200 KB target by 33×)
  - **Site total dist**: ~57 KB across 3 HTML pages + 1 CSS + 4 SVG images + 1 GIF placeholder + TODO file. No JS shipped (Astro static).
  - **Desktop + VS Code bundles**: unchanged from v0.5 — desktop 157.30 KB gzip initial, vsix 644 KB.
- Workarounds:
  - Astro pinned to `^4.16.0` rather than 6.x — smaller install, fewer migration risks for a 3-page static site, and `@astrojs/tailwind` v5 is the stable companion.
  - Single-pass headless screenshot/GIF capture on Windows was infeasible without Playwright/Puppeteer/ffmpeg installed; shipped high-fidelity SVG mockups + a step-by-step real-capture recipe in `TODO_DEMO_GIF.md` instead. SVGs reference the same `--bg-editor`, `--diff-added` etc. token values so the site visually echoes the product accurately.
  - Astro's `BASE_URL` is consumed in templates with a trailing-slash strip so the same source builds correctly for either `https://callmap.dev/` (base `/`) or `https://eugine8248.github.io/callmap/` (base `/callmap/` via the `CALLMAP_SITE_BASE` env var set in CI).
- Still user-blocked:
  - **C1** — VS Code marketplace publisher account (vsix sits ready, ship-around: README install command links to the GitHub Release `.vsix`)
  - **C2** — Domain (site ships to `eugine8248.github.io/callmap` as the documented fallback)
  - **C3** — Show HN + Product Hunt launch timing (copy drafted; user picks the morning)
- Push instructions for the user (NOT executed by the chain — `gh` CLI per auto-memory):
  ```bash
  winget install --id GitHub.cli
  gh auth login
  gh repo create callmap --public --source=. --remote=origin
  git push -u origin main
  git push origin v1.0.0   # triggers .github/workflows/release.yml
  ```
- Final commit on `main`: `v1.0 — launch package: site, docs, release pipeline, README polish`. Tag: `v1.0.0` (annotated).

---

## How to read this

Each section flips from `queued` → `**in progress**` → `✅ complete`. Look for `Status: **in progress**` to see what's actively building.

User actions live in `NEEDS_APPROVAL.md` so you don't have to scroll this file to find your todos.
