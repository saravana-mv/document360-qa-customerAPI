/**
 * Parse OpenAPI JSON blocks inside spec markdown files and extract
 * request body required fields + all properties for each endpoint.
 * Returns a human-readable summary the AI can use without digging
 * through raw JSON.
 */
export function extractRequiredFieldsSummary(specContext: string): string {
  // Match JSON blocks that contain OpenAPI specs
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

  return buildResult(summaries);
}

/**
 * Extract just the common required field names (excluding generic ones like "name"/"title").
 * Returns an array like ["project_version_id", "status"] that callers can inject into prompts.
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

function buildResult(summaries: string[]): string {

  // Collect fields that appear as required across multiple endpoints — these
  // are cross-cutting requirements that should be included in ALL POST/PUT
  // bodies, including prerequisite/dependency steps that have no spec.
  const fieldFrequency: Record<string, number> = {};
  for (const summary of summaries) {
    const reqMatch = summary.match(/\*\*Required fields\*\*: (.+)/);
    if (reqMatch) {
      const fields = reqMatch[1].match(/`(\w+)`/g)?.map(f => f.replace(/`/g, "")) ?? [];
      for (const f of fields) {
        fieldFrequency[f] = (fieldFrequency[f] || 0) + 1;
      }
    }
  }
  // Fields appearing in any spec are likely needed for related endpoints too
  const commonFields = Object.entries(fieldFrequency)
    .filter(([name]) => !["name", "title"].includes(name)) // Skip generic field names
    .map(([name]) => `\`${name}\``);

  let crossNote = "";
  if (commonFields.length > 0) {
    crossNote = "\n\n### Common Required Fields for Prerequisite Steps\n\n" +
      "When creating **prerequisite/dependency steps** (e.g., creating a parent category before creating articles), " +
      "the endpoint may not have a spec file in the context. In that case, include these fields that are " +
      "commonly required across this API: " + commonFields.join(", ") + ".\n" +
      "Use project variables (`{{proj.X}}`) or state variables (`{{state.X}}`) for their values.";
  }

  return "\n\n# Request Body Required Fields Summary\n\n" +
    "**IMPORTANT**: The following required fields were extracted from the API spec schemas. " +
    "You MUST include ALL fields marked as **YES** in the `<body>` CDATA of the corresponding steps.\n\n" +
    summaries.join("\n\n") + crossNote;
}
