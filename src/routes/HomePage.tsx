import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PrInputForm from "../components/PrInputForm";
import { addRecentPr, getRecentPrs, getToken, setToken } from "../lib/settings";
import type { RecentPr } from "../types";

export default function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentPr[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setRecent(getRecentPrs());
  }, []);

  function handleSubmit(url: string) {
    // Save to recent as a placeholder; GraphPage will update with the real title.
    addRecentPr({ url, title: url, loadedAt: Date.now() });
    navigate(`/graph?url=${encodeURIComponent(url)}`);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded bg-sky-500 px-2 py-0.5 font-mono text-sm font-bold text-white">
            callmap
          </div>
          <div className="text-xs text-slate-500">v0.1 — PR-delta callgraph viewer</div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-center text-2xl font-semibold text-slate-100">
            See what a pull request actually changes.
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            callmap renders a focused callgraph of just the functions touched by a PR —
            and their direct callers and callees.
          </p>

          <div className="mt-8">
            <PrInputForm onSubmit={handleSubmit} busy={false} />
          </div>

          {recent.length > 0 && (
            <div className="mt-10">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Recent
              </div>
              <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                {recent.map((r) => (
                  <li
                    key={r.url}
                    className="cursor-pointer px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
                    onClick={() => handleSubmit(r.url)}
                  >
                    <div className="truncate font-mono text-xs text-slate-400">{r.url}</div>
                    {r.title !== r.url && (
                      <div className="truncate text-sm text-slate-200">{r.title}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [token, setLocalToken] = useState(getToken() ?? "");

  function save() {
    setToken(token);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60">
      <div className="w-[460px] rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-100">Settings</h2>
        <p className="mt-1 text-xs text-slate-400">
          A GitHub Personal Access Token raises your API limit from 60 to 5000
          requests per hour. Only the <code className="font-mono">public_repo</code> scope
          is needed for public PRs.
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          GitHub PAT (optional)
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setLocalToken(e.target.value)}
          placeholder="ghp_…"
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
