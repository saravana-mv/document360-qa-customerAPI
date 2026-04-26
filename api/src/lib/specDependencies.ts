/**
 * Pre-compute entity dependencies from OpenAPI specs at import time.
 *
 * Scans request body schemas for foreign-key `_id` fields, cross-references
 * against actual paths in the spec, and stores the result as
 * `_system/_dependencies.md` in the version folder.
 *
 * AI prompts (idea generation, flow chat, flow generation) read this
 * pre-computed file instead of regex-parsing distilled markdown at runtime.
 */

import { downloadBlob, uploadBlob, deleteBlob } from "./blobClient";

const DEPS_FILENAME = "_system/_dependencies.md";
const DEPS_VERSION = 1;
const DEPS_HEADER = `<!-- deps-v${DEPS_VERSION} -->`;

// ── Types ──────────────────────────────────────────────────────────────

interface DepField {
  /** The _id field name (e.g. "category_id") */
  field: string;
  /** Whether the field is required in the schema */
  required: boolean;
  /** Description from the schema */
  description: string;
  /** Inferred resource name (plural, e.g. "categories") */
  resource: string;
  /** Verified POST path for setup, or null */
  setupPath: string | null;
  /** Verified DELETE path for teardown, or null */
  teardownPath: string | null;
  /** Whether the endpoints were verified to exist in the spec */
  verified: boolean;
}

interface EndpointDeps {
  method: string;
  path: string;
  fields: DepField[];
}

// ── $ref resolution (local copy to avoid circular dependency) ─────────

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

/** Recursively resolve $ref chains (up to 10 levels deep). */
function deepResolveRef(root: Record<string, unknown>, obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj == null || typeof obj !== "object") return obj;
  const rec = obj as Record<string, unknown>;
  if (typeof rec["$ref"] === "string") {
    const resolved = resolvePointer(root, rec["$ref"] as string);
    return resolved ? deepResolveRef(root, resolved, depth + 1) : obj;
  }
  return obj;
}

// ── Swagger 2.x normalization (minimal) ───────────────────────────────

function normalizeSpec(specJson: Record<string, unknown>): Record<string, unknown> {
  if (!specJson["swagger"]) return specJson;

  const basePath = (specJson["basePath"] as string) ?? "";
  const oldPaths = (specJson["paths"] ?? {}) as Record<string, unknown>;
  const newPaths: Record<string, unknown> = {};

  for (const [path, methods] of Object.entries(oldPaths)) {
    const fullPath = basePath && !path.startsWith(basePath) ? `${basePath}${path}` : path;
    newPaths[fullPath] = methods;
  }

  const definitions = (specJson["definitions"] ?? {}) as Record<string, unknown>;
  const parameters = (specJson["parameters"] ?? {}) as Record<string, unknown>;
  const components: Record<string, unknown> = {};
  if (Object.keys(definitions).length > 0) components["schemas"] = definitions;
  if (Object.keys(parameters).length > 0) components["parameters"] = parameters;

  const serialized = JSON.stringify({ paths: newPaths, components })
    .replace(/#\/definitions\//g, "#/components/schemas/");
  const parsed = JSON.parse(serialized) as Record<string, unknown>;

  return {
    openapi: "3.0.1",
    info: specJson["info"] ?? { title: "API", version: "1.0" },
    paths: parsed["paths"],
    components: parsed["components"] ?? {},
  };
}

// ── Pluralization helper ──────────────────────────────────────────────

function pluralize(word: string): string {
  if (word.endsWith("y") && !word.endsWith("ay") && !word.endsWith("ey") && !word.endsWith("oy") && !word.endsWith("uy")) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z") || word.endsWith("ch") || word.endsWith("sh")) {
    return word + "es";
  }
  return word + "s";
}

// ── Core extraction ───────────────────────────────────────────────────

/** Fields to skip — always path params or self-references */
const SKIP_FIELDS = new Set(["project_id"]);

/** Description patterns indicating auth/M2M fields (not entity deps) */
const AUTH_PATTERNS = /\b(authentication|M2M|machine.to.machine|api.key|access.token|bearer)\b/i;

/**
 * Extract entity dependencies from a full OpenAPI/Swagger spec.
 */
