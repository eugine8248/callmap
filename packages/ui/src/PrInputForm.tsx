import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { parsePrUrl } from "@callmap/core";

interface Props {
  onSubmit: (url: string) => void;
  busy: boolean;
}

export interface PrInputFormHandle {
  focus: () => void;
}

const PrInputForm = forwardRef<PrInputFormHandle, Props>(function PrInputForm(
  { onSubmit, busy }: Props,
  ref
) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

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
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        Paste a GitHub PR URL
      </label>
      <div className="mt-2 flex gap-2">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          autoFocus
          className="flex-1 rounded-sm border border-ide-border bg-ide-input px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-disabled focus:border-ide-border-focus focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || url.trim().length === 0}
          className="rounded-sm bg-accent px-4 py-2 text-[13px] font-semibold text-text-on-status hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Loading…" : "Map it"}
        </button>
      </div>
      {err && <div className="mt-2 text-[12px] text-diff-removed">{err}</div>}
    </form>
  );
});

export default PrInputForm;
