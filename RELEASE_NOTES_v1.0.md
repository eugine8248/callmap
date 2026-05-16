# callmap v1.0.0 — Launch release

**See what a pull request actually changes.**

callmap is a focused callgraph viewer for code reviewers. Paste a GitHub PR
URL — get a colour-coded delta graph of every function the PR added,
removed, or changed, plus their direct callers and callees. Free, MIT,
desktop + VS Code, no telemetry.

This is the launch release — v1.0.0 caps the autonomous build chain that
shipped v0.1 through v0.5 over a single day. Everything from "core flow"
to "launch package" landed without per-version review.

## What's new in v1.0

- **Docs + landing site** at `eugine8248.github.io/callmap` (or
  `callmap.dev` once the domain lands). Astro, dark-by-default, IDE-themed.
- **Real OSS README**, contributing guide, security policy, issue + PR
  templates, GitHub Sponsors button.
- **GitHub Actions release pipeline** that builds installers on
  Windows/macOS/Linux and a `.vsix` on tag push, all attached to a draft
  release. CI workflow runs typecheck + build + vsix package on every PR.
- **Launch drafts** for Show HN and Product Hunt under
  `packages/site/launch/` — ready to paste when timing is picked.

## The full v0.1 → v1.0 chain

### v0.1 — Core flow
Initial Tauri + React shell that turns a PR URL into a callgraph. Five-node
verified end-to-end on `sindresorhus/p-queue#245`. `.msi` 2.5 MB, NSIS
1.8 MB — 50× smaller than the Electron equivalent.

### v0.2 — VS Code IDE-style reskin
IdeShell, ActivityBar, Sidebar, StatusBar, Breadcrumbs, CommandPalette,
26 hand-rolled Codicons. Cross-platform keymap (Ctrl ↔ ⌘). Bundle stayed
under 200 KB gzip.

### v0.3 — Multi-language + cross-file resolution
Python and Go parsers via tree-sitter WASM, lazy-loaded. PR-wide symbol
table with qualified-name resolution and ambiguity flagging. Dimmed
external nodes for out-of-PR callees. Status-bar language breakdown.

### v0.4 — VS Code extension + npm-workspaces refactor
Repo split into four workspaces (`@callmap/core`, `@callmap/ui`,
`@callmap/desktop`, `callmap-vscode`). VS Code extension reuses the host's
GitHub session — no PAT input. Same engine drives both shells.
`callmap-0.4.0.vsix` was 625 KB.

### v0.5 — Performance + search + bookmarks
WebWorker parsing. Ctrl+F find widget. Minimap toggle. Per-PR bookmarks
(localStorage on desktop, `globalState` in VS Code). React.lazy code-split
for `CallGraphView` + `SourcePanel`. OS-keychain PAT storage on desktop.
Full PR-files pagination — drops the 100-file ceiling.

### v1.0 — Launch package
- Astro docs + landing site at `packages/site/`
- Real OSS README, CONTRIBUTING, SECURITY, issue + PR templates
- GitHub Sponsors button (`@eugine8248`)
- Release + CI workflows
- Show HN + Product Hunt copy drafts
- Screenshots + demo placeholders (real captures in
  `packages/site/public/TODO_DEMO_GIF.md`)

## Feature highlight reel

- PR-delta callgraph — only the slice a PR touches, not the whole repo
- Multi-language via tree-sitter WASM: TS, JS, Python, Go
- Two shells, one engine: 2 MB Tauri installer + 644 KB `.vsix`
- IDE-style UX: command palette, find widget, minimap, bookmarks
- Cross-file resolution with class methods and Go-receiver methods
  qualified
- OS-keychain PAT (desktop) / `vscode.authentication` session (extension)
- Full PR-files pagination, sequential to respect GH rate limits
- WebWorker parsing keeps the main thread free on large PRs
- MIT, no telemetry, no analytics, no third-party CDN except
  api.github.com

## Build artifacts

| Artifact                          | Size                |
| --------------------------------- | ------------------- |
| Desktop initial bundle (gzip)     | 157.30 KB           |
| Desktop lazy `CallGraphView`      | 60.77 KB gzip       |
| Desktop lazy `SourcePanel`        | 14.34 KB gzip       |
| Windows `.msi`                    | 2.59 MB             |
| Windows NSIS `.exe`               | 1.97 MB             |
| `callmap-1.0.0.vsix`              | ~640 KB             |
| Site initial HTML + CSS (gzip)    | ~6 KB               |

## Known limitations

- v1.0 binaries are **unsigned** — SmartScreen and Gatekeeper warn on
  first launch. Code-signing in v1.1.
- Four languages today (TS/JS/Python/Go). Rust + Java prioritized for
  v1.x.
- Name-only cross-file resolution. Import-graph awareness is a roadmap
  item.
- External callees render as dimmed "ext" nodes without fetching the
  outside file. One-hop external fetch is a roadmap item.

See [CHANGELOG](https://eugine8248.github.io/callmap/changelog/) for the
full history, [SECURITY.md](SECURITY.md) for security policy, and
[NEEDS_APPROVAL.md](NEEDS_APPROVAL.md) for items waiting on the maintainer.

## Install

**VS Code** (once the marketplace listing is live):

```bash
code --install-extension callmap.callmap
```

**Desktop**: download the installer for your platform from the assets
below. Unsigned in v1.0 — see [SECURITY.md](SECURITY.md).

---

Thank you for trying callmap. If it saves you time, consider
[sponsoring on GitHub](https://github.com/sponsors/eugine8248) or starring
the repo.
