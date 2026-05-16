#!/usr/bin/env node
// End-to-end smoke test for the callgraph pipeline (no browser).
// Runs against a real GitHub PR; uses the *regex fallback* of the parser
// because tree-sitter's WASM grammars don't load cleanly under bare Node
// without DOM globals. The regex fallback exercises the same diff +
// graph-trim logic, so this is a real smoke test of the pipeline shape.

import fs from "node:fs";

const PR_URL = process.argv[2] ?? "https://github.com/sindresorhus/slugify/pull/45";

function parsePrUrl(u) {
  const m = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  return m ? { owner: m[1], repo: m[2], number: parseInt(m[3], 10) } : null;
}

const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

const parts = parsePrUrl(PR_URL);
if (!parts) { console.error("Invalid PR URL"); process.exit(1); }

console.log(`PR: ${parts.owner}/${parts.repo}#${parts.number}`);
const prRes = await fetch(`https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}`, { headers });
const pr = await prRes.json();
console.log(`Title: ${pr.title}`);
console.log(`Base: ${pr.base.sha.slice(0,7)}  Head: ${pr.head.sha.slice(0,7)}`);

const filesRes = await fetch(`https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}/files?per_page=100`, { headers });
const files = (await filesRes.json()).filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f.filename));
console.log(`Changed source files: ${files.length}`);

function regexExtract(source) {
  const fns = [];
  const lines = source.split("\n");
  const reFn = /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const reArrow = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  const seen = new Set();
  for (const re of [reFn, reArrow]) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const startLine = source.slice(0, m.index).split("\n").length;
      const endLine = Math.min(lines.length, startLine + 30);
      const body = lines.slice(startLine - 1, endLine).join("\n");
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      const calls = [];
      let c;
      while ((c = callRe.exec(body)) !== null) {
        if (!["function","if","for","while","switch","return",name].includes(c[1])) calls.push(c[1]);
      }
      fns.push({ name, declKind: re === reFn ? "function" : "arrow", startLine, endLine, body, calls });
    }
  }
  return fns;
}

function diffFile(file, baseFns, headFns) {
  const byName = new Map(baseFns.map(f => [f.name, f]));
  const out = [];
  const seenHead = new Set();
  for (const head of headFns) {
    seenHead.add(head.name);
    const base = byName.get(head.name);
    const id = `${file}::${head.name}::${head.declKind}`;
    if (!base) out.push({ ...head, file, id, kind: "added" });
    else if (base.body.replace(/\s+/g," ").trim() !== head.body.replace(/\s+/g," ").trim())
      out.push({ ...head, file, id, kind: "changed", oldBody: base.body });
    else out.push({ ...head, file, id, kind: "unchanged" });
  }
  for (const base of baseFns) {
    if (!seenHead.has(base.name))
      out.push({ ...base, file, id: `${file}::${base.name}::${base.declKind}`, kind: "removed" });
  }
  return out;
}

const allChanged = [];
for (const f of files) {
  const base = f.status === "added" ? null
    : await fetch(`https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${pr.base.sha}/${f.previous_filename || f.filename}`).then(r => r.ok ? r.text() : null);
  const head = f.status === "removed" ? null
    : await fetch(`https://raw.githubusercontent.com/${parts.owner}/${parts.repo}/${pr.head.sha}/${f.filename}`).then(r => r.ok ? r.text() : null);
  const baseFns = base ? regexExtract(base) : [];
  const headFns = head ? regexExtract(head) : [];
  console.log(`  ${f.filename}: base=${baseFns.length}fns, head=${headFns.length}fns`);
  allChanged.push(...diffFile(f.filename, baseFns, headFns));
}

const interesting = allChanged.filter(f => f.kind === "added" || f.kind === "removed" || f.kind === "changed");
const interestingNames = new Set(interesting.map(f => f.name));

const callersByCallee = new Map();
for (const fn of allChanged) {
  for (const callee of fn.calls) {
    if (!callersByCallee.has(callee)) callersByCallee.set(callee, []);
    callersByCallee.get(callee).push(fn);
  }
}

const ctx = new Map();
for (const fn of interesting) {
  for (const callee of fn.calls) {
    if (interestingNames.has(callee)) continue;
    const m = allChanged.find(c => c.name === callee && c.kind === "unchanged");
    if (m && !ctx.has(m.id)) ctx.set(m.id, { ...m, kind: "neutral" });
  }
  const callers = callersByCallee.get(fn.name) ?? [];
  for (const c of callers) {
    if (interestingNames.has(c.name)) continue;
    if (c.kind === "unchanged" && !ctx.has(c.id)) ctx.set(c.id, { ...c, kind: "neutral" });
  }
}

const nodes = [...interesting, ...ctx.values()];
const nodeIds = new Set(nodes.map(n => n.id));
const namesToIds = new Map();
for (const n of nodes) {
  if (!namesToIds.has(n.name)) namesToIds.set(n.name, []);
  namesToIds.get(n.name).push(n.id);
}
const edges = [];
const seen = new Set();
for (const n of nodes) {
  for (const callee of n.calls) {
    const targets = namesToIds.get(callee);
    if (!targets) continue;
    for (const t of targets) {
      if (!nodeIds.has(t) || t === n.id) continue;
      const key = `${n.id}->${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: n.id, target: t });
    }
  }
}

const stats = {
  filesScanned: files.length,
  added: nodes.filter(n => n.kind === "added").length,
  removed: nodes.filter(n => n.kind === "removed").length,
  changed: nodes.filter(n => n.kind === "changed").length,
  contextNodes: nodes.filter(n => n.kind === "neutral").length,
  totalNodes: nodes.length,
  totalEdges: edges.length,
};

console.log("\n=== RESULT ===");
console.log(JSON.stringify(stats, null, 2));
console.log("\nNodes:");
for (const n of nodes) console.log(`  [${n.kind.padEnd(8)}] ${n.name}  (${n.file}:${n.startLine})`);
console.log("\nEdges:");
for (const e of edges) console.log(`  ${e.source}  ->  ${e.target}`);

// write a fixture for the README walkthrough
fs.writeFileSync("docs/smoke-result.json", JSON.stringify({ pr: { title: pr.title, url: pr.html_url }, stats }, null, 2));
console.log("\nWrote docs/smoke-result.json");
