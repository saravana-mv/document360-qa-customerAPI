/**
 * Client-side OpenAPI 3.x / Swagger 2.x parser.
 * Resolves $refs inline and groups endpoints by tag for the API docs viewer.
 */
import type { SwaggerSpec, Schema, Operation, Parameter, Response, SecurityScheme } from "../../types/spec.types";

export interface ParsedEndpointDoc {
  path: string;
  method: string;
  summary: string;
  description?: string;
  operationId?: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    contentType: string;
    schema?: Schema;
    example?: unknown;
    /** OAS3 named examples map (example name → value) */
    examples?: Record<string, unknown>;
  };
  responses: Array<{
    status: string;
    description?: string;
    contentType?: string;
    schema?: Schema;
  }>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface EndpointGroup {
  tag: string;
  description?: string;
  endpoints: ParsedEndpointDoc[];
}

export interface ParsedSpec {
  title: string;
  version: string;
  description?: string;
  groups: EndpointGroup[];
  securitySchemes?: Record<string, SecurityScheme>;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Parse a raw OpenAPI JSON spec into a structured format for the docs viewer.
 * Handles both OpenAPI 3.x and Swagger 2.x (auto-normalized).
 */
export function parseSwaggerSpec(raw: string): ParsedSpec {
  const spec = JSON.parse(raw) as Record<string, unknown>;

  // Normalize Swagger 2.x to OpenAPI 3.x structure
  if (!spec.openapi && (spec as { swagger?: string }).swagger?.startsWith("2")) {
    normalizeSwagger2(spec);
  }

  const typed = spec as unknown as SwaggerSpec;
  const groups = new Map<string, EndpointGroup>();
  const tagDescriptions = new Map<string, string>();

  // Collect tag descriptions
  if (typed.tags) {
    for (const t of typed.tags) {
      if (t.description) tagDescriptions.set(t.name, t.description);
    }
  }

  const paths = typed.paths ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    // Path-level parameters (shared across all methods)
    const pathParams = resolveParamArray(
      (pathItem as Record<string, unknown>).parameters as Parameter[] | undefined,
      spec,
    );

    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as Operation | undefined;
      if (!op) continue;

      const tags = op.tags?.length ? op.tags : ["Other"];
      const opParams = resolveParamArray(op.parameters, spec);
      // Merge path-level + operation-level params (op overrides path)
      const mergedParams = mergeParams(pathParams, opParams);

      // Request body
      let requestBody: ParsedEndpointDoc["requestBody"];
      if (op.requestBody) {
        const rb = resolveRef(op.requestBody, spec) as NonNullable<Operation["requestBody"]>;
        if (rb?.content) {
          const [contentType, media] = Object.entries(rb.content)[0] ?? [];
          if (contentType && media) {
            // Collect named examples from OAS3 `examples` map
            const namedExamples: Record<string, unknown> = {};
            const rawExamples = (media as Record<string, unknown>).examples as Record<string, { value?: unknown; summary?: string }> | undefined;
            if (rawExamples && typeof rawExamples === "object") {
              for (const [exName, exObj] of Object.entries(rawExamples)) {
                if (exObj && typeof exObj === "object" && "value" in exObj) {
                  namedExamples[exName] = exObj.value;
                }
              }
            }
            requestBody = {
              required: rb.required,
              description: rb.description,
              contentType,
              schema: media.schema ? resolveSchemaRefs(media.schema, spec) : undefined,
              example: media.example,
              examples: Object.keys(namedExamples).length > 0 ? namedExamples : undefined,
            };
          }
        }
      }

      // Responses
      const responses: ParsedEndpointDoc["responses"] = [];
      if (op.responses) {
        for (const [status, resp] of Object.entries(op.responses)) {
          const resolved = resolveRef(resp, spec) as Response;
          let contentType: string | undefined;
          let schema: Schema | undefined;
          if (resolved?.content) {
            const [ct, media] = Object.entries(resolved.content)[0] ?? [];
            contentType = ct;
            schema = media?.schema ? resolveSchemaRefs(media.schema, spec) : undefined;
          }
          responses.push({
            status,
            description: resolved?.description,
            contentType,
            schema,
          });
        }
      }

      const endpoint: ParsedEndpointDoc = {
        path,
        method,
        summary: op.summary ?? "",
        description: op.description,
        operationId: op.operationId,
        tags,
        parameters: mergedParams,
        requestBody,
        responses,
        security: op.security ?? typed.security,
        deprecated: op.deprecated,
      };

      for (const tag of tags) {
        let group = groups.get(tag);
        if (!group) {
          group = { tag, description: tagDescriptions.get(tag), endpoints: [] };
          groups.set(tag, group);
        }
        group.endpoints.push(endpoint);
      }
    }
  }

  return {
    title: typed.info?.title ?? "API",
    version: typed.info?.version ?? "",
    description: typed.info?.description,
    groups: [...groups.values()],
    securitySchemes: typed.components?.securitySchemes,
  };
}

