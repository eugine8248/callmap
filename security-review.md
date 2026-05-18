# callmap v1.2 — Security Review

**Date:** 2026-05-18
**Reviewer:** desktop-builder cybersecurity (Build-phase gate)
**Scope:** Delta from v1.1.0 to v1.2.0
**Verdict:** ✅ **PASS — no Critical findings, no blockers to ship.**

---

## 1. Surface delta from v1.1

| Dimension | v1.1 → v1.2 change |
|-----------|-------------------|
| New IPC channels | None |
| New Tauri commands | None |
| New file-system access | None |
| New network endpoints | None |
| New external auth flows | None |
| New OS-keychain reads/writes | None |
| New native modules | None |
| New runtime npm deps | `d3-force-3d@^3.0.5` — already in the lockfile as a transitive dep of `react-force-graph-3d`, now elevated to direct |
| Renderer-side CSP | unchanged |
| Tauri allowlist | unchanged |
| Renderer sandbox | unchanged (Tauri default: contextIsolation on, nodeIntegration n/a, asset:// protocol) |

**Net surface change: zero new attack vectors.** Every M1–M7 change is renderer-side rendering / a11y / keyboard wiring. No process, no FS, no network, no IPC.

## 2. Dimension-by-dimension review

### Renderer sandbox (Tauri)
Tauri's default isolation model (no Node, asset:// protocol, no remote loading) is unchanged. The new SVG `<animateMotion>` curves and the new `aria-live` `<span>` are pure render output — no script execution surface added.

### IPC / Tauri commands
Zero new commands. The existing `#[tauri::command]` set is unchanged from v1.1 (verified by inspection of `packages/desktop/src-tauri/src/`). No widening of the allowlist.

### File-system access
Zero new file paths read or written by the app. The 3D cluster anchor computation (`cubeLatticeAnchors`) runs entirely in JS memory.

### Secret storage
Unchanged. GitHub PAT is still stored in `localStorage` (a known v1.x posture — see SECURITY.md). The v1.2 changes don't add any new secret handling.

### Auto-update integrity
Auto-update remains disabled in v1.2 (still pending code-signing per NEEDS_APPROVAL.md). No regression.

### Code signing
Unchanged (still unsigned — Important finding inherited from v1.0 / v1.1, documented in README.md "v1.0 installers are unsigned"). v1.2 does not change the signing posture; the README claim that v1.1 would sign installers remains unfulfilled and is **user-owned** (Apple Developer cert + Windows EV cert).

### Native module supply chain
No new native modules. `d3-force-3d` is pure JS (no `.node` binaries). `three.js` is pure JS. The webview-tree-sitter native dep is unchanged.

### CSP
Tauri's `csp: null` posture is unchanged. Tauri 2 enforces an internal asset:// protocol that prevents arbitrary remote script loading; the explicit-null in tauri.conf.json defers to Tauri's defaults. Same posture as v1.1.

### XSS surface (renderer)
The new aria-live region in `GraphModeShell` injects only a small fixed string set: `"Map view"`, `"Review view"`, `"3D view loaded"`. No user input crosses into the DOM via this path.

The new curved-edge `d` attribute computed from `curveControlPoint` is a numeric string built from `x1`, `y1`, `controlX`, `controlY`, `x2`, `y2` — all numbers from the d3-force simulation. No user-supplied string interpolation. SVG `path d` is not an HTML-injection vector regardless.

The new global Tab cycle handler in `MapGraphView` calls `e.preventDefault()` on the captured Tab event but does NOT inject DOM. The `setFocusedNodeId` state path is internal.

### Dependency audit
`npm audit --omit=dev` reports 3 vulns:
- All 3 are in `astro` / `vite` / `esbuild` — dev / docs-site dependencies only.
- None are in the desktop runtime path (`@callmap/desktop` builds via vite-bundled output; the dev-time tooling vulns do not ship in the installer).
- None are in the VS Code extension path.
- Same posture as v1.1; no v1.2 regression.

## 3. Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| F1 | Important | Unsigned installers — Windows SmartScreen + macOS Gatekeeper warnings on first launch | **Carried from v1.0/v1.1**. User-owned (NEEDS_APPROVAL C1 docs domain, code-signing certs out of scope for v1.2). |
| F2 | Important | GitHub PAT in localStorage (no OS-keychain backing) | **Carried from v1.0/v1.1**. Tauri Stronghold migration deferred to v1.3+. |
| F3 | Informational | dev-tree audit returns 3 vulns (vite/astro/esbuild) | **No prod impact**. Same as v1.1. |
| F4 | Informational | tauri.conf.json `csp: null` (deferring to Tauri 2 defaults) | **By design**. Same as v1.1. |

**Zero Critical findings. Zero new findings introduced by v1.2.**

## 4. `blocks_ship` flag

```json
{
  "blocks_ship": false,
  "critical": 0,
  "important_carried": 2,
  "informational": 2
}
```

## 5. Recommendations for v1.3+ (out of v1.2 scope)

1. **Migrate GitHub PAT to Tauri Stronghold** (closes F2). Requires a new Tauri plugin dep — appropriate for a future security-focused minor.
2. **Code-sign Windows + macOS installers** (closes F1). Requires user-owned certs (NEEDS_APPROVAL).
3. **Upgrade docs-site Astro** (closes F3). Trivially `npm update astro` after v1.2 ships.

## 6. Handoff

Build-phase gate cleared. Cycle proceeds to QA without revisions.
