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

interface ItemSchema {
  schemaName: string;
  requiredFields: string[];
  fields: FieldInfo[];
  parentField: string; // e.g. "articles"
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
    itemSchemas: ItemSchema[];
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
  // Match the OpenAPI JSON blocks:  ```json or ````json METHOD /path\n{...}``` or ````
  const jsonBlockRe = /`{3,4}json\s+(\w+)\s+(\S+)\n([\s\S]*?)`{3,4}/g;

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

        // Follow $ref in array items to capture nested schema fields
        const itemSchemas: ItemSchema[] = [];
        if (properties) {
          for (const [fieldName, fieldDef] of Object.entries(properties)) {
            if (fieldDef.type === "array" && fieldDef.items) {
              const items = fieldDef.items as Record<string, unknown>;
              if (items.$ref) {
                const itemSchema = resolveRef(items.$ref as string, schemas);
                if (itemSchema) {
                  const itemRequired = (itemSchema.required as string[]) ?? [];
                  const itemProps = itemSchema.properties as Record<string, Record<string, unknown>> | undefined;
                  const itemFields: FieldInfo[] = [];
                  if (itemProps) {
                    for (const [fn, fd] of Object.entries(itemProps)) {
                      itemFields.push({
                        name: fn,
                        type: extractFieldType(fd, schemas),
                        required: itemRequired.includes(fn),
                        description: ((fd.description as string) ?? "").slice(0, 150),
                        example: fd.example,
                      });
                    }
                  }
                  const itemSchemaName = (items.$ref as string).split("/").pop() ?? "";
                  itemSchemas.push({ schemaName: itemSchemaName, requiredFields: itemRequired, fields: itemFields, parentField: fieldName });
                }
              }
            }
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

        requestBody = { schemaName, requiredFields: required, fields, examples, itemSchemas };
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

    // Item schemas (for array properties like bulk endpoints)
    if (rb.itemSchemas && rb.itemSchemas.length > 0) {
      for (const item of rb.itemSchemas) {
        lines.push(`### Array Item Schema: \`${item.parentField}\` → ${item.schemaName}`);
        if (item.requiredFields.length > 0) {
          lines.push(`**REQUIRED FIELDS (per item): ${item.requiredFields.map(f => `\`${f}\``).join(", ")}**`);
        }
        lines.push("");
        lines.push("| Field | Type | Required | Description |");
        lines.push("|-------|------|----------|-------------|");
        for (const f of item.fields) {
          const req = f.required ? "**YES**" : "no";
          const desc = f.description.replace(/\|/g, "\\|");
          lines.push(`| \`${f.name}\` | ${f.type} | ${req} | ${desc} |`);
        }
        lines.push("");
      }
    }

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

