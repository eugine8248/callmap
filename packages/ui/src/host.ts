// Platform-specific callbacks supplied by the host (desktop or vscode).
//
// The UI package is pure React and reaches the outside world via this
// object. The desktop host wires it to tauri-plugin-shell + localStorage;
// the VS Code host routes calls through postMessage so the extension
// process can handle them (vscode.env.openExternal, workspace state,
// authentication session, etc.).
//
// Keep this surface tiny — every new method has to be implemented on
// both hosts.

import type { Bookmark, RecentPr } from "@callmap/core";

export interface HostBindings {
  /** Open a URL in the user's default browser. */
  openExternal: (url: string) => void;

  /**
   * Recent-PR storage. Desktop persists to localStorage. VS Code stores
   * in workspaceState via postMessage. Synchronous getters return a
   * snapshot — the UI bumps a `recentVersion` counter and re-reads.
   */
  getRecentPrs: () => RecentPr[];
  addRecentPr: (entry: RecentPr) => void;
  removeRecentPr: (url: string) => void;
  clearRecentPrs: () => void;

  /**
   * GitHub PAT input.
   *
   * On the desktop the Settings pane lets the user paste a PAT. In
   * VS Code we delegate to vscode.authentication.getSession and there
   * is nothing to render — `supportsPatInput: false` hides the pane.
   *
   * v0.5: the desktop host migrates from localStorage to the OS keychain.
   * Because the API is async on Tauri (Rust IPC) but stays synchronous on
   * v0.4 hosts that haven't migrated, the getters / setters can return
   * either a value or a Promise. The shell calls `await` on either.
   */
  supportsPatInput: boolean;
  getToken: () => string | null | Promise<string | null>;
  setToken: (token: string) => void | Promise<void>;

  /**
   * Whether the legend bar should default to visible. VS Code users see
   * an information panel inside the activity bar instead, so the legend
   * is hidden by default there.
   */
  defaultShowLegend?: boolean;

  /**
   * The host's name, used for the welcome pane copy and feature gating.
   */
  hostName: "desktop" | "vscode";

  /**
   * v0.5 — bookmark storage. Bookmarks are per-PR (the prKey makes that
   * explicit) and live in whatever local storage the host has access to.
   * Desktop: localStorage. VS Code: globalState via postMessage.
   *
   * The four getters/setters are synchronous so the bookmarks pane can
   * derive its row list during render without waiting on IO. Mutations
   * fire-and-forget through the host; the shell calls `getBookmarks`
   * again after a write to refresh.
   */
  getBookmarks: (prKey: string) => Bookmark[];
  addBookmark: (b: Bookmark) => void;
  removeBookmark: (prKey: string, nodeId: string) => void;
  clearBookmarks: (prKey: string) => void;
}
