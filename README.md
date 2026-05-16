# callmap

**See what a pull request actually changes.**

callmap is a lightweight desktop callgraph viewer scoped to **the slice of code a PR touches** — not the whole repo. Paste a GitHub PR URL, and you get a focused, color-coded callgraph of every function the diff added, removed, or modified, plus their direct callers and callees.

![callmap screenshot placeholder](docs/screenshot.png)

---

## Why it exists

Generic callgraph tools (SourceTrail, Crabviz, GitNexus, IDE call hierarchies) render the entire repository. That's great for archaeology — and overwhelming during a code review.

**callmap inverts the default.** It shows you only the delta. The point is to answer one question fast:

> _"What does this PR actually call, and what calls into it?"_

- **Green** nodes = functions added by this PR.
- **Red, ghosted** nodes = functions removed.
- **Amber** nodes = functions whose body changed.
- **Neutral** nodes = direct callers and callees of the above, for context.

Click any node to see the function source in a side panel — with the diff highlighted inline for changed functions.

---

## Install

### End users
1. Grab the latest installer for your platform from the [Releases](https://github.com/eugine8248/callmap/releases) page.
2. Run it. On Windows, you'll see a SmartScreen warning the first time — callmap is unsigned in v0.1. Click "More info" → "Run anyway."

### Contributors / from source

v0.4 reorganized the repo into npm workspaces. The engine lives in
`@callmap/core`, shared React components in `@callmap/ui`, the Tauri
desktop app in `@callmap/desktop`, and the VS Code extension in
`callmap-vscode`.

```bash
git clone https://github.com/eugine8248/callmap.git
cd callmap
npm install                # installs all workspaces

# Desktop (Tauri)
npm run dev:desktop        # browser dev mode (no native window)
npm run tauri:dev          # desktop dev window
npm run tauri:build        # produce an unsigned installer

# VS Code extension
npm run build:vscode       # build the webview + extension host
npm run package:vscode     # produce packages/vscode/callmap-0.4.0.vsix

# Whole tree
npm run typecheck          # tsc --noEmit across every workspace
npm run build              # builds all four workspaces
```

Prerequisites for the desktop build: Node 18+, Rust 1.77+, and the Tauri 2 prerequisites for your OS (WebView2 on Windows, libwebkit2gtk on Linux, Xcode CLT on macOS).

Prerequisites for the VS Code extension: only Node 18+. Install the
generated `.vsix` via `code --install-extension packages/vscode/callmap-0.4.0.vsix`.

### Grammar files

The tree-sitter grammars are loaded at runtime. The desktop app fetches them from `packages/desktop/public/`; the VS Code extension copies them into `packages/vscode/media/` at build time and resolves them through `asWebviewUri`. v0.4 ships the same four grammars as v0.3: TypeScript, JavaScript, Python, and Go. Each is lazy-loaded — only the grammars touched by the current PR are fetched, so a JS-only PR never pays for the Python WASM.

You can download prebuilt WASM files manually, or run the helper:

```bash
node scripts/fetch-grammars.mjs
```

If a grammar is missing for the language in question, JS/TS falls back to a regex-based extractor (usable but less accurate); Python and Go simply skip the file.

---

## How it works

1. Parse the PR URL → fetch metadata, base SHA, head SHA, and the list of changed files via the GitHub REST API.
2. For each changed `.ts/.tsx/.js/.jsx/.py/.go` file, fetch both the **base** and **head** version of the source.
3. Parse both versions with `web-tree-sitter` (loading the matching grammar lazily) and extract every function declaration along with the identifier names called inside each body. Class methods and Go receiver methods are captured with their qualifier (`MyClass.foo`, `*Receiver.Method`).
4. Diff the per-file function sets: qualified-name match + whitespace-insensitive body comparison → classify each function as added / removed / changed / unchanged.
5. **Build a PR-wide symbol table** (v0.3): index every head-side declaration by both its short name and its qualified name. Resolve every call site against the table — 1 match resolves cleanly; >1 matches stay unresolved with a `disambiguated: false` flag; 0 matches become dimmed "external" placeholder nodes (the callee lives outside the PR).
6. Trim the graph to the **1-hop neighborhood** of the changed set, drop the rest, and lay out with `dagre` (top-down).
7. Render with `xyflow`.

The full pipeline lives in `packages/core/src/callgraphBuilder.ts`. Cross-file resolution is name-only — v0.3 doesn't parse imports. v0.4+ may add import-graph awareness.

---

## Authentication

Unauthenticated GitHub API calls are rate-limited to 60 / hour, which is fine for poking at one or two small PRs. For real use:

- **Desktop:** paste a Personal Access Token into Settings (the cog icon on the home page). callmap only needs the `public_repo` scope for public PRs. The token is stored in browser localStorage.
- **VS Code:** callmap delegates to `vscode.authentication.getSession('github', ['repo'])` — the same sign-in the official GitHub Pull Requests extension uses. No PAT to copy.

A live `X-RateLimit-Remaining` indicator sits in the top-right of the graph view.

---

## Known limitations (v0.3)

- **Name-only cross-file resolution.** v0.3 builds a PR-wide symbol table and resolves call sites by qualified or short name. We do **not** parse imports — same-name functions in different modules of the changed set still go unresolved with an "ambiguous" marker rather than guessing. v0.4 may add import-graph awareness.
- **External callees aren't fetched.** A call into a function that lives outside the PR's changed-files set renders as a dimmed dashed node with an "ext" badge. We don't fetch the file just to resolve the symbol. v0.4 may.
- **Four languages.** TypeScript, JavaScript, Python, and Go. Rust / Java / C# are deferred.
- **First page of changed files.** GitHub's `/files` endpoint paginates at 100. PRs larger than that are truncated.
- **No collaborative or shared views.** It's a single-window tool by design.
- **Unsigned Windows builds.** SmartScreen will warn until we set up code signing.

---

## Roadmap

- **v0.2** — *Shipped.* VS Code-style IDE shell, command palette, deep links, theming.
- **v0.3** — *Shipped.* Python + Go parsers. Class-method / receiver-aware function names. PR-wide cross-file symbol resolution with disambiguation. Syntax-highlighted source panel. Languages activity-bar pane with per-language filtering. Status-bar language breakdown.
- **v0.4** — *Shipped.* npm-workspaces refactor (`@callmap/core` engine, `@callmap/ui` shared React, `@callmap/desktop` Tauri, `callmap-vscode` extension). VS Code extension with GitHub Authentication session, status-bar entry, command palette integration. Same engine drives the desktop app.
- **v0.5** — Bookmarks. Full PR-files pagination. OS-keychain token storage. Save callgraph as PNG/SVG. Marketplace publish of the VS Code extension (needs publisher approval).
- **v0.6+** — Import-graph aware cross-file resolution. Optionally fetch external callees one hop out. Optional AI-generated function summaries.

---

## Credits

- [tree-sitter](https://tree-sitter.github.io/) — the parsing backbone
- [xyflow](https://xyflow.com/) — the React node-graph renderer
- [dagre](https://github.com/dagrejs/dagre) — hierarchical graph layout
- [Tauri](https://tauri.app/) — the desktop shell

---

## License

MIT — see [LICENSE](LICENSE).
