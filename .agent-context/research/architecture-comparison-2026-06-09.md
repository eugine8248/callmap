# callmap Architecture Comparison & Diagnosis

**Date:** 2026-06-09
**Mode:** Read-only diagnosis of callmap + web research of OSS comparators
**Goal:** Explain *why* callmap's callgraph approach struggles, grounded in its actual code, and extract concrete lessons.

---

## TL;DR

callmap builds caller→callee edges by **purely syntactic name-matching**: it tree-sitter-parses only the files a PR touches, collects every callee *identifier text* (with an optional one-level qualifier), and looks that bare name up in a symbol table built from those same changed files. There is **no scope analysis, no import/alias resolution, no type information, and no cross-file symbol binding**. That is fine for a fuzzy "what's near this change" sketch but it is structurally unable to produce the *precise, trustworthy* callgraph the UI implies — because deciding which `parse()` (of the five `parse()`s in a repo) a given call actually targets is a **semantic** question, and callmap only has **syntactic** information. Every other tool that claims edge accuracy either (a) adds a real semantic/name-resolution layer (stack-graphs, SCIP, LSP, ts-morph) or (b) deliberately drops the precision claim and ships a fuzzy *relationship/cluster* graph for AI recall (graphify) or a *graph DB* you query loosely (CodeGraph).

---

## Step 1 — What callmap actually does (from the code)

Files read: `ARCHITECTURE.md`, `README.md`, `packages/core/src/{callgraphBuilder,parser,diffAnalyzer,github,language}.ts`.

### Pipeline (from `callgraphBuilder.ts` + `github.ts`)
1. Parse PR URL → fetch PR meta (base/head SHA) and the **changed-files list** (`fetchChangedFiles`).
2. Filter to supported extensions (`.ts/.tsx/.js/.jsx/.py/.go`). **Only those files are fetched and parsed** — `fetchFileAtSha` is called per changed file, base + head. Nothing else in the repo is ever read.
3. Tree-sitter parse both base and head of each changed file in a Web Worker; extract function declarations + call sites.
4. `diffFile()` classifies each function added / removed / changed / unchanged by matching on `qualifiedName` and comparing whitespace-normalized bodies.
5. Build a **PR-wide symbol table** from head-side decls (`symbolByQualified` + `symbolByName`).
6. `resolveCall()` resolves each call site against that table.
7. Trim to the one-hop neighbourhood (interesting nodes = added/removed/changed; pull in direct callers/callees from the `unchanged` pool); synthesize `__external__` placeholder nodes for unresolved calls.

### How edges are actually built — the resolution method

