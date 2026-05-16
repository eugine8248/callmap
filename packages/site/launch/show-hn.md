# Show HN — submission draft

> Submit at https://news.ycombinator.com/submit — pick a Tuesday or Wednesday
> morning Pacific time. Don't include the "Show HN:" prefix in the URL field;
> add it to the title only.

---

## Title (≤ 80 characters)

> **Show HN: Callmap – Visualize what a pull request actually changes**

Alternates if the primary one feels overcooked at submission time:

- Show HN: Callmap – PR-delta callgraph viewer for code reviewers (MIT)
- Show HN: Callmap – See only the slice of code a pull request touches

## URL

`https://callmap.dev` (once C2 lands) — fallback
`https://eugine8248.github.io/callmap` until then.

If you'd rather not link the site at all, submit the GitHub repo URL
(`https://github.com/eugine8248/callmap`) and link the site in the first
comment.

## First comment (paste immediately after submitting)

> Hi HN — I built callmap because every callgraph tool I tried (SourceTrail,
> Crabviz, IDE call-hierarchies) renders the whole repo. That's great for
> archaeology and overwhelming during a code review. The reviewer's question
> is narrower: *what does this PR actually call, and what calls into it?*
>
> Callmap inverts the default. Paste any public GitHub PR URL and it shows
> only the slice of code the diff touches — added/removed/changed functions,
> plus their direct callers and callees. Colours match VS Code's diff palette
> so meaning is instant. Click a node, the source slides open with the diff
> highlighted inline.
>
> A few choices I made that might be worth discussing:
>
> - **PR-delta first**, not whole-repo. The graph only contains the functions
>   touched by the diff plus their one-hop neighbours. Everything else is
>   dropped before layout.
> - **Tree-sitter WASM**, lazy-loaded per language. JS/TS/Python/Go today,
>   ~2.6 MB grammars total but only the ones the PR touches actually load.
>   Rust/Java/C# deferred — feedback on which to prioritize would be useful.
> - **Two shells, one engine**. The same `@callmap/core` package drives the
>   Tauri desktop app (~2 MB installer) and the VS Code extension (~640 KB
>   vsix). The VS Code build reuses the host's GitHub session — no PAT to
>   copy.
> - **No telemetry, no analytics, no third-party CDN**. Only api.github.com,
>   and a token (if you paste one) sits in your OS keychain.
>
> What's coming next:
>
> - One-hop import-graph awareness so unresolved external callees get fetched
>   on demand
> - Rust + Java parsers
> - Code-signed Windows/macOS installers in v1.1
>
> Repo is MIT: https://github.com/eugine8248/callmap. Direct feedback,
> teardowns of the resolver, parser bugs on languages I haven't tested deeply
> — all welcome. The PR I usually demo against is sindresorhus/p-queue#245.

## Three-bullet TL;DR (handy for replies / link previews)

- PR-delta callgraph: only functions the diff added, removed, or changed, plus
  their direct neighbours. Not the whole repo.
- Multi-language via tree-sitter WASM (TS/JS/Python/Go today; Rust/Java
  deferred). Lazy-loaded grammars; a JS-only PR never pays for the Python
  parser.
- Free, MIT, two shells (desktop + VS Code), no telemetry, OS-keychain PAT.
  Built end-to-end in an autonomous chain v0.1 → v1.0.

## Anticipated questions + short answers (for replies)

- *"How is this different from SourceTrail / Crabviz / GitNexus?"* — Those
  render the entire codebase. Callmap renders only the slice a PR touches,
  scoped to the changed-files set plus their one-hop neighbours. Different
  use case (review vs. archaeology).
- *"Why Tauri instead of Electron / web-only?"* — 2 MB installer vs ~150 MB,
  and the engine wants Tauri's filesystem/keychain access. There's also a
  pure-webview path (the VS Code extension) — same `@callmap/core`.
- *"Does it work on private repos?"* — Yes if you paste a PAT (desktop) or
  sign in via the GitHub session (VS Code). Public repos work unauth at GH's
  60/hr.
- *"Roadmap?"* — Code-signing, Rust/Java parsers, import-graph aware
  resolution, optional AI-generated function summaries. Issues are open.

## Posting checklist

- [ ] Domain live (C2)
- [ ] Site deployed at chosen URL
- [ ] GitHub release published with the desktop installers and the .vsix
- [ ] VS Code marketplace listing live OR README install command links to the
      Release `.vsix` (C1)
- [ ] You're free for ~4 hours after posting to reply to comments — HN
      rewards fast, substantive engagement
