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
  responseExample: unknown | null;
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
      } else if (schemaRef && (schemaRef as Record<string, unknown>).type) {
        // Inline schema (no $ref) — use it directly
        schema = schemaRef as unknown as Record<string, unknown>;
        schemaName = (schema.title as string) ?? "inline";
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
  let responseExample: unknown | null = null;
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
        // Extract response example if available
        const examples = jsonResp.examples as Record<string, Record<string, unknown>> | undefined;
        if (examples) {
          const firstEx = Object.values(examples)[0];
          if (firstEx?.value) responseExample = firstEx.value;
        }
        if (!responseExample && jsonResp.example) {
          responseExample = jsonResp.example;
        }
      }
    }
  }

  return { method, path, summary, description, pathParams, requestBody, successStatus, responseKeyFields, responseExample };
}

function extractResponseKeyFields(
  schema: Record<string, unknown>,
  schemas: Record<string, unknown>,
  prefix: string,
  result: string[],
  depth: number,
): void {
  if (depth > 3) return; // Don't go too deep
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  for (const [name, def] of Object.entries(properties)) {
    const fieldPath = `${prefix}.${name}`;
    const type = extractFieldType(def, schemas);

    if (type === "array") {
      // For arrays, follow items.$ref to show item-level fields with [] notation
      const items = def.items as Record<string, unknown> | undefined;
      let itemSchema: Record<string, unknown> | null = null;
      if (items?.$ref) itemSchema = resolveRef(items.$ref as string, schemas);
      if (!itemSchema && items?.allOf) {
        for (const r of items.allOf as Record<string, string>[]) {
          if (r.$ref) { itemSchema = resolveRef(r.$ref, schemas); break; }
        }
      }
      if (itemSchema && depth < 2) {
        // Show array with item fields: response.data[].id, response.data[].name, etc.
        result.push(`${fieldPath} (array)`);
        extractResponseKeyFields(itemSchema, schemas, `${fieldPath}[]`, result, depth + 1);
      } else {
        result.push(`${fieldPath} (${type})`);
      }
    } else if (type === "object" || def.allOf || def.$ref) {
      // For nested objects, recurse if it's a $ref we can resolve
      let nested: Record<string, unknown> | null = null;
      if (def.$ref) nested = resolveRef(def.$ref as string, schemas);
      if (def.allOf) {
        for (const r of def.allOf as Record<string, string>[]) {
          if (r.$ref) { nested = resolveRef(r.$ref, schemas); break; }
        }
      }
      if (nested && depth < 2) {
        extractResponseKeyFields(nested, schemas, fieldPath, result, depth + 1);
      } else {
        result.push(`${fieldPath} (${type})`);
      }
    } else {
      result.push(`${fieldPath} (${type})`);
    }

    // Cap at 20 key fields (raised from 15 to accommodate array item fields)
    if (result.length >= 20) return;
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
    lines.push("For array fields marked with `[]`, use index syntax in captures: `response.data[0].id`, `response.data[1].id`, etc.");
    for (const f of ep.responseKeyFields.slice(0, 20)) {
      lines.push(`- \`${f}\``);
    }
  }

  // Response example — shows the EXACT structure the AI should use for captures
  if (ep.responseExample) {
    lines.push("");
    lines.push("### Example Response");
    const exStr = JSON.stringify(ep.responseExample, null, 2);
    // Cap at 60 lines to keep distillation compact
    const exLines = exStr.split("\n");
    const capped = exLines.length > 60 ? exLines.slice(0, 60).join("\n") + "\n  // ... truncated" : exStr;
    lines.push("```json");
    lines.push(capped);
    lines.push("```");
    lines.push("**Use the EXACT field paths from this example for captures — do NOT invent nested paths.**");
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

export function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Check if a field name matches any project variable (snake_case or camelCase). */
export function matchesProjectVariable(
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

export interface ItemSchema {
  parentField: string;
  requiredFields: string[];
  allFields: string[];
}

export interface SpecEndpoint {
  method: string;
  path: string;
  requiredRequestFields: string[];
  allRequestFields: string[];   // all field names from the request body table
  responseFields: string[];  // bare field names from response
  specFilePath: string | null;  // from ## filename.md header preceding the endpoint
  itemSchemas: ItemSchema[];    // from ### Array Item Schema sections
}

/** Normalize a path for comparison: replace all {param} with * */
export function normalizePath(p: string): string {
  return p.replace(/\{[^}]+\}/g, "*").toLowerCase();
}

/** Parse distilled spec sections into structured endpoint info. */
export function parseSpecEndpoints(distilledContext: string): SpecEndpoint[] {
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

  // Build a map from endpoint position to the preceding ## filename.md header
  const headerRe = /^## ([\w/.-]+\.md)\s*$/gm;
  const headers: { path: string; pos: number }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(distilledContext)) !== null) {
    headers.push({ path: hm[1], pos: hm.index });
  }

  const endpoints: SpecEndpoint[] = [];
  for (const sec of sections) {
    // Find the nearest preceding ## filename.md header
    let specFilePath: string | null = null;
    for (let h = headers.length - 1; h >= 0; h--) {
      if (headers[h].pos < sec.start) {
        specFilePath = headers[h].path;
        break;
      }
    }

    // Top-level required request fields (exclude per-item)
    const reqFields: string[] = [];
    const topReqRe = /\*\*REQUIRED FIELDS:\s*(.+?)\*\*/g;
    let rm: RegExpExecArray | null;
    while ((rm = topReqRe.exec(sec.text)) !== null) {
      const fields = rm[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
      reqFields.push(...fields);
    }

    // Per-item required fields (separate bucket)
    const itemSchemas: ItemSchema[] = [];
    const itemSchemaRe = /### Array Item Schema: `(\w+)`/g;
    let ism: RegExpExecArray | null;
    while ((ism = itemSchemaRe.exec(sec.text)) !== null) {
      const parentField = ism[1];
      const itemStart = ism.index;
      const nextSection = sec.text.indexOf("### ", itemStart + 1);
      const itemText = sec.text.slice(itemStart, nextSection > itemStart ? nextSection : undefined);

      const itemReqFields: string[] = [];
      const itemReqRe = /\*\*REQUIRED FIELDS \(per item\):\s*(.+?)\*\*/g;
      let irm: RegExpExecArray | null;
      while ((irm = itemReqRe.exec(itemText)) !== null) {
        const fields = irm[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
        itemReqFields.push(...fields);
      }

      const itemAllFields: string[] = [];
      const itemFieldRe = /\|\s*`(\w+)`\s*\|/g;
      let iaf: RegExpExecArray | null;
      while ((iaf = itemFieldRe.exec(itemText)) !== null) {
        if (!itemAllFields.includes(iaf[1])) itemAllFields.push(iaf[1]);
      }

      itemSchemas.push({ parentField, requiredFields: itemReqFields, allFields: itemAllFields });
    }

    // Also pick per-item fields into reqFields for backward compatibility
    // (existing post-processors expect them in requiredRequestFields)
    const perItemRe = /\*\*REQUIRED FIELDS \(per item\):\s*(.+?)\*\*/g;
    let pim: RegExpExecArray | null;
    while ((pim = perItemRe.exec(sec.text)) !== null) {
      const fields = pim[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
      for (const f of fields) {
        if (!reqFields.includes(f)) reqFields.push(f);
      }
    }

    // Also pick up from table rows (required fields marked **YES**) — only from Request Body section (not item schemas)
    const reqBodyStart = sec.text.indexOf("### Request Body");
    const firstItemSchema = sec.text.indexOf("### Array Item Schema");
    const reqBodyTableEnd = firstItemSchema > reqBodyStart ? firstItemSchema : sec.text.indexOf("### ", reqBodyStart + 1);
    const reqBodyTopSection = reqBodyStart >= 0
      ? sec.text.slice(reqBodyStart, reqBodyTableEnd > reqBodyStart ? reqBodyTableEnd : undefined)
      : "";
    if (reqBodyTopSection) {
      const tableRowRe = /\|\s*`(\w+)`\s*\|[^|]*\|\s*\*\*YES\*\*\s*\|/g;
      let tr: RegExpExecArray | null;
      while ((tr = tableRowRe.exec(reqBodyTopSection)) !== null) {
        if (!reqFields.includes(tr[1])) reqFields.push(tr[1]);
      }
    }

    // All request fields (any field in the request body table, required or not)
    const allFields: string[] = [];
    const allFieldRe = /\|\s*`(\w+)`\s*\|/g;
    let af: RegExpExecArray | null;
    // Only parse fields from the Request Body section (excluding item schemas)
    const reqBodySection = reqBodyStart >= 0
      ? sec.text.slice(reqBodyStart, reqBodyTableEnd > reqBodyStart ? reqBodyTableEnd : undefined)
      : "";
    if (reqBodySection) {
      while ((af = allFieldRe.exec(reqBodySection)) !== null) {
        if (!allFields.includes(af[1])) allFields.push(af[1]);
      }
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

    endpoints.push({
      method: sec.method, path: sec.path,
      requiredRequestFields: reqFields, allRequestFields: allFields,
      responseFields: respFields,
      specFilePath, itemSchemas,
    });
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

// ── Spec-Aware Required Field Injection ──────────────────────────────

const DEFAULT_TEST_VALUES: Record<string, string> = {
  title: "[TEST] {{timestamp}}",
  name: "[TEST] {{timestamp}}",
  content: "Test content - {{timestamp}}",
  description: "Test description",
  body: "Test body content",
  email: "test-{{timestamp}}@example.com",
  url: "https://example.com/test",
  slug: "test-{{timestamp}}",
};

/**
 * Common field name confusions the AI makes. When a required field is missing
 * but a similar-sounding wrong field is present, rename it instead of adding both.
 * Key = correct spec field name, value = wrong names the AI commonly substitutes.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  title: ["name", "article_name", "article_title"],
  name: ["title", "category_name", "category_title"],
  content: ["body", "html_content", "text"],
  body: ["content", "html_body"],
  description: ["summary", "desc"],
};

/**
 * Deterministic post-processor: for each POST/PUT/PATCH step, read the
 * matching spec's REQUIRED fields and inject any that the AI omitted.
 *
 * Unlike `injectMissingRequiredFields` (which only handles ID/version fields),
 * this handles ALL required fields including entity-specific ones like `title`.
 */
export function injectSpecRequiredFields(
  xml: string,
  specContext: string,
  projectVariables: { name: string; value: string }[],
): string {
  if (!specContext) return xml;
  const specEndpoints = parseSpecEndpoints(specContext);
  if (specEndpoints.length === 0) return xml;
  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  let result = xml;
  const injections: { stepIdx: number; field: string; value: string }[] = [];
  const renames: { stepIdx: number; wrongField: string; correctField: string }[] = [];

  for (let i = 0; i < xmlSteps.length; i++) {
    const step = xmlSteps[i];
    if (!["POST", "PUT", "PATCH"].includes(step.method)) continue;
    const normStep = normalizePath(step.path);
    const spec = specEndpoints.find(ep =>
      ep.method === step.method && normalizePath(ep.path) === normStep
    );
    if (!spec || spec.requiredRequestFields.length === 0) continue;
    const cdataBody = step.fullMatch.match(/<body><!\[CDATA\[([\s\S]*?)\]\]><\/body>/)?.[1] ?? "";
    if (!cdataBody.trim().startsWith("{")) continue;

    // Collect all field names actually present in the body
    const bodyFieldNames = new Set<string>();
    const fieldNameRe = /"(\w+)"\s*:/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldNameRe.exec(cdataBody)) !== null) {
      bodyFieldNames.add(fm[1]);
    }

    for (const field of spec.requiredRequestFields) {
      if (cdataBody.includes(`"${field}"`)) continue;
      if (/^project_id$/i.test(field)) continue;

      // Check if the AI used a wrong alias for this field (e.g., "name" instead of "title")
      const aliases = FIELD_ALIASES[field];
      const wrongField = aliases?.find(a => bodyFieldNames.has(a));
      if (wrongField) {
        // Rename the wrong field to the correct one instead of adding both
        renames.push({ stepIdx: i, wrongField, correctField: field });
        continue;
      }

      let value: string;
      const camel = toCamelCase(field);
      const matchedVar = projectVariables.find(v =>
        v.name === field || v.name === camel ||
        v.name.toLowerCase() === field.toLowerCase() ||
        v.name.toLowerCase() === camel.toLowerCase()
      );
      if (matchedVar) {
        value = `{{proj.${matchedVar.name}}}`;
      } else if (result.includes(`state.${camel}`) || result.includes(`state.${field}`)) {
        value = `{{state.${camel}}}`;
      } else if (DEFAULT_TEST_VALUES[field]) {
        value = DEFAULT_TEST_VALUES[field];
      } else {
        value = `test-${field}-{{timestamp}}`;
      }
      injections.push({ stepIdx: i, field, value });
    }
  }

  if (injections.length === 0 && renames.length === 0) return xml;
  if (renames.length > 0) {
    console.log(`[injectSpecRequiredFields] Renaming ${renames.length} wrong field names:`,
      renames.map(r => `step ${r.stepIdx}: "${r.wrongField}" → "${r.correctField}"`).join(", "));
  }
  if (injections.length > 0) {
    console.log(`[injectSpecRequiredFields] Injecting ${injections.length} missing required fields:`,
      injections.map(j => `step ${j.stepIdx}: ${j.field}=${j.value}`).join(", "));
  }

  // Apply renames first (replace wrong field names with correct ones)
  for (const r of renames) {
    let stepXml = xmlSteps[r.stepIdx].fullMatch;
    // Replace the field name inside the CDATA body JSON
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (cdataMatch) {
      const newBody = cdataMatch[2].replace(
        new RegExp(`"${r.wrongField}"(\\s*:)`, "g"),
        `"${r.correctField}"$1`,
      );
      stepXml = stepXml.replace(cdataRe, `$1${newBody}$3`);
      const pos = result.indexOf(xmlSteps[r.stepIdx].fullMatch);
      if (pos >= 0) {
        result = result.slice(0, pos) + stepXml + result.slice(pos + xmlSteps[r.stepIdx].fullMatch.length);
        // Update the stored fullMatch so subsequent operations see the renamed version
        xmlSteps[r.stepIdx] = { ...xmlSteps[r.stepIdx], fullMatch: stepXml };
      }
    }
  }

  const byStep = new Map<number, typeof injections>();
  for (const inj of injections) {
    const list = byStep.get(inj.stepIdx) ?? [];
    list.push(inj);
    byStep.set(inj.stepIdx, list);
  }
  const sortedSteps = [...byStep.keys()].sort((a, b) => b - a);
  for (const stepIdx of sortedSteps) {
    const fields = byStep.get(stepIdx)!;
    let stepXml = xmlSteps[stepIdx].fullMatch;
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (!cdataMatch) continue;
    const bodyText = cdataMatch[2];
    const lastBrace = bodyText.lastIndexOf("}");
    if (lastBrace < 0) continue;
    const additions = fields.map(f => `  "${f.field}": "${f.value}"`).join(",\n");
    const beforeBrace = bodyText.slice(0, lastBrace).trimEnd();
    const needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith("{") && !beforeBrace.endsWith(",");
    const separator = needsComma ? ",\n" : "\n";
    const newBody = beforeBrace + separator + additions + "\n" + bodyText.slice(lastBrace).trimStart();
    stepXml = stepXml.replace(cdataRe, `$1${newBody}$3`);
    const pos = result.indexOf(xmlSteps[stepIdx].fullMatch);
    if (pos >= 0) {
      result = result.slice(0, pos) + stepXml + result.slice(pos + xmlSteps[stepIdx].fullMatch.length);
    }
  }
  return result;
}

// ── Strip Extra Request Fields ───────────────────────────────────────

/**
 * Post-processor: for PATCH/PUT steps where we can match a spec endpoint,
 * remove any request body fields that are NOT in the spec's request schema.
 * This catches the common AI mistake of copying create-only fields (e.g.
 * workspace_id) into update step bodies.
 */
export function stripExtraRequestFields(
  xml: string,
  specContext: string,
): string {
  if (!specContext) return xml;
  const specEndpoints = parseSpecEndpoints(specContext);
  if (specEndpoints.length === 0) return xml;
  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  let result = xml;
  const removals: { stepIdx: number; field: string }[] = [];

  for (let i = 0; i < xmlSteps.length; i++) {
    const step = xmlSteps[i];
    if (!["POST", "PATCH", "PUT"].includes(step.method)) continue;
    const normStep = normalizePath(step.path);
    const spec = specEndpoints.find(ep =>
      ep.method === step.method && normalizePath(ep.path) === normStep
    );
    // Only strip if we have a known set of allowed fields from the spec
    if (!spec || spec.allRequestFields.length === 0) continue;

    const cdataMatch = step.fullMatch.match(/<body><!\[CDATA\[([\s\S]*?)\]\]><\/body>/);
    if (!cdataMatch) continue;
    const bodyText = cdataMatch[1];
    if (!bodyText.trim().startsWith("{")) continue;

    const allowedSet = new Set(spec.allRequestFields);
    const fieldRe = /"(\w+)"\s*:/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(bodyText)) !== null) {
      if (!allowedSet.has(fm[1])) {
        removals.push({ stepIdx: i, field: fm[1] });
      }
    }
  }

  if (removals.length === 0) return xml;

  console.log(`[stripExtraRequestFields] Removing ${removals.length} extra fields:`,
    removals.map(r => `step ${r.stepIdx}: "${r.field}"`).join(", "));

  // Group by step and remove fields from JSON body
  const byStep = new Map<number, string[]>();
  for (const r of removals) {
    const list = byStep.get(r.stepIdx) ?? [];
    list.push(r.field);
    byStep.set(r.stepIdx, list);
  }

  // Process in reverse order so positions remain valid
  const sortedSteps = [...byStep.keys()].sort((a, b) => b - a);
  for (const stepIdx of sortedSteps) {
    const fieldsToRemove = byStep.get(stepIdx)!;
    let stepXml = xmlSteps[stepIdx].fullMatch;
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (!cdataMatch) continue;

    let bodyJson = cdataMatch[2];
    for (const field of fieldsToRemove) {
      // Remove the field line including trailing comma handling
      // Pattern: optional leading comma/whitespace, "field": value, optional trailing comma
      bodyJson = bodyJson.replace(
        new RegExp(`\\s*"${field}"\\s*:\\s*(?:"[^"]*"|\\{[^}]*\\}|\\[[^\\]]*\\]|[^,}\\]]+)\\s*,?`, "g"),
        "",
      );
    }
    // Fix potential trailing comma before closing brace
    bodyJson = bodyJson.replace(/,(\s*})/, "$1");

    stepXml = stepXml.replace(cdataRe, `$1${bodyJson}$3`);
    const pos = result.indexOf(xmlSteps[stepIdx].fullMatch);
    if (pos >= 0) {
      result = result.slice(0, pos) + stepXml + result.slice(pos + xmlSteps[stepIdx].fullMatch.length);
    }
  }

  return result;
}

// ── Endpoint Ref Injection ────────────────────────────────────────────

/**
 * Deterministic post-processor: for each step that has a method+path matching
 * a spec file in the context, inject `<endpointRef>` if missing, or correct
 * hallucinated endpointRefs that point to non-existent spec files.
 *
 * Spec context headers look like: `## V3/articles/create-projects-articles.md`
 * Distilled endpoints look like:  `## Endpoint: POST /v3/projects/{project_id}/articles`
 *
 * We build a map from (method, normalizedPath) → spec file name, then match
 * each XML step against it. Steps with existing endpointRefs that don't match
 * any known spec file are treated as hallucinated and replaced.
 */
export function injectEndpointRefs(xml: string, specContext: string): string {
  if (!specContext) return xml;

  // Build map: (METHOD, normalizedPath) → spec file name
  // Spec context has sections like "## V3/articles/create-projects-articles.md"
  // followed by distilled content with "## Endpoint: POST /v3/projects/{project_id}/articles"
  const fileHeaderRe = /^## ([\w/.-]+\.md)\s*$/gm;
  const endpointHeaderRe = /## Endpoint: (GET|POST|PUT|PATCH|DELETE) (\S+)/g;

  // First, collect all file names with their positions
  const fileHeaders: { name: string; pos: number }[] = [];
  let fh: RegExpExecArray | null;
  while ((fh = fileHeaderRe.exec(specContext)) !== null) {
    fileHeaders.push({ name: fh[1], pos: fh.index });
  }

  // Then collect all endpoint headers with their positions
  // Store all candidates per key to handle collisions (e.g., create.md and create-bulk.md
  // both containing POST for the same path)
  const endpointMap = new Map<string, string[]>(); // "METHOD|normalizedPath" → file names
  let eh: RegExpExecArray | null;
  while ((eh = endpointHeaderRe.exec(specContext)) !== null) {
    const method = eh[1];
    const path = eh[2];
    const normPath = normalizePath(path);
    // Find which file section this endpoint belongs to (closest file header before it)
    let fileName = "";
    for (const fhdr of fileHeaders) {
      if (fhdr.pos < eh.index) fileName = fhdr.name;
      else break;
    }
    if (fileName) {
      const key = `${method}|${normPath}`;
      const existing = endpointMap.get(key) ?? [];
      existing.push(fileName);
      endpointMap.set(key, existing);
    }
  }

  console.log(`[injectEndpointRefs] fileHeaders: ${fileHeaders.map(h => h.name).join(", ")}`);
  console.log(`[injectEndpointRefs] endpointMap (${endpointMap.size}):`,
    Array.from(endpointMap.entries()).map(([k, v]) => `${k} → ${v.join(", ")}`).join(" | "));

  if (endpointMap.size === 0) return xml;

  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  let result = xml;
  let injected = 0;

  // Collect known spec file names for validation
  const knownFiles = new Set(fileHeaders.map((fh) => fh.name));

  // Process in reverse to preserve string offsets
  for (let i = xmlSteps.length - 1; i >= 0; i--) {
    const step = xmlSteps[i];

    const normStepPath = normalizePath(step.path);
    const exactKey = `${step.method}|${normStepPath}`;
    let candidates = endpointMap.get(exactKey);

    // Check if step already has an endpointRef
    const existingRefMatch = step.fullMatch.match(/<endpointRef>([^<]+)<\/endpointRef>/);
    if (existingRefMatch) {
      const existingRef = existingRefMatch[1].trim();
      // Validate the existing ref is correct: must be a known file AND must be
      // one of the candidates for this step's method+path. A known file that
      // maps to a different endpoint (e.g., create.md on a PATCH step) is wrong.
      const isValidForStep = candidates?.includes(existingRef) ?? false;
      if (knownFiles.has(existingRef) && isValidForStep) continue;
      // Otherwise it's wrong — we'll replace it below
      console.log(`[injectEndpointRefs] Wrong endpointRef: "${existingRef}" for ${step.method} ${step.path} — will correct`);
    }

    // Fuzzy fallback: match by method + path suffix (last 2 segments after normalization).
    // Handles cases where the AI uses a slightly different path prefix
    // (e.g., /v3/projects/*/categories vs /v3/projects/*/workspaces/*/categories)
    if (!candidates) {
      const stepSuffix = extractPathSuffix(normStepPath, 2);
      if (stepSuffix) {
        for (const [mapKey, mapFiles] of endpointMap) {
          const [mapMethod, mapPath] = mapKey.split("|", 2);
          if (mapMethod !== step.method) continue;
          if (extractPathSuffix(mapPath, 2) === stepSuffix) {
            candidates = mapFiles;
            console.log(`[injectEndpointRefs] Fuzzy match: step ${step.method} ${step.path} → ${mapFiles.join(", ")} (suffix: ${stepSuffix})`);
            break;
          }
        }
      }
    }

    if (!candidates || candidates.length === 0) continue;

    // Pick the best file from candidates when there are collisions
    const fileName = pickBestEndpointFile(candidates, step);

    let newStepXml: string;

    if (existingRefMatch) {
      // Replace the wrong endpointRef with the correct one
      newStepXml = step.fullMatch.replace(
        /<endpointRef>[^<]+<\/endpointRef>/,
        `<endpointRef>${fileName}</endpointRef>`,
      );
      console.log(`[injectEndpointRefs] Corrected endpointRef: "${existingRefMatch[1].trim()}" → "${fileName}"`);
    } else {
      // Insert <endpointRef> after <name>...</name>
      const nameCloseIdx = step.fullMatch.indexOf("</name>");
      if (nameCloseIdx < 0) continue;

      const insertPos = nameCloseIdx + "</name>".length;
      const indent = "      "; // match typical step child indentation
      const refElement = `\n${indent}<endpointRef>${fileName}</endpointRef>`;
      newStepXml = step.fullMatch.slice(0, insertPos) + refElement + step.fullMatch.slice(insertPos);
    }

    const pos = result.indexOf(step.fullMatch);
    if (pos >= 0) {
      result = result.slice(0, pos) + newStepXml + result.slice(pos + step.fullMatch.length);
      injected++;
    }
  }

  if (injected > 0) {
    console.log(`[injectEndpointRefs] Injected/corrected ${injected} <endpointRef> elements`);
  }

  return result;
}

/**
 * When multiple spec files map to the same METHOD|path key (e.g., create.md
 * and create-categories-bulk.md both contain POST /categories), pick the best one.
 * Prefers non-bulk, shorter/simpler filenames for single-object steps.
 */
function pickBestEndpointFile(candidates: string[], step: { fullMatch: string }): string {
  if (candidates.length === 1) return candidates[0];

  // For single-object bodies (no JSON array), prefer non-bulk files
  const bodyLooksLikeArray = /\[\s*\{/.test(step.fullMatch);
  if (!bodyLooksLikeArray) {
    const nonBulk = candidates.filter(f => !f.toLowerCase().includes("bulk"));
    if (nonBulk.length > 0) {
      // Among non-bulk, prefer shorter filename (create.md over create-categories.md)
      return nonBulk.sort((a, b) => a.length - b.length)[0];
    }
  }

  // Default: prefer shorter/simpler filename
  return candidates.sort((a, b) => a.length - b.length)[0];
}

/** Extract the last N segments of a normalized path for fuzzy matching. */
function extractPathSuffix(normPath: string, segments: number): string | null {
  const parts = normPath.split("/").filter(Boolean);
  if (parts.length < segments) return null;
  return parts.slice(-segments).join("/");
}

// ── Capture Validation ───────────────────────────────────────────────

/**
 * Deterministic post-processor: validate that each step's <capture> elements
 * only reference fields that actually exist in the matched spec's response
 * schema. Removes hallucinated captures (e.g., capturing version_number from
 * a create endpoint that only returns id, name, order).
 *
 * Only validates steps whose method+path match a spec endpoint in the context.
 * Steps without a matching spec (setup/teardown) are left untouched.
 */
export function validateCaptures(xml: string, specContext: string): string {
  if (!specContext) return xml;

  const specEndpoints = parseSpecEndpoints(specContext);
  if (specEndpoints.length === 0) return xml;

  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  let result = xml;
  let removed = 0;

  // Process in reverse to preserve string offsets
  for (let i = xmlSteps.length - 1; i >= 0; i--) {
    const step = xmlSteps[i];
    const normStepPath = normalizePath(step.path);

    // Match step to spec endpoint (exact then fuzzy)
    let spec = specEndpoints.find(ep =>
      ep.method === step.method && normalizePath(ep.path) === normStepPath
    );
    if (!spec) {
      const stepSuffix = extractPathSuffix(normStepPath, 2);
      if (stepSuffix) {
        spec = specEndpoints.find(ep =>
          ep.method === step.method && extractPathSuffix(normalizePath(ep.path), 2) === stepSuffix
        );
      }
    }

    // No spec match — can't validate, leave untouched
    if (!spec || spec.responseFields.length === 0) continue;

    // Find all capture elements in this step
    const captureRe = /<capture\s+variable="state\.(\w+)"\s+source="response\.(?:data\.)?(\w+)"[^/]*\/>/g;
    const badCaptures: string[] = [];
    let cm: RegExpExecArray | null;
    const stepXml = step.fullMatch;
    while ((cm = captureRe.exec(stepXml)) !== null) {
      const sourceField = cm[2]; // e.g. "version_number"
      // Check if this field exists in the spec's response fields
      if (!spec.responseFields.includes(sourceField)) {
        badCaptures.push(cm[0]);
        console.log(`[validateCaptures] Removing hallucinated capture: state.${cm[1]} from response.data.${sourceField} (step: ${step.method} ${step.path}, available: ${spec.responseFields.join(", ")})`);
      }
    }

    if (badCaptures.length === 0) continue;

    // Remove bad captures from the step XML
    let newStepXml = stepXml;
    for (const bad of badCaptures) {
      // Remove the capture line (including leading whitespace and trailing newline)
      newStepXml = newStepXml.replace(new RegExp(`\\s*${escapeRegex(bad)}\\s*\n?`), "\n");
      removed++;
    }

    // If <captures> is now empty, remove the entire block
    newStepXml = newStepXml.replace(/\s*<captures>\s*<\/captures>\s*/g, "\n");

    const pos = result.indexOf(stepXml);
    if (pos >= 0) {
      result = result.slice(0, pos) + newStepXml + result.slice(pos + stepXml.length);
    }
  }

  if (removed > 0) {
    console.log(`[validateCaptures] Removed ${removed} hallucinated capture(s)`);
  }

  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Rules-Aware Field Injection ──────────────────────────────────────

/**
 * Parse skills/rules text for field requirements tied to endpoints.
 * Looks for patterns like:
 *   - `field_name` — in lesson lines mentioning specific endpoints
 *   - **POST /v3/.../publish** — missing_field: `workspace_id`
 *
 * Returns a map from normalizedPath → Set of field names.
 */
function parseRulesFieldRequirements(
  rulesText: string,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  if (!rulesText) return result;

  // Parse lessons: lines like "- **POST /v3/.../endpoint** — category: `field_name`. description"
  // Also match: "- **endpoint** — ...: `field1`, `field2`..."
  const lessonRe = /\*\*(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?(\S*\/\S+)\*\*[^`]*(`\w+`(?:\s*,\s*`\w+`)*)/gi;
  let m: RegExpExecArray | null;
  while ((m = lessonRe.exec(rulesText)) !== null) {
    const endpointPath = m[1];
    const fieldsStr = m[2];
    const fields = fieldsStr.match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
    if (fields.length === 0) continue;

    const norm = normalizePath(endpointPath);
    if (!result.has(norm)) result.set(norm, new Set());
    for (const f of fields) result.get(norm)!.add(f);
  }

  return result;
}

/**
 * Post-processor: inject fields that are mentioned in skills/rules lessons
 * but missing from step request bodies. Only injects when a matching project
 * variable exists (safe — we know the field is meant to come from a variable).
 */
export function injectRulesRequiredFields(
  xml: string,
  rulesText: string,
  projectVariables: { name: string; value: string }[],
): string {
  if (!rulesText || projectVariables.length === 0) return xml;

  const rulesFields = parseRulesFieldRequirements(rulesText);
  if (rulesFields.size === 0) return xml;

  console.log(`[injectRulesRequiredFields] Parsed ${rulesFields.size} endpoint field rules:`,
    [...rulesFields.entries()].map(([k, v]) => `${k}: ${[...v].join(",")}`).join(" | "));

  const xmlSteps = parseXmlSteps(xml);
  if (xmlSteps.length === 0) return xml;

  let result = xml;
  const injections: { stepIdx: number; field: string; value: string }[] = [];

  for (let i = 0; i < xmlSteps.length; i++) {
    const step = xmlSteps[i];
    if (!["POST", "PUT", "PATCH"].includes(step.method)) continue;

    const normStep = normalizePath(step.path);
    const ruleFieldSet = rulesFields.get(normStep);
    if (!ruleFieldSet) continue;

    const cdataBody = step.fullMatch.match(/<body><!\[CDATA\[([\s\S]*?)\]\]><\/body>/)?.[1] ?? "";
    if (!cdataBody.trim().startsWith("{")) continue;

    for (const field of ruleFieldSet) {
      if (cdataBody.includes(`"${field}"`)) continue;
      // Only inject if a matching project variable exists
      const camel = toCamelCase(field);
      const matchedVar = projectVariables.find(v =>
        v.name === field || v.name === camel ||
        v.name.toLowerCase() === field.toLowerCase() ||
        v.name.toLowerCase() === camel.toLowerCase()
      );
      if (!matchedVar) continue;
      injections.push({ stepIdx: i, field, value: `{{proj.${matchedVar.name}}}` });
    }
  }

  if (injections.length === 0) return xml;

  console.log(`[injectRulesRequiredFields] Injecting ${injections.length} fields from rules:`,
    injections.map(inj => `step ${inj.stepIdx}: "${inj.field}" = "${inj.value}"`).join(", "));

  // Group by step and inject
  const byStep = new Map<number, typeof injections>();
  for (const inj of injections) {
    const list = byStep.get(inj.stepIdx) ?? [];
    list.push(inj);
    byStep.set(inj.stepIdx, list);
  }

  for (const stepIdx of [...byStep.keys()].sort((a, b) => b - a)) {
    const fields = byStep.get(stepIdx)!;
    let stepXml = xmlSteps[stepIdx].fullMatch;
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (!cdataMatch) continue;
    const bodyText = cdataMatch[2];
    const lastBrace = bodyText.lastIndexOf("}");
    if (lastBrace < 0) continue;
    const additions = fields.map(f => `  "${f.field}": "${f.value}"`).join(",\n");
    const beforeBrace = bodyText.slice(0, lastBrace).trimEnd();
    const needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith("{") && !beforeBrace.endsWith(",");
    const separator = needsComma ? ",\n" : "\n";
    const newBody = beforeBrace + separator + additions + "\n" + bodyText.slice(lastBrace).trimStart();
    stepXml = stepXml.replace(cdataRe, `$1${newBody}$3`);
    const pos = result.indexOf(xmlSteps[stepIdx].fullMatch);
    if (pos >= 0) {
      result = result.slice(0, pos) + stepXml + result.slice(pos + xmlSteps[stepIdx].fullMatch.length);
    }
  }

  return result;
}
