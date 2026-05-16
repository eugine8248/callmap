/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        added: "#22c55e",
        removed: "#ef4444",
        changed: "#f59e0b",
        neutral: "#64748b",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
