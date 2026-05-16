// VS Code extension entry. Owns:
//   • command registration (openPR, openCurrentRepoPR, openFromSelection, showRecent)
//   • a singleton webview panel that hosts the built React UI from
//     packages/vscode/media/
//   • status-bar item that opens the recent-PRs quick-pick
//
// The heavy lifting (PR fetch, parse, callgraph build) happens inside
// the webview using @callmap/core. The extension process only proxies
// HTTP requests through to api.github.com so we can supply the user's
// authenticated session token without ever sending it to the renderer.

import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";
import { CallgraphPanel } from "./panel";

const RECENT_KEY = "callmap.recentPrs";

interface RecentPr {
  url: string;
  title: string;
  loadedAt: number;
}

export function activate(context: vscode.ExtensionContext): void {
  // ── Status bar ──────────────────────────────────────────────────
  const statusBarEnabled = vscode.workspace
    .getConfiguration("callmap")
    .get<boolean>("statusBar.enabled", true);

  let statusBar: vscode.StatusBarItem | undefined;
  if (statusBarEnabled) {
    statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    statusBar.text = "$(git-pull-request) callmap";
    statusBar.tooltip = "Show recent PRs in callmap";
    statusBar.command = "callmap.showRecent";
    statusBar.show();
    context.subscriptions.push(statusBar);
  }

  // ── Commands ───────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("callmap.openPR", async () => {
      const url = await vscode.window.showInputBox({
        title: "callmap: open a GitHub PR",
        prompt: "Paste the PR URL",
        placeHolder: "https://github.com/owner/repo/pull/123",
        ignoreFocusOut: true,
        validateInput: (v) =>
          v && !/^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(v.trim())
            ? "Expected https://github.com/<owner>/<repo>/pull/<n>"
            : null,
      });
      if (!url) return;
      await CallgraphPanel.createOrShow(context, url.trim());
    }),

    vscode.commands.registerCommand("callmap.openCurrentRepoPR", async () => {
      const repo = await detectGithubRepo();
      if (!repo) {
        vscode.window.showWarningMessage(
          "callmap: no GitHub remote detected in the current workspace."
        );
        return;
      }
      const session = await getGithubSession(true);
      if (!session) {
        vscode.window.showWarningMessage(
          "callmap: GitHub sign-in required to list PRs."
        );
        return;
      }
      try {
        const prs = await listOpenPrs(repo.owner, repo.repo, session.accessToken);
        if (prs.length === 0) {
          vscode.window.showInformationMessage(
            `callmap: no open PRs in ${repo.owner}/${repo.repo}.`
          );
          return;
        }
        const pick = await vscode.window.showQuickPick(
          prs.map((p) => ({
            label: `#${p.number} ${p.title}`,
            description: p.url,
            url: p.url,
          })),
          { title: `Open PRs in ${repo.owner}/${repo.repo}`, ignoreFocusOut: true }
        );
        if (pick) await CallgraphPanel.createOrShow(context, pick.url);
      } catch (e: unknown) {
        vscode.window.showErrorMessage(
          `callmap: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }),

    vscode.commands.registerCommand("callmap.openFromSelection", async () => {
      // Gated on the GitHub PR extension being installed (see package.json).
      // We try to read the current PR number out of the workspace state the
      // PR extension publishes; failing that we fall back to the same input
      // box as openPR.
      const prInfo = await tryCurrentPrFromGithubExtension();
      if (prInfo) {
        await CallgraphPanel.createOrShow(context, prInfo);
        return;
      }
      await vscode.commands.executeCommand("callmap.openPR");
    }),

    vscode.commands.registerCommand("callmap.showRecent", async () => {
      const recents = context.globalState.get<RecentPr[]>(RECENT_KEY, []);
      if (recents.length === 0) {
        await vscode.commands.executeCommand("callmap.openPR");
        return;
      }
      const items = recents.map((r) => ({
        label: r.title || formatSlug(r.url),
        description: formatSlug(r.url),
        url: r.url,
      }));
      items.push({
        label: "$(add) Load a PR by URL…",
        description: "",
        url: "__new__",
      });
      const pick = await vscode.window.showQuickPick(items, {
        title: "callmap: recent PRs",
        ignoreFocusOut: true,
      });
      if (!pick) return;
      if (pick.url === "__new__") {
        await vscode.commands.executeCommand("callmap.openPR");
      } else {
        await CallgraphPanel.createOrShow(context, pick.url);
      }
    })
  );

  // React to config changes (status-bar toggle, theme follow).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("callmap.statusBar.enabled")) {
        const enabled = vscode.workspace
          .getConfiguration("callmap")
          .get<boolean>("statusBar.enabled", true);
        if (enabled && !statusBar) {
          // The user re-enabled the bar — bounce the window so we
          // recreate it cleanly. (Recreating ad-hoc would leak handles.)
          vscode.window.showInformationMessage(
            "callmap: reload the window to show the status-bar item."
          );
        } else if (!enabled && statusBar) {
          statusBar.dispose();
          statusBar = undefined;
        }
      }
      if (e.affectsConfiguration("callmap.theme")) {
        CallgraphPanel.broadcastThemeChange();
      }
    })
  );
}

export function deactivate(): void {
  /* nothing to clean up — VS Code disposes subscriptions automatically */
}

// ── Helpers ───────────────────────────────────────────────────────

async function getGithubSession(
  createIfNone: boolean
): Promise<vscode.AuthenticationSession | undefined> {
  try {
    return await vscode.authentication.getSession("github", ["repo"], {
      createIfNone,
    });
  } catch {
    return undefined;
  }
}

interface RepoInfo {
  owner: string;
  repo: string;
}

async function detectGithubRepo(): Promise<RepoInfo | null> {
  // We use `git remote -v` because parsing git config across the
  // workspace folders directly would require its own state machine.
  // git is essentially guaranteed to be on PATH for VS Code users.
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) return null;
  return new Promise<RepoInfo | null>((resolve) => {
    cp.execFile(
      "git",
      ["remote", "get-url", "origin"],
      { cwd: folder },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const url = stdout.trim();
        const m =
          url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i) ?? null;
        if (!m) {
          resolve(null);
          return;
        }
        resolve({ owner: m[1], repo: m[2] });
      }
    );
  });
}

interface OpenPr {
  number: number;
  title: string;
  url: string;
}

async function listOpenPrs(
  owner: string,
  repo: string,
  token: string
): Promise<OpenPr[]> {
  // Node-side fetch, available on Node 18+ (VS Code's extension host).
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
  }>;
  return data.map((p) => ({ number: p.number, title: p.title, url: p.html_url }));
}

async function tryCurrentPrFromGithubExtension(): Promise<string | null> {
  // The official PR extension exposes a quick-info command but it isn't a
  // stable contract — we wrap it in a try/catch so the absence of that
  // extension or a future rename doesn't bubble up to the user.
  try {
    const ext = vscode.extensions.getExtension("github.vscode-pull-request-github");
    if (!ext) return null;
    await ext.activate();
    const api = ext.exports;
    if (api?.getCurrentPullRequest) {
      const pr = await api.getCurrentPullRequest();
      if (pr?.html_url) return pr.html_url;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function formatSlug(url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? `${m[1]}/${m[2]} #${m[3]}` : url;
}

// Exported solely for the panel module to read/write the same state key.
export const RECENT_STATE_KEY = RECENT_KEY;
