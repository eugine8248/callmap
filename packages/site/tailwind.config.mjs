/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,md,mdx,js,ts}"],
  theme: {
    extend: {
      colors: {
        // Match @callmap/ui dark tokens exactly.
        editor: "#1e1e1e",
        sidebar: "#252526",
        activity: "#333333",
        panel: "#252526",
        hover: "#2a2d2e",
        selected: "#094771",
        input: "#3c3c3c",
        border: "#3c3c3c",
        "border-strong": "#4a4a4a",
        primary: "#cccccc",
        secondary: "#9d9d9d",
        disabled: "#6a6a6a",
        accent: "#007acc",
        "accent-hover": "#1a8cff",
        link: "#3794ff",
        "diff-added": "#4ec9b0",
        "diff-removed": "#f48771",
        "diff-changed": "#dcdcaa",
        "diff-neutral": "#858585",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
