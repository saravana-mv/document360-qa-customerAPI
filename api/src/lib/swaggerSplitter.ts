/**
 * Splits a full OpenAPI 3.x or Swagger 2.x spec into individual per-endpoint
 * .md files with self-contained operation definitions and resolved $refs.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SplitFile {
  folder: string;
  filename: string;
  content: string;
}

export interface SplitStats {
  endpoints: number;
  folders: number;
  skipped: number;
}

export interface SuggestedVariable {
  name: string;
  description: string;
  type: string;
  format?: string;
  example?: string;
}

export type SuggestedConnectionProvider = "oauth2" | "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie";

export interface SuggestedConnection {
  name: string;
  provider: SuggestedConnectionProvider;
  description?: string;
  // OAuth-specific
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  // API Key
  authHeaderName?: string;
  authQueryParam?: string;
}

export interface SplitResult {
  files: SplitFile[];
  stats: SplitStats;
  suggestedVariables: SuggestedVariable[];
  suggestedConnections: SuggestedConnection[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a tag name to kebab-case folder name. */
export function tagToFolder(tag: string): string {
  return tag
    .replace(/([a-z])([A-Z])/g, "$1-$2")   // camelCase → camel-Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2") // AISearch → AI-Search
    .replace(/[\s_]+/g, "-")                // spaces/underscores → hyphens
    .replace(/[^a-zA-Z0-9-]/g, "")          // strip non-alnum
    .toLowerCase();
}

/** Map HTTP method + path to a base filename (without .md). */
function methodToBaseName(method: string): string {
  const map: Record<string, string> = {
    post: "create",
    put: "update",
    patch: "patch",
    delete: "delete",
  };
  return map[method.toLowerCase()] ?? method.toLowerCase();
}

/** Check if a path ends with a path parameter (e.g. `/{id}`). */
function endsWithParam(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return !!last && /^\{.+\}$/.test(last);
}

/** Build a discriminator suffix from the path for collision resolution. */
function pathDiscriminator(method: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  // Remove path params and common prefixes
  const meaningful = segments.filter(s => !/^\{.+\}$/.test(s));
  // Take the last 1-2 meaningful segments
  const suffix = meaningful.slice(-2).join("-");
  return suffix ? `-${suffix}` : `-${method.toLowerCase()}`;
}

/** Generate a collision-safe filename for an operation. */
export function operationToFilename(
  method: string,
  path: string,
  existingNames: Set<string>,
): string {
  const m = method.toLowerCase();
  let base: string;

  if (m === "get") {
    base = endsWithParam(path) ? "get" : "list";
  } else {
    base = methodToBaseName(m);
  }

  const candidate = `${base}.md`;
  if (!existingNames.has(candidate)) {
    existingNames.add(candidate);
    return candidate;
  }

  // Collision — add path discriminator
  const disc = pathDiscriminator(method, path);
  const fallback = `${base}${disc}.md`;
  if (!existingNames.has(fallback)) {
    existingNames.add(fallback);
    return fallback;
  }

  // Still colliding — append counter
  let counter = 2;
  while (existingNames.has(`${base}${disc}-${counter}.md`)) counter++;
  const final = `${base}${disc}-${counter}.md`;
  existingNames.add(final);
  return final;
}

// ── $ref Resolution ──────────────────────────────────────────────────────────

/** Resolve a JSON pointer like `#/components/schemas/Article` against the spec root. */
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

/**
 * Recursively walk an object, collecting all $ref pointers that point into
 * components/schemas or components/parameters.
 */
function collectRefs(
  obj: unknown,
  root: Record<string, unknown>,
  visited: Set<string>,
  refs: { schemas: Set<string>; parameters: Set<string> },
): void {
  if (obj == null || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) collectRefs(item, root, visited, refs);
    return;
  }

  const record = obj as Record<string, unknown>;

  if (typeof record["$ref"] === "string") {
    const ref = record["$ref"];
    if (visited.has(ref)) return; // circular
    visited.add(ref);

    const match = ref.match(/^#\/components\/(schemas|parameters)\/(.+)$/);
    if (match) {
      const [, section, name] = match;
      if (section === "schemas") refs.schemas.add(name);
      else refs.parameters.add(name);

      // Recurse into the referenced object
      const resolved = resolvePointer(root, ref);
      if (resolved) collectRefs(resolved, root, visited, refs);
    }
    return;
  }

  for (const value of Object.values(record)) {
    collectRefs(value, root, visited, refs);
  }
}

