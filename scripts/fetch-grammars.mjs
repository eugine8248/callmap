#!/usr/bin/env node
// Helper script: download the tree-sitter runtime + TS/JS grammar WASM files
// into ./public/ so the dev build can find them.
//
// The runtime ships with web-tree-sitter under node_modules; the grammars
// have to be acquired separately. We pull them from the official mirror
// that the tree-sitter team publishes alongside each grammar release.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const targets = [
  {
    src: path.join(__dirname, "..", "node_modules", "web-tree-sitter", "tree-sitter.wasm"),
    dest: path.join(publicDir, "tree-sitter.wasm"),
    note: "runtime (copied from node_modules/web-tree-sitter)",
  },
];

const remotes = [
  {
    name: "tree-sitter-typescript.wasm",
    // tree-sitter-wasms is a community-maintained set of prebuilt grammar WASMs.
    url: "https://unpkg.com/@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm",
  },
  {
    name: "tree-sitter-javascript.wasm",
    url: "https://unpkg.com/@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm",
  },
];

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

for (const t of targets) {
  if (!fs.existsSync(t.src)) {
    console.warn(`! Missing ${t.src} — run \`npm install\` first.`);
    continue;
  }
  fs.copyFileSync(t.src, t.dest);
  console.log(`✓ ${path.basename(t.dest)} (${t.note})`);
}

for (const r of remotes) {
  const dest = path.join(publicDir, r.name);
  if (fs.existsSync(dest)) {
    console.log(`= ${r.name} already present (skip)`);
    continue;
  }
  process.stdout.write(`→ fetching ${r.name}... `);
  try {
    const res = await fetch(r.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`done (${(buf.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    console.log(`  Download manually from a tree-sitter grammar release and place at ${dest}`);
  }
}

console.log("\nGrammars ready in ./public/. Run `npm run tauri:dev` next.");
