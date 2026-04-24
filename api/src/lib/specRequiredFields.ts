/**
 * Distill OpenAPI JSON blocks inside spec markdown files into a compact,
 * AI-friendly format.  The raw JSON can be 1000+ lines per endpoint —
 * burying required fields and examples deep in nested structures.  This
 * module extracts the essential information and presents it so the AI
 * cannot miss it.
 *
 * Approach:  REPLACE the raw OpenAPI JSON with a distilled summary that
 * keeps: endpoint, description, path params, request body schema with
 * required fields prominently marked, request examples, and key response
 * fields.  Everything else (error schemas, security defs, enum details)
 * is stripped.
 */

// ── Types ─────────────────────────────────────────────────────────────

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: unknown;
}

interface EndpointSummary {
  method: string;
  path: string;
  summary: string;
  description: string;
  pathParams: FieldInfo[];
  requestBody: {
    schemaName: string;
    requiredFields: string[];
    fields: FieldInfo[];
    examples: { name: string; value: unknown }[];
  } | null;
  successStatus: string;
  responseKeyFields: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function resolveRef(ref: string, schemas: Record<string, unknown>): Record<string, unknown> | null {
  const name = ref.split("/").pop();
  if (!name || !schemas[name]) return null;
  return schemas[name] as Record<string, unknown>;
}

function extractFieldType(fieldDef: Record<string, unknown>, schemas: Record<string, unknown>): string {
  if (fieldDef.type) return fieldDef.type as string;
  if (fieldDef.allOf) {
    const refs = fieldDef.allOf as Record<string, string>[];
    for (const r of refs) {
      if (r.$ref) {
        const resolved = resolveRef(r.$ref, schemas);
        if (resolved?.type) return resolved.type as string;
        if (resolved?.enum) return "enum";
      }
    }
    return "object";
  }
  if (fieldDef.$ref) return "object";
  return "unknown";
}

// ── Main: distill raw spec context ────────────────────────────────────

/**
 * Transform raw spec markdown (containing OpenAPI JSON blocks) into a
 * compact format optimised for AI consumption.  The output replaces
 * the massive JSON with structured, readable summaries.
 */
export function distillSpecContext(specContext: string): string {
  // Match the OpenAPI JSON blocks:  ````json METHOD /path\n{...}````
  const jsonBlockRe = /````json\s+(\w+)\s+(\S+)\n([\s\S]*?)````/g;

  // First pass: collect all distilled endpoints
  const endpoints: EndpointSummary[] = [];
  let result = specContext;

  let match: RegExpExecArray | null;
  const replacements: { start: number; end: number; replacement: string }[] = [];

  while ((match = jsonBlockRe.exec(specContext)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const jsonStr = match[3];

    try {
      const spec = JSON.parse(jsonStr);
      const schemas = spec?.components?.schemas ?? {};
      const parameters = spec?.components?.parameters ?? {};
      const paths = spec?.paths;
      if (!paths) continue;

      for (const [, pathObj] of Object.entries(paths) as [string, Record<string, unknown>][]) {
        for (const [, opObj] of Object.entries(pathObj) as [string, Record<string, unknown>][]) {
          const op = opObj as Record<string, unknown>;
          const endpoint = parseEndpoint(method, path, op, schemas, parameters);
          endpoints.push(endpoint);

          // Build the distilled text to replace the JSON block
          const distilled = formatEndpoint(endpoint);
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement: distilled,
          });
        }
      }
    } catch {
      // Not valid JSON — leave as-is
    }
  }

  // Apply replacements in reverse order to preserve indices
  for (const r of replacements.reverse()) {
    result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
  }

  return result;
}