  // Response — show full field list so the AI can identify capturable fields
  lines.push(`### Response (${ep.successStatus})`);
  if (ep.responseKeyFields.length > 0) {
    lines.push("**Response fields available for capture** (use `<capture variable=\"state.xxx\" source=\"response.data.xxx\"/>`):");
    for (const f of ep.responseKeyFields.slice(0, 15)) {
      lines.push(`- \`${f}\``);
    }
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
 * Extract common required field names from spec context.
 * Works with both raw OpenAPI JSON blocks AND distilled format.
 * Follows $ref into array items and nested schemas to find deeply
 * nested required fields (e.g. bulk endpoint → item schema → required).
 */
export function extractCommonRequiredFields(specContext: string): string[] {
  const fieldFrequency: Record<string, number> = {};

  // Try distilled format: **REQUIRED FIELDS: `f1`, `f2`** and **REQUIRED FIELDS (per item): `f1`, `f2`**
  const distilledRe = /\*\*REQUIRED FIELDS(?:\s*\(per item\))?:\s*(.+?)\*\*/g;
  let dm: RegExpExecArray | null;
  while ((dm = distilledRe.exec(specContext)) !== null) {
    const fields = dm[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
    for (const f of fields) {
      fieldFrequency[f] = (fieldFrequency[f] || 0) + 1;
    }
  }

  // Also try field table rows: | `field_name` | type | **YES** | ...
  const tableRowRe = /\|\s*`(\w+)`\s*\|[^|]*\|\s*\*\*YES\*\*\s*\|/g;
  let tr: RegExpExecArray | null;
  while ((tr = tableRowRe.exec(specContext)) !== null) {
    fieldFrequency[tr[1]] = (fieldFrequency[tr[1]] || 0) + 1;
  }

  // Also try raw OpenAPI JSON blocks — follow $ref recursively
  if (Object.keys(fieldFrequency).length === 0) {
    const jsonBlockRe = /````json\s+(\w+)\s+(\S+)\n([\s\S]*?)````/g;
    let match: RegExpExecArray | null;
    while ((match = jsonBlockRe.exec(specContext)) !== null) {
      try {
        const spec = JSON.parse(match[3]);
        const schemas = spec?.components?.schemas ?? {};
        collectAllRequiredFields(schemas, fieldFrequency);
      } catch { /* skip */ }
    }
  }

  // Only return fields that look like cross-entity identifiers (contain "id" or "version")
  // rather than generic content fields (title, name, description, content, etc.)
  // which are entity-specific and would produce wrong values if injected into unrelated steps.
  return Object.entries(fieldFrequency)
    .filter(([name]) => /id$|_id|version/i.test(name))
    .map(([name]) => name);
}

/**
 * Analyze distilled spec context to find cross-endpoint data dependencies.
 *
 * Scans all endpoints for cases where one endpoint's REQUIRED request field
 * matches another endpoint's response field name.  Returns a markdown section
 * with explicit capture instructions so the AI knows exactly which fields to
 * capture from which step and inject into which downstream step.
 *
 * Works on already-distilled spec text (not raw OpenAPI JSON).
 */
export function analyzeCrossStepDependencies(
  distilledContext: string,
  projectVariables?: { name: string; value: string }[],
): string {
  // Parse endpoints from distilled format
  const endpointRe = /## Endpoint: (GET|POST|PUT|PATCH|DELETE) (\S+)/g;
  const sections: { method: string; path: string; text: string; start: number }[] = [];
  let em: RegExpExecArray | null;
  while ((em = endpointRe.exec(distilledContext)) !== null) {
    sections.push({ method: em[1], path: em[2], text: "", start: em.index });
  }
  // Slice each section's text
  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start : distilledContext.length;
    sections[i].text = distilledContext.slice(sections[i].start, end);
  }

  // For each endpoint, extract required request fields and response fields
  const endpoints: {
    method: string;
    path: string;
    requiredRequestFields: string[];
    responseFields: string[]; // bare names like "version_number"
  }[] = [];

  for (const sec of sections) {
    // Required request fields from **REQUIRED FIELDS: `f1`, `f2`**
    const reqFields: string[] = [];
    const reqRe = /\*\*REQUIRED FIELDS:\s*(.+?)\*\*/g;
    let rm: RegExpExecArray | null;
    while ((rm = reqRe.exec(sec.text)) !== null) {
      const fields = rm[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
      reqFields.push(...fields);
    }

    // Response fields from bulleted list: - `response.data.xxx`
    const respFields: string[] = [];
    const respRe = /- `response\.(?:data\.)?(\w+)/g;
    let rr: RegExpExecArray | null;
    while ((rr = respRe.exec(sec.text)) !== null) {
      respFields.push(rr[1]);
    }
    // Also handle old flat format: Key fields: `response.data.xxx (type)`, ...
    const flatRe = /Key fields:\s*(.+)/g;
    let fr: RegExpExecArray | null;
    while ((fr = flatRe.exec(sec.text)) !== null) {
      const fields = fr[1].match(/response\.(?:data\.)?(\w+)/g) ?? [];
      for (const f of fields) {
        const bare = f.replace(/^response\.(?:data\.)?/, "");
        if (bare && !respFields.includes(bare)) respFields.push(bare);
      }
    }

    endpoints.push({
      method: sec.method,
      path: sec.path,
      requiredRequestFields: reqFields,
      responseFields: respFields,
    });
  }

  // Find cross-endpoint matches: endpoint A's response field matches endpoint B's required field
  const instructions: string[] = [];
  for (const consumer of endpoints) {
    for (const reqField of consumer.requiredRequestFields) {
      // Skip generic fields that are path params or project variables (project_id, etc.)
      if (/^project_id$/i.test(reqField)) continue;
      if (projectVariables && matchesProjectVariable(reqField, projectVariables)) continue;

      for (const producer of endpoints) {
        if (producer === consumer && producer.method === consumer.method) continue;
        if (producer.responseFields.includes(reqField)) {
          instructions.push(
            `- **${producer.method} ${producer.path}** response contains \`${reqField}\` → ` +
            `**${consumer.method} ${consumer.path}** requires \`${reqField}\` in request body. ` +
            `You MUST add \`<capture variable="state.${toCamelCase(reqField)}" source="response.data.${reqField}"/>\` ` +
            `to the ${producer.method} step and use \`{{state.${toCamelCase(reqField)}}}\` in the ${consumer.method} step's body.`
          );
        }
      }
    }
  }

  if (instructions.length === 0) return "";

  return `\n\n# Cross-Step Data Dependencies (AUTO-DETECTED)\n\n` +
    `**CRITICAL**: The following fields MUST be captured from earlier steps and passed to later steps. ` +
    `Failure to capture these will cause runtime errors.\n\n` +
    instructions.join("\n");
}

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Check if a field name matches any project variable (snake_case or camelCase). */
function matchesProjectVariable(
  fieldName: string,
  projVars: { name: string; value: string }[],
): boolean {
  const camel = toCamelCase(fieldName);
  const lower = fieldName.toLowerCase();
  const camelLower = camel.toLowerCase();
  return projVars.some(v => {
    const vl = v.name.toLowerCase();
    return vl === lower || vl === camelLower;
  });
}

