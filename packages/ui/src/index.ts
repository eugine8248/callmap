// Public API for @callmap/ui.
//
// The desktop and VS Code hosts both pull <IdeShell /> from here and
// inject their own HostBindings. Component-level exports stay flat so
// downstream code (tests, future embed surfaces) can mount the pieces
// individually without re-mounting the full shell.

export { default as IdeShell } from "./IdeShell";
export type { IdeShellProps } from "./IdeShell";

export { default as ActivityBar } from "./ActivityBar";
export type { ActivityView } from "./ActivityBar";

export { default as Sidebar } from "./Sidebar";
export { default as StatusBar } from "./StatusBar";
export { default as Breadcrumbs } from "./Breadcrumbs";
// v0.5 — CallGraphView, FunctionNode, and SourcePanel are NOT
// re-exported here. They're loaded via React.lazy by IdeShell and
// re-exporting them would pin xyflow + highlight.js into the initial
// bundle, defeating the code split. Downstream code that wants the
// components directly can deep-import them at "./CallGraphView" etc.
export type { CallGraphViewHandle } from "./CallGraphView";
export { default as Codicon } from "./Codicon";
export type { CodiconName } from "./Codicon";
export { default as CommandPalette } from "./CommandPalette";
export type { CommandItem, PaletteMode } from "./CommandPalette";
export { default as DiffBadge } from "./DiffBadge";
export { default as EmptyState } from "./EmptyState";
export { default as LegendBar } from "./LegendBar";
export { default as PrInputForm } from "./PrInputForm";
export type { PrInputFormHandle } from "./PrInputForm";

export type { HostBindings } from "./host";

export {
  applyInitialTheme,
  getTheme,
  setTheme,
  toggleTheme,
} from "./theme";
export type { Theme } from "./theme";

export {
  KEYMAP,
  matchShortcut,
  renderShortcut,
  isMac,
} from "./keymap";
export type { CommandId, Shortcut, ModifierKey } from "./keymap";

export { highlightLines } from "./highlight";
