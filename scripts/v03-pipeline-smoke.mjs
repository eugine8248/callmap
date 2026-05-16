#!/usr/bin/env node
// v0.3 full-pipeline smoke. Fetches a real GitHub PR, parses every
// changed source file with the actual web-tree-sitter grammars (using
// the same WASM files the browser app ships in /public/), then runs
// the cross-file resolver and reports the resulting graph stats.
//
// This is the "real" verification that the task asks for:
//   - TS regression PR (must still produce the v0.2 numbers)
//   - small Python PR
//   - small Go PR

import Parser from "web-tree-sitter";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

await Parser.init({ locateFile: (f) => path.join(publicDir, f) });

const GRAMMARS = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
};
const langCache = new Map();
async function loadLang(key) {
  if (langCache.has(key)) return langCache.get(key);
  const lang = await Parser.Language.load(path.join(publicDir, GRAMMARS[key]));
  langCache.set(key, lang);
  return lang;
}

function detectLanguage(filename) {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  if (ext === "ts" || ext === "tsx") return "ts";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "js";
  if (ext === "py" || ext === "pyi") return "py";
  if (ext === "go") return "go";
  return null;
}
function grammarFor(lang) {
  if (lang === "ts") return "typescript";
  if (lang === "js") return "javascript";
  if (lang === "py") return "python";
  if (lang === "go") return "go";
  return null;
}
function languageGroup(lang) {
  if (lang === "ts" || lang === "tsx") return "ts";
  if (lang === "js" || lang === "jsx") return "js";
  if (lang === "py") return "py";
  if (lang === "go") return "go";
  return "unknown";
}

// ── AST walkers (mirror src/lib/parser.ts) ─────────────────────────
function walkJs(node, source, out) {
  const t = node.type;
  if (t === "function_declaration" || t === "generator_function_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) out.push(makeFn(nameNode.text, nameNode.text, "function", node, source, extractCallsJs));
  } else if (t === "method_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const cls = enclosingClass(node);
      const qual = cls ? `${cls}.${nameNode.text}` : nameNode.text;
      out.push(makeFn(nameNode.text, qual, "method", node, source, extractCallsJs));
    }
  } else if (t === "variable_declarator" || t === "public_field_definition") {
    const nameNode = node.childForFieldName("name");
    const valueNode = node.childForFieldName("value");
    if (nameNode && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function_expression" || valueNode.type === "function")) {
      const isField = t === "public_field_definition";
      const cls = isField ? enclosingClass(node) : null;
      const qual = cls ? `${cls}.${nameNode.text}` : nameNode.text;
      const kind = valueNode.type === "arrow_function" ? "arrow" : "expression";
      out.push(makeFn(nameNode.text, qual, kind, valueNode, source, extractCallsJs));
    }
  }
  for (let i = 0; i < node.childCount; i++) walkJs(node.child(i), source, out);
}
function enclosingClass(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "class_declaration" || cur.type === "class") {
      const n = cur.childForFieldName("name");
      if (n) return n.text;
    }
    cur = cur.parent;
  }
  return null;
}
function extractCallsJs(node) {
  const out = [];
  const q = [node];
  while (q.length) {
    const n = q.shift();
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleeJs(fn);
      if (c) out.push(c);
    }
    for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
  }
  return out;
}
function calleeJs(n) {
  if (!n) return null;
  if (n.type === "identifier" || n.type === "property_identifier") return { name: n.text };
  if (n.type === "member_expression") {
    const obj = n.childForFieldName("object");
    const prop = n.childForFieldName("property");
    if (!prop) return null;
    const qualifier = obj && (obj.type === "identifier" || obj.type === "this_expression") ? obj.text : undefined;
    return { name: prop.text, qualifier };
  }
  if (n.childCount > 0) return calleeJs(n.child(0));
  return null;
}

function walkPython(node, source, out, cls) {
  const t = node.type;
  if (t === "class_definition") {
    const nameNode = node.childForFieldName("name");
    const className = nameNode ? nameNode.text : null;
    const body = node.childForFieldName("body");
    if (body) for (let i = 0; i < body.childCount; i++) walkPython(body.child(i), source, out, className);
    return;
  }
  if (t === "function_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const name = nameNode.text;
      const qual = cls ? `${cls}.${name}` : name;
      out.push(makeFn(name, qual, cls ? "method" : "function", node, source, extractCallsPy));
    }
    return;
  }
  for (let i = 0; i < node.childCount; i++) walkPython(node.child(i), source, out, cls);
}
function extractCallsPy(node) {
  const out = [];
  const q = [node];
  while (q.length) {
    const n = q.shift();
    if (n.type === "call") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleePy(fn);
      if (c) out.push(c);
    }
    for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
  }
  return out;
}
function calleePy(n) {
  if (!n) return null;
  if (n.type === "identifier") return { name: n.text };
  if (n.type === "attribute") {
    const obj = n.childForFieldName("object");
    const attr = n.childForFieldName("attribute");
    if (!attr) return null;
    const qualifier = obj && obj.type === "identifier" ? obj.text : undefined;
    return { name: attr.text, qualifier };
  }
  if (n.childCount > 0) return calleePy(n.child(0));
  return null;
}

