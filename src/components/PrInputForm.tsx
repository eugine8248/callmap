import { useState } from "react";
import { parsePrUrl } from "../lib/github";

interface Props {
  onSubmit: (url: string) => void;
  busy: boolean;
}

export default function PrInputForm({ onSubmit, busy }: Props) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parts = parsePrUrl(url);
    if (!parts) {
      setErr("Expected a URL like https://github.com/<owner>/<repo>/pull/<n>");
      return;
    }
    setErr(null);
    onSubmit(url.trim());
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Paste a GitHub PR URL
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          autoFocus
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || url.trim().length === 0}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {busy ? "Loading…" : "Map it"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
    </form>
  );
}
