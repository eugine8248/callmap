// Orchestrates the full PR -> callgraph pipeline:
//   1. fetch PR meta + changed files
//   2. for each .ts/.tsx/.js/.jsx file, fetch base+head content
//   3. parse both sides with tree-sitter
//   4. diff the function sets per file
//   5. trim the result to the "delta neighborhood":
//        the changed/added/removed functions + their direct callers/callees
//
// Output: a CallGraphResult ready to feed into xyflow + dagre.

import {
  fetchChangedFiles,
  fetchFileAtSha,
  fetchPrMeta,
  isSupportedSource,
  parsePrUrl,
  pickLanguage,
} from "./github";
import { extractFunctions } from "./parser";
import { diffFile } from "./diffAnalyzer";
import type { CallGraphResult, ChangedFunction, ChangeKind } from "../types";

export interface BuildProgress {
  phase: "meta" | "files" | "parse" | "graph" | "done";
  message: string;
  current?: number;
  total?: number;
}

export type ProgressCb = (p: BuildProgress) => void;

export async function buildCallGraphFromPrUrl(
  url: string,
  onProgress?: ProgressCb
): Promise<CallGraphResult> {
  const parts = parsePrUrl(url);
  if (!parts) throw new Error("Invalid GitHub PR URL. Expected https://github.com/<owner>/<repo>/pull/<n>");

  onProgress?.({ phase: "meta", message: "Fetching PR metadata..." });
  const pr = await fetchPrMeta(parts);

  onProgress?.({ phase: "files", message: "Listing changed files..." });
  const files = (await fetchChangedFiles(parts)).filter((f) =>
    isSupportedSource(f.filename)
  );

  if (files.length === 0) {
    return {
      pr,
      functions: [],
      edges: [],
      stats: { filesScanned: 0, added: 0, removed: 0, changed: 0, contextNodes: 0 },
    };
  }

  // Step 2 + 3 + 4: fetch + parse + diff per file
  const allChanged: ChangedFunction[] = [];
  let i = 0;
  for (const f of files) {
    i++;
    onProgress?.({
      phase: "parse",
      message: `Parsing ${f.filename}`,
      current: i,
      total: files.length,
    });

    const lang = pickLanguage(f.filename);
    const [baseSrc, headSrc] = await Promise.all([
      f.status === "added"
        ? Promise.resolve<string | null>(null)
        : fetchFileAtSha(parts.owner, parts.repo, pr.baseSha, f.previous_filename || f.filename),
      f.status === "removed"
        ? Promise.resolve<string | null>(null)
        : fetchFileAtSha(parts.owner, parts.repo, pr.headSha, f.filename),
    ]);

    const baseFns = baseSrc ? await extractFunctions(baseSrc, lang) : [];
    const headFns = headSrc ? await extractFunctions(headSrc, lang) : [];

    const fileChanges = diffFile({ file: f.filename, baseFns, headFns });
    allChanged.push(...fileChanges);
  }

  onProgress?.({ phase: "graph", message: "Building graph..." });

  // Step 5: pick the "interesting" set (added/removed/changed)
  // and pull in their direct callers + callees from the 'unchanged' pool.
  const interesting = allChanged.filter((fn) =>
    fn.kind === "added" || fn.kind === "removed" || fn.kind === "changed"
  );
  const interestingNames = new Set(interesting.map((f) => f.name));

  // Build a callee->callers map across all parsed functions
  const callersByCallee = new Map<string, ChangedFunction[]>();
  for (const fn of allChanged) {
    for (const callee of fn.calls) {
      const list = callersByCallee.get(callee) ?? [];
      list.push(fn);
      callersByCallee.set(callee, list);
    }
  }

  const contextSet = new Map<string, ChangedFunction>();

  // direct callees of interesting functions
  for (const fn of interesting) {
    for (const callee of fn.calls) {
      if (interestingNames.has(callee)) continue;
      const match = allChanged.find((c) => c.name === callee && c.kind === "unchanged");
      if (match && !contextSet.has(match.id)) {
        contextSet.set(match.id, { ...match, kind: "neutral" });
      }
    }
  }

  // direct callers of interesting functions
  for (const fn of interesting) {
    const callers = callersByCallee.get(fn.name) ?? [];
    for (const caller of callers) {
      if (interestingNames.has(caller.name)) continue;
      if (caller.kind === "unchanged" && !contextSet.has(caller.id)) {
        contextSet.set(caller.id, { ...caller, kind: "neutral" });
      }
    }
  }

  const nodes: ChangedFunction[] = [...interesting, ...contextSet.values()];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const namesToIds = new Map<string, string[]>();
  for (const n of nodes) {
    const arr = namesToIds.get(n.name) ?? [];
    arr.push(n.id);
    namesToIds.set(n.name, arr);
  }

  const edges: Array<{ source: string; target: string }> = [];
  const seenEdges = new Set<string>();
  for (const n of nodes) {
    for (const callee of n.calls) {
      const targets = namesToIds.get(callee);
      if (!targets) continue;
      for (const t of targets) {
        if (!nodeIds.has(t)) continue;
        if (t === n.id) continue; // skip self-recursive for clarity
        const key = `${n.id}->${t}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        edges.push({ source: n.id, target: t });
      }
    }
  }

  const stats = {
    filesScanned: files.length,
    added: nodes.filter((n) => n.kind === "added").length,
    removed: nodes.filter((n) => n.kind === "removed").length,
    changed: nodes.filter((n) => n.kind === "changed").length,
    contextNodes: nodes.filter((n) => (n.kind as ChangeKind) === "neutral").length,
  };

  onProgress?.({ phase: "done", message: "Done." });

  return { pr, functions: nodes, edges, stats };
}
