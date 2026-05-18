# callmap — Architecture (v1.2 cycle)

**Date:** 2026-05-18
**Approval Mode:** Auto
**Phases:** Discovery → Design → Build → QA → Package
**Cycle:** v1.2 (incremental on shipped v1.1.0)

---

## Context carried from v1.1

- npm workspaces monorepo: `packages/core`, `packages/ui`, `packages/desktop` (Tauri), `packages/vscode`, `packages/site` (Astro)
- Tauri 2 desktop shell; VS Code extension shares the `@callmap/core` engine
- v1.1 shipped Map view (d3-force-3 with cluster anchors, SVG `<animateMotion>` particles, react-force-graph-3d easter-egg 3D)
- All v1.1 source files listed in `V11_REPORT.md` §6
- v1.1 followups (V11_REPORT.md §7) seed the v1.2 candidate pool

## Tech Stack
- Framework: Tauri 2 (desktop) + VS Code webview (extension)
- Frontend: React 18 + TypeScript + Vite, xyflow + dagre + d3-force, SVG animateMotion
- Backend: Tauri Rust shell (desktop), VS Code extension host (vscode)
- Storage: none (stateless — PR data fetched via GitHub REST API)

## Target Platforms
- Windows (x64 .exe / .msi)
- macOS (universal .dmg)
- Linux (.AppImage)
- VS Code Marketplace (`.vsix`)

## Project Overview (v1.2)
v1.2 is a Map-view polish + perf-budget release for callmap. Scope is bounded to the seven must-have items M1–M7 mined from V11_REPORT.md §7 and the brief's three hints (curved/routed edges, zoom<0.5 particle gating, 3D chunk size tuning). No language parsers, no AI summaries, no auto-update — those stay on the v1.x / v2.x roadmap in README.md.

## v1.2 Scope Index
- M1: Curved cross-cluster edges (2D)
- M2: Zoom < 0.5 particle gating (with 0.55 hysteresis)
- M3: 3D chunk gzip ≤ 300 KB (from 367.88 KB)
- M4: Animation budget ladder — 3/1/0 particles at 0/200/350 nodes (2D + 3D)
- M5: Per-file cluster anchors in 3D (forceX/Y/Z lattice)
- M6: Global Tab cycle in 2D + Enter to open source panel
- M7: Mode crossfade aria-live announcements

## UX Flow (v1.2 delta)
No new windows/views/modals. Adds keyboard Tab cycle (M6), Enter to open source panel, aria-live mode announcements (M7). Curved cross-cluster edges (M1), zoom-gated particles (M2), particle-count ladder (M4), and 3D cluster lattice (M5) are renderer-side. See `design/ux-flow.md`.

## Component Map (v1.2 delta)
Modified: `MapEdge`, `MapGraphView`, `Map3DView`, `GraphModeShell`, `mapConstants.ts`, `styles.css`, `keymap.ts`, `useForceLayout.ts`. New: 0. Removed: 0. See `design/component-map.md`.

## Folder Structure (v1.2 — unchanged from v1.1)
```
packages/
├── core/        # @callmap/core — engine
├── ui/          # @callmap/ui — React shell + Map view (modified in v1.2)
├── desktop/     # @callmap/desktop — Tauri shell (vite.config.ts modified)
├── vscode/      # callmap-vscode — extension (webview-vite.config.ts modified)
└── site/        # @callmap/site — docs (untouched)
```

## Frontend Changes (v1.2)

### Files modified
| File | M? | Change |
|------|----|--------|
| `packages/ui/src/mapConstants.ts` | M1, M2, M4 | Added `particlesForNodeCount`, `ZOOM_PARTICLE_OFF/ON`, `curveControlPoint`, `CURVE_OFFSET_MAX/RATIO` |
| `packages/ui/src/MapEdge.tsx` | M1 | New `controlX/controlY` props; renders Q-Bezier when present |
| `packages/ui/src/MapGraphView.tsx` | M1, M2, M4, M6 | Cross-cluster curve detection in edgeRender memo; zoom hysteresis effect; particle ladder; global Tab cycle + Enter promotion + focus ring state |
| `packages/ui/src/MapNode.tsx` | M6 | New `focused` prop renders dashed half-opacity ring |
| `packages/ui/src/Map3DView.tsx` | M3, M4, M5 | Cube-lattice cluster anchors via `d3-force-3d.forceX/Y/Z` injection; shared particle ladder |
| `packages/ui/src/GraphModeShell.tsx` | M7 | aria-live announcement on mode change |
| `packages/ui/src/styles.css` | M7 | `.map-aria-live` visually-hidden rule |
| `packages/ui/src/keymap.ts` | M6 | New `map.cycleNode` (Tab) and `map.openFocusedSource` (Enter) CommandIds |
| `packages/ui/src/d3-force-3d.d.ts` | M5 | New ambient declarations for d3-force-3d (forceX/Y/Z) |
| `packages/desktop/vite.config.ts` | M3 | Split `three` into its own chunk (parallel cold fetch) |
| `packages/vscode/webview-vite.config.ts` | M3 | Same `three` split for the VS Code webview |

### IPC Channels / Tauri Commands
None added in v1.2. Existing v1.1 surface unchanged.

### Frontend Notes
- Framework: Tauri 2 (unchanged) + VS Code webview (unchanged)
- React stack: React 18 + Vite + TypeScript + TailwindCSS (unchanged)
- New components: 0 (no UI added)
- New windows: 0 (no new views)
- Dark mode: unchanged (OS-follow via existing theme system)
- Keyboard shortcuts: +2 (Tab global cycle, Enter source-open) — both bound at MapGraphView window level, listed in `keymap.ts` for palette/help
- System tray: unchanged (none)
- Auto-update: unchanged (none, still pending code-signing per NEEDS_APPROVAL)

