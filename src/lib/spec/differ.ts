import type { SwaggerSpec, SpecDiff, ParsedEndpoint } from "../../types/spec.types";
import { parseSpec } from "./parser";

function endpointKey(e: ParsedEndpoint): string {
  return `${e.method}:${e.path}`;
}

export function diffSpecs(oldSpec: SwaggerSpec, newSpec: SwaggerSpec): SpecDiff {
  const oldEndpoints = parseSpec(oldSpec).flatMap((t) => t.endpoints);
  const newEndpoints = parseSpec(newSpec).flatMap((t) => t.endpoints);

  const oldMap = new Map(oldEndpoints.map((e) => [endpointKey(e), e]));
  const newMap = new Map(newEndpoints.map((e) => [endpointKey(e), e]));

  const added: ParsedEndpoint[] = [];
  const removed: ParsedEndpoint[] = [];
  const changed: SpecDiff["changed"] = [];

  for (const [key, newEp] of newMap.entries()) {
    if (!oldMap.has(key)) {
      added.push(newEp);
    } else {
      const oldEp = oldMap.get(key)!;
      const changes: string[] = [];

      const oldParams = new Set((oldEp.operation.parameters || []).map((p) => `${p.name}:${p.in}`));
      const newParams = new Set((newEp.operation.parameters || []).map((p) => `${p.name}:${p.in}`));

      for (const p of newParams) {
        if (!oldParams.has(p)) changes.push(`Added param: ${p}`);
      }
      for (const p of oldParams) {
        if (!newParams.has(p)) changes.push(`Removed param: ${p}`);
      }

      const oldCodes = new Set(Object.keys(oldEp.operation.responses || {}));
      const newCodes = new Set(Object.keys(newEp.operation.responses || {}));
      for (const code of newCodes) {
        if (!oldCodes.has(code)) changes.push(`New response code: ${code}`);
      }

      if (changes.length > 0) {
        changed.push({ path: newEp.path, method: newEp.method, changes });
      }
    }
  }

  for (const [key, oldEp] of oldMap.entries()) {
    if (!newMap.has(key)) {
      removed.push(oldEp);
    }
  }

  return { added, removed, changed };
}