**Call-site extraction is identifier-text scraping.** For each language the walker finds call nodes and reads the callee *text*:
- JS/TS (`calleeJs`): `identifier`/`property_identifier` → `{name}`; `member_expression` → `{name: prop.text, qualifier: obj.text}` but **only if the object is a plain `identifier` or `this`**. Anything else (chained call, indexed access, computed member) → qualifier dropped or call missed.
- Python (`calleePython`): `identifier` → `{name}`; `attribute` → `{name: attr, qualifier: obj}` (qualifier only when obj is a bare `identifier`).
- Go (`calleeGo`): `identifier` → `{name}`; `selector_expression` → `{name: field, qualifier: operand}` (operand only when a bare identifier — and Go can't even tell a package selector `pkg.Func` from a value method `obj.Method`; both become `{name, qualifier}`).

**Resolution is bare-name lookup with no binding** (`resolveCall`):
1. If the call has a qualifier, try `"<qualifier>.<name>"` against `symbolByQualified`. **This treats the qualifier as if it were the class/receiver type — but the qualifier is the *variable/expression text at the call site* (`obj`, `this`, `pkg`), not the declared type.** So `user.save()` is looked up as `user.save`, while the method is indexed as `User.save`. These almost never match. The qualifier path is mostly dead.
2. Try the **bare name** in `symbolByQualified` — succeeds only if exactly one match.
3. Fall back to **short-name lookup across all files** (`symbolByName`). One match → edge. Multiple matches → flagged `ambiguous`, **no edge drawn**. Zero matches → unresolved → `__external__` placeholder.

So in practice the *only* edge-producing path is: **"a call whose callee text equals the bare name of exactly one declared function anywhere in the changed-files set."** That's it. Identity is the function's *text name*, scoped to whichever files happened to be in the PR.

Node identity (`diffAnalyzer.ts`): `id = "<file>::<qualifiedName>::<declKind>"`, and `qualifiedName` is at most one level (`Class.method`, `Receiver.Method`) derived from the *enclosing class/receiver text* — never from imports or types.

### Concrete failure modes (accuracy/robustness cliffs)

| # | Situation | What happens | Why |
|---|-----------|--------------|-----|
| F1 | **Same-named functions** (two `parse()`, multiple `handle`, Go `Get`) | Edge silently **dropped** (flagged ambiguous, no edge) | No way to pick the right target without scopes/types. Sourcegraph's own docs note common names like `Get` are exactly where syntactic nav fails. |
| F2 | **Methods via a variable** `user.save()` | Resolved as `user.save`, won't match `User.save` → falls to bare `save` → ambiguous or wrong | Qualifier is the *receiver variable text*, not the *type*. No type inference. |
| F3 | **Imported / aliased names** `import {save as persist}` then `persist()` | Looked up as `persist`; never linked to `save` | No import table, no alias resolution. |
| F4 | **Cross-file edges** where the target file isn't in the PR | Target invisible → call becomes a dimmed `__external__` stub | Only changed files are fetched. A changed function that calls a stable helper shows the helper as "external/unknown," not as the real function. README roadmap admits "import-graph aware cross-file resolution" is a *future* v1.x item. |
| F5 | **Cross-language edges** (TS calling a Go service, FFI) | Never drawn | Symbol tables are per-call-site name only; no cross-language binding exists or is conceptually possible here. |
| F6 | **Dynamic dispatch / higher-order / callbacks** `arr.map(fn)`, `this[name]()`, interface methods | Missed or mis-attributed | Computed members return null in the callee extractors; no interface/vtable model. |
| F7 | **False edge from name collision** | Function A calls local `init`; an unrelated `init` is the only one in the changed set → A→unrelated edge drawn | Single-match short-name fallback can bind to a coincidental same-named function in a different module. |
| F8 | **Nested / closure functions** (Python especially) | Not discovered (`walkPython` deliberately doesn't descend into function bodies) | Design choice: top-level + class methods only. Calls *into* a nested helper become external. |
| F9 | **Grammar load failure** | JS/TS silently degrade to a **regex** extractor (`regexExtractJs`) that grabs `name(` tokens and filters a handful of keywords; Python/Go return `[]` (whole file vanishes) | Fallback is far cruder; no signal to the user that the graph is now much less accurate. |
| F10 | **Truthiness of the picture** | A reviewer sees a clean graph with definite-looking edges and `(external)` stubs, with **no confidence indication** on the resolved edges | The UI implies precision the engine can't deliver. Missed edges (F1, F3, F4) are *silent* — the most dangerous kind for a review tool. |

**Root mechanism of the struggle:** callmap is trying to answer a **semantic** question ("which declaration does this call bind to?") with **syntactic** data ("what text is at the call site?"), across **4 languages**, while only able to see a **PR-sized slice** of the codebase. The single biggest correctness amplifier is the slice: even perfect name resolution would still mis-render most real PRs because the callees/callers usually live in files the PR didn't touch (F4).

---

## Step 2 — The comparators (from their repos / docs)

### graphify — https://github.com/safishamsi/graphify
tree-sitter AST extraction across ~28 languages, **local/offline**, **whole-repo**. Builds a **knowledge graph** (NetworkX-style), runs **Leiden** community detection for hierarchical clusters, and tags every relationship with a **confidence level** (`EXTRACTED` / `INFERRED` / `AMBIGUOUS`). Output is batch artifacts: interactive `graph.html`, `GRAPH_REPORT.md`, queryable `graph.json`. Intended use: an **AI coding-assistant skill** — LLMs query the graph for *recall/context*, not a compiler-accurate callgraph. Crucially, graphify **does not claim precise call resolution**; it ships a fuzzier relationship+cluster map and is *honest about it* (the AMBIGUOUS tag) because "good enough recall for an LLM" tolerates approximation.

### CodeGraph — https://github.com/ChrisRoyse/CodeGraph
Parses **whole repo** into a **Neo4j** graph DB ("digital twin"); edges typed `IMPORTS/EXPORTS/CALLS/EXTENDS/IMPLEMENTS/HAS_METHOD`. Notably it uses **per-language tooling, not one syntactic engine**: **ts-morph** for TS/JS (has a real TS type/symbol model), **Python's native `ast`**, tree-sitter for Java/C#/Go/C/C++/SQL. Two-pass: build per-file ASTs, then resolve cross-file relationships. Offline/batch, queried by AI assistants. The architectural lesson: it **offloads storage to a graph DB** and **reaches for semantic-capable parsers where they exist** (ts-morph), instead of leaning on lowest-common-denominator syntactic matching.

### The semantic-resolution camp (the real lesson)
- **stack-graphs / tree-sitter-graph** — https://github.com/github/stack-graphs : a declarative **name-resolution** layer built *on top of* tree-sitter (scope graphs from TU Delft research). You write per-language rules for scopes, imports, and bindings; resolution is **incremental + per-file** and needs no build system. This is **exactly the layer callmap is missing**. It's what powers **GitHub's precise jump-to-definition**. (Repo archived read-only Sep 2025, but the technique and the published rule sets remain the reference design.)
- **SCIP / LSIF (Sourcegraph)** — https://sourcegraph.com/blog/announcing-scip : language-agnostic **semantic index** emitted by per-language indexers; results are **"compiler-accurate because the indexer analyzed the code semantically."** Supports **incremental** re-index of only changed files after a push — the precise version of what callmap does fuzzily. Storage is an **on-disk index** consumed by a server.
- **LSP call-hierarchy** — language servers (tsserver, gopls, pyright/jedi) expose `callHierarchy/incomingCalls` + `outgoingCalls`. These are the **real edges**, computed by a server that *understands* types, imports, and scopes. Cost: you must run a language server per language and (often) have the project's deps resolvable.

**The two-tier reality (external validation of callmap's tier):** Sourcegraph ships **both** tiers. Its **search-based** navigation uses "text search and syntax-level heuristics **without language-level semantic information**," is fast and zero-setup, and its docs warn that **"incorrect results occur more often for tokens with common names (such as `Get`)."** Its **precise** tier (SCIP) is the semantic one you use "if you require 100% confidence." **callmap is sitting in the search-based/heuristic tier while presenting a precise-tier UI.** That mismatch is the heart of the problem.

---

## Step 3 — Comparison table

| Dimension | **callmap** | **graphify** | **CodeGraph** | **stack-graphs / SCIP / LSP (semantic camp)** |
|---|---|---|---|---|
| **Resolution method** | Purely **syntactic** bare-name matching (tree-sitter call text → name lookup; qualifier rarely matches) | **Syntactic** tree-sitter edges + LLM for non-code; **confidence-tagged** (EXTRACTED/INFERRED/AMBIGUOUS) | **Mixed/semantic-leaning**: ts-morph (TS symbols), Python `ast`, tree-sitter elsewhere; cross-file resolve pass | **Semantic name resolution** — scopes, imports, types, bindings (compiler-accurate) |
| **Call-edge accuracy** | Low/approximate; **silent** misses on collisions, imports, cross-file, dynamic | Approximate by design (recall over precision) | Medium-high for TS/Py; varies by language | **High** (precise / "compiler-accurate") |
| **Scope** | **PR slice only** (changed files) — biggest accuracy limiter | **Whole repo** | **Whole repo** | Whole repo, but **incremental per changed file** (SCIP/stack-graphs) |
| **Storage** | **Stateless / in-memory** (nothing persisted) | Batch files: `graph.{html,json}`, report | **Neo4j** graph DB | On-disk **index** (SCIP) / in-server (LSP) / per-file stack graph |
| **Multi-language** | One syntactic engine, 4 langs, hand-written walkers | tree-sitter, ~28 langs (uniform, shallow) | **Per-language best tool** (ts-morph/ast/tree-sitter) | Per-language **rules/indexers/servers** (deep, costly to add) |
| **Live vs batch** | **Live/on-demand** (paste URL → render) | **Batch/offline** (CI/git-hook rebuild) | **Batch/offline** (CLI → DB) | Index = batch (per push); query = live |
| **Use case** | **PR-review "what changed near here" sketch** | **LLM code recall/context** | AI dev workflows over a code DB | **Precise jump-to-def / find-refs / call-hierarchy** for humans + tools |

---

## Why callmap's architecture struggles (honest root cause)

**One sentence:** callmap tries to produce a *precise* callgraph using only *syntactic* tree-sitter identifier-text matching, across *four* languages, over a *PR-sized slice* of the repo — but binding a call to the right declaration is a *semantic* problem (scopes, imports, types), so the engine is missing the one layer that would make its edges trustworthy.

Specific cliffs, in priority order:
1. **Slice scope (F4) is the dominant error source.** Most callers/callees of a changed function live in unchanged files the PR never fetched, so they collapse into `(external)` stubs or vanish. Even perfect resolution can't fix this without fetching beyond the diff.
2. **No semantic binding (F1–F3, F7).** Same-named functions → dropped edges; methods-via-variable and imports/aliases → wrong or no edges; lone same-name collisions → *false* edges. The qualifier path in `resolveCall` is essentially dead because it compares call-site *variable text* to *declared type names*.
3. **Silent failure (F10) erodes trust fastest.** A reviewer can't tell a "no edge because there genuinely is none" from "no edge because resolution gave up (ambiguous)" from "edge to the wrong twin." For a *review* tool, a confidently-wrong or silently-incomplete graph is worse than no graph.
4. **Shallow-across-4 instead of deep-in-1.** Four hand-written walkers + a regex fallback (F9) means each language gets a thin, divergent extractor and none gets real resolution — the breadth actively prevents investing in depth.

This is not a bug to patch; it's the ceiling of the chosen method. graphify hits the same syntactic ceiling but **doesn't pretend to be precise** — it ships a confidence-tagged cluster map for an LLM that tolerates noise. callmap's UI promises precision its method can't reach.

---

## What graphify (and the others) do differently

- **graphify** sidesteps precise call-resolution entirely: fuzzy **knowledge graph + Leiden clustering**, **confidence tags**, **batch/offline**, aimed at **LLM recall** where approximate is fine. Lesson: *match the precision claim to the method.*
- **CodeGraph** offloads to a **graph DB** and, critically, **uses semantic-capable parsers per language** (ts-morph for TS, native `ast` for Python) instead of one lowest-common-denominator syntactic engine. Lesson: *pick the deepest tool each language already offers.*
- **stack-graphs / SCIP / LSP** **invest in real name resolution** — scopes, imports, types — which is the only path to compiler-accurate edges. SCIP even does it **incrementally per changed file**, which is the *correct* version of callmap's PR-slice instinct. Lesson: *precision requires a semantic layer; there is no syntactic shortcut to it.*

---

## Lessons + concrete options for callmap

**Option A — Add a real semantic layer (get true edges).**
Per language: TS/JS via **ts-morph** or the TS compiler API (has the symbol/type model and import resolution for free); Go via **gopls** LSP `callHierarchy` or `golang.org/x/tools/go/packages`; Python via **pyright/jedi** LSP. Or adopt **tree-sitter-stack-graphs** rule sets to stay tree-sitter-native while gaining scope/import resolution.
*Trade-offs:* This is the right answer for accuracy but breaks two pillars — it generally needs the **whole repo / resolvable deps** (not a diff slice) and often a **process/server** (hard inside a Tauri/VS Code-webview stateless client). LSP is heavy; ts-morph is the lightest real win and could run in the desktop shell.

**Option B — Narrow to ONE language, done deeply.**
Drop Python/Go/regex; do **TypeScript only** with ts-morph + proper import resolution. One excellent language beats four shallow ones for a credibility-driven review tool.
*Trade-offs:* Loses the multi-language marketing line; but it's the cheapest path to *trustworthy* and plays to the existing JS/TS strength (the regex fallback already only exists for JS/TS).

**Option C — Be honest about approximate edges (cheapest, ship now).**
Keep the syntactic engine but **adopt graphify's confidence model**: shade/dash edges by resolution path (qualified-unique = solid; short-name-unique = dashed "guess"; ambiguous = render a "N candidates" affordance instead of silently dropping). Label the graph "approximate — based on the diff slice." Surface the `regex-fallback` degradation (F9) explicitly.
*Trade-offs:* Doesn't add accuracy, but **converts silent wrong/missing edges (F10) into visible uncertainty**, which is most of what destroys reviewer trust. Low effort, high trust-per-hour.

**Option D — Widen the slice one hop (attacks F4, the dominant error).**
When a call is unresolved within the diff, **fetch the importing/target file at head** (resolve the import path, pull that one file, parse, link) instead of stubbing `(external)`. Bounded fan-out (1 hop, capped N files) keeps it client-side and within rate limits.
*Trade-offs:* More GitHub requests + latency, partial (won't catch deep chains), still syntactic — but directly removes the single biggest source of missing/false edges and is compatible with A/C.

**Option E — Lean into graphify's lane (if precision is unreachable client-side).**
Accept that a stateless 4-language client can't be precise and pivot the value prop from "precise callgraph" to "**relationship + change-impact cluster view**" — exactly graphify's territory, but PR-scoped and live. The current force-directed Map view is already halfway there.
*Trade-offs:* Repositions the product away from "trustworthy callgraph"; but it's an *honest* fit for what the engine can actually compute.

**Recommended sequencing:** **C now** (honesty/confidence shading — stops trust bleed immediately) → **D** (one-hop fetch — kills the dominant F4 error) → **A scoped to TS via ts-morph** = effectively **B** (the deep, accurate core where the product is strongest). Treat Python/Go as "approximate, syntactic, confidence-tagged" until a semantic indexer exists for them.

---

## Sources
- callmap source (read-only): `packages/core/src/{callgraphBuilder,parser,diffAnalyzer,github,language}.ts`, `ARCHITECTURE.md`, `README.md`
- graphify — https://github.com/safishamsi/graphify
- CodeGraph — https://github.com/ChrisRoyse/CodeGraph
- stack-graphs / tree-sitter-graph — https://github.com/github/stack-graphs
- SCIP (semantic, compiler-accurate, incremental) — https://sourcegraph.com/blog/announcing-scip ; https://scip-code.org/
- Sourcegraph precise vs search-based code navigation (the two-tier model; "common names like `Get`" failure) — https://docs.sourcegraph.com/code_navigation/explanations/search_based_code_navigation ; https://sourcegraph.com/docs/code-search/code-navigation/precise_code_navigation
