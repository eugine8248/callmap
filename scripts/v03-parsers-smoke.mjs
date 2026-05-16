#!/usr/bin/env node
// v0.3 parser smoke. Runs web-tree-sitter in Node against the WASM
// grammars in /public/ to verify that the new Python and Go parsers
// extract functions + calls correctly. We don't run the full pipeline
// (that needs GitHub fetches + the React shell) — this just confirms
// the AST walkers produce the shapes callgraphBuilder expects.

import Parser from "web-tree-sitter";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

// Locate the runtime + grammar WASMs from the local filesystem.
await Parser.init({
  locateFile: (file) => path.join(publicDir, file),
});

async function load(name) {
  return await Parser.Language.load(path.join(publicDir, name));
}

const Python = await load("tree-sitter-python.wasm");
const Go = await load("tree-sitter-go.wasm");

// ── Python case ───────────────────────────────────────────────────
const pySrc = `
def top_level():
    helper()
    pkg.compute(1, 2)

class MyClass:
    def foo(self):
        bar()
        self.baz()

class Other:
    def foo(self):
        pass
`;

const pyParser = new Parser();
pyParser.setLanguage(Python);
const pyTree = pyParser.parse(pySrc);

function walkPython(node, out, cls) {
  const t = node.type;
  if (t === "class_definition") {
    const nameNode = node.childForFieldName("name");
    const className = nameNode ? nameNode.text : null;
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) walkPython(body.child(i), out, className);
    }
    return;
  }
  if (t === "function_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const name = nameNode.text;
      const qual = cls ? `${cls}.${name}` : name;
      const calls = [];
      const q = [node];
      while (q.length) {
        const n = q.shift();
        if (n.type === "call") {
          const fn = n.childForFieldName("function") ?? n.child(0);
          if (fn?.type === "identifier") calls.push({ name: fn.text });
          else if (fn?.type === "attribute") {
            const obj = fn.childForFieldName("object");
            const attr = fn.childForFieldName("attribute");
            if (attr) {
              calls.push({
                name: attr.text,
                qualifier: obj?.type === "identifier" ? obj.text : undefined,
              });
            }
          }
        }
        for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
      }
      out.push({ name, qualifiedName: qual, calls });
    }
    return;
  }
  for (let i = 0; i < node.childCount; i++) walkPython(node.child(i), out, cls);
}

const pyFns = [];
walkPython(pyTree.rootNode, pyFns, null);
console.log("── Python ──");
console.log(JSON.stringify(pyFns, null, 2));

// Verify the expected shape
const pyNames = pyFns.map((f) => f.qualifiedName).sort();
const wantPy = ["MyClass.foo", "Other.foo", "top_level"];
const pyOK =
  JSON.stringify(pyNames) === JSON.stringify(wantPy) &&
  pyFns.find((f) => f.qualifiedName === "top_level").calls.some((c) => c.name === "helper") &&
  pyFns.find((f) => f.qualifiedName === "MyClass.foo").calls.some((c) => c.name === "bar");
console.log(pyOK ? "PASS python extraction" : "FAIL python extraction");

// ── Go case ───────────────────────────────────────────────────────
const goSrc = `
package main

import "fmt"

func Hello() {
    fmt.Println("hi")
    helper()
}

type Receiver struct{}

func (r *Receiver) Method() {
    Hello()
}

func (r Receiver) Other() {
    r.Method()
}
`;

const goParser = new Parser();
goParser.setLanguage(Go);
const goTree = goParser.parse(goSrc);

function walkGo(node, out) {
  const t = node.type;
  if (t === "function_declaration" || t === "method_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      let recvType = null;
      if (t === "method_declaration") {
        const recv = node.childForFieldName("receiver");
        if (recv) {
          const q = [recv];
          while (q.length) {
            const n = q.shift();
            if (n.type === "type_identifier") { recvType = n.text; break; }
            for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
          }
        }
      }
      const name = nameNode.text;
      const qual = recvType ? `${recvType}.${name}` : name;
      const calls = [];
      const q = [node];
      while (q.length) {
        const n = q.shift();
        if (n.type === "call_expression") {
          const fn = n.childForFieldName("function") ?? n.child(0);
          if (fn?.type === "identifier") calls.push({ name: fn.text });
          else if (fn?.type === "selector_expression") {
            const operand = fn.childForFieldName("operand");
            const field = fn.childForFieldName("field");
            if (field) {
              calls.push({
                name: field.text,
                qualifier: operand?.type === "identifier" ? operand.text : undefined,
              });
            }
          }
        }
        for (let i = 0; i < n.childCount; i++) q.push(n.child(i));
      }
      out.push({ name, qualifiedName: qual, calls });
    }
  }
  for (let i = 0; i < node.childCount; i++) walkGo(node.child(i), out);
}

const goFns = [];
walkGo(goTree.rootNode, goFns);
console.log("\n── Go ──");
console.log(JSON.stringify(goFns, null, 2));

const goNames = goFns.map((f) => f.qualifiedName).sort();
const wantGo = ["Hello", "Receiver.Method", "Receiver.Other"];
const goOK =
  JSON.stringify(goNames) === JSON.stringify(wantGo) &&
  goFns.find((f) => f.qualifiedName === "Hello").calls.some((c) => c.name === "Println" && c.qualifier === "fmt") &&
  goFns.find((f) => f.qualifiedName === "Receiver.Method").calls.some((c) => c.name === "Hello");
console.log(goOK ? "PASS go extraction" : "FAIL go extraction");

if (!pyOK || !goOK) process.exit(1);
console.log("\nAll parser smoke tests passed");
