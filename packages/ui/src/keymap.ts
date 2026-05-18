// Central keyboard map. v0.3+ can extend this in one place to add new
// commands and palette entries without touching the dispatch logic.
//
// The label shown in the command palette is rendered with renderShortcut()
// which substitutes ⌘ for Ctrl on macOS so users see what their muscle
// memory expects.

export type ModifierKey = "Ctrl" | "Shift" | "Alt" | "Meta";

export interface Shortcut {
  key: string; // single character or named key, e.g. "p", "b", "Escape"
  mods?: ModifierKey[];
}

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Pretty-print a shortcut for the palette and tooltips. */
export function renderShortcut(s: Shortcut | undefined): string {
  if (!s) return "";
  const parts: string[] = [];
  if (s.mods?.includes("Ctrl")) parts.push(isMac ? "⌘" : "Ctrl");
  if (s.mods?.includes("Shift")) parts.push(isMac ? "⇧" : "Shift");
  if (s.mods?.includes("Alt")) parts.push(isMac ? "⌥" : "Alt");
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
  parts.push(key);
  return isMac ? parts.join("") : parts.join("+");
}

/** Match a DOM KeyboardEvent against a Shortcut definition. */
export function matchShortcut(e: KeyboardEvent, s: Shortcut): boolean {
  // Use Ctrl on Windows/Linux, Cmd (metaKey) on macOS, transparently.
  const wantsCtrl = !!s.mods?.includes("Ctrl");
  const wantsShift = !!s.mods?.includes("Shift");
  const wantsAlt = !!s.mods?.includes("Alt");
  const ctrlPressed = isMac ? e.metaKey : e.ctrlKey;

  if (wantsCtrl !== ctrlPressed) return false;
  if (wantsShift !== e.shiftKey) return false;
  if (wantsAlt !== e.altKey) return false;

  if (s.key.length === 1) {
    return e.key.toLowerCase() === s.key.toLowerCase();
  }
  return e.key === s.key;
}

// ── Top-level command IDs ──────────────────────────────────────────
export type CommandId =
  | "palette.open"
  | "palette.quickOpen"
  | "palette.jumpToFunction"
  | "sidebar.toggle"
  | "theme.toggle"
  | "source.close"
  | "legend.toggle"
  | "recent.clear"
  | "pr.openInBrowser"
  | "pr.reload"
  | "pr.focusInput"
  // v0.5
  | "search.openInGraph"
  | "minimap.toggle"
  | "bookmarks.show"
  // v1.1 — Map view
  | "viewMode.toggle"
  | "viewMode.review"
  | "viewMode.map"
  // v1.2 — Map keyboard navigation. Tab cycles every node when nothing
  // is selected (deterministic file/line/qname order). Enter promotes a
  // Tab-focused node to selected and opens the source panel. We don't
  // bind these as command IDs because the handler lives inside
  // MapGraphView at the window level; the IDs are here only so the
  // command palette and help-text can list them.
  | "map.cycleNode"
  | "map.openFocusedSource";

export const KEYMAP: Record<CommandId, Shortcut | undefined> = {
  "palette.open": { key: "p", mods: ["Ctrl", "Shift"] },
  "palette.quickOpen": { key: "p", mods: ["Ctrl"] },
  "palette.jumpToFunction": { key: "t", mods: ["Ctrl"] },
  "sidebar.toggle": { key: "b", mods: ["Ctrl"] },
  "theme.toggle": undefined, // status-bar click only
  "source.close": { key: "Escape" },
  "legend.toggle": undefined,
  "recent.clear": undefined,
  "pr.openInBrowser": undefined,
  "pr.reload": undefined,
  "pr.focusInput": undefined,
  // v0.5 — inline find-widget (graph search) and minimap toggle.
  // Ctrl+F mirrors VS Code's editor find. Ctrl+Shift+M is the same chord
  // VS Code uses for the "Problems" view; here it's repurposed for the
  // minimap toggle since callmap has no Problems pane.
  "search.openInGraph": { key: "f", mods: ["Ctrl"] },
  "minimap.toggle": { key: "m", mods: ["Ctrl", "Shift"] },
  "bookmarks.show": undefined,
  // v1.1 — Toggle between Review (xyflow) and Map (force-directed)
  // graph renderers. Ctrl+Shift+G is unbound in VS Code and Cursor so
  // we won't clash with editor commands. The split "go to review" /
  // "go to map" entries live in the palette but share no shortcut.
  "viewMode.toggle": { key: "g", mods: ["Ctrl", "Shift"] },
  "viewMode.review": undefined,
  "viewMode.map": undefined,
  // v1.2 — Tab + Enter are the global Map nav keys. We list them as
  // undefined-shortcut commands because their actual binding is a
  // window-level keydown handler in MapGraphView, not a palette
  // dispatch. Listing them surfaces them in /help and the command
  // palette's "all bindings" view.
  "map.cycleNode": { key: "Tab" },
  "map.openFocusedSource": { key: "Enter" },
};
