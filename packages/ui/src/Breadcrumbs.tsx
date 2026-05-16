// Thin 28px breadcrumb header above the editor area. Segments are
// clickable; non-active segments open the corresponding GitHub URL
// in the user's default browser. v0.4: openExternal is now a prop so
// the host (Tauri / VS Code) supplies the right implementation.

import Codicon from "./Codicon";
import type { PullRequestMeta } from "@callmap/core";

interface Props {
  pr: PullRequestMeta | null;
  activeFile: string | null;
  openExternal: (url: string) => void;
}

export default function Breadcrumbs({ pr, activeFile, openExternal }: Props) {
  if (!pr) {
    return (
      <div className="flex h-7 shrink-0 items-center border-b border-ide-border bg-editor px-3 text-[12px] text-text-secondary">
        Welcome — paste a PR URL to begin
      </div>
    );
  }
  const ownerUrl = `https://github.com/${pr.owner}`;
  const repoUrl = `https://github.com/${pr.owner}/${pr.repo}`;
  const pullsUrl = `https://github.com/${pr.owner}/${pr.repo}/pulls`;
  const prUrl = pr.url;
  const fileUrl = activeFile
    ? `https://github.com/${pr.owner}/${pr.repo}/blob/${pr.headSha}/${activeFile}`
    : null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 overflow-hidden border-b border-ide-border bg-editor px-3 text-[12px]">
      <Crumb label={pr.owner} url={ownerUrl} openExternal={openExternal} />
      <Sep />
      <Crumb label={pr.repo} url={repoUrl} openExternal={openExternal} />
      <Sep />
      <Crumb label="pull" url={pullsUrl} muted openExternal={openExternal} />
      <Sep />
      <Crumb label={`#${pr.number}`} url={prUrl} openExternal={openExternal} />
      {activeFile && (
        <>
          <Sep />
          <Crumb
            label={activeFile}
            url={fileUrl ?? prUrl}
            mono
            className="truncate"
            openExternal={openExternal}
          />
        </>
      )}
    </div>
  );
}

function Sep() {
  return (
    <span className="text-text-disabled">
      <Codicon name="chevron-right" size={12} />
    </span>
  );
}

function Crumb({
  label,
  url,
  mono,
  muted,
  className,
  openExternal,
}: {
  label: string;
  url: string;
  mono?: boolean;
  muted?: boolean;
  className?: string;
  openExternal: (url: string) => void;
}) {
  return (
    <button
      onClick={() => openExternal(url)}
      className={[
        "truncate hover:text-text-primary hover:underline",
        muted ? "text-text-disabled" : "text-text-secondary",
        mono ? "font-mono" : "",
        className ?? "",
      ].join(" ")}
      title={url}
    >
      {label}
    </button>
  );
}