/**
 * Given an operation object, resolve all $refs and produce a minimal
 * components section containing only what this endpoint needs.
 */
export function resolveRefs(
  operation: Record<string, unknown>,
  pathParams: unknown[] | undefined,
  fullSpec: Record<string, unknown>,
): { schemas: Record<string, unknown>; parameters: Record<string, unknown> } {
  const refs = { schemas: new Set<string>(), parameters: new Set<string>() };
  const visited = new Set<string>();

  // Collect from the operation itself
  collectRefs(operation, fullSpec, visited, refs);

  // Collect from path-level parameters
  if (pathParams) {
    collectRefs(pathParams, fullSpec, visited, refs);
  }

  const components = fullSpec["components"] as Record<string, unknown> | undefined;
  const allSchemas = (components?.["schemas"] ?? {}) as Record<string, unknown>;
  const allParams = (components?.["parameters"] ?? {}) as Record<string, unknown>;

  const minSchemas: Record<string, unknown> = {};
  for (const name of refs.schemas) {
    if (allSchemas[name]) minSchemas[name] = allSchemas[name];
  }

  const minParams: Record<string, unknown> = {};
  for (const name of refs.parameters) {
    if (allParams[name]) minParams[name] = allParams[name];
  }

  return { schemas: minSchemas, parameters: minParams };
}

// ── Inline $ref resolution (deep copy with refs replaced) ────────────────────

/**
 * Deep-clone an object, resolving all $ref pointers inline.
 * Circular refs are replaced with a stub `{ "type": "object", "description": "Circular ref: ..." }`.
 */
function inlineRefs(
  obj: unknown,
  root: Record<string, unknown>,
  visited: Set<string>,
): unknown {
  if (obj == null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => inlineRefs(item, root, visited));
  }

  const record = obj as Record<string, unknown>;

  if (typeof record["$ref"] === "string") {
    const ref = record["$ref"];
    if (visited.has(ref)) {
      return { type: "object", description: `Circular ref: ${ref}` };
    }
    visited.add(ref);
    const resolved = resolvePointer(root, ref);
    if (resolved) {
      const result = inlineRefs(resolved, root, new Set(visited));
      return result;
    }
    return record; // unresolved — keep as-is
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = inlineRefs(value, root, visited);
  }
  return result;
}

// ── Markdown builder ─────────────────────────────────────────────────────────

/** Build the .md content for a single endpoint. */
export function buildEndpointMarkdown(
  method: string,
  path: string,
  operation: Record<string, unknown>,
  pathParams: unknown[] | undefined,
  fullSpec: Record<string, unknown>,
  filename: string,
): string {
  const info = fullSpec["info"] as Record<string, unknown> | undefined;
  const title = (operation["summary"] as string) ?? `${method.toUpperCase()} ${path}`;

  // Build a self-contained mini-spec with resolved refs
  const resolved = resolveRefs(operation, pathParams, fullSpec);

  // Inline-resolve the operation for the output
  const resolvedOp = inlineRefs(operation, fullSpec, new Set()) as Record<string, unknown>;

  // Merge path-level parameters into the operation if not already present
  if (pathParams && Array.isArray(pathParams)) {
    const resolvedPathParams = inlineRefs(pathParams, fullSpec, new Set()) as unknown[];
    const opParams = (resolvedOp["parameters"] ?? []) as unknown[];
    // Only add path params not already in operation
    const existingNames = new Set(
      opParams
        .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
        .map(p => `${p["name"]}:${p["in"]}`),
    );
    const merged = [...opParams];
    for (const pp of resolvedPathParams) {
      if (pp != null && typeof pp === "object") {
        const rec = pp as Record<string, unknown>;
        const key = `${rec["name"]}:${rec["in"]}`;
        if (!existingNames.has(key)) merged.push(pp);
      }
    }
    if (merged.length > 0) resolvedOp["parameters"] = merged;
  }

  const miniSpec: Record<string, unknown> = {
    openapi: "3.0.1",
    info: { title, version: (info?.["version"] as string) ?? "1.0" },
    paths: {
      [path]: {
        [method.toLowerCase()]: resolvedOp,
      },
    },
  };

  // Add minimal components if any refs were collected
  const hasSchemas = Object.keys(resolved.schemas).length > 0;
  const hasParams = Object.keys(resolved.parameters).length > 0;
  if (hasSchemas || hasParams) {
    const comps: Record<string, unknown> = {};
    if (hasSchemas) comps["schemas"] = resolved.schemas;
    if (hasParams) comps["parameters"] = resolved.parameters;
    miniSpec["components"] = comps;
  }

  const jsonBlock = JSON.stringify(miniSpec, null, 2);
  const nameWithoutExt = filename.replace(/\.md$/, "");

  return `## ${nameWithoutExt}.md\n\n\`\`\`json ${method.toUpperCase()} ${path}\n${jsonBlock}\n\`\`\`\n`;
}

