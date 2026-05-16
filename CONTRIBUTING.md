# Contributing to callmap

Thanks for the interest! Callmap is a small, focused tool and PRs that keep
that focus tight are very welcome.

## Quick start

```bash
git clone https://github.com/eugine8248/callmap.git
cd callmap
npm install
npm run build         # builds all four workspaces
npm run dev:desktop   # web dev mode for fast iteration
npm run tauri:dev     # desktop dev window (requires Rust 1.95+)
```

Node 20+ and (for the desktop build) Rust 1.95+ with the Tauri 2
prerequisites for your OS. On Windows, set up Git Bash and keep
`.npmrc`'s `script-shell=bash` in place — npm 10.9 + Node 22 has a known
issue with `tsc.cmd` exit codes that the bash override sidesteps.

## Repo layout

The repo is an npm-workspaces monorepo. Four workspaces:

| Workspace            | What lives there                                           |
| -------------------- | ---------------------------------------------------------- |
| `@callmap/core`      | Engine: parser, GitHub fetch, diff, callgraph builder, dagre layout. Pure logic. No React, no Tauri. |
| `@callmap/ui`        | React shell (IdeShell + components) + theme + keymap + highlight. Owns `styles.css`. |
| `@callmap/desktop`   | Tauri shell. Mounts `<IdeShell host={desktopHost} />`. PAT in OS keychain via `keyring` crate. |
| `callmap-vscode`     | VS Code extension. Same `<IdeShell />` in a webview, GitHub session from `vscode.authentication`. |
| `@callmap/site`      | Astro docs + landing site. Static output to `dist/`. |

The parsers (tree-sitter WASM grammars + the extraction logic) live in
`packages/core/src/parser/`. Cross-file resolution sits in
`packages/core/src/callgraphBuilder.ts`. If you want to add a language:

1. Drop the `tree-sitter-<lang>.wasm` into `packages/desktop/public/` and add a
   copy step in `packages/vscode/scripts/copy-assets.mjs`.
2. Register a new parser config in `packages/core/src/parser/configs.ts` —
   declare the function-declaration node types, identifier capture, and
   call-expression node types.
3. Add the language to the file-extension switch in
   `packages/core/src/diffStrategy.ts`.
4. Add a smoke test PR to `scripts/v03-parsers-smoke.mjs`.

## Filing an issue

Bug reports are gold. Please include:

- The PR URL that exposes the bug (or "happens on any PR" if it's general)
- Which shell (desktop / VS Code / both)
- Your OS and callmap version
- What you expected vs. what you got
- DevTools console output if there were errors

There's a bug-report template at
`.github/ISSUE_TEMPLATE/bug-report.yml` — just fill it in.

## Sending a PR

- One logical change per PR.
- Run `npm run typecheck` and `npm run build` locally.
- If you touched the engine, run the smoke tests:
  ```bash
  node scripts/v03-parsers-smoke.mjs
  node scripts/v03-pipeline-smoke.mjs
  node scripts/v03-resolver-test.mjs
  ```
- Commit messages: keep them imperative-mood and prefixed with the version
  you're targeting (e.g. `v1.1: add rust parser config`).

## Code style

- TypeScript everywhere. `strict: true` in `tsconfig`s.
- React function components only; no class components.
- No global state libraries. Local `useState` + a tiny number of `useRef`s.
- Tailwind for new styles; CSS-var tokens for anything theme-y.

## License

MIT. By submitting a PR you agree to license your contribution under the
same terms.
