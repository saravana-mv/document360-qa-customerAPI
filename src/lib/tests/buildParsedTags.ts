import type { ParsedTag, ParsedEndpoint } from "../../types/spec.types";
import { getAllTests } from "./registry";

/**
 * Builds ParsedTag[] directly from registered tests, with no external spec fetch.
 * Groups tests by tag, then by path+method within each tag.
 */
export function buildParsedTagsFromRegistry(): ParsedTag[] {
  const tests = getAllTests();
  const tagMap = new Map<string, Map<string, ParsedEndpoint>>();

  for (const test of tests) {
    if (!tagMap.has(test.tag)) {
      tagMap.set(test.tag, new Map());
    }
    const endpointMap = tagMap.get(test.tag)!;
    const key = `${test.method}:${test.path}`;
    if (!endpointMap.has(key)) {
      endpointMap.set(key, {
        path: test.path,
        method: test.method,
        operationId: test.id,
        summary: test.name,
        tags: [test.tag],
        operation: {
          operationId: test.id,
          summary: test.name,
          tags: [test.tag],
        },
      });
    }
  }

  return Array.from(tagMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, endpointMap]) => ({
      name,
      endpoints: Array.from(endpointMap.values()),
    }));
}
