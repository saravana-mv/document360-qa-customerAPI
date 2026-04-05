import type { SwaggerSpec, ParsedTag, ParsedEndpoint } from "../../types/spec.types";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function parseSpec(spec: SwaggerSpec): ParsedTag[] {
  const tagMap = new Map<string, ParsedEndpoint[]>();

  // Initialize tags from spec tags array
  if (spec.tags) {
    for (const tag of spec.tags) {
      tagMap.set(tag.name, []);
    }
  }

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tags = operation.tags || ["Untagged"];
      const endpoint: ParsedEndpoint = {
        path,
        method: method.toUpperCase(),
        operation,
        operationId: operation.operationId || `${method}-${path}`,
        summary: operation.summary || `${method.toUpperCase()} ${path}`,
        tags,
      };

      for (const tag of tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }
        tagMap.get(tag)!.push(endpoint);
      }
    }
  }

  return Array.from(tagMap.entries()).map(([name, endpoints]) => ({ name, endpoints }));
}