// ── Swagger 2.x → 3.x normalization ─────────────────────────────────────────

function normalizeSwagger2(spec: Record<string, unknown>): Record<string, unknown> {
  const basePath = (spec["basePath"] as string) ?? "";
  const oldPaths = (spec["paths"] ?? {}) as Record<string, unknown>;
  const newPaths: Record<string, unknown> = {};

  // Remap paths with basePath prefix
  for (const [path, methods] of Object.entries(oldPaths)) {
    const fullPath = basePath && !path.startsWith(basePath)
      ? `${basePath}${path}`
      : path;
    newPaths[fullPath] = methods;
  }

  // Convert definitions → components/schemas
  const definitions = (spec["definitions"] ?? {}) as Record<string, unknown>;
  const parameters = (spec["parameters"] ?? {}) as Record<string, unknown>;

  const components: Record<string, unknown> = {};
  if (Object.keys(definitions).length > 0) components["schemas"] = definitions;
  if (Object.keys(parameters).length > 0) components["parameters"] = parameters;

  // Rewrite $ref pointers from #/definitions/ to #/components/schemas/
  const serialized = JSON.stringify({ paths: newPaths, components })
    .replace(/#\/definitions\//g, "#/components/schemas/");

  const parsed = JSON.parse(serialized) as Record<string, unknown>;

  return {
    openapi: "3.0.1",
    info: spec["info"] ?? { title: "API", version: "1.0" },
    paths: parsed["paths"],
    components: parsed["components"] ?? {},
  };
}

// ── Main splitter ────────────────────────────────────────────────────────────

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export function splitSwagger(specJson: Record<string, unknown>): SplitResult {
  // Detect and normalize Swagger 2.x
  const spec = specJson["swagger"]
    ? normalizeSwagger2(specJson)
    : specJson;

  const paths = (spec["paths"] ?? {}) as Record<string, Record<string, unknown>>;
  const files: SplitFile[] = [];
  const folderNames = new Set<string>();

  // Track existing filenames per folder for collision detection
  const folderFileNames: Record<string, Set<string>> = {};
  let skipped = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    // Path-level parameters (shared across all methods)
    const pathParams = pathItem["parameters"] as unknown[] | undefined;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation || typeof operation !== "object") continue;

      // Determine folder from first tag
      const tags = (operation["tags"] as string[]) ?? [];
      const tagName = tags[0] ?? "other";
      const folder = tagToFolder(tagName);
      folderNames.add(folder);

      // Track filenames per folder
      if (!folderFileNames[folder]) folderFileNames[folder] = new Set();

      const filename = operationToFilename(method, path, folderFileNames[folder]);

      try {
        const content = buildEndpointMarkdown(
          method, path, operation, pathParams, spec, filename,
        );
        files.push({ folder, filename, content });
      } catch (e) {
        console.warn(`[swaggerSplitter] skipped ${method.toUpperCase()} ${path}:`, e);
        skipped++;
      }
    }
  }

  // Extract path parameters as suggested project variables
  const suggestedVariables = extractPathParameters(paths, spec);

  // Extract security schemes as suggested connections
  const suggestedConnections = extractSecuritySchemes(spec);

  return {
    files,
    stats: {
      endpoints: files.length,
      folders: folderNames.size,
      skipped,
    },
    suggestedVariables,
    suggestedConnections,
  };
}

/**
 * Extract all path parameters from the spec and deduplicate them into
 * suggested project variables.
 */
