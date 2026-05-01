/**
 * Step Context Builder — pre-computes a structured per-step context
 * that maps each idea step to its spec file and extracts key schema info.
 *
 * This supplements the flat spec dump with an explicit "cheat sheet" so
 * the AI can follow it precisely instead of pattern-matching steps to specs.
 */

import {
  parseSpecEndpoints,
  normalizePath,
  toCamelCase,
  matchesProjectVariable,
  SpecEndpoint,
  ItemSchema,
} from "./specRequiredFields";

// ── Types ────────────────────────────────────────────────────────────

export interface FieldHint {
  name: string;
  type: string;
  required: boolean;
  valueSource: string; // e.g. "{{proj.projectVersionId}}", "{{state.categoryId}}", literal
}

export interface CaptureHint {
  field: string;       // response field to capture (e.g. "id")
  stateVar: string;    // state variable name (e.g. "categoryId")
  neededBy: number[];  // step numbers that consume this
}

export interface StepContextEntry {
  stepNumber: number;
  method: string;
  path: string;
  resource: string;
  purpose: "primary" | "prerequisite" | "teardown";
  specFile: string | null;
  matchedEndpoint: SpecEndpoint | null;
  requiredBodyFields: FieldHint[];
  itemSchema: { parentField: string; requiredFields: FieldHint[] } | null;
  responseCaptures: CaptureHint[];
  pathParamHints: { name: string; value: string }[];
  notes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract (method, path) from an idea step string like "POST /v3/projects/{project_id}/articles" */
function parseIdeaStep(step: string): { method: string; path: string } | null {
  const m = step.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (!m) return null;
  return { method: m[1].toUpperCase(), path: m[2] };
}

/** Extract the primary resource name from a path (e.g. "/v3/projects/{id}/articles" → "articles") */
function extractResource(path: string): string {
  const segments = path.split("/").filter(
    s => s && !s.startsWith("{") && !/^v\d+$/i.test(s) && s !== "projects",
  );
  // Return the last non-param segment (the most specific resource)
  return segments[segments.length - 1] ?? "";
}

/** Parse field type from distilled spec table row: | `name` | string | **YES** | desc | */
function parseFieldTable(specText: string, sectionHeader: string): { name: string; type: string; required: boolean }[] {
  const fields: { name: string; type: string; required: boolean }[] = [];
  const start = specText.indexOf(sectionHeader);
  if (start < 0) return fields;

  // Find the next ### section boundary
  const nextSection = specText.indexOf("### ", start + sectionHeader.length);
  const section = specText.slice(start, nextSection > start ? nextSection : undefined);

  const rowRe = /\|\s*`(\w+)`\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section)) !== null) {
    const name = m[1];
    const type = m[2].trim();
    const required = m[3].includes("**YES**");
    fields.push({ name, type, required });
  }
  return fields;
}

/** Find the matching project variable for a field name. Returns the proj var name or null. */
function findMatchingProjVar(
  fieldName: string,
  projVars: { name: string; value: string }[],
): string | null {
  const camel = toCamelCase(fieldName);
  const lower = fieldName.toLowerCase();
  const camelLower = camel.toLowerCase();
  return projVars.find(v => {
    const vl = v.name.toLowerCase();
    return vl === lower || vl === camelLower;
  })?.name ?? null;
}

// ── Core ─────────────────────────────────────────────────────────────

/**
 * Build structured per-step context for the AI, mapping each idea step
 * to its spec endpoint and extracting field/capture hints.
 */
