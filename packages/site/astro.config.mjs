// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

// callmap docs site — static, no JS framework, dark by default.
// Output goes to packages/site/dist/. Deploys to GitHub Pages or any static host.
//
// Base path note: until C2 (domain) lands, we ship to
//   https://eugine8248.github.io/callmap
// so the site builds with `--base=/callmap` for GH Pages, but defaults to "/"
// for a custom domain. Set CALLMAP_SITE_BASE env var to override.
const base = process.env.CALLMAP_SITE_BASE || "/";

export default defineConfig({
  site: "https://eugine8248.github.io",
  base,
  trailingSlash: "ignore",
  integrations: [tailwind({ applyBaseStyles: false })],
  build: {
    inlineStylesheets: "auto",
  },
  compressHTML: true,
});