function extractPathParameters(
  paths: Record<string, Record<string, unknown>>,
  spec: Record<string, unknown>,
): SuggestedVariable[] {
  const seen = new Map<string, SuggestedVariable>();

  for (const [, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    // Collect path-level + operation-level parameters
    const paramSources: unknown[][] = [];
    const pathParams = pathItem["parameters"] as unknown[] | undefined;
    if (Array.isArray(pathParams)) paramSources.push(pathParams);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;
      const opParams = operation["parameters"] as unknown[] | undefined;
      if (Array.isArray(opParams)) paramSources.push(opParams);
    }

    for (const params of paramSources) {
      for (const raw of params) {
        let param = raw as Record<string, unknown>;
        // Resolve $ref if needed
        if (typeof param["$ref"] === "string") {
          const resolved = resolvePointer(spec, param["$ref"] as string);
          if (!resolved || typeof resolved !== "object") continue;
          param = resolved as Record<string, unknown>;
        }

        if (param["in"] !== "path") continue;
        const name = param["name"] as string | undefined;
        if (!name || seen.has(name)) continue;

        // OAS3: param.schema.type/format/example; Swagger 2: param.type/format/example
        const schema = param["schema"] as Record<string, unknown> | undefined;
        const type = (schema?.["type"] ?? param["type"] ?? "string") as string;
        const format = (schema?.["format"] ?? param["format"]) as string | undefined;
        const example = (schema?.["example"] ?? param["example"]) as string | undefined;
        const description = (param["description"] as string) ?? name;

        seen.set(name, {
          name,
          description,
          type,
          ...(format ? { format } : {}),
          ...(example != null ? { example: String(example) } : {}),
        });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract security schemes from the spec and map them to suggested connections.
 */
function extractSecuritySchemes(spec: Record<string, unknown>): SuggestedConnection[] {
  const results: SuggestedConnection[] = [];

  // OAS3: components.securitySchemes
  const components = spec["components"] as Record<string, unknown> | undefined;
  const oas3Schemes = components?.["securitySchemes"] as Record<string, Record<string, unknown>> | undefined;

  // Swagger 2: securityDefinitions
  const swagger2Defs = spec["securityDefinitions"] as Record<string, Record<string, unknown>> | undefined;

  const schemes = oas3Schemes ?? swagger2Defs;
  if (!schemes) return results;

  for (const [schemeName, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== "object") continue;
    const type = scheme["type"] as string;

    if (type === "oauth2") {
      const conn: SuggestedConnection = {
        name: schemeName,
        provider: "oauth2",
        description: scheme["description"] as string | undefined,
      };

      // OAS3: flows.authorizationCode / implicit / clientCredentials / password
      const flows = scheme["flows"] as Record<string, Record<string, unknown>> | undefined;
      if (flows) {
        // Prefer authorizationCode, then implicit, then clientCredentials, then password
        const flow = flows["authorizationCode"] ?? flows["implicit"] ?? flows["clientCredentials"] ?? flows["password"];
        if (flow) {
          conn.authorizationUrl = flow["authorizationUrl"] as string | undefined;
          conn.tokenUrl = flow["tokenUrl"] as string | undefined;
          const scopesObj = flow["scopes"] as Record<string, string> | undefined;
          if (scopesObj) conn.scopes = Object.keys(scopesObj).join(" ");
        }
      } else {
        // Swagger 2: flat structure
        conn.authorizationUrl = scheme["authorizationUrl"] as string | undefined;
        conn.tokenUrl = scheme["tokenUrl"] as string | undefined;
        const scopesObj = scheme["scopes"] as Record<string, string> | undefined;
        if (scopesObj) conn.scopes = Object.keys(scopesObj).join(" ");
      }

      results.push(conn);
    } else if (type === "http") {
      const httpScheme = (scheme["scheme"] as string)?.toLowerCase();
      if (httpScheme === "bearer") {
        results.push({
          name: schemeName,
          provider: "bearer",
          description: scheme["description"] as string | undefined,
        });
      } else if (httpScheme === "basic") {
        results.push({
          name: schemeName,
          provider: "basic",
          description: scheme["description"] as string | undefined,
        });
      }
    } else if (type === "apiKey") {
      const location = scheme["in"] as string;
      const paramName = scheme["name"] as string | undefined;
      if (location === "header") {
        results.push({
          name: schemeName,
          provider: "apikey_header",
          description: scheme["description"] as string | undefined,
          authHeaderName: paramName,
        });
      } else if (location === "query") {
        results.push({
          name: schemeName,
          provider: "apikey_query",
          description: scheme["description"] as string | undefined,
          authQueryParam: paramName,
        });
      } else if (location === "cookie") {
        results.push({
          name: schemeName,
          provider: "cookie",
          description: scheme["description"] as string | undefined,
        });
      }
    } else if (type === "basic") {
      // Swagger 2 basic auth
      results.push({
        name: schemeName,
        provider: "basic",
        description: scheme["description"] as string | undefined,
      });
    }
  }

  return results;
}
