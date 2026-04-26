// Pre-run validation: extract all proj.* variable references from test
// definitions and check that they have corresponding project variables.

import type { TestDef } from "../../types/test.types";

/**
 * Suggest the closest defined variable name for a misspelled reference.
 * Uses a combination of substring matching and Levenshtein distance.
 * Returns null if no close match is found (distance > 50% of longer name).
 */
export function suggestSimilarVar(
  undefinedVar: string,
  definedNames: Set<string>,
): string | null {
  if (definedNames.size === 0) return null;

  const lower = undefinedVar.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;

  for (const name of definedNames) {
    const nameLower = name.toLowerCase();

    // Exact case-insensitive match — shouldn't happen (would be defined), but safety
    if (lower === nameLower) return name;

    // One contains the other (e.g. "projectVersionId" contains "versionId")
    if (lower.includes(nameLower) || nameLower.includes(lower)) {
      const dist = levenshtein(lower, nameLower);
      if (dist < bestScore) { bestScore = dist; best = name; }
      continue;
    }

    // Levenshtein distance
    const dist = levenshtein(lower, nameLower);
    if (dist < bestScore) { bestScore = dist; best = name; }
  }

  // Only suggest if distance is within 50% of the longer string length
  const maxLen = Math.max(undefinedVar.length, best?.length ?? 0);
  if (best && bestScore <= Math.ceil(maxLen * 0.5)) return best;
  return null;
}

/** Simple Levenshtein distance (adequate for short variable names). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insert
        prev[j] + 1,            // delete
        prev[j - 1] + cost,     // replace
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** Extract all unique proj.* variable names referenced in a set of test definitions. */
export function extractProjVarRefs(tests: TestDef[]): Set<string> {
  const refs = new Set<string>();
  const projPattern = /\{\{proj\.(\w+)\}\}/g;

  for (const def of tests) {
    // From pathParamsMeta (e.g. { value: "proj.projectId" })
    if (def.pathParamsMeta) {
      for (const meta of Object.values(def.pathParamsMeta)) {
        if (meta.value.startsWith("proj.")) {
          refs.add(meta.value.slice("proj.".length));
        }
        for (const m of meta.value.matchAll(projPattern)) refs.add(m[1]);
      }
    }

    // From queryParams (e.g. { lang_code: "proj.langCode" })
    if (def.queryParams) {
      for (const v of Object.values(def.queryParams)) {
        if (v.startsWith("proj.")) {
          refs.add(v.slice("proj.".length));
        }
        for (const m of v.matchAll(projPattern)) refs.add(m[1]);
      }
    }

    // From sampleRequestBody (search for {{proj.X}} in stringified body)
    if (def.sampleRequestBody !== undefined) {
      const bodyStr = typeof def.sampleRequestBody === "string"
        ? def.sampleRequestBody
        : JSON.stringify(def.sampleRequestBody);
      for (const m of bodyStr.matchAll(projPattern)) refs.add(m[1]);
    }
  }

  return refs;
}

export interface MissingVarInfo {
  varName: string;
  usedBy: string[]; // flow names that reference it
}

/** Check which proj.* references have no corresponding project variable. */
export function findMissingProjVars(
  tests: TestDef[],
  definedVarNames: Set<string>,
): MissingVarInfo[] {
  const refsByVar = new Map<string, Set<string>>();

  for (const def of tests) {
    const refs = extractProjVarRefs([def]);
    for (const varName of refs) {
      if (!refsByVar.has(varName)) refsByVar.set(varName, new Set());
      refsByVar.get(varName)!.add(def.tag);
    }
  }

  const missing: MissingVarInfo[] = [];
  for (const [varName, tags] of refsByVar) {
    if (!definedVarNames.has(varName)) {
      missing.push({ varName, usedBy: Array.from(tags) });
    }
  }

  return missing.sort((a, b) => a.varName.localeCompare(b.varName));
}

export interface EmptyVarInfo {
  varName: string;
  usedBy: string[]; // flow names that reference it
}

/**
 * Find project variables that are referenced by tests but have empty values.
 * Variables that are completely undefined are reported by findMissingProjVars;
 * this catches the case where the variable exists but has no value assigned.
 */
export function findEmptyProjVars(
  tests: TestDef[],
  variables: Array<{ name: string; value: string }>,
): EmptyVarInfo[] {
  const emptyNames = new Set(variables.filter(v => !v.value.trim()).map(v => v.name));
  if (emptyNames.size === 0) return [];

  const refsByVar = new Map<string, Set<string>>();
  for (const def of tests) {
    const refs = extractProjVarRefs([def]);
    for (const varName of refs) {
      if (emptyNames.has(varName)) {
        if (!refsByVar.has(varName)) refsByVar.set(varName, new Set());
        refsByVar.get(varName)!.add(def.tag);
      }
    }
  }

  const empty: EmptyVarInfo[] = [];
  for (const [varName, tags] of refsByVar) {
    empty.push({ varName, usedBy: Array.from(tags) });
  }
  return empty.sort((a, b) => a.varName.localeCompare(b.varName));
}
