# Security Policy

Thanks for helping keep callmap safe.

## Supported versions

Only the latest minor version (1.x) gets security fixes. Older versions are
not supported.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| 0.x     | :x:                |

## Reporting a vulnerability

**Please don't file public issues for security bugs.** Send a private report:

1. **GitHub Security Advisories** — preferred. Go to
   https://github.com/eugine8248/callmap/security/advisories/new and submit a
   private advisory. I'll see it immediately.
2. **Email** — `eugine8248@gmail.com` with subject `[callmap security]`. PGP
   key on request.

Expect a first response within 7 days. For critical issues I'll target a
fix within 14 days; less-critical ones get rolled into the next minor.

## What's in scope

- The desktop app (`@callmap/desktop` / Tauri shell + Rust commands)
- The VS Code extension (`callmap-vscode`)
- The core engine (`@callmap/core`)
- The docs site (`@callmap/site`)

## What's out of scope

- Anything that requires a malicious GitHub PR URL **and** an attacker
  controlling your network — that's a much bigger problem than callmap.
- Cosmetic UI issues that aren't exploitable.
- Vulnerabilities in upstream dependencies that haven't been patched yet —
  please report those upstream too.

## Unsigned binaries (v1.0)

The v1.0 desktop installers (`.msi`, `.exe`, `.dmg`, `.AppImage`) are
**unsigned**. This means:

- Windows will show a SmartScreen warning on first launch
- macOS will need a right-click → Open to bypass Gatekeeper
- Linux gets no signature check at all

This is a tradeoff for shipping v1.0 quickly. Code-signing certificates
(Windows EV + Apple Developer) land in v1.1. If you're security-conscious,
build from source:

```bash
git clone https://github.com/eugine8248/callmap.git
cd callmap
npm install
npm --workspace @callmap/desktop run tauri:build
```

The build is fully reproducible from the tagged commit.

## Data handling

- callmap **does not collect telemetry or analytics**. Zero third-party
  network calls beyond api.github.com.
- A GitHub PAT (if you provide one) is stored:
  - **Desktop**: in your OS keychain (Windows Credential Manager / macOS
    Keychain Services / Linux secret-service).
  - **VS Code**: nowhere — callmap delegates to
    `vscode.authentication.getSession('github', ['repo'])` and never sees
    the raw token.
- PR data fetched from GitHub stays in-memory only. Bookmarks and recent
  PRs are stored in `localStorage` (desktop) or `globalState` (VS Code).
- The docs site has no analytics, no fonts CDN, no third-party requests.
