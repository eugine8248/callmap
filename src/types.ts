// Shared types for the callmap pipeline.

export type ChangeKind = "added" | "removed" | "changed" | "unchanged" | "neutral";

export interface ParsedFunction {
  id: string;            // stable hash: file + name + kind
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  body: string;
  declKind: "function" | "arrow" | "method" | "expression";
  calls: string[];       // identifier names of calls inside the body
}

export interface ChangedFunction extends ParsedFunction {
  kind: ChangeKind;
  oldBody?: string;      // present for 'changed' (the base version) so we can diff in the source panel
}

export interface PullRequestMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  baseSha: string;
  headSha: string;
  url: string;
}

export interface ChangedFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | string;
  previous_filename?: string;
}

export interface CallGraphResult {
  pr: PullRequestMeta;
  functions: ChangedFunction[];
  edges: Array<{ source: string; target: string }>;
  stats: {
    filesScanned: number;
    added: number;
    removed: number;
    changed: number;
    contextNodes: number;
  };
}

export interface RecentPr {
  url: string;
  title: string;
  loadedAt: number;
}
