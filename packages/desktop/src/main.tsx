// Desktop entry. v0.5 changes:
//   • Token provider reads through the keychain-backed host
//     asynchronously (the v0.4 sync hook is still respected when the
//     keychain hasn't completed its first read).
//   • A Vite `?worker&inline` import wires up @callmap/core's parse
//     worker so multi-file PRs parse off the main thread.
//
// The Tauri shell wraps this Vite build and the tauri.conf.json still
// points its frontendDist at packages/desktop/dist.

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { IdeShell } from "@callmap/ui";
import {
  setTokenProvider,
  setParseWorkerFactory,
  wrapParseWorker,
} from "@callmap/core";
// v0.5 — Inline-bundled parse worker. `?worker&inline` is a Vite
// directive: it produces a Worker constructor whose source is bundled
// as a base64 blob, so the Tauri build has no extra .js files to ship.
// On the dev server it's served as a separate URL.
import ParseWorker from "@callmap/core/parseWorker?worker&inline";
import "@callmap/ui/styles.css";
import { desktopHost } from "./host";

// ── Token provider ────────────────────────────────────────────────
// The core's GitHub client reads the PAT through a synchronous hook.
// Our keychain-backed getter is async, so we keep an in-memory cache
// that we refresh whenever the user opens Settings; the hook returns
// the cached value (null until the first resolution completes — the
// first call after launch is anonymous, which is fine: it'll just hit
// the public-rate-limit until the cache populates).
let cachedToken: string | null = null;
void (async () => {
  cachedToken = await Promise.resolve(desktopHost.getToken());
})();
// Watch for keychain mutations driven by the Settings pane. The host
// calls setToken which goes through Tauri IPC; we listen on a custom
// event the host dispatches so the cache stays fresh.
if (typeof window !== "undefined") {
  window.addEventListener("callmap:token-updated", () => {
    void (async () => {
      cachedToken = await Promise.resolve(desktopHost.getToken());
    })();
  });
}
setTokenProvider(() => cachedToken);

// Wrap setToken so the Settings save also bumps the cache.
const _origSetToken = desktopHost.setToken;
desktopHost.setToken = async (token: string) => {
  await Promise.resolve(_origSetToken(token));
  cachedToken = token.trim() || null;
  window.dispatchEvent(new CustomEvent("callmap:token-updated"));
};

// ── Parse worker ──────────────────────────────────────────────────
// We register a factory that spins up a fresh Worker per PR build and
// hands it to wrapParseWorker. The factory passes the WASM URLs through
// the worker init message — the worker itself uses fetch() to pull them.
const WASM_FILES = [
  "tree-sitter.wasm",
  "tree-sitter-typescript.wasm",
  "tree-sitter-javascript.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-go.wasm",
];
setParseWorkerFactory(() => {
  try {
    const worker = new ParseWorker();
    const wasmFiles: Record<string, string> = {};
    for (const f of WASM_FILES) {
      // Tauri serves /public/*.wasm at the document root, same as Vite.
      wasmFiles[f] = `/${f}`;
    }
    return wrapParseWorker(worker, wasmFiles);
  } catch (err) {
    console.warn("[callmap] failed to spawn parse worker, parsing inline:", err);
    return null;
  }
});

function GraphRedirect() {
  // v0.1 bookmarks shipped as /graph?url=… — redirect to the new shell
  // route which reads ?url= on first paint.
  const [params] = useSearchParams();
  const url = params.get("url");
  return <Navigate to={url ? `/?url=${encodeURIComponent(url)}` : "/"} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<IdeShell host={desktopHost} />} />
      <Route path="/graph" element={<GraphRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
