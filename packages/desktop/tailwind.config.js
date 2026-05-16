/** @type {import('tailwindcss').Config} */
export default {
  // v0.4: scan both the local src/ (thin shell) and the shared UI
  // package so Tailwind picks up every utility class used by the
  // components we now consume from @callmap/ui.
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surface tokens (Monaco / VS Code inspired) — see src/styles.css
        editor: "var(--bg-editor)",
        sidebar: "var(--bg-sidebar)",
        "activity-bar": "var(--bg-activity-bar)",
        "status-bar": "var(--bg-status-bar)",
        "status-bar-warn": "var(--bg-status-bar-warn)",
        panel: "var(--bg-panel)",
        hover: "var(--bg-hover)",
        selected: "var(--bg-selected)",
        "ide-input": "var(--bg-input)",
        "ide-overlay": "var(--bg-overlay)",
        tooltip: "var(--bg-tooltip)",

        // Borders
        "ide-border": "var(--border)",
        "ide-border-strong": "var(--border-strong)",
        "ide-border-focus": "var(--border-focus)",

        // Text
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-disabled": "var(--text-disabled)",
        "text-on-status": "var(--text-on-status)",
        "text-link": "var(--text-link)",

        // Brand / accent
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",

        // Diff palette
        "diff-added": "var(--diff-added)",
        "diff-added-bg": "var(--diff-added-bg)",
        "diff-removed": "var(--diff-removed)",
        "diff-removed-bg": "var(--diff-removed-bg)",
        "diff-changed": "var(--diff-changed)",
        "diff-changed-bg": "var(--diff-changed-bg)",
        "diff-neutral": "var(--diff-neutral)",
        "diff-neutral-bg": "var(--diff-neutral-bg)",
      },
      fontFamily: {
        ui: ['"Segoe UI"', "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ['"Cascadia Mono"', "Consolas", "Menlo", '"Courier New"', "monospace"],
      },
      fontSize: {
        ide: ["13px", "1.4"],
        "ide-sm": ["12px", "1.4"],
        "ide-xs": ["11px", "1.35"],
      },
    },
  },
  plugins: [],
};