export function buildStepContext(
  ideaSteps: string[],
  specContext: string,
  specFiles: string[],
  projVars: { name: string; value: string }[],
): StepContextEntry[] {
  const specEndpoints = parseSpecEndpoints(specContext);

  // Build a lookup: normPath → SpecEndpoint (for matching)
  const epByNormPath = new Map<string, SpecEndpoint>();
  for (const ep of specEndpoints) {
    const key = `${ep.method}:${normalizePath(ep.path)}`;
    epByNormPath.set(key, ep);
  }

  // Parse idea steps
  const parsedSteps = ideaSteps.map((step, i) => {
    const parsed = parseIdeaStep(step);
    return {
      stepNumber: i + 1,
      raw: step,
      method: parsed?.method ?? "GET",
      path: parsed?.path ?? step,
      resource: parsed ? extractResource(parsed.path) : "",
    };
  });

  // Determine the "primary" resources from the idea (non-DELETE, non-prereq resource(s))
  const resourceCounts = new Map<string, number>();
  for (const s of parsedSteps) {
    if (s.resource) {
      resourceCounts.set(s.resource, (resourceCounts.get(s.resource) || 0) + 1);
    }
  }

  // Primary resource = most frequently referenced (heuristic)
  let primaryResource = "";
  let maxCount = 0;
  for (const [r, c] of resourceCounts) {
    if (c > maxCount) { maxCount = c; primaryResource = r; }
  }

  const totalSteps = parsedSteps.length;
  const entries: StepContextEntry[] = [];

  // First pass: build entries with spec matching and purpose classification
  for (const step of parsedSteps) {
    const normKey = `${step.method}:${normalizePath(step.path)}`;
    const matched = epByNormPath.get(normKey) ?? null;

    // Classify purpose
    let purpose: "primary" | "prerequisite" | "teardown";
    if (step.method === "DELETE") {
      purpose = "teardown";
    } else if (step.resource === primaryResource) {
      purpose = "primary";
    } else if (step.stepNumber <= Math.ceil(totalSteps / 2)) {
      purpose = "prerequisite";
    } else {
      purpose = "primary";
    }

    entries.push({
      stepNumber: step.stepNumber,
      method: step.method,
      path: step.path,
      resource: step.resource,
      purpose,
      specFile: matched?.specFilePath ?? null,
      matchedEndpoint: matched,
      requiredBodyFields: [],
      itemSchema: null,
      responseCaptures: [],
      pathParamHints: [],
      notes: [],
    });
  }

  // Second pass: build field hints for steps with matched specs
  for (const entry of entries) {
    const ep = entry.matchedEndpoint;

    if (ep) {
      // Parse the field table from the spec section for type info
      const epSection = findEndpointSection(specContext, ep.method, ep.path);
      const fieldTable = epSection ? parseFieldTable(epSection, "### Request Body") : [];
      const fieldTypeMap = new Map(fieldTable.map(f => [f.name, f]));

      // Build required body field hints
      for (const fieldName of ep.requiredRequestFields) {
        const typeInfo = fieldTypeMap.get(fieldName);
        const type = typeInfo?.type ?? "string";
        const required = typeInfo?.required ?? true;

        const hint: FieldHint = {
          name: fieldName,
          type,
          required,
          valueSource: resolveFieldValue(fieldName, entry, entries, projVars),
        };
        entry.requiredBodyFields.push(hint);
      }

      // Build item schema hints
      if (ep.itemSchemas.length > 0) {
        const itemSch = ep.itemSchemas[0]; // take first
        const itemFields: FieldHint[] = [];
        for (const fieldName of itemSch.requiredFields) {
          itemFields.push({
            name: fieldName,
            type: "string",
            required: true,
            valueSource: resolveFieldValue(fieldName, entry, entries, projVars),
          });
        }
        entry.itemSchema = { parentField: itemSch.parentField, requiredFields: itemFields };
      }
    } else if (["POST", "PUT", "PATCH"].includes(entry.method)) {
      // No spec — add note
      entry.notes.push("No spec available — construct body with common required fields and IDs from prior steps");
    }

    // Build path param hints
    const pathParams = entry.path.match(/\{(\w+)\}/g) ?? [];
    for (const param of pathParams) {
      const paramName = param.replace(/[{}]/g, "");
      if (/^project_id$/i.test(paramName)) {
        entry.pathParamHints.push({ name: paramName, value: "{{proj.projectId}}" });
      } else {
        // Look for a matching state variable from earlier steps
        const source = findStateSource(paramName, entry, entries);
        entry.pathParamHints.push({ name: paramName, value: source });
      }
    }
  }

  // Third pass: build capture hints (which fields to capture from each step's response)
  for (const producerEntry of entries) {
    const ep = producerEntry.matchedEndpoint;
    if (!ep || ep.responseFields.length === 0) continue;

    for (const respField of ep.responseFields) {
      // Check if any downstream step needs this field
      const consumers: number[] = [];
      for (const consumerEntry of entries) {
        if (consumerEntry.stepNumber <= producerEntry.stepNumber) continue;

        // Check body fields
        for (const fh of consumerEntry.requiredBodyFields) {
          if (fieldMatchesResponse(fh.name, respField, producerEntry.resource)) {
            consumers.push(consumerEntry.stepNumber);
          }
        }
        // Check item schema fields
        if (consumerEntry.itemSchema) {
          for (const fh of consumerEntry.itemSchema.requiredFields) {
            if (fieldMatchesResponse(fh.name, respField, producerEntry.resource)) {
              consumers.push(consumerEntry.stepNumber);
            }
          }
        }
        // Check path params
        for (const ph of consumerEntry.pathParamHints) {
          if (paramMatchesResponse(ph.name, respField, producerEntry.resource)) {
            consumers.push(consumerEntry.stepNumber);
          }
        }
      }

      if (consumers.length > 0 || respField === "id") {
        const stateVar = buildStateVarName(respField, producerEntry.resource);
        producerEntry.responseCaptures.push({
          field: respField,
          stateVar,
          neededBy: [...new Set(consumers)],
        });
      }
    }

    // Always capture `id` if not already captured
    if (!producerEntry.responseCaptures.some(c => c.field === "id") && ep.responseFields.includes("id")) {
      // Already handled above
    } else if (!producerEntry.responseCaptures.some(c => c.field === "id") && producerEntry.method === "POST") {
      producerEntry.responseCaptures.unshift({
        field: "id",
        stateVar: buildStateVarName("id", producerEntry.resource),
        neededBy: [],
      });
    }
  }

  // Fourth pass: update field value sources now that captures are known
  for (const entry of entries) {
    for (const fh of entry.requiredBodyFields) {
      if (fh.valueSource === "?") {
        fh.valueSource = resolveFieldValue(fh.name, entry, entries, projVars);
      }
    }
    if (entry.itemSchema) {
      for (const fh of entry.itemSchema.requiredFields) {
        if (fh.valueSource === "?") {
          fh.valueSource = resolveFieldValue(fh.name, entry, entries, projVars);
        }
      }
    }
    for (const ph of entry.pathParamHints) {
      if (ph.value === "?") {
        ph.value = findStateSource(ph.name.replace(/_id$/, ""), entry, entries);
      }
    }
  }

  return entries;
}

