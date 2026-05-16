import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildCallGraphFromPrUrl, type BuildProgress } from "../lib/callgraphBuilder";
import { GithubError, getLastRateLimit } from "../lib/github";
import { addRecentPr } from "../lib/settings";
import CallGraphView from "../components/CallGraphView";
import SourcePanel from "../components/SourcePanel";
import LegendBar from "../components/LegendBar";
import EmptyState from "../components/EmptyState";
import type { CallGraphResult, ChangedFunction } from "../types";

export default function GraphPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = params.get("url") ?? "";

  const [graph, setGraph] = useState<CallGraphResult | null>(null);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitedModal, setRateLimitedModal] = useState(false);
  const [selected, setSelected] = useState<ChangedFunction | null>(null);

  useEffect(() => {
    if (!url) {
      navigate("/");
      return;
    }
    let cancelled = false;
    setError(null);
    setGraph(null);
    setProgress({ phase: "meta", message: "Starting…" });
    buildCallGraphFromPrUrl(url, (p) => {
      if (!cancelled) setProgress(p);
    })
      .then((g) => {
        if (cancelled) return;
        setGraph(g);
        setProgress(null);
        addRecentPr({ url, title: g.pr.title, loadedAt: Date.now() });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof GithubError && e.isRateLimit) {
          setRateLimitedModal(true);
        }
        setError(e instanceof Error ? e.message : String(e));
        setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, navigate]);

  const rl = getLastRateLimit();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            ← Back
          </button>
          <div className="rounded bg-sky-500 px-2 py-0.5 font-mono text-xs font-bold text-white">
            callmap
          </div>
          {graph && (
            <div className="truncate text-xs text-slate-300">
              <span className="text-slate-500">PR:</span> {graph.pr.owner}/{graph.pr.repo}#{graph.pr.number}{" "}
              <span className="text-slate-100">{graph.pr.title}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {graph && (
            <div>
              {graph.stats.filesScanned} files · {graph.functions.length} nodes ·{" "}
              {graph.edges.length} edges
            </div>
          )}
          {rl && (
            <div title={`Resets at ${new Date(rl.resetAt * 1000).toLocaleTimeString()}`}>
              API: {rl.remaining}/{rl.limit}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {progress && <ProgressOverlay p={progress} />}
          {error && !rateLimitedModal && (
            <EmptyState title="Couldn't load this PR" hint={error} />
          )}
          {graph && graph.functions.length === 0 && !progress && !error && (
            <EmptyState
              title="No JavaScript or TypeScript changes found"
              hint="callmap only parses .ts/.tsx/.js/.jsx files in v0.1. Other languages are on the v0.2 roadmap."
            />
          )}
          {graph && graph.functions.length > 0 && (
            <>
              <CallGraphView
                graph={graph}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
              <div className="pointer-events-none absolute bottom-3 left-3">
                <LegendBar stats={graph.stats} />
              </div>
            </>
          )}
        </div>
        {selected && <SourcePanel fn={selected} onClose={() => setSelected(null)} />}
      </div>

      {rateLimitedModal && (
        <RateLimitModal onClose={() => setRateLimitedModal(false)} onSettings={() => {
          setRateLimitedModal(false);
          navigate("/");
        }} />
      )}
    </div>
  );
}

function ProgressOverlay({ p }: { p: BuildProgress }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-sm text-slate-300">
      <div className="font-mono">{p.message}</div>
      {p.total && (
        <div className="text-xs text-slate-500">
          {p.current}/{p.total}
        </div>
      )}
    </div>
  );
}

function RateLimitModal({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
      <div className="w-[420px] rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-100">GitHub rate limit hit</h2>
        <p className="mt-2 text-sm text-slate-300">
          You've used up the 60-request hourly quota for unauthenticated GitHub API calls.
          Paste a Personal Access Token in <span className="font-semibold">Settings</span>{" "}
          to lift the limit to 5000 / hour.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Dismiss
          </button>
          <button
            onClick={onSettings}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
