# callmap v1.0 — Launch Report

v1.0 is committed locally on `main` and tagged `v1.0.0`. The autonomous
build chain v0.1 → v1.0 is complete. Three items remain user-blocked
(see `NEEDS_APPROVAL.md` and the launch checklist below).

## Where things live

| Asset                               | Path                                            |
| ----------------------------------- | ----------------------------------------------- |
| Landing + docs site (source)        | `packages/site/`                                |
| Site build output                   | `packages/site/dist/`                           |
| Show HN draft                       | `packages/site/launch/show-hn.md`               |
| Product Hunt draft                  | `packages/site/launch/product-hunt.md`          |
| Screenshots (SVG mockups)           | `packages/site/public/screenshot-*.svg`         |
| Demo image (placeholder)            | `packages/site/public/demo.svg` + `demo.gif`    |
| Real-capture instructions           | `packages/site/public/TODO_DEMO_GIF.md`         |
| Release pipeline                    | `.github/workflows/release.yml`                 |
| CI pipeline                         | `.github/workflows/ci.yml`                      |
| Funding metadata                    | `.github/FUNDING.yml`                           |
| Issue + PR templates                | `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` |
| New OSS README                      | `README.md`                                     |
| Contributing guide                  | `CONTRIBUTING.md`                               |
| Security policy                     | `SECURITY.md`                                   |
| Release notes                       | `RELEASE_NOTES_v1.0.md`                         |
| User-action items                   | `NEEDS_APPROVAL.md`                             |
| Build chain history                 | `AUTOMATION_LOG.md`                             |

## Launch checklist

When you're ready to actually launch:

### 1. Domain (C2)

Register the domain — recommended `callmap.dev` at Cloudflare Registrar
(~$15/yr) or Namecheap. Alternatives: `callmap.app`, `getcallmap.com`.

When picked, update:

- `packages/site/astro.config.mjs` — change the `site` URL and set `base`
  back to `"/"` (currently defaults to `"/"` already; the
  `CALLMAP_SITE_BASE` env var is used by CI to deploy to `/callmap/` on
  GitHub Pages as a fallback).
- README badge URLs (the marketplace + release badge links — keep both
  GitHub URLs as they are).

### 2. VS Code marketplace publisher (C1)

1. Sign in at <https://marketplace.visualstudio.com/manage> with a
   Microsoft account.
2. Create a publisher (e.g. `callmap` or `eugine`).
3. Generate a PAT at
   <https://dev.azure.com/{your-org}/_usersSettings/tokens> with scope
   `Marketplace → Manage`.
4. Edit `packages/vscode/package.json` and set `"publisher": "<name>"`.
5. Run `vsce login <publisher>` then
   `npm --workspace callmap-vscode run package` and `vsce publish` from
   that workspace.

### 3. Deploy the site

**GitHub Pages (default fallback, no domain needed):**

```bash
# In Repo Settings → Pages: source = GitHub Actions
# Then push, the CI workflow already builds with the right base.
# Add a `deploy-pages` workflow if you want auto-deploy, or upload
# `packages/site/dist/` to the gh-pages branch manually:
npm run build:site
git worktree add /tmp/gh-pages gh-pages 2>/dev/null || git branch gh-pages
# (then sync packages/site/dist/ contents into the gh-pages branch root)
```

**Cloudflare Pages (recommended once domain lands):**

1. Connect the repo at <https://dash.cloudflare.com/?to=/:account/pages>.
2. Build command: `npm install && npm run build:site`.
3. Output directory: `packages/site/dist`.
4. Add a custom domain in the Cloudflare Pages settings.

### 4. Push to GitHub

The user pushes via the `gh` CLI per the auto-memory note. Once the CLI
is installed:

```bash
# Install GitHub CLI if not yet installed
winget install --id GitHub.cli

# Authenticate
gh auth login

# Create the public repo (the rest of this assumes you're inside the
# callmap working tree, on the main branch)
gh repo create callmap --public --source=. --remote=origin

# Push main and the v1.0.0 tag
git push -u origin main
git push origin v1.0.0
```

The `v1.0.0` tag push will trigger
`.github/workflows/release.yml`, which builds desktop installers on all
three platforms + the `.vsix` and attaches them to a draft release.

### 5. Capture real screenshots and demo GIF

The v1.0 site ships **SVG mockups** styled exactly to the production IDE
tokens. Replacing them with real captures is a 30-minute manual job.
See `packages/site/public/TODO_DEMO_GIF.md` for step-by-step
instructions.

### 6. Submit Show HN + Product Hunt (C3)

1. Pick a Tuesday or Wednesday morning Pacific time. Mid-morning
   (7–10 AM PT) is the sweet spot for both platforms.
2. Open `packages/site/launch/show-hn.md`. Submit the title at
   <https://news.ycombinator.com/submit>. Paste the first comment
   immediately after.
3. Open `packages/site/launch/product-hunt.md`. Submit at
   <https://www.producthunt.com/posts/new> with the tagline,
   description, and topics. Drop the maker comment in the first 60
   minutes.
4. Block 4 hours after each post to reply to comments. Both platforms
   reward responsiveness more than polish.

## Verification commands run during v1.0 build

- `npm install` — added 246 packages for the new `@callmap/site`
  workspace.
- `npm run typecheck` — clean across all 5 workspaces (core, ui,
  desktop, vscode, site).
- `npm run build` — clean (desktop webview + vscode webview + vscode
  parse worker + vscode extension).
- `npm --workspace @callmap/site run build` — 3 static pages, 821 ms,
  initial HTML+CSS ~6 KB gzipped.
- `astro telemetry disable` — Astro telemetry off.
- Git commit + tag created locally; **not pushed** (user controls
  remote).

## What's still user-blocked

- **C1** — VS Code marketplace publisher account
- **C2** — Domain registration
- **C3** — Launch timing (Show HN + Product Hunt)

All three are documented in `NEEDS_APPROVAL.md`. Everything that doesn't
depend on them is shipped.

## Key trade-offs honored during the run

- **Astro pinned to ^4.16.0** (not 6.x) — smaller install footprint and
  fewer breaking-change risks for a 3-page static site.
- **Screenshots are SVG mockups, not real PNGs.** Capture tooling
  (ffmpeg, Playwright, Puppeteer) wasn't on `PATH` in the autonomous
  environment, and launching the live Tauri shell for headless capture
  on Windows was out of scope for a single-pass run. The TODO file has
  the recipe. The SVGs match the production IDE tokens exactly so the
  site still tells the visual story.
- **`demo.gif` is a 43-byte transparent placeholder.** A real recording
  needs ffmpeg + OBS/ShareX. The `demo.svg` carries the message on the
  site in the meantime.
- **Site references `.svg` filenames**, not `.png`. When real captures
  land, swap the three `<img src>` lines in
  `packages/site/src/pages/index.astro` from `.svg` to `.png`.

## How to read this

Items above with a section number (1–6) are sequential. You can do them
in any order, but 1 (domain) unlocks the site deploy, and 4 (push to
GitHub) is what triggers the CI release pipeline that produces the
installers users will download.

Repo is committed at `main`, tagged `v1.0.0`, ready to push.
