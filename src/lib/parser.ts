// Tree-sitter wrapper. Loads the runtime + TS/JS grammars from /public/
// lazily on first use. Returns a Parser per language.
//
// Notes for v0.1:
// - The grammar WASM files are expected at /tree-sitter-typescript.wasm
//   and /tree-sitter-javascript.wasm. The README/build instructions
//   describe how to acquire them (see scripts/fetch-grammars.mjs).
// - If the grammars are missing, parse() returns null and the caller
//   falls back to a regex-based extraction (still useful for a demo).

import Parser from "web-tree-sitter";

type Language = Parser.Language;
type Lang = "typescript" | "javascript";

let initPromise: Promise<void> | null = null;
const langCache = new Map<Lang, Language | null>();

async function ensureRuntime(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = Parser.init({
    locateFile: (file: string) => `/${file}`,
  });
  return initPromise;
}

async function loadLanguage(lang: Lang): Promise<Language | null> {
  const cached = langCache.get(lang);
  if (cached !== undefined) return cached;
  await ensureRuntime();
  const wasmPath =
    lang === "typescript"
      ? "/tree-sitter-typescript.wasm"
      : "/tree-sitter-javascript.wasm";
  try {
    const language = await Parser.Language.load(wasmPath);
    langCache.set(lang, language);
    return language;
  } catch (err) {
    console.warn(`[parser] failed to load ${lang} grammar:`, err);
    langCache.set(lang, null);
    return null;
  }
}

export async function getParser(lang: Lang): Promise<Parser | null> {
  const language = await loadLanguage(lang);
  if (!language) return null;
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

export interface RawFn {
  name: string;
  startLine: number;
  endLine: number;
  body: string;
  declKind: "function" | "arrow" | "method" | "expression";
  calls: string[];
}

// Public API: parse a source string and return all top-level + nested functions.
// Falls back to a regex skim if tree-sitter isn't available.
export async function extractFunctions(
  source: string,
  lang: Lang
): Promise<RawFn[]> {
  const parser = await getParser(lang);
  if (!parser) return regexExtract(source);
  const tree = parser.parse(source);
  if (!tree) return regexExtract(source);
  const fns: RawFn[] = [];
  walk(tree.rootNode, source, fns);
  return fns;
}

// AST walk. We recognize:
//   function_declaration                              -> function foo() {}
//   method_definition                                 -> class X { foo() {} }
//   variable_declarator with arrow_function/function  -> const foo = () => {}
//   public_field_definition with arrow                -> class X { foo = () => {} }
//   export_statement wrapping any of the above        -> handled by recursion
function walk(node: any, source: string, out: RawFn[]): void {
  const t = node.type as string;

  if (t === "function_declaration" || t === "generator_function_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) out.push(makeFn(nameNode.text, "function", node, source));
  } else if (t === "method_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) out.push(makeFn(nameNode.text, "method", node, source));
  } else if (t === "variable_declarator" || t === "public_field_definition") {
    const nameNode = node.childForFieldName("name");
    const valueNode = node.childForFieldName("value");
    if (
      nameNode &&
      valueNode &&
      (valueNode.type === "arrow_function" ||
        valueNode.type === "function_expression" ||
        valueNode.type === "function")
    ) {
      const kind: RawFn["declKind"] =
        valueNode.type === "arrow_function" ? "arrow" : "expression";
      out.push(makeFn(nameNode.text, kind, valueNode, source));
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walk(node.child(i), source, out);
  }
}

function makeFn(
  name: string,
  declKind: RawFn["declKind"],
  bodyNode: any,
  source: string
): RawFn {
  const start = bodyNode.startPosition.row + 1;
  const end = bodyNode.endPosition.row + 1;
  const body = source.slice(bodyNode.startIndex, bodyNode.endIndex);
  const calls = extractCalls(bodyNode);
  return { name, declKind, startLine: start, endLine: end, body, calls };
}

// Best-effort call extraction: walk descendants, collect the callee identifier
// from any call_expression. Handles `foo()`, `obj.foo()`, `foo?.()`.
function extractCalls(node: any): string[] {
  const calls: string[] = [];
  const queue: any[] = [node];
  while (queue.length) {
    const n = queue.shift();
    if (!n) continue;
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function") ?? n.child(0);
      if (fn) {
        const name = calleeName(fn);
        if (name) calls.push(name);
      }
    }
    for (let i = 0; i < n.childCount; i++) queue.push(n.child(i));
  }
  return calls;
}

function calleeName(n: any): string | null {
  if (!n) return null;
  if (n.type === "identifier" || n.type === "property_identifier") return n.text;
  if (n.type === "member_expression") {
    const prop = n.childForFieldName("property");
    return prop ? prop.text : null;
  }
  // Optional chain: foo?.() — descend into the expression child
  if (n.childCount > 0) return calleeName(n.child(0));
  return null;
}

// -- Regex fallback (used when grammars are missing) --
// Catches the most common patterns: function decls, arrow assigns, methods.
function regexExtract(source: string): RawFn[] {
  const fns: RawFn[] = [];
  const lines = source.split("\n");
  const reFn =
    /(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const reArrow =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  const seen = new Set<string>();
  for (const re of [reFn, reArrow]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const idx = m.index;
      const startLine = source.slice(0, idx).split("\n").length;
      // crude body extraction: 30 lines after the match
      const endLine = Math.min(lines.length, startLine + 30);
      const body = lines.slice(startLine - 1, endLine).join("\n");
      // crude call detection
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      const calls: string[] = [];
      let c: RegExpExecArray | null;
      while ((c = callRe.exec(body)) !== null) {
        if (c[1] !== name && c[1] !== "function" && c[1] !== "if" && c[1] !== "for" && c[1] !== "while" && c[1] !== "switch" && c[1] !== "return") {
          calls.push(c[1]);
        }
      }
      fns.push({
        name,
        declKind: re === reFn ? "function" : "arrow",
        startLine,
        endLine,
        body,
        calls,
      });
    }
  }
  return fns;
}
