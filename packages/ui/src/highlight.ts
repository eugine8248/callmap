// Source-panel syntax highlighting, v0.3.
//
// We use highlight.js with a hand-picked language list rather than the
// full 150+ language bundle. Each register imports just one grammar
// file (typically 5-10 KB gzip).
//
// Public API: `highlightLines(source, language) -> string[]`. Returns
// an array of HTML strings, one per source line, with hljs-class
// spans applied. The caller renders each line in its own row so line
// numbers stay aligned.
//
// Themes live in styles.css under the .hljs-* classes — see v0.3
// stylesheet additions.

import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import type { Language } from "@callmap/core";

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("go", go);
}

function hljsLanguageFor(lang: Language): string | null {
  switch (lang) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "go":
      return "go";
    default:
      return null;
  }
}

/**
 * Highlight `source` in `lang`, returning one HTML string per line.
 * If the language isn't supported, returns raw HTML-escaped lines so
 * the renderer can still display monospaced text without colorization.
 */
export function highlightLines(source: string, lang: Language): string[] {
  ensureRegistered();
  const hl = hljsLanguageFor(lang);
  if (!hl) return source.split("\n").map(escapeHtml);
  try {
    const result = hljs.highlight(source, { language: hl, ignoreIllegals: true });
    return result.value.split("\n");
  } catch {
    return source.split("\n").map(escapeHtml);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