// ── $ref resolution ──────────────────────────────────────────────────────────

function resolvePointer(root: Record<string, unknown>, pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined;
  const parts = pointer.slice(2).split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveRef(obj: unknown, root: Record<string, unknown>): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.$ref === "string") {
    return resolvePointer(root, rec.$ref) ?? obj;
  }
  return obj;
}

/** Resolve $refs within a schema tree. Handles circular refs with a visited set. */
function resolveSchemaRefs(
  schema: Schema,
  root: Record<string, unknown>,
  visited = new Set<string>(),
): Schema {
  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      return { type: "object", description: `(circular: ${schema.$ref.split("/").pop()})` };
    }
    visited.add(schema.$ref);
    const resolved = resolvePointer(root, schema.$ref);
    if (resolved && typeof resolved === "object") {
      return resolveSchemaRefs(resolved as Schema, root, new Set(visited));
    }
    return schema;
  }

  const result: Schema = { ...schema };

  if (result.properties) {
    const props: Record<string, Schema> = {};
    for (const [key, val] of Object.entries(result.properties)) {
      props[key] = resolveSchemaRefs(val, root, new Set(visited));
    }
    result.properties = props;
  }

  if (result.items) {
    result.items = resolveSchemaRefs(result.items, root, new Set(visited));
  }

  if (result.allOf) {
    // Merge allOf into a single schema
    let merged: Schema = {};
    for (const sub of result.allOf) {
      const resolved = resolveSchemaRefs(sub, root, new Set(visited));
      merged = mergeSchemas(merged, resolved);
    }
    return merged;
  }

  if (result.oneOf) {
    result.oneOf = result.oneOf.map(s => resolveSchemaRefs(s, root, new Set(visited)));
  }
  if (result.anyOf) {
    result.anyOf = result.anyOf.map(s => resolveSchemaRefs(s, root, new Set(visited)));
  }

  if (result.additionalProperties && typeof result.additionalProperties === "object") {
    result.additionalProperties = resolveSchemaRefs(
      result.additionalProperties as Schema, root, new Set(visited),
    );
  }

  return result;
}

function mergeSchemas(a: Schema, b: Schema): Schema {
  const result: Schema = { ...a, ...b };
  if (a.properties || b.properties) {
    result.properties = { ...(a.properties ?? {}), ...(b.properties ?? {}) };
  }
  if (a.required || b.required) {
    result.required = [...new Set([...(a.required ?? []), ...(b.required ?? [])])];
  }
  return result;
}

function resolveParamArray(
  params: Parameter[] | undefined,
  root: Record<string, unknown>,
): Parameter[] {
  if (!params) return [];
  return params.map(p => {
    const resolved = resolveRef(p, root) as Parameter;
    if (resolved.schema) {
      return { ...resolved, schema: resolveSchemaRefs(resolved.schema, root) };
    }
    return resolved;
  });
}

function mergeParams(pathParams: Parameter[], opParams: Parameter[]): Parameter[] {
  const map = new Map<string, Parameter>();
  for (const p of pathParams) map.set(`${p.in}:${p.name}`, p);
  for (const p of opParams) map.set(`${p.in}:${p.name}`, p); // op overrides
  return [...map.values()];
}