/** Recursively collect required fields from all schemas, following $ref. */
function collectAllRequiredFields(
  schemas: Record<string, unknown>,
  result: Record<string, number>,
): void {
  for (const [, schemaDef] of Object.entries(schemas)) {
    const schema = schemaDef as Record<string, unknown>;
    const required = schema.required as string[] | undefined;
    if (required && Array.isArray(required)) {
      for (const f of required) {
        result[f] = (result[f] || 0) + 1;
      }
    }
  }
}

// ── Cross-Step Capture Injection (Post-Processing) ───────────────────

interface ParsedStep {
  index: number;       // position in the XML
  fullMatch: string;   // the full <step>...</step> text
  method: string;
  path: string;
}

interface SpecEndpoint {
  method: string;
  path: string;
  requiredRequestFields: string[];
  responseFields: string[];  // bare field names from response
}

/** Normalize a path for comparison: replace all {param} with * */
function normalizePath(p: string): string {
  return p.replace(/\{[^}]+\}/g, "*").toLowerCase();
}

/** Parse distilled spec sections into structured endpoint info. */
function parseSpecEndpoints(distilledContext: string): SpecEndpoint[] {
  const endpointRe = /## Endpoint: (GET|POST|PUT|PATCH|DELETE) (\S+)/g;
  const sections: { method: string; path: string; text: string; start: number }[] = [];
  let em: RegExpExecArray | null;
  while ((em = endpointRe.exec(distilledContext)) !== null) {
    sections.push({ method: em[1], path: em[2], text: "", start: em.index });
  }
  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start : distilledContext.length;
    sections[i].text = distilledContext.slice(sections[i].start, end);
  }

  const endpoints: SpecEndpoint[] = [];
  for (const sec of sections) {
    // Required request fields
    const reqFields: string[] = [];
    const reqRe = /\*\*REQUIRED FIELDS(?:\s*\(per item\))?:\s*(.+?)\*\*/g;
    let rm: RegExpExecArray | null;
    while ((rm = reqRe.exec(sec.text)) !== null) {
      const fields = rm[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
      reqFields.push(...fields);
    }
    // Also pick up from table rows
    const tableRowRe = /\|\s*`(\w+)`\s*\|[^|]*\|\s*\*\*YES\*\*\s*\|/g;
    let tr: RegExpExecArray | null;
    while ((tr = tableRowRe.exec(sec.text)) !== null) {
      if (!reqFields.includes(tr[1])) reqFields.push(tr[1]);
    }

    // Response fields
    const respFields: string[] = [];
    const respRe = /- `response\.(?:data\.)?(\w+)/g;
    let rr: RegExpExecArray | null;
    while ((rr = respRe.exec(sec.text)) !== null) {
      respFields.push(rr[1]);
    }
    const flatRe = /Key fields:\s*(.+)/g;
    let fr: RegExpExecArray | null;
    while ((fr = flatRe.exec(sec.text)) !== null) {
      const fields = fr[1].match(/response\.(?:data\.)?(\w+)/g) ?? [];
      for (const f of fields) {
        const bare = f.replace(/^response\.(?:data\.)?/, "");
        if (bare && !respFields.includes(bare)) respFields.push(bare);
      }
    }

    endpoints.push({ method: sec.method, path: sec.path, requiredRequestFields: reqFields, responseFields: respFields });
  }
  return endpoints;
}

/** Parse <step> blocks from generated XML. */
function parseXmlSteps(xml: string): ParsedStep[] {
  const stepRe = /<step\b[^>]*>[\s\S]*?<\/step>/g;
  const steps: ParsedStep[] = [];
  let m: RegExpExecArray | null;
  while ((m = stepRe.exec(xml)) !== null) {
    const methodMatch = m[0].match(/<method>(GET|POST|PUT|PATCH|DELETE)<\/method>/i);
    const pathMatch = m[0].match(/<path>([^<]+)<\/path>/);
    if (methodMatch && pathMatch) {
      steps.push({
        index: m.index,
        fullMatch: m[0],
        method: methodMatch[1].toUpperCase(),
        path: pathMatch[1].trim(),
      });
    }
  }
  return steps;
}

/**
 * Deterministic post-processor: inject missing <capture> elements and
 * {{state.xxx}} body references for cross-step data dependencies.
 *
 * Runs after AI generates the XML. Catches cases where the AI forgot to
 * capture a response field needed by a downstream step.
 */
export function injectCrossStepCaptures(
  xml: string,
  specContext: string,
  projectVariables: { name: string; value: string }[],
): string {
  if (!specContext) return xml;

  const specEndpoints = parseSpecEndpoints(specContext);
  if (specEndpoints.length === 0) return xml;

  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  // Match each XML step to a spec endpoint
  const stepSpecs: (SpecEndpoint | null)[] = xmlSteps.map(step => {
    const normStep = normalizePath(step.path);
    return specEndpoints.find(ep =>
      ep.method === step.method && normalizePath(ep.path) === normStep
    ) ?? null;
  });

  // Diagnostic: log step-to-spec matching
  console.log(`[injectCrossStepCaptures] specEndpoints: ${specEndpoints.map(e => `${e.method} ${e.path} (req: ${e.requiredRequestFields.join(",")}, resp: ${e.responseFields.join(",")})`).join(" | ")}`);
  console.log(`[injectCrossStepCaptures] step-spec matches: ${xmlSteps.map((s, i) => `${s.method} ${s.path} → ${stepSpecs[i] ? "MATCHED" : "no-match"}`).join(" | ")}`);

  // Build list of needed injections
  const captureInjections: { stepIdx: number; field: string; camelField: string }[] = [];
  const bodyInjections: { stepIdx: number; field: string; camelField: string }[] = [];

  for (let consumerIdx = 0; consumerIdx < xmlSteps.length; consumerIdx++) {
    const consumerSpec = stepSpecs[consumerIdx];
    if (!consumerSpec) continue;

    for (const reqField of consumerSpec.requiredRequestFields) {
      // Skip if it's a project variable
      if (matchesProjectVariable(reqField, projectVariables)) continue;
      // Skip project_id — always from path/context
      if (/^project_id$/i.test(reqField)) continue;

      const camelField = toCamelCase(reqField);

      // Check if the consumer step body already references this field
      const consumerXml = xmlSteps[consumerIdx].fullMatch;
      // Extract CDATA body for precise check (avoid false matches in <name>, <notes>, etc.)
      const cdataBody = consumerXml.match(/<body><!\[CDATA\[([\s\S]*?)\]\]><\/body>/)?.[1] ?? "";
      if (cdataBody.includes(`state.${camelField}`) || cdataBody.includes(`"${reqField}"`)) continue;

      // Find a producer step (earlier) whose response includes this field
      for (let producerIdx = 0; producerIdx < consumerIdx; producerIdx++) {
        const producerSpec = stepSpecs[producerIdx];
        if (!producerSpec) continue;
        if (!producerSpec.responseFields.includes(reqField)) continue;

        // Found a match — record needed injections
        const producerXml = xmlSteps[producerIdx].fullMatch;
        if (!producerXml.includes(`state.${camelField}"`)) {
          // Producer doesn't already capture this field
          captureInjections.push({ stepIdx: producerIdx, field: reqField, camelField });
        }
        bodyInjections.push({ stepIdx: consumerIdx, field: reqField, camelField });
        break; // first producer wins
      }
    }
  }

  // Diagnostic: log detected injections
  if (captureInjections.length > 0 || bodyInjections.length > 0) {
    console.log(`[injectCrossStepCaptures] captures to inject: ${captureInjections.map(c => `step[${c.stepIdx}].${c.field}`).join(", ")}`);
    console.log(`[injectCrossStepCaptures] body refs to inject: ${bodyInjections.map(b => `step[${b.stepIdx}].${b.field}`).join(", ")}`);
  } else {
    console.log(`[injectCrossStepCaptures] no cross-step dependencies detected`);
  }

  if (captureInjections.length === 0 && bodyInjections.length === 0) return xml;

  // Apply injections — work on the full XML string, replacing step blocks
  // Process in reverse order of step index to preserve offsets
  let result = xml;

  // Deduplicate injections per step
  const capturesByStep = new Map<number, { field: string; camelField: string }[]>();
  for (const ci of captureInjections) {
    if (!capturesByStep.has(ci.stepIdx)) capturesByStep.set(ci.stepIdx, []);
    const list = capturesByStep.get(ci.stepIdx)!;
    if (!list.some(x => x.field === ci.field)) list.push(ci);
  }
  const bodiesByStep = new Map<number, { field: string; camelField: string }[]>();
  for (const bi of bodyInjections) {
    if (!bodiesByStep.has(bi.stepIdx)) bodiesByStep.set(bi.stepIdx, []);
    const list = bodiesByStep.get(bi.stepIdx)!;
    if (!list.some(x => x.field === bi.field)) list.push(bi);
  }

  // Collect all step indices that need changes, sorted descending
  const affectedSteps = new Set([...capturesByStep.keys(), ...bodiesByStep.keys()]);
  const sortedIndices = [...affectedSteps].sort((a, b) => b - a);

  for (const stepIdx of sortedIndices) {
    let stepXml = xmlSteps[stepIdx].fullMatch;

    // Inject captures
    const captures = capturesByStep.get(stepIdx);
    if (captures && captures.length > 0) {
      const captureLines = captures.map(c =>
        `      <capture variable="state.${c.camelField}" source="response.data.${c.field}"/>`
      ).join("\n");

      if (stepXml.includes("</captures>")) {
        // Insert before closing </captures>
        stepXml = stepXml.replace("</captures>", `${captureLines}\n    </captures>`);
      } else {
        // Insert new <captures> block — after </body> or before </assertions> or before </step>
        const captureBlock = `    <captures>\n${captureLines}\n    </captures>\n`;
        if (stepXml.includes("</body>")) {
          stepXml = stepXml.replace("</body>", `</body>\n${captureBlock}`);
        } else if (stepXml.includes("<assertions>")) {
          stepXml = stepXml.replace("<assertions>", `${captureBlock}    <assertions>`);
        } else {
          stepXml = stepXml.replace("</step>", `${captureBlock}  </step>`);
        }
      }
    }

    // Inject body references
    const bodies = bodiesByStep.get(stepIdx);
    if (bodies && bodies.length > 0) {
      const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
      const cdataMatch = stepXml.match(cdataRe);
      if (cdataMatch) {
        const bodyText = cdataMatch[2];
        if (bodyText.trim().startsWith("{")) {
          const lastBrace = bodyText.lastIndexOf("}");
          if (lastBrace >= 0) {
            const additions = bodies
              .map(b => `  "${b.field}": "{{state.${b.camelField}}}"`)
              .join(",\n");
            const beforeBrace = bodyText.slice(0, lastBrace).trimEnd();
            const needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith("{") && !beforeBrace.endsWith(",");
            const separator = needsComma ? ",\n" : "\n";
            const newBody = beforeBrace + separator + additions + "\n" +
              bodyText.slice(lastBrace).trimStart();
            stepXml = stepXml.replace(cdataRe, `$1${newBody}$3`);
          }
        }
      }
    }

    // Replace the original step in the result
    const originalStep = xmlSteps[stepIdx].fullMatch;
    const pos = result.indexOf(originalStep);
    if (pos >= 0) {
      result = result.slice(0, pos) + stepXml + result.slice(pos + originalStep.length);
    }
  }

  return result;
}