### Build Verification (auto-build at end of Build phase)
- `npm run typecheck` — passes across all 4 workspaces (core, ui, desktop, vscode)
- `npm -w @callmap/desktop run build` — passes; produces:
  | Chunk | Raw | Gzip |
  |-------|-----|------|
  | `index` (main) | 527.76 KB | 152.76 KB |
  | `CallGraphView` (lazy) | 158.30 KB | 51.66 KB |
  | `MapGraphView` (lazy) | 44.37 KB | 16.08 KB |
  | **`Map3DView` (wrapper, was monolithic in v1.1)** | **50.08 KB** | **15.60 KB** |
  | **`three` (NEW split chunk, v1.2)** | **1,305.42 KB** | **353.47 KB** |
  | SourcePanel (lazy) | 44.28 KB | 14.39 KB |

### Bundle-size budget vs M3 target
- M3 target: ≤ 300 KB gzip for the 3D chunk family.
- Actual: 369.07 KB combined (three + Map3DView wrapper).
- Reason target missed: `three` itself is 353 KB gzip; no v1.2-scope path reduces it without forking three.
- Mitigation delivered: parallel fetch + separate cacheability for three (most users won't fetch it twice if it stays in the cache between sessions). Wrapper chunk dropped from monolithic 368 KB to isolated 15.6 KB. The next opportunity to cross the 300 KB line is a v1.3 fork of three's render bundle (out of v1.2 scope).
- Documented as Important (not Critical) per cybersecurity-style risk grading.

## Backend Logic (v1.2)

**No changes.** v1.2 introduces zero new IPC channels, zero new Tauri commands, zero new file-system access, zero new external API endpoints, and zero new auth flows. The Rust side of the Tauri app and the VS Code extension host code are unchanged from v1.1. Backend specialist verified by re-reading requirements.md §"External APIs" and §"OS Integration" — both marked "unchanged".

## DB Schema + Storage Strategy (v1.2)

**Not applicable.** callmap is stateless (PR data fetched on demand via GitHub REST). The only persisted state is the existing v1.1 `localStorage` keys (theme, recent PRs, bookmarks, view mode) — none of which are touched by v1.2.

## Security Review Summary (v1.2)

**Verdict:** PASS — no Critical, no blockers. Zero new attack vectors introduced by v1.2 (renderer-side polish + a11y only). 2 Important findings (F1 unsigned installers, F2 PAT in localStorage) are carried from v1.0/v1.1 and remain user-owned. See `security-review.md` for the full report.

## QA Report Summary (v1.2)
- typecheck + build pass for all 4 workspaces (core, ui, desktop, vscode)
- M1, M2, M4, M5, M6, M7 all complete with code evidence
- M3 partial (3D chunk family 369 KB gzip vs 300 KB target — three.js itself is the floor at 353 KB; mitigation: parallel fetch + wrapper isolation)
- Zero regressions vs v1.1
- See `qa-report.md` for full report
- No Debugger loop triggered

## Packaging Config (v1.2)

### Targets built locally (Windows sandbox)
- Windows x64 NSIS .exe: `callmap_1.2.0_x64-setup.exe` (2.40 MB)
- Windows x64 MSI: `callmap_1.2.0_x64_en-US.msi` (2.97 MB)
- VS Code .vsix: `callmap-1.2.0.vsix` (1.02 MB, includes 3D `three.js` chunk + tree-sitter WASMs)

### Targets requiring native host (NOT built this cycle)
- macOS universal .dmg — requires macOS host running `tauri build`. Will be produced by the existing GitHub Actions release pipeline on tag push (the same workflow that shipped v1.0/v1.1 macOS installers).
- Linux x64 .AppImage — requires Linux host. Same — produced by CI on tag push.

### Output location
- Local artifacts copied to `~/projects/callmap/dist/` for inspection.
- Upstream cached at `~/projects/callmap/packages/desktop/src-tauri/target/release/bundle/{msi,nsis}/`.

### Artifact list (this cycle)
| Filename | Size |
|----------|-----:|
| `dist/callmap_1.2.0_x64-setup.exe` | 2.40 MB |
| `dist/callmap_1.2.0_x64_en-US.msi` | 2.97 MB |
| `dist/callmap-1.2.0.vsix` | 1.02 MB |

## Phase Log
- 2026-05-18 — v1.2 cycle started
- 2026-05-18 — requirements-gatherer complete, scope frozen (M1–M7 must-have, N1–N2 nice-to-have)
- 2026-05-18 — ux-designer complete, geometry + a11y wiring specified
- 2026-05-18 — frontend complete: all M1–M7 implemented, typecheck + build green, M3 partial (369 KB vs 300 KB target — documented)
- 2026-05-18 — backend: pass-through (no v1.2 backend surface)
- 2026-05-18 — database: pass-through (stateless app)
- 2026-05-18 — cybersecurity: PASS (blocks_ship=false, 0 critical, 2 important carried from v1.0/v1.1)
- 2026-05-18 — qa: PASS, no Debugger loop needed
- 2026-05-18 — package: Windows MSI + NSIS + VSIX built. macOS .dmg + Linux .AppImage deferred to GitHub Actions tag-push pipeline (cross-compile not available in this sandbox)
- 2026-05-18 — v1.2 cycle COMPLETE (pre-push)
