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

```bash
git clone https://github.com/eugine8248/callmap.git
cd callmap
npm install
npm run dev          # browser dev mode (no native window)
npm run tauri:dev    # desktop dev window
npm run tauri:build  # produce an unsigned installer
```

Prerequisites for the desktop build: Node 18+, Rust 1.77+, and the Tauri 2 prerequisites for your OS (WebView2 on Windows, libwebkit2gtk on Linux, Xcode CLT on macOS).

### Grammar files

The tree-sitter grammars are loaded at runtime from `/public/`. You can download prebuilt WASM files from the [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript/releases) and [tree-sitter-javascript](https://github.com/tree-sitter/tree-sitter-javascript/releases) release pages, or run the helper:

```bash
node scripts/fetch-grammars.mjs
```

If the grammars are missing, callmap falls back to a regex-based extractor — usable, but less accurate.

---

## How it works

1. Parse the PR URL → fetch metadata, base SHA, head SHA, and the list of changed files via the GitHub REST API.
2. For each changed `.ts/.tsx/.js/.jsx` file, fetch both the **base** and **head** version of the source.
3. Parse both versions with `web-tree-sitter` and extract every function declaration (function decls, arrow functions assigned to const, class methods, exported fns) along with the identifier names called inside each body.
4. Diff the per-file function sets: name match + whitespace-insensitive body comparison → classify each function as added / removed / changed / unchanged.
5. Trim the graph to the **1-hop neighborhood** of the changed set, drop the rest, and lay out with `dagre` (top-down).
6. Render with `xyflow`.

The full pipeline lives in `src/lib/callgraphBuilder.ts`.

---

## Authentication

Unauthenticated GitHub API calls are rate-limited to 60 / hour, which is fine for poking at one or two small PRs. For real use, paste a Personal Access Token into Settings (the cog icon on the home page). callmap only needs the `public_repo` scope for public PRs. The token is stored in browser localStorage in v0.1 — moving it to the OS keychain is on the v0.2 list.

A live `X-RateLimit-Remaining` indicator sits in the top-right of the graph view.

---

## Known limitations (v0.1)

- **TypeScript + JavaScript only.** Python and Go are next.
- **Name-based call resolution.** We match callees by identifier, not by type. Same-named functions in different scopes will get conflated. This is documented but not solved in v0.1.
- **First page of changed files.** GitHub's `/files` endpoint paginates at 100. PRs larger than that are truncated.
- **No collaborative or shared views.** It's a single-window tool by design.
- **Unsigned Windows builds.** SmartScreen will warn until we set up code signing.

---

## Roadmap

- **v0.2** — Python + Go parsers. Full pagination. OS-keychain token storage. Better call resolution (handle imports + scopes).
- **v0.3** — VS Code extension wrapping the same engine. Save callgraph as PNG/SVG.
- **v0.4+** — Optional AI-generated function summaries (if and only if it earns its keep).

---

## Credits

- [tree-sitter](https://tree-sitter.github.io/) — the parsing backbone
- [xyflow](https://xyflow.com/) — the React node-graph renderer
- [dagre](https://github.com/dagrejs/dagre) — hierarchical graph layout
- [Tauri](https://tauri.app/) — the desktop shell

---

## License

MIT — see [LICENSE](LICENSE).
