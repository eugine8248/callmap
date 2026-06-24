# callmap v1.2 — Cycle Complete

**Date:** 2026-05-18
**Cycle:** v1.2 (incremental on v1.1.0)
**Approval mode:** auto
**PM:** desktop-builder
**Verdict:** ✅ SHIPPED

---

## v1.2 Scope (all delivered)

| ID | Title | Status |
|----|-------|--------|
| M1 | Curved cross-cluster edges (2D) | ✅ |
| M2 | Zoom-gated particles (hysteresis at 0.5 / 0.55) | ✅ |
| M3 | 3D chunk split (three.js isolated for parallel fetch) | ⚠️ partial — 369 KB gzip vs 300 KB aspirational target. three.js is the floor at 353 KB; further reduction needs a three fork, out of v1.2 scope. Documented in security-review.md and ARCHITECTURE.md. |
| M4 | Animation budget ladder (3/1/0 at 0/200/350 nodes) | ✅ |
| M5 | Per-file cluster anchors in 3D (forceX/Y/Z lattice) | ✅ |
| M6 | Global Tab cycle + Enter to open source panel | ✅ |
| M7 | aria-live mode announcements | ✅ |

Nice-to-haves N1 (3D bookmark sprites) and N2 (settle-entrance batched fade-in) were explicitly deferred per requirements.md. They roll forward to v1.3.

## Pipeline summary

| Phase | Specialist | Outcome |
|-------|-----------|---------|
| Discovery | requirements-gatherer | Scope frozen to M1–M7 + N1–N2 (deferred) |
| Design | ux-designer | Curve geometry, zoom hysteresis, particle ladder, 3D cube lattice, focus ring, aria-live region all specified |
| Build | frontend | All M1–M7 implemented; typecheck + 4-workspace build green |
| Build | backend | Pass-through (no v1.2 backend surface) |
| Build | database | Pass-through (stateless app) |
| Build (gate) | cybersecurity | PASS — blocks_ship=false, 0 critical, 2 important carried from v1.0/v1.1 |
| QA | qa | PASS — no Debugger loop needed, zero regressions vs v1.1 |
| Package | frontend | Windows MSI + NSIS + VSIX built locally; macOS/Linux deferred to CI on tag push |

## Artifacts produced

**Local build (this sandbox, Windows host):**
- `dist/callmap_1.2.0_x64-setup.exe` — 2.40 MB (Windows NSIS)
- `dist/callmap_1.2.0_x64_en-US.msi` — 2.97 MB (Windows MSI)
- `dist/callmap-1.2.0.vsix` — 1.02 MB (VS Code extension)

**CI-built (Release workflow firing on v1.2.0 tag push):**
- `callmap_1.2.0_universal.dmg` — macOS universal
- `callmap_1.2.0_amd64.AppImage` — Linux x64
- (status: in-progress at cycle close; check the Release page)

## GitHub state

- Branch: `main`
- Commit: `3b8243e` "v1.2.0 — Map view polish: curved edges, zoom-gated particles, 3D cluster lattice, Tab cycle, aria-live"
- Tag: `v1.2.0` (pushed)
- Release: https://github.com/eugine8248/callmap/releases/tag/v1.2.0
- Windows installers + VSIX attached directly to the release at creation; macOS .dmg + Linux .AppImage will be appended by the `release.yml` workflow

## Files modified / created (29 files in commit)

Source changes:
- `packages/ui/src/mapConstants.ts` — added `particlesForNodeCount`, zoom hysteresis constants, `curveControlPoint`
- `packages/ui/src/MapEdge.tsx` — `controlX/Y` props, Q-Bezier path rendering
- `packages/ui/src/MapGraphView.tsx` — cross-cluster curve detection, zoom-gated particles, global Tab cycle, focus state
- `packages/ui/src/MapNode.tsx` — `focused` prop, dashed half-opacity ring
- `packages/ui/src/Map3DView.tsx` — cube-lattice cluster anchors, d3-force-3d injection, shared particle ladder
- `packages/ui/src/GraphModeShell.tsx` — aria-live region
- `packages/ui/src/styles.css` — `.map-aria-live` visually-hidden rule
- `packages/ui/src/keymap.ts` — `map.cycleNode`, `map.openFocusedSource` CommandIds
- `packages/ui/src/d3-force-3d.d.ts` — NEW ambient declarations for d3-force-3d
- `packages/desktop/vite.config.ts` — split `three` into separate chunk
- `packages/vscode/webview-vite.config.ts` — same `three` split

Version bumps to 1.2.0:
- root `package.json`, `packages/{core,ui,desktop,vscode,site}/package.json`
- `packages/desktop/src-tauri/Cargo.toml`
- `packages/desktop/src-tauri/tauri.conf.json`
- `package-lock.json` regenerated to declare d3-force-3d direct

Cycle documentation:
- `ARCHITECTURE.md` — NEW, full v1.2 architecture record
- `RELEASE_NOTES_v1.2.md` — NEW, release notes
- `requirements.md` — NEW, scope-frozen
- `design/ux-flow.md`, `design/component-map.md` — NEW
- `security-review.md` — NEW, PASS verdict
- `qa-report.md` — NEW, PASS verdict
- `README.md` — roadmap updated to mark v1.1/v1.2 ✅, installer table to 1.2.0
- `.gitignore` — added `session-snapshot.yaml`

## Carried-forward NEEDS_APPROVAL items

These remain user-owned and unchanged by v1.2:

- **C1** — VS Code Marketplace publisher account (the v1.2 VSIX is built and attached to the GitHub release, but auto-publish to the marketplace still waits on the publisher PAT).
- **C2** — Docs domain (`callmap.dev` etc.) — no change.
- **F1** — Code-signing certificates (Apple Developer + Windows EV) — installers still unsigned, SmartScreen / Gatekeeper warnings on first launch.
- **F2** — GitHub PAT migration to Tauri Stronghold — v1.3+ candidate.

## Followups rolled to v1.3

- N1: Bookmarks in 3D (sprite at orb position)
- N2: Settle-entrance batched fade-in (50 immediate + rest in second wave)
- Three.js fork to push below 300 KB gzip floor (M3 second pass)
- F1 / F2 from security review

## Master Agent: nothing to escalate

No blockers, no missing credentials, no QA fail loops. Cycle ran end-to-end on auto. GitHub push succeeded. Release page is live.