// ── Value Resolution Helpers ─────────────────────────────────────────

function resolveFieldValue(
  fieldName: string,
  currentEntry: StepContextEntry,
  allEntries: StepContextEntry[],
  projVars: { name: string; value: string }[],
): string {
  // Skip project_id — always from path
  if (/^project_id$/i.test(fieldName)) return "{{proj.projectId}}";

  // Check project variables first
  const projVar = findMatchingProjVar(fieldName, projVars);
  if (projVar) return `{{proj.${projVar}}}`;

  // Check if an earlier step captures a matching field
  for (const prior of allEntries) {
    if (prior.stepNumber >= currentEntry.stepNumber) break;
    for (const cap of prior.responseCaptures) {
      if (fieldMatchesResponse(fieldName, cap.field, prior.resource)) {
        return `{{state.${cap.stateVar}}}`;
      }
    }
  }

  // Foreign key pattern: field ends with _id → might be captured from a prereq step
  if (fieldName.endsWith("_id")) {
    const resource = fieldName.replace(/_id$/, "");
    for (const prior of allEntries) {
      if (prior.stepNumber >= currentEntry.stepNumber) break;
      if (prior.resource.startsWith(resource) || resource.startsWith(prior.resource.replace(/s$/, ""))) {
        const idCapture = prior.responseCaptures.find(c => c.field === "id");
        if (idCapture) return `{{state.${idCapture.stateVar}}}`;
      }
    }
  }

  // Generate a sensible literal based on field name/type
  if (/^(name|title)$/i.test(fieldName)) {
    return `"[TEST] ${currentEntry.resource} - {{timestamp}}"`;
  }
  if (/content|body|description|html/i.test(fieldName)) {
    return `"<p>Test content - {{timestamp}}</p>"`;
  }

  return "?";
}

function findStateSource(
  paramName: string,
  currentEntry: StepContextEntry,
  allEntries: StepContextEntry[],
): string {
  // Common: project_id from proj vars
  if (/^project_id$/i.test(paramName)) return "{{proj.projectId}}";

  // Look for a capture from earlier steps that matches this param
  for (const prior of allEntries) {
    if (prior.stepNumber >= currentEntry.stepNumber) break;
    for (const cap of prior.responseCaptures) {
      if (paramMatchesResponse(paramName, cap.field, prior.resource)) {
        return `{{state.${cap.stateVar}}}`;
      }
    }
    // If param is like "article_id" and prior step creates articles with id capture
    if (paramName.endsWith("_id")) {
      const resource = paramName.replace(/_id$/, "");
      const singular = prior.resource.replace(/ies$/, "y").replace(/s$/, "");
      if (resource === singular || resource === prior.resource) {
        const idCapture = prior.responseCaptures.find(c => c.field === "id");
        if (idCapture) return `{{state.${idCapture.stateVar}}}`;
      }
    }
  }

  return "?";
}

