// VS Code webview entry. Bootstraps:
//   • a postMessage bridge to the extension host (HTTP proxy, recents,
//     openExternal, theme, bookmarks)
//   • the @callmap/core WASM loader pointed at the asWebviewUri map
//     supplied by the extension
//   • a HostBindings object backed by the bridge
//   • <IdeShell /> from @callmap/ui
//
// v0.5 changes:
//   • Bookmarks proxied through the extension host's globalState so the
//     pin survives reload (and reaches other workspaces in the same
//     VS Code profile).
//   • Parse worker registered when the runtime supports `new Worker(url)`
//     against an asWebviewUri-resolved URL.
//
// The extension sends an 'init' message synchronously after we post
// 'ready'. Until init arrives we render a thin "Connecting…" splash.

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { IdeShell, type HostBindings } from "@callmap/ui";
import {
  setHttp,
  setTokenProvider,
  setWasmLoader,
  setParseWorkerFactory,
  wrapParseWorker,
  type Bookmark,
  type HttpFetcher,
  type RecentPr,
} from "@callmap/core";
import "@callmap/ui/styles.css";

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (msg: any) => void;
      setState: (s: any) => void;
      getState: () => any;
    };
  }
}

const vscode = window.acquireVsCodeApi();

// ── HTTP proxy through the extension host ─────────────────────────
// The webview can't talk to api.github.com directly (CSP). We forward
// each request via postMessage and resolve a promise when the matching
// http:result comes back. ID = monotonic counter.
let nextHttpId = 1;
const pendingHttp = new Map<
  number,
  (res: {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    body: string;
  }) => void
>();

const httpFetcher: HttpFetcher = (url, init) => {
  const id = nextHttpId++;
  return new Promise((resolve) => {
    pendingHttp.set(id, (raw) => {
      resolve({
        ok: raw.ok,
        status: raw.status,
        text: async () => raw.body,
        json: async () => JSON.parse(raw.body),
        headers: {
          get: (n: string) => {
            // VS Code's fetch lowercases header names; consumers ask in
            // any case, so we normalize on lookup.
            const lower = n.toLowerCase();
            for (const [k, v] of Object.entries(raw.headers)) {
              if (k.toLowerCase() === lower) return v;
            }
            return null;
          },
        },
      });
    });
    vscode.postMessage({
      type: "http:request",
      payload: { id, url, headers: init?.headers ?? {} },
    });
  });
};

setHttp(httpFetcher);

// The session token never reaches the webview — the extension host
// attaches Authorization headers inside its http:request handler.
setTokenProvider(() => null);

// ── WASM loader ───────────────────────────────────────────────────
// Filled in once we receive the 'init' message. We fetch via the
// webview-uri so the CSP allows it and stream the bytes into the
// tree-sitter runtime.
let wasmUriMap: Record<string, string> = {};
let workerUri: string | null = null;
setWasmLoader(async (file) => {
  const uri = wasmUriMap[file];
  if (!uri) {
    throw new Error(`callmap webview: no URI registered for ${file}`);
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`callmap webview: failed to fetch ${file}`);
  // tree-sitter accepts both the URI string (for the runtime) and the
  // Uint8Array (for grammars). We always return bytes — works for both.
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf;
});

// ── Parse worker (v0.5) ────────────────────────────────────────────
// The webview spawns Web Workers from a separate, build-time emitted
// chunk. The extension supplies the absolute asWebviewUri so we can
// `new Worker(url)` past the CSP.
//
// If the worker URI never arrives (older extension host, or build
// without the worker chunk) we fall back to the inline parser path.
setParseWorkerFactory(() => {
  if (!workerUri) return null;
  try {
    // VS Code's strict CSP forbids the standard "module" worker type
    // unless `worker-src 'self'` is set; we keep it as a classic worker
    // because the bundled chunk emits classic-script syntax.
    const worker = new Worker(workerUri);
    return wrapParseWorker(worker, wasmUriMap);
  } catch (err) {
    console.warn("[callmap webview] worker spawn failed, parsing inline:", err);
    return null;
  }
});

// ── Recent-PR state mirror ────────────────────────────────────────
let recentsSnapshot: RecentPr[] = [];

// ── Bookmark state mirror (v0.5) ──────────────────────────────────
// The extension owns the source of truth in globalState. We keep a
// per-prKey snapshot in memory; mutations fire postMessages and the
// extension echoes back via `bookmarks` so this map stays consistent.
let bookmarksByPr: Record<string, Bookmark[]> = {};

// ── HostBindings ──────────────────────────────────────────────────
const vscodeHost: HostBindings = {
  hostName: "vscode",
  openExternal: (url) => vscode.postMessage({ type: "openExternal", payload: { url } }),
  getRecentPrs: () => recentsSnapshot,
  addRecentPr: (entry) => vscode.postMessage({ type: "addRecent", payload: entry }),
  removeRecentPr: (url) => vscode.postMessage({ type: "removeRecent", payload: { url } }),
  clearRecentPrs: () => vscode.postMessage({ type: "clearRecents" }),
  supportsPatInput: false,
  // The webview never sees the token; these stubs satisfy the interface.
  getToken: () => null,
  setToken: () => {
    /* not supported — see settings pane copy */
  },
  defaultShowLegend: true,
  getBookmarks: (prKey) => bookmarksByPr[prKey] ?? [],
  addBookmark: (b) => vscode.postMessage({ type: "addBookmark", payload: b }),
  removeBookmark: (prKey, nodeId) =>
    vscode.postMessage({ type: "removeBookmark", payload: { prKey, nodeId } }),
  clearBookmarks: (prKey) =>
    vscode.postMessage({ type: "clearBookmarks", payload: { prKey } }),
};

// ── App ───────────────────────────────────────────────────────────
function App() {
  const [ready, setReady] = useState(false);
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const msg = ev.data;
      switch (msg?.type) {
        case "init": {
          wasmUriMap = msg.payload.wasmFiles ?? {};
          workerUri = msg.payload.workerUri ?? null;
          recentsSnapshot = msg.payload.recents ?? [];
          bookmarksByPr = msg.payload.bookmarks ?? {};
          document.documentElement.setAttribute(
            "data-theme",
            msg.payload.theme === "light" ? "light" : "dark"
          );
          setInitialUrl(msg.payload.initialUrl ?? null);
          setReady(true);
          return;
        }
        case "loadUrl": {
          // Re-mount with a new initialUrl so IdeShell's bootstrap effect runs.
          setInitialUrl(msg.payload.url);
          forceRender((n) => n + 1);
          return;
        }
        case "recents": {
          recentsSnapshot = msg.payload ?? [];
          forceRender((n) => n + 1);
          return;
        }
        case "bookmarks": {
          // payload: { prKey, list }
          bookmarksByPr[msg.payload.prKey] = msg.payload.list ?? [];
          forceRender((n) => n + 1);
          return;
        }
        case "theme": {
          document.documentElement.setAttribute(
            "data-theme",
            msg.payload === "light" ? "light" : "dark"
          );
          return;
        }
        case "http:result": {
          const cb = pendingHttp.get(msg.payload.id);
          if (cb) {
            pendingHttp.delete(msg.payload.id);
            cb(msg.payload);
          }
          return;
        }
      }
    }
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!ready) {
    return (
      <div style={{ padding: 16, fontFamily: "var(--vscode-font-family, sans-serif)" }}>
        Connecting to callmap host…
      </div>
    );
  }

  return <IdeShell host={vscodeHost} initialUrl={initialUrl} key={initialUrl ?? ""} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