// ── Swagger 2.x normalization ───────────────────────────────────────────────

function normalizeSwagger2(spec: Record<string, unknown>) {
  spec.openapi = "3.0.0";
  const definitions = spec.definitions as Record<string, unknown> | undefined;
  const parameters = spec.parameters as Record<string, unknown> | undefined;

  if (!spec.components) spec.components = {};
  const components = spec.components as Record<string, unknown>;
  if (definitions) components.schemas = definitions;
  if (parameters) components.parameters = parameters;

  // Rewrite refs
  const raw = JSON.stringify(spec);
  const rewritten = raw.replace(/#\/definitions\//g, "#/components/schemas/");
  Object.assign(spec, JSON.parse(rewritten));

  // Prepend basePath to paths
  const basePath = (spec.basePath as string | undefined)?.replace(/\/$/, "") ?? "";
  if (basePath && spec.paths) {
    const paths = spec.paths as Record<string, unknown>;
    const newPaths: Record<string, unknown> = {};
    for (const [p, val] of Object.entries(paths)) {
      newPaths[basePath + p] = val;
    }
    spec.paths = newPaths;
  }
}

// ── File path mapping (mirrors server-side swaggerSplitter naming) ──────────

/** Convert a tag name to a kebab-case folder name (mirrors server tagToFolder). */
function tagToFolder(tag: string): string {
  return toKebabCase(tag);
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function endsWithParam(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return !!last && /^\{.+\}$/.test(last);
}

function methodToBaseName(method: string): string {
  const map: Record<string, string> = { post: "create", put: "update", patch: "update", delete: "delete" };
  return map[method.toLowerCase()] ?? method.toLowerCase();
}

function pathDiscriminator(method: string, path: string, resourceFolder?: string): string {
  const segments = path.split("/").filter(Boolean);
  const skip = new Set(["projects", resourceFolder?.toLowerCase()].filter(Boolean));
  const meaningful = segments.filter(s =>
    !/^\{.+\}$/.test(s) && !/^v\d+$/i.test(s) && !skip.has(s.toLowerCase())
  );
  const suffix = meaningful.slice(-2).join("-");
  return suffix ? `-${suffix}` : `-${method.toLowerCase()}`;
}

function operationToFilename(
  method: string,
  path: string,
  existingNames: Set<string>,
  resourceFolder?: string,
  operationId?: string,
): string {
  let base: string;

  if (operationId) {
    base = toKebabCase(operationId);
  } else {
    const m = method.toLowerCase();
    const action = m === "get" ? (endsWithParam(path) ? "get" : "list") : methodToBaseName(m);
    const resource = resourceFolder ? singularize(resourceFolder) : "";
    const suffix = resourceFolder ? (action === "list" ? resourceFolder : resource) : "";
    base = suffix ? `${action}-${suffix}` : action;
  }

  const candidate = `${base}.md`;
  if (!existingNames.has(candidate)) {
    existingNames.add(candidate);
    return candidate;
  }
  const disc = pathDiscriminator(method, path, resourceFolder);
  const fallback = `${base}${disc}.md`;
  existingNames.add(fallback);
  return fallback;
}

/**
 * Build a mapping from spec file paths to parsed endpoints.
 * Keys are relative paths like "articles/create-article.md" (no version prefix).
 */
export function buildEndpointFileMap(spec: ParsedSpec): Map<string, ParsedEndpointDoc> {
  const map = new Map<string, ParsedEndpointDoc>();
  const folderFileNames: Record<string, Set<string>> = {};

  for (const group of spec.groups) {
    const folder = tagToFolder(group.tag);
    if (!folderFileNames[folder]) folderFileNames[folder] = new Set();

    for (const ep of group.endpoints) {
      const filename = operationToFilename(ep.method, ep.path, folderFileNames[folder], folder, ep.operationId);
      map.set(`${folder}/${filename}`, ep);
    }
  }
  return map;
}
