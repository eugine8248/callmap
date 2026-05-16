// Theme persistence + DOM toggle. Themes are pure CSS-var swaps on
// :root[data-theme=...] so flips are instant and don't flash.

const KEY = "callmap.theme";

export type Theme = "dark" | "light";

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* noop */
  }
  return "dark";
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* noop */
  }
  document.documentElement.setAttribute("data-theme", theme);
}

export function applyInitialTheme(): void {
  setTheme(getTheme());
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
