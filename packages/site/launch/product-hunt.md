# Product Hunt — submission draft

> Submit at https://www.producthunt.com/posts/new — Tuesday or Wednesday
> launch (Pacific time). The first 4 hours of upvotes weigh heaviest; line up
> 3–5 makers/early-adopters to comment in the first hour.

---

## Tagline (60 chars max)

> **See what a pull request actually changes.** *(46 chars)*

Alternate, slightly punchier:

- "PR-delta callgraph for code reviewers." *(38 chars)*

## Description (260 chars max)

> Callmap is a focused callgraph viewer for code reviewers. Paste any GitHub
> PR URL — get a colour-coded delta graph of every function the PR adds,
> removes, or changes, plus their callers and callees. Desktop + VS Code, MIT,
> no telemetry. *(258 chars)*

## Launch description (longer, the post body)

> Code reviews drown in a sea of changed-file lists. Generic callgraph tools
> render the whole repo — overwhelming when the reviewer's question is much
> narrower: *what does this PR actually call, and what calls into it?*
>
> Callmap inverts the default. Paste any public GitHub PR URL and it shows
> only the slice of code the diff touches: added functions in green, removed
> in red-ghosted, changed in amber, plus their direct callers and callees for
> context. Click any node to open the source with the diff highlighted
> inline. Right-click to bookmark. Ctrl+F to fuzzy-find any function.
>
> Two shells, one engine. The desktop app is a 2 MB Tauri installer that
> stores your PAT in the OS keychain. The VS Code extension reuses the host's
> GitHub session — no token to copy — and sits in the activity bar next to
> the source-control view.
>
> Four languages today (TypeScript, JavaScript, Python, Go), all via
> tree-sitter WASM grammars that load lazily — a JS-only PR never pays for
> the Python parser. Rust and Java are on the roadmap.
>
> MIT licensed. No telemetry. No analytics. No third-party CDN beyond
> api.github.com.
>
> Free forever for the core. v1.1 is code-signed installers + Rust parser.

## "What's special" — 3 bullets

- **PR-delta first.** Every other callgraph tool renders the whole codebase.
  Callmap only draws the slice a PR touches and its one-hop neighbours —
  the right scope for a review minute, not a refactor weekend.
- **Two shells, one engine.** The same `@callmap/core` package drives the
  Tauri desktop app and the VS Code extension. The VS Code build is 644 KB
  and reuses the host's GitHub session.
- **Quiet by design.** MIT. No telemetry. No analytics. No external CDN.
  Tokens live in your OS keychain. Code-signing in v1.1, parser additions
  driven by user issues.

## "Who's it for" — one sentence

> Code reviewers and PR authors on multi-language projects who want to see
> the call-flow a diff touches without losing 20 minutes mapping it in their
> head.

## Topics / categories

Suggested PH topics (pick 3):

- Developer Tools
- Productivity
- Open Source

## Maker comment (drop in the first hour)

> Hi! I'm the maker. Callmap exists because the last six code reviews I did
> all started the same way: skim the diff, get lost in the changed-files
> list, draw a callgraph by hand on a sticky note. The tool answers the
> sticky-note question in one click.
>
> Two things I'd love feedback on:
>
> 1. Language priorities. TS/JS/Python/Go ship today. Rust is the most-asked
>    next. If you'd vote for Java/C#/C++ instead, drop a 👍 in an issue at
>    https://github.com/eugine8248/callmap/issues so I can sequence.
> 2. The VS Code experience vs. the desktop one. Same engine but the
>    affordances differ — would love teardowns of either.
>
> Repo: https://github.com/eugine8248/callmap (MIT). Direct feedback or
> bug reports very welcome.

## Posting checklist

- [ ] Domain live (C2)
- [ ] Hunter chosen (optional — solo launches do fine with the right tagline)
- [ ] 3–5 supporters lined up to comment in the first 60 minutes
- [ ] Twitter / Mastodon / Reddit posts queued to go out at PH-time + 5 min
- [ ] You're free for the day — PH winners reply to everyone
