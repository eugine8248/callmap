# callmap — Items needing user action

Nothing blocks v0.1–v0.3. v0.4 onward has 3 small items.

---

## C1 — VS Code Marketplace publisher account (v0.4)

**Why:** to ship the VS Code extension to the marketplace. Free account, ~5 min setup.

**What to do when ready:**
1. https://marketplace.visualstudio.com/manage → sign in with a Microsoft account
2. Create a publisher (e.g. `eugine` or `callmap`)
3. Generate a Personal Access Token at https://dev.azure.com/<your-org>/_usersSettings/tokens
   - Scope: Marketplace → Manage
   - Expiration: 1 year
4. Paste publisher name + PAT into a chat reply or save to `callmap/.vscode-publish.env` — agent will use it for `vsce publish`

**Status:** ⏳ pending — v0.4 ships code regardless; just the publish step waits

---

## C2 — Domain for docs site (v1.0)

**Why:** for the launch landing page + README badge.

**Recommended:** `callmap.dev` (~$15/yr at Cloudflare Registrar or Namecheap). Alternatives: `callmap.app` or `getcallmap.com`.

**What to do when ready:**
1. Register the domain
2. Tell me the chosen domain; agent will wire it into:
   - README badges
   - Astro/Vite-SSG docs site `<base>` config
   - Cloudflare Pages deploy target (if hosting there)

**Status:** ⏳ pending — v1.0 docs site can ship to `https://eugine8248.github.io/callmap` as a default until domain is picked

---

## C3 — Launch timing (v1.0)

**Why:** Show HN and Product Hunt have optimal posting windows (Tuesday/Wednesday US morning). Launch copy will be drafted; **you** submit it.

**What to do when ready:**
1. Read the drafted launch copy in `callmap/docs/launch/show-hn.md` + `product-hunt.md`
2. Pick a Tuesday/Wednesday morning (Pacific time)
3. Post manually (Show HN doesn't accept submissions via API)

**Status:** ⏳ pending — drafted, awaiting your timing

---

## How items move from this file

Each item is marked `⏳ pending` until you take action, then I update to `✅ done <date>` and remove from active list.
