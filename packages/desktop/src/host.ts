// Tauri-backed implementation of @callmap/ui's HostBindings.
//
// v0.5 changes:
//   • PAT migrated from localStorage to the OS keychain (Windows
//     Credential Manager / macOS Keychain Services / Linux secret-service)
//     via three Tauri IPC commands defined in src-tauri/src/lib.rs.
//   • Migration on first launch: if a token already exists in
//     localStorage, copy it to the keychain and remove the localStorage
//     entry. Fire a one-shot toast so the user knows.
//   • Bookmarks stored in localStorage keyed by `<owner>/<repo>#<n>`.
//
// Recent PRs stay in localStorage (cheap to read, no secret risk).
// openExternal still routes through tauri-plugin-shell.

import type { HostBindings } from "@callmap/ui";
import type { Bookmark, RecentPr } from "@callmap/core";

const PAT_LEGACY_KEY = "callmap.gh_pat";
const PAT_MIGRATED_KEY = "callmap.gh_pat_migrated";
const RECENT_KEY = "callmap.recent_prs";
const BOOKMARKS_KEY_PREFIX = "callmap.bookmarks::";
const MAX_RECENT = 20;

// ── Tauri IPC plumbing ─────────────────────────────────────────────
// The Tauri commands live in src-tauri. We dynamic-import the API so
// `vite dev` (browser, no Tauri) still works for offline UI iteration —
// `isTauri()` short-circuits to a graceful fallback.

function isTauri(): boolean {
  // Tauri v2 injects `window.__TAURI_INTERNALS__` *and* a synchronous
  // `isTauri()` flag. We probe defensively because the type isn't on
  // the global declaration set in tsc.
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return !!w.__TAURI_INTERNALS__;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Lazy-import so the dev-server bundle (no Tauri runtime) still loads.
  // @ts-ignore — module resolution differs in dev vs prod; the runtime
  // import works because @tauri-apps/api is a direct dep.
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(cmd, args);
}

// ── Token (PAT) — keychain via IPC ─────────────────────────────────
async function getTokenFromKeychain(): Promise<string | null> {
  if (!isTauri()) {
    // Browser dev mode — fall back to localStorage so the UI still works.
    try {
      return localStorage.getItem(PAT_LEGACY_KEY);
    } catch {
      return null;
    }
  }
  try {
    return (await invoke<string | null>("get_token")) ?? null;
  } catch (err) {
    console.warn("[callmap] get_token IPC failed, falling back to localStorage:", err);
    try {
      return localStorage.getItem(PAT_LEGACY_KEY);
    } catch {
      return null;
    }
  }
}

async function setTokenInKeychain(token: string): Promise<void> {
  if (!isTauri()) {
    try {
      if (token.trim().length === 0) localStorage.removeItem(PAT_LEGACY_KEY);
      else localStorage.setItem(PAT_LEGACY_KEY, token.trim());
    } catch {
      /* noop */
    }
    return;
  }
  try {
    await invoke<void>("set_token", { token });
  } catch (err) {
    console.warn("[callmap] set_token IPC failed:", err);
  }
}

// ── Migration: localStorage → keychain ─────────────────────────────
// Runs at most once. Idempotent: the marker key prevents a second
// attempt. If migration fails we leave the localStorage entry in place
// so the user isn't locked out of the API.
async function migrateTokenIfNeeded(notify: (text: string) => void): Promise<void> {
  if (!isTauri()) return;
  let alreadyMigrated = false;
  try {
    alreadyMigrated = localStorage.getItem(PAT_MIGRATED_KEY) === "1";
  } catch {
    /* noop */
  }
  if (alreadyMigrated) return;

  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(PAT_LEGACY_KEY);
  } catch {
    return;
  }
  if (!legacy || legacy.trim().length === 0) {
    // Nothing to migrate, but still mark so we don't probe every launch.
    try {
      localStorage.setItem(PAT_MIGRATED_KEY, "1");
    } catch {
      /* noop */
    }
    return;
  }

  try {
    await invoke<void>("set_token", { token: legacy });
    // Only clear localStorage after a successful write.
    localStorage.removeItem(PAT_LEGACY_KEY);
    localStorage.setItem(PAT_MIGRATED_KEY, "1");
    notify("Your GitHub token is now stored in the OS keychain.");
  } catch (err) {
    console.warn("[callmap] PAT migration failed:", err);
  }
}

// ── Recent PRs (unchanged from v0.4) ───────────────────────────────
function getRecentPrs(): RecentPr[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPr[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addRecentPr(entry: RecentPr): void {
  const existing = getRecentPrs().filter((e) => e.url !== entry.url);
  const next = [entry, ...existing].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function removeRecentPr(url: string): void {
  const next = getRecentPrs().filter((e) => e.url !== url);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

function clearRecentPrs(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* noop */
  }
}

// ── Bookmarks (v0.5) ───────────────────────────────────────────────
// localStorage-backed, keyed per-PR so two PRs with the same node ids
// can each have their own pin set. The host only needs to know how to
// read and persist; the shell drives the UX.

function bookmarkKey(prKey: string): string {
  return `${BOOKMARKS_KEY_PREFIX}${prKey}`;
}

function getBookmarks(prKey: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(bookmarkKey(prKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Bookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBookmarks(prKey: string, list: Bookmark[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(bookmarkKey(prKey));
    else localStorage.setItem(bookmarkKey(prKey), JSON.stringify(list));
  } catch {
    /* noop */
  }
}

function addBookmark(b: Bookmark): void {
  const list = getBookmarks(b.prKey).filter((x) => x.nodeId !== b.nodeId);
  list.unshift(b);
  writeBookmarks(b.prKey, list);
}

function removeBookmark(prKey: string, nodeId: string): void {
  const list = getBookmarks(prKey).filter((b) => b.nodeId !== nodeId);
  writeBookmarks(prKey, list);
}

function clearBookmarks(prKey: string): void {
  writeBookmarks(prKey, []);
}

// ── openExternal (unchanged from v0.4) ─────────────────────────────
async function openExternal(url: string): Promise<void> {
  try {
    const mod = await import("@tauri-apps/plugin-shell");
    await mod.open(url);
    return;
  } catch {
    /* fall through */
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* noop */
  }
}

// ── Bootstrap migration on module load ─────────────────────────────
// Fire-and-forget; toast goes through a window CustomEvent so the
// IdeShell can pick it up without us reaching into React state.
(function bootstrap() {
  if (typeof window === "undefined") return;
  void migrateTokenIfNeeded((text) => {
    window.dispatchEvent(
      new CustomEvent("callmap:toast", { detail: { text } })
    );
  });
})();

export const desktopHost: HostBindings = {
  hostName: "desktop",
  openExternal: (url) => {
    void openExternal(url);
  },
  getRecentPrs,
  addRecentPr,
  removeRecentPr,
  clearRecentPrs,
  supportsPatInput: true,
  // v0.5 — getToken/setToken now resolve through the OS keychain.
  // The HostBindings interface permits a Promise return so the Settings
  // pane will await it.
  getToken: () => getTokenFromKeychain(),
  setToken: (token) => setTokenInKeychain(token),
  defaultShowLegend: true,
  getBookmarks,
  addBookmark,
  removeBookmark,
  clearBookmarks,
};
