// The CallgraphPanel owns a single webview that hosts the built React
// bundle from media/. Messages crossing the boundary:
//
// ── from extension to webview ────────────────────────────────────
//   { type: 'init',         payload: InitPayload }
//   { type: 'recents',      payload: RecentPr[] }
//   { type: 'bookmarks',    payload: { prKey, list: Bookmark[] } }    (v0.5)
//   { type: 'theme',        payload: 'dark'|'light' }
//   { type: 'http:result',  payload: { id, ok, status, headers, body } }
//
// ── from webview to extension ────────────────────────────────────
//   { type: 'openExternal',    payload: { url } }
//   { type: 'addRecent'   ,    payload: RecentPr }
//   { type: 'removeRecent',    payload: { url } }
//   { type: 'clearRecents' }
//   { type: 'addBookmark',     payload: Bookmark }              (v0.5)
//   { type: 'removeBookmark',  payload: { prKey, nodeId } }     (v0.5)
//   { type: 'clearBookmarks',  payload: { prKey } }             (v0.5)
//   { type: 'http:request',    payload: { id, url, headers } }
//
// HTTP requests are proxied through the extension host so the
// authenticated GitHub session token (vscode.authentication.getSession)
// never crosses into the renderer. This also bypasses the webview's
// strict CSP, which blocks direct cross-origin fetches.

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { webviewHtml } from "./webview-html";
import { RECENT_STATE_KEY } from "./extension";

interface RecentPr {
  url: string;
  title: string;
  loadedAt: number;
}

// v0.5: bookmark schema mirrors @callmap/core. Kept local so the
// extension doesn't need an extra package dependency just for typing.
interface Bookmark {
  prKey: string;
  nodeId: string;
  name: string;
  file: string;
  startLine: number;
  addedAt: number;
}

const BOOKMARKS_STATE_KEY = "callmap.bookmarks";

interface InitPayload {
  initialUrl: string | null;
  theme: "dark" | "light";
  wasmFiles: Record<string, string>; // grammar name -> webview URI
  workerUri: string | null;          // v0.5 — parse-worker chunk URI
  recents: RecentPr[];
  bookmarks: Record<string, Bookmark[]>; // v0.5 — keyed by prKey
}

export class CallgraphPanel {
  private static instance: CallgraphPanel | undefined;
  private static panels = new Set<CallgraphPanel>();