function parseEndpoint(
  method: string,
  path: string,
  op: Record<string, unknown>,
  schemas: Record<string, unknown>,
  componentParams: Record<string, unknown>,
): EndpointSummary {
  const summary = (op.summary as string) ?? "";
  const description = (op.description as string) ?? "";

  // Path parameters
  const pathParams: FieldInfo[] = [];
  const params = op.parameters as Record<string, unknown>[] | undefined;
  if (params) {
    for (const p of params) {
      let param = p;
      if (p.$ref) {
        const refName = (p.$ref as string).split("/").pop();
        if (refName && componentParams[refName]) {
          param = componentParams[refName] as Record<string, unknown>;
        }
      }
      if ((param as Record<string, unknown>).in === "path") {
        const schema = (param as Record<string, unknown>).schema as Record<string, unknown> | undefined;
        pathParams.push({
          name: (param as Record<string, unknown>).name as string,
          type: schema?.type as string ?? "string",
          required: true,
          description: ((param as Record<string, unknown>).description as string) ?? "",
          example: schema?.example,
        });
      }
    }
  }

  // Request body
  let requestBody: EndpointSummary["requestBody"] = null;
  const reqBody = op.requestBody as Record<string, unknown> | undefined;
  if (reqBody) {
    const content = reqBody.content as Record<string, Record<string, unknown>> | undefined;
    const jsonContent = content?.["application/json"];
    if (jsonContent) {
      const schemaRef = jsonContent.schema as Record<string, string> | undefined;
      let schemaName = "";
      let schema: Record<string, unknown> | null = null;

      if (schemaRef?.$ref) {
        schemaName = schemaRef.$ref.split("/").pop() ?? "";
        schema = resolveRef(schemaRef.$ref, schemas);
      }

      if (schema) {
        const required = (schema.required as string[]) ?? [];
        const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
        const fields: FieldInfo[] = [];

        if (properties) {
          for (const [fieldName, fieldDef] of Object.entries(properties)) {
            fields.push({
              name: fieldName,
              type: extractFieldType(fieldDef, schemas),
              required: required.includes(fieldName),
              description: ((fieldDef.description as string) ?? "").slice(0, 150),
              example: fieldDef.example,
            });
          }
        }

        // Extract examples
        const examples: { name: string; value: unknown }[] = [];
        const examplesObj = jsonContent.examples as Record<string, Record<string, unknown>> | undefined;
        if (examplesObj) {
          for (const [exName, exDef] of Object.entries(examplesObj)) {
            if (exDef.value) {
              examples.push({ name: exName, value: exDef.value });
            }
          }
        }

        requestBody = { schemaName, requiredFields: required, fields, examples };
      }
    }
  }

  // Success response — extract key fields
  const responses = op.responses as Record<string, Record<string, unknown>> | undefined;
  let successStatus = "200";
  const responseKeyFields: string[] = [];
  if (responses) {
    // Find the success response (2xx)
    const successKey = Object.keys(responses).find(k => k.startsWith("2"));
    if (successKey) {
      successStatus = successKey;
      const successResp = responses[successKey];
      const respContent = successResp?.content as Record<string, Record<string, unknown>> | undefined;
      const jsonResp = respContent?.["application/json"];
      if (jsonResp) {
        const respSchemaRef = jsonResp.schema as Record<string, string> | undefined;
        if (respSchemaRef?.$ref) {
          const respSchema = resolveRef(respSchemaRef.$ref, schemas);
          if (respSchema) {
            extractResponseKeyFields(respSchema, schemas, "response", responseKeyFields, 0);
          }
        }
      }
    }
  }

  return { method, path, summary, description, pathParams, requestBody, successStatus, responseKeyFields };
}

function extractResponseKeyFields(
  schema: Record<string, unknown>,
  schemas: Record<string, unknown>,
  prefix: string,
  result: string[],
  depth: number,
): void {
  if (depth > 2) return; // Don't go too deep
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  for (const [name, def] of Object.entries(properties)) {
    const fieldPath = `${prefix}.${name}`;
    const type = extractFieldType(def, schemas);

    if (type === "array" || type === "object" || def.allOf || def.$ref) {
      // For nested objects, recurse one level if it's a $ref we can resolve
      let nested: Record<string, unknown> | null = null;
      if (def.$ref) nested = resolveRef(def.$ref as string, schemas);
      if (def.allOf) {
        for (const r of def.allOf as Record<string, string>[]) {
          if (r.$ref) { nested = resolveRef(r.$ref, schemas); break; }
        }
      }
      if (nested && depth < 1) {
        extractResponseKeyFields(nested, schemas, fieldPath, result, depth + 1);
      } else {
        result.push(`${fieldPath} (${type})`);
      }
    } else {
      result.push(`${fieldPath} (${type})`);
    }

    // Cap at 15 key fields
    if (result.length >= 15) return;
  }
}

// ── Formatting ────────────────────────────────────────────────────────