export function extractDependencies(specJson: Record<string, unknown>): EndpointDeps[] {
  const spec = normalizeSpec(specJson);
  const paths = (spec["paths"] ?? {}) as Record<string, Record<string, unknown>>;

  // Collect all known path patterns for cross-referencing
  const allPaths = Object.keys(paths);

  const results: EndpointDeps[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of ["post", "put", "patch"]) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      // Get request body schema properties
      const bodyProps = getRequestBodyProperties(operation, spec);
      if (!bodyProps) continue;

      // Extract the resource name from the path (last non-param segment)
      const pathSegments = path.split("/").filter(Boolean);
      const resourceSegments = pathSegments.filter(s => !s.startsWith("{"));
      const selfResource = resourceSegments[resourceSegments.length - 1] ?? "";
      const selfSingular = selfResource.replace(/ies$/, "y").replace(/s$/, "");

      // Get required fields from schema
      const requiredFields = getRequiredFields(operation, spec);

      const fields: DepField[] = [];

      for (const [fieldName, fieldSchema] of Object.entries(bodyProps.properties)) {
        // Only look at _id fields
        if (!fieldName.endsWith("_id")) continue;

        const schema = deepResolveRef(spec, fieldSchema) as Record<string, unknown> | null;
        if (!schema || typeof schema !== "object") continue;

        // Skip globally-excluded fields
        if (SKIP_FIELDS.has(fieldName)) continue;

        // Skip self-references (e.g. article_id in /articles)
        const fieldBase = fieldName.replace(/_id$/, "");
        if (fieldBase === selfSingular) continue;

        // Skip array-typed _id fields (bulk endpoints)
        const fieldType = schema["type"] as string | undefined;
        if (fieldType === "array") continue;

        // Skip auth-related fields
        const desc = (schema["description"] as string) ?? "";
        if (AUTH_PATTERNS.test(desc)) continue;

        const isRequired = requiredFields.has(fieldName);
        const resource = pluralize(fieldBase);

        // Try to extract path from description
        let hintedPath: string | null = null;
        const pathHint = desc.match(/(?:retrieve|get|fetch)\s+(?:from\s+)?(?:GET\s+)?(\/\S+)/i);
        if (pathHint) hintedPath = pathHint[1];

        // Cross-reference: find POST and DELETE for this resource
        const { setupPath, teardownPath, verified } = findResourcePaths(
          allPaths, resource, path, hintedPath,
        );

        fields.push({
          field: fieldName,
          required: isRequired,
          description: desc,
          resource,
          setupPath,
          teardownPath,
          verified,
        });
      }

      if (fields.length > 0) {
        results.push({ method: method.toUpperCase(), path, fields });
      }
    }
  }

  return results;
}

/** Extract request body schema properties from an operation. */
function getRequestBodyProperties(
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
): { properties: Record<string, unknown> } | null {
  // OAS3: requestBody.content.application/json.schema
  let bodySchema: unknown = null;

  const requestBody = deepResolveRef(spec, operation["requestBody"]) as Record<string, unknown> | null;
  if (requestBody) {
    const content = requestBody["content"] as Record<string, Record<string, unknown>> | undefined;
    if (content) {
      const jsonContent = content["application/json"] ?? content["*/*"];
      if (jsonContent) {
        bodySchema = deepResolveRef(spec, jsonContent["schema"]);
      }
    }
  }

  // Swagger 2.x: parameters with in=body
  if (!bodySchema && Array.isArray(operation["parameters"])) {
    for (const param of operation["parameters"]) {
      const resolved = deepResolveRef(spec, param) as Record<string, unknown>;
      if (resolved?.["in"] === "body" && resolved["schema"]) {
        bodySchema = deepResolveRef(spec, resolved["schema"]);
        break;
      }
    }
  }

  if (!bodySchema || typeof bodySchema !== "object") return null;
  const schemaObj = bodySchema as Record<string, unknown>;

  // Handle allOf by merging properties
  if (Array.isArray(schemaObj["allOf"])) {
    const merged: Record<string, unknown> = {};
    for (const item of schemaObj["allOf"]) {
      const resolved = deepResolveRef(spec, item) as Record<string, unknown>;
      if (resolved?.["properties"]) {
        Object.assign(merged, resolved["properties"]);
      }
    }
    if (Object.keys(merged).length > 0) {
      return { properties: resolveProperties(merged, spec) };
    }
  }

  const props = schemaObj["properties"] as Record<string, unknown> | undefined;
  if (!props || Object.keys(props).length === 0) return null;
  return { properties: resolveProperties(props, spec) };
}