  static async createOrShow(
    context: vscode.ExtensionContext,
    initialUrl: string
  ): Promise<void> {
    if (CallgraphPanel.instance) {
      CallgraphPanel.instance.reveal(initialUrl);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "callmap",
      "callmap",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
      }
    );
    CallgraphPanel.instance = new CallgraphPanel(context, panel, initialUrl);
    CallgraphPanel.panels.add(CallgraphPanel.instance);
  }

  /** Tell every live panel to reapply the configured theme. */
  static broadcastThemeChange(): void {
    for (const p of CallgraphPanel.panels) {
      p.postTheme();
    }
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly initialUrl: string
  ) {
    this.panel.webview.html = this.buildHtml();
    this.wireMessages();
    this.panel.onDidDispose(() => this.dispose());

    // Theme-kind change (Dark/Light toggle from VS Code itself) should
    // flow to the webview when the user has `callmap.theme: 'auto'`.
    vscode.window.onDidChangeActiveColorTheme(
      () => this.postTheme(),
      null,
      this.context.subscriptions
    );

    // Send the initial bootstrap once the webview signals ready.
  }

  private dispose(): void {
    CallgraphPanel.panels.delete(this);
    if (CallgraphPanel.instance === this) CallgraphPanel.instance = undefined;
  }

  private reveal(url: string): void {
    this.panel.reveal(vscode.ViewColumn.Active);
    // Tell the running webview to load a different PR without reload.
    this.panel.webview.postMessage({ type: "loadUrl", payload: { url } });
  }

  // ── Webview HTML ────────────────────────────────────────────────
  private buildHtml(): string {
    const mediaDir = path.join(this.context.extensionPath, "media");
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(mediaDir, "main.js"))
    );
    const stylesUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(mediaDir, "main.css"))
    );
    const cspSource = this.panel.webview.cspSource;
    const nonce = randomNonce();
    return webviewHtml({
      scriptUri: scriptUri.toString(),
      stylesUri: stylesUri.toString(),
      cspSource,
      nonce,
    });
  }

  // ── Message bridge ──────────────────────────────────────────────
  private wireMessages(): void {
    this.panel.webview.onDidReceiveMessage(async (msg: any) => {
      try {
        switch (msg?.type) {
          case "ready":
            await this.postInit();
            return;
          case "openExternal":
            if (typeof msg.payload?.url === "string") {
              vscode.env.openExternal(vscode.Uri.parse(msg.payload.url));
            }
            return;
          case "addRecent":
            this.mutateRecents((r) => {
              const filtered = r.filter((e) => e.url !== msg.payload.url);
              return [msg.payload, ...filtered].slice(0, this.maxRecents());
            });
            return;
          case "removeRecent":
            this.mutateRecents((r) => r.filter((e) => e.url !== msg.payload.url));
            return;
          case "clearRecents":
            this.mutateRecents(() => []);
            return;
          case "addBookmark":
            this.mutateBookmarks(msg.payload.prKey, (list) => {
              const filtered = list.filter((b) => b.nodeId !== msg.payload.nodeId);
              return [msg.payload, ...filtered];
            });
            return;
          case "removeBookmark":
            this.mutateBookmarks(msg.payload.prKey, (list) =>
              list.filter((b) => b.nodeId !== msg.payload.nodeId)
            );
            return;
          case "clearBookmarks":
            this.mutateBookmarks(msg.payload.prKey, () => []);
            return;
          case "http:request":
            await this.handleHttp(msg.payload);
            return;
        }
      } catch (e: unknown) {
        // Surface the error to the user but don't crash the host —
        // a broken message handler shouldn't bring down VS Code.
        vscode.window.showErrorMessage(
          `callmap: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    });
  }

  private maxRecents(): number {
    return vscode.workspace
      .getConfiguration("callmap")
      .get<number>("recent.maxItems", 20);
  }

  private mutateRecents(fn: (r: RecentPr[]) => RecentPr[]): void {
    const current = this.context.globalState.get<RecentPr[]>(
      RECENT_STATE_KEY,
      []
    );
    const next = fn(current);
    void this.context.globalState.update(RECENT_STATE_KEY, next);
    this.panel.webview.postMessage({ type: "recents", payload: next });
  }

  // v0.5 — bookmark mutator. Stored as `{ [prKey]: Bookmark[] }` in a
  // single globalState entry so the panel can hydrate everything in
  // one shot at init.
  private mutateBookmarks(prKey: string, fn: (b: Bookmark[]) => Bookmark[]): void {
    const all = this.context.globalState.get<Record<string, Bookmark[]>>(
      BOOKMARKS_STATE_KEY,
      {}
    );
    const next = fn(all[prKey] ?? []);
    if (next.length === 0) {
      // Tidy up — empty arrays add up over time.
      delete all[prKey];
    } else {
      all[prKey] = next;
    }
    void this.context.globalState.update(BOOKMARKS_STATE_KEY, all);
    this.panel.webview.postMessage({
      type: "bookmarks",
      payload: { prKey, list: next },
    });
  }

  private async postInit(): Promise<void> {
    const mediaDir = path.join(this.context.extensionPath, "media");
    // Build a map of grammar-file -> webview URI so the parser's
    // setWasmLoader can resolve them inside the renderer.
    const wasmFiles: Record<string, string> = {};
    for (const f of [
      "tree-sitter.wasm",
      "tree-sitter-typescript.wasm",
      "tree-sitter-javascript.wasm",
      "tree-sitter-python.wasm",
      "tree-sitter-go.wasm",
    ]) {
      const full = path.join(mediaDir, f);
      if (fs.existsSync(full)) {
        wasmFiles[f] = this.panel.webview
          .asWebviewUri(vscode.Uri.file(full))
          .toString();
      }
    }
    // v0.5 — locate the parse worker chunk. Vite emits it as a
    // separate file in media/ (the filename comes from Vite's
    // chunkFileNames option — we search for the first chunk that
    // imports "parseWorker"). If not found we send null so the
    // webview falls back to the inline parser.
    let workerUri: string | null = null;
    try {
      for (const f of fs.readdirSync(mediaDir)) {
        if (!f.endsWith(".js")) continue;
        if (!/parseWorker/i.test(f)) continue;
        workerUri = this.panel.webview
          .asWebviewUri(vscode.Uri.file(path.join(mediaDir, f)))
          .toString();
        break;
      }
    } catch {
      /* noop — directory listing failure shouldn't block init */
    }
    const init: InitPayload = {
      initialUrl: this.initialUrl,
      theme: this.resolvedTheme(),
      wasmFiles,
      workerUri,
      recents: this.context.globalState.get<RecentPr[]>(RECENT_STATE_KEY, []),
      bookmarks: this.context.globalState.get<Record<string, Bookmark[]>>(
        BOOKMARKS_STATE_KEY,
        {}
      ),
    };
    this.panel.webview.postMessage({ type: "init", payload: init });
  }

  private postTheme(): void {
    this.panel.webview.postMessage({
      type: "theme",
      payload: this.resolvedTheme(),
    });
  }

  private resolvedTheme(): "dark" | "light" {
    const cfg = vscode.workspace
      .getConfiguration("callmap")
      .get<string>("theme", "auto");
    if (cfg === "dark" || cfg === "light") return cfg;
    // auto: follow VS Code's active theme kind. High-contrast variants
    // collapse onto the closest base theme.
    const kind = vscode.window.activeColorTheme.kind;
    if (
      kind === vscode.ColorThemeKind.Light ||
      kind === vscode.ColorThemeKind.HighContrastLight
    ) {
      return "light";
    }
    return "dark";
  }

  private async handleHttp(payload: {
    id: number;
    url: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    // Attach the GitHub session token to api.github.com requests so the
    // webview never sees it. For other origins (defensive — none used
    // today) we forward unchanged.
    const headers: Record<string, string> = { ...(payload.headers ?? {}) };
    if (/^https:\/\/api\.github\.com\//.test(payload.url) && !headers.Authorization) {
      const session = await vscode.authentication.getSession(
        "github",
        ["repo"],
        { createIfNone: false }
      );
      if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    }
    try {
      const res = await fetch(payload.url, { headers });
      const body = await res.text();
      // Capture rate-limit-relevant headers; the webview parses them itself.
      const headersOut: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headersOut[k] = v;
      });
      this.panel.webview.postMessage({
        type: "http:result",
        payload: {
          id: payload.id,
          ok: res.ok,
          status: res.status,
          headers: headersOut,
          body,
        },
      });
    } catch (e: unknown) {
      this.panel.webview.postMessage({
        type: "http:result",
        payload: {
          id: payload.id,
          ok: false,
          status: 0,
          headers: {},
          body: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }
}

function randomNonce(): string {
  // CSP requires inline-script execution be gated on a nonce. Use a 16
  // byte random hex string (good enough — the webview only loads once).
  const arr = new Uint8Array(16);
  // Node's crypto.getRandomValues is available since Node 19; for 18
  // we fall back to Math.random which is acceptable for a CSP nonce
  // (not a security token).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const c = require("crypto");
    if (c?.randomFillSync) c.randomFillSync(arr);
    else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  } catch {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