function formatEndpoint(ep: EndpointSummary): string {
  const lines: string[] = [];

  lines.push(`## Endpoint: ${ep.method} ${ep.path}`);
  if (ep.summary) lines.push(`**${ep.summary}**`);
  if (ep.description) lines.push(`> ${ep.description.replace(/\r?\n/g, " ").slice(0, 300)}`);
  lines.push("");

  // Path params
  if (ep.pathParams.length > 0) {
    lines.push("### Path Parameters");
    for (const p of ep.pathParams) {
      lines.push(`- \`${p.name}\` (${p.type}, required) — ${p.description}`);
    }
    lines.push("");
  }

  // Request body
  if (ep.requestBody) {
    const rb = ep.requestBody;
    lines.push(`### Request Body (${rb.schemaName})`);

    if (rb.requiredFields.length > 0) {
      lines.push(`**REQUIRED FIELDS: ${rb.requiredFields.map(f => `\`${f}\``).join(", ")}**`);
    }
    lines.push("");

    // Field table
    lines.push("| Field | Type | Required | Description |");
    lines.push("|-------|------|----------|-------------|");
    for (const f of rb.fields) {
      const req = f.required ? "**YES**" : "no";
      const desc = f.description.replace(/\|/g, "\\|");
      lines.push(`| \`${f.name}\` | ${f.type} | ${req} | ${desc} |`);
    }
    lines.push("");

    // Examples
    if (rb.examples.length > 0) {
      lines.push("### Example Request Body");
      for (const ex of rb.examples) {
        lines.push(`**${ex.name}**:`);
        lines.push("```json");
        lines.push(JSON.stringify(ex.value, null, 2));
        lines.push("```");
      }
      lines.push("");
    }
  }

  // Response
  lines.push(`### Response (${ep.successStatus})`);
  if (ep.responseKeyFields.length > 0) {
    lines.push(`Key fields: ${ep.responseKeyFields.slice(0, 10).map(f => `\`${f}\``).join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ── Legacy exports (kept for backward compat) ─────────────────────────

/**
 * Extract required fields summary — now delegates to distillSpecContext
 * internally but returns just the summary section.
 */
export function extractRequiredFieldsSummary(specContext: string): string {
  const jsonBlockRe = /````json\s+(\w+)\s+(\S+)\n([\s\S]*?)````/g;
  const summaries: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = jsonBlockRe.exec(specContext)) !== null) {
    const method = match[1];
    const path = match[2];
    try {
      const spec = JSON.parse(match[3]);
      const schemas = spec?.components?.schemas;
      if (!schemas) continue;

      const paths = spec?.paths;
      if (!paths) continue;
      for (const [, pathObj] of Object.entries(paths) as [string, Record<string, unknown>][]) {
        for (const [, opObj] of Object.entries(pathObj) as [string, Record<string, unknown>][]) {
          const op = opObj as Record<string, unknown>;
          const reqBody = op.requestBody as Record<string, unknown> | undefined;
          if (!reqBody) continue;
          const content = reqBody.content as Record<string, Record<string, unknown>> | undefined;
          if (!content) continue;
          const jsonContent = content["application/json"];
          if (!jsonContent) continue;
          const schemaRef = jsonContent.schema as Record<string, string> | undefined;
          if (!schemaRef?.$ref) continue;
          const schemaName = schemaRef.$ref.split("/").pop();
          if (!schemaName || !schemas[schemaName]) continue;

          const schema = schemas[schemaName] as Record<string, unknown>;
          const required = (schema.required as string[]) ?? [];
          const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
          if (!properties || required.length === 0) continue;

          const lines: string[] = [];
          lines.push(`### ${method} ${path} — Request Body (${schemaName})`);
          lines.push(`**Required fields**: ${required.map(f => `\`${f}\``).join(", ")}`);
          lines.push("");
          lines.push("| Field | Type | Required | Description |");
          lines.push("|-------|------|----------|-------------|");
          for (const [fieldName, fieldDef] of Object.entries(properties)) {
            const isReq = required.includes(fieldName) ? "**YES**" : "no";
            const type = (fieldDef.type as string) ?? (fieldDef.allOf ? "enum/ref" : "unknown");
            const desc = ((fieldDef.description as string) ?? "").replace(/\|/g, "\\|").slice(0, 120);
            lines.push(`| \`${fieldName}\` | ${type} | ${isReq} | ${desc} |`);
          }
          summaries.push(lines.join("\n"));
        }
      }
    } catch {
      // Not valid JSON or unexpected structure — skip
    }
  }

  if (summaries.length === 0) return "";

  return "\n\n# Request Body Required Fields Summary\n\n" +
    "**IMPORTANT**: The following required fields were extracted from the API spec schemas. " +
    "You MUST include ALL fields marked as **YES** in the `<body>` CDATA of the corresponding steps.\n\n" +
    summaries.join("\n\n");
}

/**
 * Extract just the common required field names (excluding generic ones).
 */
export function extractCommonRequiredFields(specContext: string): string[] {
  const jsonBlockRe = /````json\s+(\w+)\s+(\S+)\n([\s\S]*?)````/g;
  const fieldFrequency: Record<string, number> = {};

  let match: RegExpExecArray | null;
  while ((match = jsonBlockRe.exec(specContext)) !== null) {
    try {
      const spec = JSON.parse(match[3]);
      const schemas = spec?.components?.schemas;
      if (!schemas) continue;
      const paths = spec?.paths;
      if (!paths) continue;
      for (const [, pathObj] of Object.entries(paths) as [string, Record<string, unknown>][]) {
        for (const [, opObj] of Object.entries(pathObj) as [string, Record<string, unknown>][]) {
          const op = opObj as Record<string, unknown>;
          const reqBody = op.requestBody as Record<string, unknown> | undefined;
          if (!reqBody) continue;
          const content = reqBody.content as Record<string, Record<string, unknown>> | undefined;
          if (!content) continue;
          const jsonContent = content["application/json"];
          if (!jsonContent) continue;
          const schemaRef = jsonContent.schema as Record<string, string> | undefined;
          if (!schemaRef?.$ref) continue;
          const schemaName = schemaRef.$ref.split("/").pop();
          if (!schemaName || !schemas[schemaName]) continue;
          const schema = schemas[schemaName] as Record<string, unknown>;
          const required = (schema.required as string[]) ?? [];
          for (const f of required) {
            fieldFrequency[f] = (fieldFrequency[f] || 0) + 1;
          }
        }
      }
    } catch { /* skip */ }
  }

  return Object.entries(fieldFrequency)
    .filter(([name]) => !["name", "title"].includes(name))
    .map(([name]) => name);
}
