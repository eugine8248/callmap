# Real screenshots and demo GIF — capture instructions

v1.0 ships with **SVG mockups** styled exactly to the production IDE tokens
(`screenshot-graph.svg`, `screenshot-source.svg`, `screenshot-vscode.svg`,
`demo.svg`). They're honest renderings of what the app shows. For the marketing
launch we want **real screen captures** — here's how.

The artifacts here that already exist:

- `screenshot-graph.svg` — callgraph view of a synthetic `sindresorhus/p-queue#245`
- `screenshot-source.svg` — source panel + reduced graph
- `screenshot-vscode.svg` — extension inside a VS Code shell
- `demo.svg` — single-frame demo preview
- `demo.gif` — 1x1 transparent placeholder (43 bytes), referenced by README/site
  until a real recording lands

The capture environment was **headless on Windows without ffmpeg, Playwright, or
Puppeteer installed**, so a true automated capture wasn't run inside the
autonomous chain. Below is the exact recipe to replace these with real PNGs/GIF.

## Real screenshots (PNG)

1. Build and launch the desktop app:
   ```bash
   npm install
   npm --workspace @callmap/desktop run tauri:dev
   ```
2. Paste `https://github.com/sindresorhus/p-queue/pull/245` into the input.
3. Wait for the graph to render (status bar shows `5 funcs · 6 edges`).
4. Resize the window to **1920 × 1200** (use a sizing helper like
   `Sizer` on Windows, or `wmctrl -r :ACTIVE: -e 0,100,100,1920,1200` on Linux).
5. Capture three frames with Snipping Tool / ShareX / built-in Cmd+Shift+4:
   - **`screenshot-graph.png`** — full IDE shell with the graph centered.
     Open the find widget (Ctrl+F) and type `onSize` so the highlight ring
     shows on the added node.
   - **`screenshot-source.png`** — click the `PQueue.onSizeLessThan` node so
     the source panel opens on the right with the diff-highlighted body.
   - **`screenshot-vscode.png`** — install the `.vsix` into VS Code (or run
     `code --extensionDevelopmentPath=packages/vscode`), open Command Palette,
     run `Callmap: Open PR from URL`, paste the same PR. Screenshot the full
     VS Code window.
6. Drop the three PNGs into `packages/site/public/` overwriting the placeholders.
   Update `index.astro` to swap `.svg` for `.png` in the three `<img src>` lines.

## Real demo GIF

1. Install ffmpeg (`winget install Gyan.FFmpeg` on Windows).
2. Use OBS Studio or ShareX to record the desktop app at 1280×720, 24 fps:
   - 0–2 s: paused, blank app window with the input visible
   - 2–4 s: paste the PR URL, press Enter
   - 4–8 s: graph appears, settles, viewport pans into focus
   - 8–12 s: click the green `onSizeLessThan` node, source panel slides open
   - 12–16 s: hit Ctrl+F, type `onIdle`, watch the halo ring move
   - 16–20 s: right-click the `PQueue.add` node, pick "Bookmark"
   - 20–22 s: the bookmark pane in the sidebar lights up
3. Convert the recording to a small GIF:
   ```bash
   ffmpeg -i demo.mp4 -vf "fps=24,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 demo.gif
   ```
4. Aim for 1.5–3 MB. If it's bigger, lower `fps` to 18 or scale to 1024.
5. Replace `packages/site/public/demo.gif` and `docs/demo.gif` with the new file.

## Why this is a TODO and not a blocker

The site, README, and launch copy are all wired up. The placeholder GIF +
SVG mockups make every page render correctly today. Swapping in real captures
is a 30-minute manual job and happens once.
