#!/usr/bin/env node
// v0.3 cross-file resolver smoke. Runs in pure Node (no tree-sitter,
// no DOM). Re-implements the resolution algorithm from
// callgraphBuilder.ts against synthesized parsed-function fixtures so
// we can verify:
//   - cross-file resolution succeeds (a.ts:foo -> b.ts:foo)
//   - ambiguous calls (two foo()s in the changed set) stay unresolved
//     with a disambiguated:false flag
//   - external calls (no match in the symbol table) become dimmed
//     placeholder nodes with an "external" badge

const FIXTURES = [
  // ── Case 1: cross-file resolution ───────────────────────────────
  {
    label: "Case 1 — cross-file resolves",
    files: {
      "a.ts": [
        { name: "caller", qualifiedName: "caller", file: "a.ts", language: "ts",
          declKind: "function", kind: "added",
          calls: [{ name: "foo" }] },
      ],
      "b.ts": [
        { name: "foo", qualifiedName: "foo", file: "b.ts", language: "ts",
          declKind: "function", kind: "unchanged", calls: [] },
      ],
    },
    expect: { resolves: ["caller -> foo"], ambiguous: [], external: [] },
  },
  // ── Case 2: ambiguous (two `foo`s in different files) ──────────
  {
    label: "Case 2 — same name in two files = ambiguous",
    files: {
      "a.ts": [
        { name: "caller", qualifiedName: "caller", file: "a.ts", language: "ts",
          declKind: "function", kind: "added", calls: [{ name: "foo" }] },
      ],
      "b.ts": [
        { name: "foo", qualifiedName: "foo", file: "b.ts", language: "ts",
          declKind: "function", kind: "changed", calls: [] },
      ],
      "c.ts": [
        { name: "foo", qualifiedName: "foo", file: "c.ts", language: "ts",
          declKind: "function", kind: "changed", calls: [] },
      ],
    },
    expect: { resolves: [], ambiguous: ["caller : foo"], external: [] },
  },
  // ── Case 3: external call ──────────────────────────────────────
  {
    label: "Case 3 — call to unknown function -> external node",
    files: {
      "a.ts": [
        { name: "caller", qualifiedName: "caller", file: "a.ts", language: "ts",
          declKind: "function", kind: "added",
          calls: [{ name: "formatDate", qualifier: "utils" }] },
      ],
    },
    expect: { resolves: [], ambiguous: [], external: ["utils.formatDate"] },
  },
  // ── Case 4: class-method disambiguation ────────────────────────
  // Two classes both have .render, but the call qualifier picks one.
  {
    label: "Case 4 — class.method qualified resolves correctly",
    files: {
      "a.ts": [
        { name: "render", qualifiedName: "A.render", file: "a.ts", language: "ts",
          declKind: "method", kind: "added", calls: [] },
      ],
      "b.ts": [
        { name: "render", qualifiedName: "B.render", file: "b.ts", language: "ts",
          declKind: "method", kind: "unchanged", calls: [] },
        { name: "trigger", qualifiedName: "trigger", file: "b.ts", language: "ts",
          declKind: "function", kind: "added",
          calls: [{ name: "render", qualifier: "B" }] },
      ],
    },
    expect: { resolves: ["trigger -> B.render"], ambiguous: [], external: [] },
  },
];

function makeId(fn) { return `${fn.file}::${fn.qualifiedName}::${fn.declKind}`; }

function runCase(c) {
  const all = [];
  for (const fns of Object.values(c.files)) {
    for (const f of fns) all.push({ ...f, id: makeId(f) });
  }
  // Build the symbol table (skip removed).
  const symByName = new Map();
  const symByQual = new Map();
  function add(map, k, v) {
    const a = map.get(k) ?? [];
    a.push(v);
    map.set(k, a);
  }
  for (const fn of all) {
    if (fn.kind === "removed") continue;
    const e = { id: fn.id, file: fn.file };
    add(symByName, fn.name, e);
    add(symByQual, fn.qualifiedName, e);
  }
  function resolveCall(call, ownerId) {
    if (call.qualifier) {
      const m = symByQual.get(`${call.qualifier}.${call.name}`);
      if (m && m.length) {
        const ids = m.map((s) => s.id).filter((x) => x !== ownerId);
        return { targets: ids, ambiguous: ids.length > 1 };
      }
    }
    const direct = symByQual.get(call.name);
    if (direct && direct.length === 1) {
      const ids = direct.map((s) => s.id).filter((x) => x !== ownerId);
      return { targets: ids, ambiguous: false };
    }
    const byShort = symByName.get(call.name);
    if (!byShort || byShort.length === 0) return { targets: [], ambiguous: false };
    const ids = byShort.map((s) => s.id).filter((x) => x !== ownerId);
    if (ids.length === 0) return { targets: [], ambiguous: false };
    if (ids.length === 1) return { targets: ids, ambiguous: false };
    return { targets: [], ambiguous: true };
  }

  const resolves = [];
  const ambiguous = [];
  const external = [];
  for (const fn of all) {
    for (const call of fn.calls) {
      const r = resolveCall(call, fn.id);
      if (r.ambiguous) {
        ambiguous.push(`${fn.name} : ${call.name}`);
      } else if (r.targets.length === 0) {
        external.push(call.qualifier ? `${call.qualifier}.${call.name}` : call.name);
      } else {
        for (const t of r.targets) {
          const tgt = all.find((f) => f.id === t);
          if (tgt) resolves.push(`${fn.name} -> ${tgt.qualifiedName}`);
        }
      }
    }
  }
  return { resolves, ambiguous, external };
}

function eqSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

let failed = 0;
for (const c of FIXTURES) {
  const actual = runCase(c);
  const ok =
    eqSet(actual.resolves, c.expect.resolves) &&
    eqSet(actual.ambiguous, c.expect.ambiguous) &&
    eqSet(actual.external, c.expect.external);
  if (ok) {
    console.log(`PASS ${c.label}`);
  } else {
    failed++;
    console.log(`FAIL ${c.label}`);
    console.log(`  expected: ${JSON.stringify(c.expect)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} of ${FIXTURES.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${FIXTURES.length} cases passed`);