/** Resolve $ref in individual property schemas. */
function resolveProperties(
  props: Record<string, unknown>,
  spec: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    result[key] = deepResolveRef(spec, val);
  }
  return result;
}

/** Get the set of required field names from the request body schema. */
function getRequiredFields(
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
): Set<string> {
  const required = new Set<string>();

  const requestBody = deepResolveRef(spec, operation["requestBody"]) as Record<string, unknown> | null;
  let bodySchema: unknown = null;

  if (requestBody) {
    const content = requestBody["content"] as Record<string, Record<string, unknown>> | undefined;
    if (content) {
      const jsonContent = content["application/json"] ?? content["*/*"];
      if (jsonContent) bodySchema = deepResolveRef(spec, jsonContent["schema"]);
    }
  }

  if (!bodySchema && Array.isArray(operation["parameters"])) {
    for (const param of operation["parameters"]) {
      const resolved = deepResolveRef(spec, param) as Record<string, unknown>;
      if (resolved?.["in"] === "body" && resolved["schema"]) {
        bodySchema = deepResolveRef(spec, resolved["schema"]);
        break;
      }
    }
  }

  if (!bodySchema || typeof bodySchema !== "object") return required;
  const schemaObj = bodySchema as Record<string, unknown>;

  // Direct required array
  if (Array.isArray(schemaObj["required"])) {
    for (const f of schemaObj["required"]) {
      if (typeof f === "string") required.add(f);
    }
  }

  // Merge required from allOf
  if (Array.isArray(schemaObj["allOf"])) {
    for (const item of schemaObj["allOf"]) {
      const resolved = deepResolveRef(spec, item) as Record<string, unknown>;
      if (Array.isArray(resolved?.["required"])) {
        for (const f of resolved["required"]) {
          if (typeof f === "string") required.add(f);
        }
      }
    }
  }

  return required;
}

/** Find POST (setup) and DELETE (teardown) paths for a resource. */
function findResourcePaths(
  allPaths: string[],
  resource: string,
  endpointPath: string,
  hintedPath: string | null,
): { setupPath: string | null; teardownPath: string | null; verified: boolean } {
  // Build the expected prefix — same structure as the endpoint up to the resource level
  // e.g. "/v3/projects/{project_id}/articles" → prefix = "/v3/projects/{project_id}"
  const segments = endpointPath.split("/").filter(Boolean);
  let prefixSegments: string[] = [];

  // Walk segments to find where the last non-param resource is (the endpoint's own resource)
  // Then use everything before it as the prefix
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i].startsWith("{")) {
      prefixSegments = segments.slice(0, i);
      break;
    }
  }
  const prefix = "/" + prefixSegments.join("/");

  // Expected paths
  const expectedPost = `${prefix}/${resource}`;
  const expectedDeletePattern = new RegExp(
    `^${escapeRegex(prefix)}/${escapeRegex(resource)}/\\{[^}]+\\}$`,
  );

  let setupPath: string | null = null;
  let teardownPath: string | null = null;

  // Check if hinted path exists
  if (hintedPath) {
    const hintedBase = hintedPath.replace(/\/\{[^}]+\}$/, "");
    if (allPaths.includes(hintedBase)) setupPath = hintedBase;
  }

  // Look for POST path
  if (!setupPath && allPaths.includes(expectedPost)) {
    setupPath = expectedPost;
  }

  // Look for DELETE path
  for (const p of allPaths) {
    if (expectedDeletePattern.test(p)) {
      teardownPath = p;
      break;
    }
  }

  const verified = setupPath !== null || teardownPath !== null;
  // If we couldn't find exact matches, construct likely paths
  if (!setupPath) setupPath = expectedPost;
  if (!teardownPath) teardownPath = `${prefix}/${resource}/{id}`;

  return { setupPath, teardownPath, verified };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Format + store ────────────────────────────────────────────────────