function fieldMatchesResponse(fieldName: string, responseField: string, producerResource: string): boolean {
  // Direct match: category_id field → id response field from categories step
  if (fieldName === responseField) return true;

  // Foreign key pattern: category_id → id from categories
  if (fieldName.endsWith("_id") && responseField === "id") {
    const resource = fieldName.replace(/_id$/, "");
    const singular = producerResource.replace(/ies$/, "y").replace(/s$/, "");
    if (resource === singular || resource === producerResource) return true;
  }

  return false;
}

function paramMatchesResponse(paramName: string, responseField: string, producerResource: string): boolean {
  return fieldMatchesResponse(paramName, responseField, producerResource);
}

function buildStateVarName(field: string, resource: string): string {
  // "id" from "categories" → "categoryId"
  if (field === "id") {
    const singular = resource.replace(/ies$/, "y").replace(/s$/, "");
    return toCamelCase(singular + "_id");
  }
  // "name" from "categories" → "categoryName"
  const singular = resource.replace(/ies$/, "y").replace(/s$/, "");
  return toCamelCase(singular + "_" + field);
}

/** Find the raw text section for a specific endpoint in the spec context */
function findEndpointSection(specContext: string, method: string, path: string): string | null {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`## Endpoint: ${method} ${escapedPath}`, "i");
  const match = re.exec(specContext);
  if (!match) return null;

  const start = match.index;
  // Find next ## Endpoint or end of context
  const nextEndpoint = specContext.indexOf("## Endpoint:", start + 1);
  const nextHeader = specContext.indexOf("\n## ", start + 1);
  const end = Math.min(
    nextEndpoint > start ? nextEndpoint : specContext.length,
    nextHeader > start ? nextHeader : specContext.length,
  );
  return specContext.slice(start, end);
}

// ── Formatting ───────────────────────────────────────────────────────

/** Convert StepContextEntry[] to structured markdown text for the AI. */
export function formatStepContext(entries: StepContextEntry[]): string {
  const lines: string[] = [];

  for (const entry of entries) {
    lines.push(`## Step ${entry.stepNumber}: ${entry.method} ${entry.path}`);
    if (entry.specFile) {
      lines.push(`Spec: ${entry.specFile}`);
    } else {
      lines.push(`Spec: (none available)`);
    }
    lines.push(`Purpose: ${entry.purpose}`);

    // Path param hints
    if (entry.pathParamHints.length > 0) {
      const nonProjectParams = entry.pathParamHints.filter(p => !/^project_id$/i.test(p.name));
      if (nonProjectParams.length > 0) {
        lines.push(`Path params: ${nonProjectParams.map(p => `${p.name} = ${p.value}`).join(", ")}`);
      }
    }

    // Required body fields
    if (entry.requiredBodyFields.length > 0) {
      lines.push("");
      lines.push("### Required Body Fields");
      for (const f of entry.requiredBodyFields) {
        if (/^project_id$/i.test(f.name)) continue;
        const reqLabel = f.required ? "required" : "optional";
        lines.push(`- \`${f.name}\` (${f.type}, ${reqLabel}) -> ${f.valueSource}`);
      }
    }

    // Item schema
    if (entry.itemSchema) {
      lines.push("");
      lines.push(`### Per-Item Required Fields (for each item in \`${entry.itemSchema.parentField}\`)`);
      for (const f of entry.itemSchema.requiredFields) {
        lines.push(`- \`${f.name}\` (${f.type}, required) -> ${f.valueSource}`);
      }
    }

    // Response captures
    if (entry.responseCaptures.length > 0) {
      lines.push("");
      lines.push("### Response Fields to Capture");
      for (const c of entry.responseCaptures) {
        const neededByStr = c.neededBy.length > 0
          ? ` (needed by step${c.neededBy.length > 1 ? "s" : ""} ${c.neededBy.join(", ")})`
          : "";
        lines.push(`- \`${c.field}\` -> capture as \`state.${c.stateVar}\`${neededByStr}`);
      }
    }

    // Notes
    if (entry.notes.length > 0) {
      lines.push("");
      for (const note of entry.notes) {
        lines.push(`Notes: ${note}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