function walkGo(node, source, out) {
  const t = node.type;
  if (t === "function_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) out.push(makeFn(nameNode.text, nameNode.text, "function", node, source, extractCallsGo));
  } else if (t === "method_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const recv = node.childForFieldName("receiver");
      let recvType = null;
      if (recv) {
        const q = [recv];
        while (q.length) {
          const n = q.shift();
          if (n.type === "type_identifier") { recvType = n.text; break; }
          for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
        }
      }
      const qual = recvType ? `${recvType}.${nameNode.text}` : nameNode.text;
      out.push(makeFn(nameNode.text, qual, "method", node, source, extractCallsGo));
    }
  }
  for (let i = 0; i < node.childCount; i++) walkGo(node.child(i), source, out);
}
function extractCallsGo(node) {
  const out = [];
  const q = [node];
  while (q.length) {
    const n = q.shift();
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      const c = calleeGo(fn);
      if (c) out.push(c);
    }
    for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
  }
  return out;
}
function calleeGo(n) {
  if (!n) return null;
  if (n.type === "identifier") return { name: n.text };
  if (n.type === "selector_expression") {
    const operand = n.childForFieldName("operand");
    const field = n.childForFieldName("field");
    if (!field) return null;
    const qualifier = operand && operand.type === "identifier" ? operand.text : undefined;
    return { name: field.text, qualifier };
  }
  if (n.childCount > 0) return calleeGo(n.child(0));
  return null;
}

function makeFn(name, qualifiedName, declKind, node, source, extract) {
  return {
    name,
    qualifiedName,
    declKind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    body: source.slice(node.startIndex, node.endIndex),
    calls: extract(node),
  };
}

async function extractFunctions(source, grammarKey) {
  const lang = await loadLang(grammarKey);
  const p = new Parser();
  p.setLanguage(lang);
  const tree = p.parse(source);
  const out = [];
  if (grammarKey === "python") walkPython(tree.rootNode, source, out, null);
  else if (grammarKey === "go") walkGo(tree.rootNode, source, out);
  else walkJs(tree.rootNode, source, out);
  return out;
}

// ── Diff + cross-file resolver (mirror callgraphBuilder.ts) ────────
function diffFile(file, language, baseFns, headFns) {
  const baseByQ = new Map(baseFns.map((f) => [f.qualifiedName, f]));
  const out = [];
  const seen = new Set();
  for (const head of headFns) {
    seen.add(head.qualifiedName);
    const id = `${file}::${head.qualifiedName}::${head.declKind}`;
    const base = baseByQ.get(head.qualifiedName);
    let kind = "unchanged";
    let oldBody;
    if (!base) kind = "added";
    else if (base.body.replace(/\s+/g, " ").trim() !== head.body.replace(/\s+/g, " ").trim()) {
      kind = "changed";
      oldBody = base.body;
    }
    out.push({ ...head, file, language, id, kind, oldBody });
  }
  for (const b of baseFns) {
    if (!seen.has(b.qualifiedName)) {
      const id = `${file}::${b.qualifiedName}::${b.declKind}`;
      out.push({ ...b, file, language, id, kind: "removed" });
    }
  }
  return out;
}

function resolve(call, ownerId, symByQ, symByN) {
  if (call.qualifier) {
    const m = symByQ.get(`${call.qualifier}.${call.name}`);
    if (m && m.length) {
      const ids = m.map((s) => s.id).filter((x) => x !== ownerId);
      return { targets: ids, ambiguous: ids.length > 1 };
    }
  }
  const d = symByQ.get(call.name);
  if (d && d.length === 1) {
    return { targets: d.map((s) => s.id).filter((x) => x !== ownerId), ambiguous: false };
  }
  const byN = symByN.get(call.name);
  if (!byN || byN.length === 0) return { targets: [], ambiguous: false };
  const ids = byN.map((s) => s.id).filter((x) => x !== ownerId);
  if (ids.length === 0) return { targets: [], ambiguous: false };
  if (ids.length === 1) return { targets: ids, ambiguous: false };
  return { targets: [], ambiguous: true };
}

