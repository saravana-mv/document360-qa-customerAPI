// Pre-run validation: extract all proj.* variable references from test
// definitions and check that they have corresponding project variables.

import type { TestDef } from "../../types/test.types";

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