/**
 * Build or rebuild `_system/_dependencies.md` for a version folder.
 */
export async function rebuildDependencies(
  projectId: string,
  folderPath: string,
  specJson: Record<string, unknown>,
): Promise<string> {
  const deps = extractDependencies(specJson);
  if (deps.length === 0) {
    // Store an empty marker so we don't re-compute
    const md = `${DEPS_HEADER}\n# Entity Dependencies\n\nNo foreign-key dependencies detected in this API.\n`;
    const blobPath = buildBlobPath(projectId, folderPath);
    await uploadBlob(blobPath, md, "text/markdown");
    return md;
  }

  // Group by resource path for readability
  const grouped = new Map<string, EndpointDeps[]>();
  for (const ep of deps) {
    const segments = ep.path.split("/").filter(s => !s.startsWith("{") && s);
    const resource = segments[segments.length - 1] ?? "other";
    if (!grouped.has(resource)) grouped.set(resource, []);
    grouped.get(resource)!.push(ep);
  }

  const sections: string[] = [];
  for (const [resource, endpoints] of grouped) {
    const lines: string[] = [];
    for (const ep of endpoints) {
      lines.push(`- **${ep.method} ${ep.path}** requires:`);
      for (const f of ep.fields) {
        const reqLabel = f.required ? "required" : "optional";
        const mark = f.verified ? " \u2713" : "";
        lines.push(`  - \`${f.field}\` (${reqLabel}) \u2192 setup: POST ${f.setupPath}, teardown: DELETE ${f.teardownPath}${mark}`);
      }
    }
    sections.push(`## ${resource}\n${lines.join("\n")}`);
  }

  const md = `${DEPS_HEADER}
# Entity Dependencies

Any test flow using these endpoints MUST create the dependency first (setup) and delete it after (teardown).
Even if the field is marked optional/nullable, realistic test flows should still create and supply these entities.

${sections.join("\n\n")}`;

  const blobPath = buildBlobPath(projectId, folderPath);
  await uploadBlob(blobPath, md, "text/markdown");
  return md;
}

function buildBlobPath(projectId: string, folderPath: string): string {
  const prefix = projectId !== "unknown" ? `${projectId}/${folderPath}` : folderPath;
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalizedPrefix}${DEPS_FILENAME}`;
}

// ── Readers ───────────────────────────────────────────────────────────

/**
 * Read pre-computed dependencies from blob. Returns null if missing/stale.
 */
export async function readDependencies(
  projectId: string,
  folderPath: string,
): Promise<string | null> {
  const blobPath = buildBlobPath(projectId, folderPath);
  try {
    const content = await downloadBlob(blobPath);
    if (content.startsWith(DEPS_HEADER)) return content;
    return null; // stale version
  } catch {
    return null;
  }
}

/**
 * Read dependencies, or lazily rebuild from stored _swagger.json.
 * Returns null if no swagger is stored (graceful degradation for old projects).
 */
export async function loadOrRebuildDependencies(
  projectId: string,
  folderPath: string,
): Promise<string | null> {
  // Try pre-computed first
  const cached = await readDependencies(projectId, folderPath);
  if (cached) return cached;

  // Try reading _swagger.json and rebuilding
  const prefix = projectId !== "unknown" ? `${projectId}/${folderPath}` : folderPath;
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const swaggerPath = `${normalizedPrefix}_system/_swagger.json`;

  try {
    const swaggerContent = await downloadBlob(swaggerPath);
    const specJson = JSON.parse(swaggerContent) as Record<string, unknown>;
    return await rebuildDependencies(projectId, folderPath, specJson);
  } catch {
    // No swagger stored — graceful degradation
    return null;
  }
}

/**
 * Delete the dependencies blob for the version folder containing a spec file.
 * Accepts a full blob path and derives the version folder from it.
 */
export async function invalidateDependencies(blobPath: string): Promise<void> {
  const parts = blobPath.split("/");
  let versionIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^v\d+$/i.test(parts[i])) { versionIdx = i; break; }
  }
  if (versionIdx < 0) return;
  const depPath = parts.slice(0, versionIdx + 1).join("/") + `/${DEPS_FILENAME}`;
  try {
    await deleteBlob(depPath);
  } catch {
    // May not exist yet — ignore
  }
}