// ── Main: orchestrate per PR ───────────────────────────────────────
async function runPr(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`bad url ${url}`);
  const [, owner, repo, num] = m;
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const pr = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}`, { headers }).then((r) => r.json());
  const filesAll = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${num}/files?per_page=100`, { headers }).then((r) => r.json());
  const files = filesAll.filter((f) => detectLanguage(f.filename));

  const allChanged = [];
  for (const f of files) {
    const lang = detectLanguage(f.filename);
    const g = grammarFor(lang);
    if (!g) continue;
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${pr.base.sha}/${f.previous_filename || f.filename}`;
    const headUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${pr.head.sha}/${f.filename}`;
    const baseSrc = f.status === "added" ? null : await fetch(baseUrl).then((r) => (r.ok ? r.text() : null));
    const headSrc = f.status === "removed" ? null : await fetch(headUrl).then((r) => (r.ok ? r.text() : null));
    const baseFns = baseSrc ? await extractFunctions(baseSrc, g) : [];
    const headFns = headSrc ? await extractFunctions(headSrc, g) : [];
    const fc = diffFile(f.filename, lang, baseFns, headFns);
    allChanged.push(...fc);
  }

  // Build symbol table (skip removed)
  const symByQ = new Map();
  const symByN = new Map();
  function add(map, k, v) { const a = map.get(k) ?? []; a.push(v); map.set(k, a); }
  for (const fn of allChanged) {
    if (fn.kind === "removed") continue;
    const e = { id: fn.id, file: fn.file };
    add(symByN, fn.name, e);
    add(symByQ, fn.qualifiedName, e);
  }

  const interesting = allChanged.filter((f) => f.kind === "added" || f.kind === "removed" || f.kind === "changed");
  const interestingIds = new Set(interesting.map((f) => f.id));
  const byId = new Map(allChanged.map((f) => [f.id, f]));
  const ctx = new Map();

  for (const fn of interesting) {
    for (const c of fn.calls) {
      const r = resolve(c, fn.id, symByQ, symByN);
      for (const tid of r.targets) {
        if (interestingIds.has(tid)) continue;
        const match = byId.get(tid);
        if (match && match.kind === "unchanged" && !ctx.has(match.id)) ctx.set(match.id, { ...match, kind: "neutral" });
      }
    }
  }
  for (const fn of allChanged) {
    if (fn.kind !== "unchanged" || ctx.has(fn.id)) continue;
    for (const c of fn.calls) {
      const r = resolve(c, fn.id, symByQ, symByN);
      if (r.targets.some((t) => interestingIds.has(t))) { ctx.set(fn.id, { ...fn, kind: "neutral" }); break; }
    }
  }
  const nodes = [...interesting, ...ctx.values()];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [];
  const externals = new Map();
  const ambigByNode = new Map();
  const seen = new Set();
  function addEdge(s, t, ext) {
    if (s === t) return;
    const k = `${s}->${t}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ source: s, target: t, external: !!ext });
  }
  for (const n of nodes) {
    for (const c of n.calls) {
      const r = resolve(c, n.id, symByQ, symByN);
      if (r.ambiguous) {
        const s = ambigByNode.get(n.id) ?? new Set();
        s.add(c.name);
        ambigByNode.set(n.id, s);
        continue;
      }
      if (r.targets.length === 0) {
        if (n.kind !== "added" && n.kind !== "removed" && n.kind !== "changed") continue;
        const tag = c.qualifier ? `${c.qualifier}.${c.name}` : c.name;
        const extId = `__external__::${tag}`;
        if (!externals.has(extId)) externals.set(extId, { id: extId, name: tag, kind: "external", language: n.language });
        addEdge(n.id, extId, true);
        continue;
      }
      for (const t of r.targets) {
        if (!nodeIds.has(t)) continue;
        addEdge(n.id, t, false);
      }
    }
  }

  const allFinal = [...nodes.map((n) => ({ ...n, disambiguated: ambigByNode.has(n.id) ? false : undefined })), ...externals.values()];

  const byLang = {};
  for (const n of allFinal) {
    if (n.kind === "external") continue;
    const lg = languageGroup(n.language);
    byLang[lg] = (byLang[lg] ?? 0) + 1;
  }

  const stats = {
    filesScanned: files.length,
    added: allFinal.filter((n) => n.kind === "added").length,
    removed: allFinal.filter((n) => n.kind === "removed").length,
    changed: allFinal.filter((n) => n.kind === "changed").length,
    contextNodes: allFinal.filter((n) => n.kind === "neutral").length,
    externalNodes: allFinal.filter((n) => n.kind === "external").length,
    ambiguousNodes: ambigByNode.size,
    totalNodes: allFinal.filter((n) => n.kind !== "external").length,
    nonExternalEdges: edges.filter((e) => !e.external).length,
    totalEdges: edges.length,
    byLanguage: byLang,
  };

  return { title: pr.title, url, stats };
}

const URLS = process.argv.slice(2);
if (URLS.length === 0) {
  console.error("Usage: node v03-pipeline-smoke.mjs <PR_URL> [...]");
  process.exit(2);
}

for (const u of URLS) {
  console.log(`\n=== ${u} ===`);
  try {
    const r = await runPr(u);
    console.log(`Title: ${r.title}`);
    console.log(JSON.stringify(r.stats, null, 2));
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
}
