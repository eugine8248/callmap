# callmap (VS Code)

PR-delta callgraph viewer for code reviewers. Paste a GitHub PR URL and
get the slice of the callgraph the diff actually touches — not the
whole repo.

## Commands

- **callmap: Show PR Callgraph** — prompts for a PR URL.
- **callmap: Show Callgraph for a PR in the Current Repo** — lists open
  PRs on the workspace's GitHub remote.
- **callmap: Visualize This PR** — available when the GitHub Pull
  Requests and Issues extension is installed.
- **callmap: Show Recent PRs** — quick-pick of recently opened PRs.

## Auth

callmap uses your VS Code GitHub sign-in via
`vscode.authentication.getSession('github', ['repo'])`. No PAT input
required.

## Settings

- `callmap.theme` — `auto` (default), `dark`, `light`.
- `callmap.statusBar.enabled` — show a status-bar entry (default: on).
- `callmap.recent.maxItems` — recent-PR list cap (default: 20).
