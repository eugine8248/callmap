// Lightweight codicon-style icons — hand-picked SVG paths matching
// the VS Code icon set (Codicon by Microsoft, MIT). Inlining ~15 icons
// adds <2KB to the bundle vs. ~30KB+ for the full font file.
//
// All icons render at 16×16, monochrome (currentColor), 1px stroke.

import type { SVGProps } from "react";

export type CodiconName =
  | "git-pull-request"
  | "history"
  | "bookmark"
  | "bookmark-filled"
  | "gear"
  | "zap"
  | "git-branch"
  | "search"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "close"
  | "arrow-left"
  | "sun"
  | "moon"
  | "play"
  | "refresh"
  | "trash"
  | "link-external"
  | "symbol-method"
  | "diff-added"
  | "diff-removed"
  | "diff-modified"
  | "circle-filled"
  | "info"
  | "warning"
  | "languages"
  | "map"
  | "pin"
  | "file"
  | "file-py"
  | "file-go"
  | "file-ts"
  | "file-js"
  | "callmap-logo"
  // v1.1 — Map view affordances
  | "network"
  | "globe"
  | "eye";

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: CodiconName;
  size?: number;
}

export default function Codicon({ name, size = 16, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="codicon"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

// Codicon paths — distilled from the canonical Codicon set.
const paths: Record<CodiconName, JSX.Element> = {
  "git-pull-request": (
    <>
      <circle cx="4" cy="4" r="1.6" />
      <circle cx="4" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M4 5.6v4.8" />
      <path d="M12 10.4V6.5A1.5 1.5 0 0 0 10.5 5H8" />
      <path d="M9.5 3.5L8 5l1.5 1.5" />
    </>
  ),
  history: (
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.5 4.5V7.5h3" />
      <path d="M8 5v3l2 1.5" />
    </>
  ),
  bookmark: (
    <path d="M4 2.5h8v11l-4-2.5-4 2.5z" />
  ),
  "bookmark-filled": (
    <path d="M4 2.5h8v11l-4-2.5-4 2.5z" fill="currentColor" />
  ),
  gear: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M5.4 11.6l-1 1M12.6 12.6l-1-1M5.4 4.4l-1-1" />
    </>
  ),
  zap: (
    <path d="M9 1.5L3 9h4l-1 5.5L13 7H9z" fill="currentColor" stroke="none" />
  ),
  "git-branch": (
    <>
      <circle cx="4" cy="3" r="1.4" />
      <circle cx="4" cy="13" r="1.4" />
      <circle cx="12" cy="6" r="1.4" />
      <path d="M4 4.4v7.2" />
      <path d="M12 7.4v.6a3 3 0 0 1-3 3H4" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.5 3.5" />
    </>
  ),
  "chevron-left": <path d="M10 3.5L5.5 8l4.5 4.5" />,
  "chevron-right": <path d="M6 3.5L10.5 8 6 12.5" />,
  "chevron-down": <path d="M3.5 6L8 10.5 12.5 6" />,
  "chevron-up": <path d="M3.5 10L8 5.5 12.5 10" />,
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  "arrow-left": (
    <>
      <path d="M7 3.5L2.5 8 7 12.5" />
      <path d="M2.5 8H14" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5V3M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M5.4 11.6l-1 1M12.6 12.6l-1-1M5.4 4.4l-1-1" />
    </>
  ),
  moon: (
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="currentColor" stroke="none" />
  ),
  play: <path d="M5 3.5L12 8l-7 4.5z" fill="currentColor" stroke="none" />,
  refresh: (
    <>
      <path d="M13 8a5 5 0 1 1-1.5-3.5" />
      <path d="M13 2.5V5h-2.5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 4.5h10" />
      <path d="M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M4.5 4.5l.7 8.5a1 1 0 0 0 1 1h3.6a1 1 0 0 0 1-1l.7-8.5" />
    </>
  ),
  "link-external": (
    <>
      <path d="M9.5 2.5H13.5V6.5" />
      <path d="M13.5 2.5L8 8" />
      <path d="M11.5 9V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h4" />
    </>
  ),
  "symbol-method": (
    <>
      <path d="M8 2L13.5 5v6L8 14l-5.5-3V5z" />
      <path d="M2.5 5L8 8l5.5-3M8 8v6" />
    </>
  ),
  "diff-added": (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v6M5 8h6" />
    </>
  ),
  "diff-removed": (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5 8h6" />
    </>
  ),
  "diff-modified": (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
    </>
  ),
  "circle-filled": <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7v4M8 5.2v.1" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2L14.5 13.5h-13z" />
      <path d="M8 6.5v3.5M8 11.6v.1" />
    </>
  ),
  // Branded "callmap" mark — two stacked nodes connected by a line
  "callmap-logo": (
    <>
      <circle cx="4.5" cy="4.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
      <path d="M5.7 5.9l4.6 4.6" />
    </>
  ),
  // v0.3 codicons — language/filter affordances
  languages: (
    <>
      <path d="M2 3h6v6H2z" />
      <path d="M8 7h6v6H8z" />
      <path d="M4 5l2 2M4 7l2-2" />
    </>
  ),
  // v0.5 — minimap toggle icon (a tiny framed rectangle inside a larger
  // viewport — reads as "map" at 12-22px).
  map: (
    <>
      <path d="M2 4l4-1.5 4 1.5 4-1.5v9l-4 1.5-4-1.5-4 1.5z" />
      <path d="M6 2.5v11M10 4v11" />
    </>
  ),
  // v0.5 — pin glyph for bookmarked-node overlay. Drawn as a circle on a
  // stem so it reads clearly even at 10-12px.
  pin: (
    <>
      <circle cx="8" cy="6" r="2.5" fill="currentColor" stroke="none" />
      <path d="M8 8.5v5" strokeWidth="1.4" />
    </>
  ),
  file: (
    <>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </>
  ),
  // Each language file icon overlays a 2-3 char label on a file outline.
  // Tree-shake friendly: rendered as inline SVG text so no font work needed.
  "file-py": (
    <>
      <path d="M4 2h5l3 3v9H4z" fill="none" />
      <path d="M9 2v3h3" />
      <text x="8" y="12" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none" fontFamily="monospace">py</text>
    </>
  ),
  "file-go": (
    <>
      <path d="M4 2h5l3 3v9H4z" fill="none" />
      <path d="M9 2v3h3" />
      <text x="8" y="12" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none" fontFamily="monospace">go</text>
    </>
  ),
  "file-ts": (
    <>
      <path d="M4 2h5l3 3v9H4z" fill="none" />
      <path d="M9 2v3h3" />
      <text x="8" y="12" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none" fontFamily="monospace">ts</text>
    </>
  ),
  "file-js": (
    <>
      <path d="M4 2h5l3 3v9H4z" fill="none" />
      <path d="M9 2v3h3" />
      <text x="8" y="12" textAnchor="middle" fontSize="5" fill="currentColor" stroke="none" fontFamily="monospace">js</text>
    </>
  ),
  // v1.1 — Map view ("Network" icon — three nodes connected by edges,
  // distinctly different from the "callmap-logo" two-node mark used
  // for the app brand).
  network: (
    <>
      <circle cx="3" cy="3.5" r="1.6" />
      <circle cx="13" cy="3.5" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <path d="M4.4 4.3l2.7 6.4M11.6 4.3l-2.7 6.4M4.6 3.5h6.8" />
    </>
  ),
  // v1.1 — 3D / globe glyph for the easter-egg pill (post-`gg`).
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="3" ry="6" />
      <path d="M2 8h12" />
    </>
  ),
  // v1.1 — generic "view" glyph for the status-bar mode pill.
  eye: (
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
};
