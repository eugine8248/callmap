// Given two sets of parsed functions (base vs head) for the same file,
// classify each function as added / removed / changed / unchanged.
//
// Matching strategy (v0.1): match by name. If two functions share the
// same name across base+head we treat them as the same function. This
// is wrong in the presence of overloads or same-name functions in
// different scopes, but it's a reasonable v0.1 heuristic — documented
// in the README under "known limitations."

import type { ChangedFunction, ParsedFunction } from "../types";
import type { RawFn } from "./parser";

export interface DiffInput {
  file: string;
  baseFns: RawFn[];
  headFns: RawFn[];
}

export function diffFile(input: DiffInput): ChangedFunction[] {
  const { file, baseFns, headFns } = input;
  const baseByName = new Map<string, RawFn>();
  baseFns.forEach((f) => baseByName.set(f.name, f));

  const out: ChangedFunction[] = [];
  const seenInHead = new Set<string>();

  for (const head of headFns) {
    seenInHead.add(head.name);
    const base = baseByName.get(head.name);
    if (!base) {
      out.push(toChanged(head, file, "added"));
    } else if (normalize(base.body) !== normalize(head.body)) {
      out.push({ ...toChanged(head, file, "changed"), oldBody: base.body });
    } else {
      out.push(toChanged(head, file, "unchanged"));
    }
  }

  // removed: in base, missing in head
  for (const base of baseFns) {
    if (!seenInHead.has(base.name)) {
      out.push(toChanged(base, file, "removed"));
    }
  }
  return out;
}

function normalize(body: string): string {
  // Whitespace-insensitive comparison so reformatting alone doesn't count as a change.
  return body.replace(/\s+/g, " ").trim();
}

function toChanged(
  raw: RawFn,
  file: string,
  kind: ChangedFunction["kind"]
): ChangedFunction {
  const id = `${file}::${raw.name}::${raw.declKind}`;
  const parsed: ParsedFunction = {
    id,
    name: raw.name,
    file,
    startLine: raw.startLine,
    endLine: raw.endLine,
    body: raw.body,
    declKind: raw.declKind,
    calls: raw.calls,
  };
  return { ...parsed, kind };
}
