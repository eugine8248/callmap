# callmap — Automation Log

Started: 2026-05-16
Mode: Autonomous build v0.1 → v1.0. No per-version approval; user-action items live in `NEEDS_APPROVAL.md`.

**Product:** Open-source desktop callgraph viewer for code reviewers. Paste a GitHub PR URL → see the delta callgraph (added/removed/changed functions + their callers/callees).

**Stack:** Tauri 2 + React 18 + TS + Tailwind 3 + xyflow + dagre + web-tree-sitter. MIT license.

**Visual identity:** VS Code IDE style — dark sidebar, breadcrumb, file-tree nav, monospace, command palette, status bar. Sleek and lightweight.

---

## v0.1 — Core flow (PR-delta callgraph)
- Status: **in progress** (agent `a734ebd41a9790b57`)
- Scope: Tauri shell, GitHub PR fetch, tree-sitter TS/JS parse, callgraph delta classification, xyflow + dagre render, source panel
- No user action required

## v0.2 — VS Code IDE-style reskin + keyboard UX
- Status: queued
- Scope:
  - **Visual:** dark theme by default (light optional), VS Code-style activity bar (left), file/PR explorer sidebar, breadcrumb header, status bar at the bottom showing rate-limit + active PR, Codicon-style icons
  - **Keyboard:** command palette (Ctrl+Shift+P), quick-open (Ctrl+P → recent PRs), jump-to-function search (Ctrl+T)
  - **Theming:** Monaco-inspired color tokens via CSS variables (Tailwind + var()) so future themes are easy
- No user action required

## v0.3 — Multi-language + cross-file call resolution
- Status: queued
- Scope:
  - Python (tree-sitter-python) + Go (tree-sitter-go) parsers
  - Cross-file call name resolution (best-effort symbol table across the changed file set)
  - Per-language icon + syntax highlighting in the source panel
- No user action required

## v0.4 — VS Code extension port
- Status: queued
- Scope:
  - Lift the engine (parser, callgraph builder, diff analyzer) into a shared `@callmap/core` workspace
  - VS Code extension wraps the core in a Webview panel
  - "Show PR callgraph" command in the extension's contributes
  - Marketplace metadata + icon
- User action required: marketplace publisher account creation (free, ~5 min) — see NEEDS_APPROVAL.md C1

## v0.5 — Performance + search + jump-to-node
- Status: queued
- Scope:
  - Handle large PRs (50+ files, 200+ functions) via WebWorker parsing
  - Search box → jump to a node by function name
  - Minimap toggle for the graph
  - Bookmarks (pin nodes you care about during a review)
- No user action required

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
