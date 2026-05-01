/**
 * Deterministic flow XML validator — checks flow XML against API specs
 * before running. Catches structural issues, missing fields, bad data flow,
 * and business rule violations at zero cost (no AI calls).
 */

import { parseFlowXml, FlowXmlParseError } from "./flowRunner/parser";
import type { ParsedFlow, ParsedStep, ParsedAssertion } from "./flowRunner/types";
import { parseSpecEndpoints, normalizePath } from "./specRequiredFields";
import type { SpecEndpoint } from "./specRequiredFields";

// ── Types ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  step: number | null;       // null = flow-level issue
  category: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;            // true if zero errors (warnings OK)
  issues: ValidationIssue[];
  summary: { errors: number; warnings: number; info: number };
}

// ── Helpers ───────────────────────────────────────────────────────────

function matchEndpoint(step: ParsedStep, endpoints: SpecEndpoint[]): SpecEndpoint | null {
  const normStep = normalizePath(step.path);
  return endpoints.find(
    (ep) => ep.method.toUpperCase() === step.method.toUpperCase() && normalizePath(ep.path) === normStep,
  ) ?? null;
}

/** Extract JSON field names from a step body (string-based, tolerant of mustache tokens). */
function extractBodyFields(body: string | undefined): string[] {
  if (!body) return [];
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return [];
  const fields: string[] = [];
  // Match top-level "field_name": patterns
  const re = /"(\w+)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    fields.push(m[1]);
  }
  return fields;
}

/** Collect all {{state.X}} references from a string. */
function findStateRefs(text: string): string[] {
  const re = /\{\{state\.(\w+)\}\}/g;
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!refs.includes(m[1])) refs.push(m[1]);
  }
  return refs;
}

/** Collect all {{proj.X}} references from a string. */
function findProjRefs(text: string): string[] {
  const re = /\{\{proj\.(\w+)\}\}/g;
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!refs.includes(m[1])) refs.push(m[1]);
  }
  return refs;
}

/** Extract path parameter names from a URL path like /v2/categories/{id}. */
function extractPathParamNames(path: string): string[] {
  const re = /\{(\w+)\}/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ── Detectors ─────────────────────────────────────────────────────────

export function detectStructuralIssues(flowXml: string): { issues: ValidationIssue[]; flow: ParsedFlow | null } {
  const issues: ValidationIssue[] = [];
  let flow: ParsedFlow | null = null;

  try {
    flow = parseFlowXml(flowXml);
  } catch (err) {
    issues.push({
      severity: "error",
      step: null,
      category: "parse-error",
      message: err instanceof FlowXmlParseError ? err.message : "Failed to parse flow XML",
    });
    return { issues, flow };
  }

  if (!flow.description) {
    issues.push({
      severity: "info",
      step: null,
      category: "missing-description",
      message: "Flow has no <description> element",
      suggestion: "Add a description to document the flow's purpose",
    });
  }

  for (const step of flow.steps) {
    if (!step.body && (step.method === "POST" || step.method === "PUT")) {
      issues.push({
        severity: "warning",
        step: step.number,
        category: "empty-body",
        message: `${step.method} step "${step.name}" has no request body`,
        suggestion: "POST/PUT requests typically require a request body",
      });
    }

    // Detect empty objects {} in request body (e.g. bulk array items with no fields)
    if (step.body) {
      const collapsed = step.body.replace(/\s+/g, "");
      if (collapsed.includes("{}")) {
        issues.push({
          severity: "error",
          step: step.number,
          category: "empty-body-objects",
          message: `Request body contains empty objects {} — required fields are missing`,
          suggestion: "Fill in the required fields for each object in the request body",
        });
      }
    }
  }

  return { issues, flow };
}

export function detectMissingRequiredFields(
  flow: ParsedFlow,
  endpoints: SpecEndpoint[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const writeMethods = ["POST", "PUT", "PATCH"];

  for (const step of flow.steps) {
    if (!writeMethods.includes(step.method)) continue;
    if (!step.endpointRef) continue;

    const ep = matchEndpoint(step, endpoints);
    if (!ep || ep.requiredRequestFields.length === 0) continue;

    const bodyFields = extractBodyFields(step.body);
    for (const field of ep.requiredRequestFields) {
      if (!bodyFields.includes(field)) {
        issues.push({
          severity: "error",
          step: step.number,
          category: "missing-field",
          message: `Required field "${field}" is missing from the request body`,
          field,
          suggestion: `Add "${field}" to the step's <body> JSON`,
        });
      }
    }
  }

  return issues;
}

export function detectExtraFields(
  flow: ParsedFlow,
  endpoints: SpecEndpoint[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const writeMethods = ["POST", "PUT", "PATCH"];

  for (const step of flow.steps) {
    if (!writeMethods.includes(step.method)) continue;
    if (!step.endpointRef) continue;

    const ep = matchEndpoint(step, endpoints);
    if (!ep || ep.allRequestFields.length === 0) continue;

    const bodyFields = extractBodyFields(step.body);
    for (const field of bodyFields) {
      if (!ep.allRequestFields.includes(field)) {
        issues.push({
          severity: "warning",
          step: step.number,
          category: "extra-field",
          message: `Field "${field}" is not in the endpoint's spec — may be hallucinated`,
          field,
          suggestion: `Remove "${field}" or verify it's a valid field for this endpoint`,
        });
      }
    }
  }

  return issues;
}

export function detectBadCaptures(
  flow: ParsedFlow,
  endpoints: SpecEndpoint[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    if (step.captures.length === 0) continue;

    const ep = matchEndpoint(step, endpoints);
    if (!ep || ep.responseFields.length === 0) continue;

    for (const cap of step.captures) {
      if (cap.from !== "response") continue;
      // Extract the bare field name from source like "data.id" or "data.category_id"
      const bare = cap.source.replace(/^(response\.)?data\./, "").split(".")[0];
      if (bare && !ep.responseFields.includes(bare)) {
        issues.push({
          severity: "warning",
          step: step.number,
          category: "bad-capture",
          message: `Capture "${cap.variable}" references "${cap.source}" which is not in the spec's response fields`,
          field: cap.source,
          suggestion: `Check that "${bare}" exists in the response. Known fields: ${ep.responseFields.slice(0, 10).join(", ")}`,
        });
      }
    }
  }

  return issues;
}

export function detectMissingCaptures(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const captured = new Set<string>();

  for (const step of flow.steps) {
    // Check all state refs in this step
    const stepXmlParts = [
      step.body ?? "",
      ...Object.values(step.pathParams),
      ...Object.values(step.queryParams),
      ...step.assertions
        .filter((a): a is Extract<ParsedAssertion, { value: string }> => "value" in a)
        .map((a) => a.value),
    ];

    for (const part of stepXmlParts) {
      const refs = findStateRefs(part);
      for (const ref of refs) {
        if (!captured.has(ref)) {
          issues.push({
            severity: "error",
            step: step.number,
            category: "missing-capture",
            message: `References {{state.${ref}}} but no prior step captures into "state.${ref}"`,
            field: `state.${ref}`,
            suggestion: "Add a <capture> in an earlier step to set this state variable",
          });
        }
      }
    }

    // Register captures from this step (for later steps)
    // Parser stores variable as "state.categoryId" — strip "state." prefix to match findStateRefs output
    for (const cap of step.captures) {
      const bare = cap.variable.replace(/^state\./, "");
      captured.add(bare);
    }
  }

  return issues;
}

export function detectCircularAssertions(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    // Build set of variables captured in THIS step
    const capturedInThisStep = new Map<string, string>();
    for (const cap of step.captures) {
      // Parser stores "state.categoryId" — strip prefix to match findStateRefs output
      const bare = cap.variable.replace(/^state\./, "");
      capturedInThisStep.set(bare, cap.source);
    }

    for (const assertion of step.assertions) {
      if (assertion.type !== "field-equals") continue;
      // Check if the expected value references a state var captured in this same step
      const refs = findStateRefs(assertion.value);
      for (const ref of refs) {
        const captureSource = capturedInThisStep.get(ref);
        if (captureSource) {
          // Compare: does the assertion field match the capture source?
          const normField = assertion.field.replace(/^response\./, "");
          const normCapture = captureSource.replace(/^response\./, "");
          if (normField === normCapture || normField.endsWith(normCapture) || normCapture.endsWith(normField)) {
            issues.push({
              severity: "warning",
              step: step.number,
              category: "circular-assertion",
              message: `Assertion on "${assertion.field}" compares against {{state.${ref}}} which is captured from the same step's "${captureSource}" — always passes`,
              field: assertion.field,
              suggestion: "Use a value from a different step or a literal expected value",
            });
          }
        }
      }
    }
  }

  return issues;
}

const TIMESTAMP_PATTERNS = [
  "created_at", "modified_at", "updated_at", "deleted_at",
  "created_date", "modified_date", "last_modified",
  "timestamp", "date_created", "date_modified",
];

export function detectTimestampAssertions(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    for (const assertion of step.assertions) {
      if (assertion.type !== "field-equals") continue;
      const fieldLower = assertion.field.toLowerCase();
      const isTimestamp = TIMESTAMP_PATTERNS.some((p) => fieldLower.includes(p));
      if (isTimestamp) {
        // Check if the value is a state ref (OK — comparing across steps)
        // or a literal (bad — timestamps are unpredictable)
        const hasStateRef = /\{\{state\./.test(assertion.value);
        if (!hasStateRef) {
          issues.push({
            severity: "warning",
            step: step.number,
            category: "timestamp-assertion",
            message: `Assertion on timestamp field "${assertion.field}" uses exact equality — timestamps are unpredictable at runtime`,
            field: assertion.field,
            suggestion: "Use field-exists instead, or compare against a state variable from a prior step",
          });
        }
      }
    }
  }

  return issues;
}

export function detectBareAssertionFields(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    for (const assertion of step.assertions) {
      if (assertion.type === "status") continue;
      const field = "field" in assertion ? assertion.field : null;
      if (!field) continue;
      // Accept response.*, data.*, and data[N].* (array access) as valid prefixes
      if (!field.startsWith("response.") && !field.startsWith("data.") && !field.startsWith("data[")) {
        // Bare field — likely missing response. prefix
        issues.push({
          severity: "warning",
          step: step.number,
          category: "bare-assertion-field",
          message: `Assertion field "${field}" may need a "response.data." prefix`,
          field,
          suggestion: `Use "response.data.${field}" instead of "${field}"`,
        });
      }
    }
  }

  return issues;
}

export function detectMissingPrerequisites(
  flow: ParsedFlow,
  projVars: { name: string; value: string }[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const projVarNames = new Set(projVars.map((v) => v.name));
  const createdEntities = new Set<string>();

  // Track what entities are created by POST steps
  for (const step of flow.steps) {
    if (step.method === "POST") {
      const resource = extractPathResource(step.path);
      if (resource) {
        createdEntities.add(resource.replace(/s$/, "")); // rough singularize
      }
    }
  }

  for (const step of flow.steps) {
    const bodyFields = extractBodyFields(step.body);
    for (const field of bodyFields) {
      if (!field.endsWith("_id")) continue;
      // Check if covered by proj vars
      const projVarName = field.replace(/_/g, "");
      const body = step.body ?? "";
      const fieldValue = body.match(new RegExp(`"${field}"\\s*:\\s*"?([^",}]+)`));
      if (fieldValue) {
        const val = fieldValue[1].trim();
        if (/\{\{proj\./.test(val)) continue; // Covered by project variable
        if (/\{\{state\./.test(val)) continue; // Covered by prior step capture
      }
      // Check if a preceding step creates this entity
      const entityName = field.replace(/_id$/, "");
      if (!createdEntities.has(entityName) && !projVarNames.has(field)) {
        issues.push({
          severity: "warning",
          step: step.number,
          category: "missing-prerequisite",
          message: `Field "${field}" references an entity but no prior step creates it and no project variable provides it`,
          field,
          suggestion: `Add a prerequisite step to create the ${entityName}, or define a project variable for ${field}`,
        });
      }
    }
  }

  return issues;
}

export function detectMissingTeardown(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Collect resources created by POST
  const created: { step: ParsedStep; resource: string }[] = [];
  for (const step of flow.steps) {
    if (step.method !== "POST") continue;
    const resource = extractPathResource(step.path);
    if (resource) created.push({ step, resource });
  }

  // Collect resources deleted by DELETE
  const deleted = new Set<string>();
  for (const step of flow.steps) {
    if (step.method !== "DELETE") continue;
    const resource = extractPathResource(step.path);
    if (resource) deleted.add(resource);
  }

  for (const { step, resource } of created) {
    if (!deleted.has(resource)) {
      // Only warn if the step is not itself a teardown step
      if (!step.teardown) {
        issues.push({
          severity: "warning",
          step: step.number,
          category: "no-teardown",
          message: `POST step "${step.name}" creates a "${resource}" resource but no DELETE step cleans it up`,
          suggestion: "Add a teardown DELETE step to clean up created resources",
        });
      }
    }
  }

  return issues;
}

export function detectUnresolvedVariables(
  flowXml: string,
  projVars: { name: string; value: string }[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const projVarNames = new Set(projVars.map((v) => v.name));
  const emptyVars = new Set(projVars.filter((v) => !v.value).map((v) => v.name));

  const refs = findProjRefs(flowXml);
  for (const ref of refs) {
    if (!projVarNames.has(ref)) {
      issues.push({
        severity: "error",
        step: null,
        category: "unresolved-variable",
        message: `{{proj.${ref}}} references an undefined project variable`,
        field: `proj.${ref}`,
        suggestion: "Define this variable in Settings → Variables",
      });
    } else if (emptyVars.has(ref)) {
      issues.push({
        severity: "warning",
        step: null,
        category: "empty-variable",
        message: `{{proj.${ref}}} is defined but has an empty value`,
        field: `proj.${ref}`,
        suggestion: "Set a value for this variable in Settings → Variables",
      });
    }
  }

  return issues;
}

/** Extract the primary API resource from a URL path.
 *  /v3/projects/{project_id}/categories/{id} → "categories"
 *  /v2/categories/{id} → "categories"
 *  Skips version prefix and projects/{id} scoping segments. */
function extractPathResource(path: string): string | null {
  const parts = path.replace(/^\//, "").split("/").filter(Boolean);
  // Skip segments: version prefix (v1, v2, …), "projects", and path params ({…})
  const meaningful = parts.filter(
    (p) => !/^v\d+$/i.test(p) && p !== "projects" && !p.startsWith("{"),
  );
  return meaningful[0]?.toLowerCase() ?? null;
}

/** Extract the resource folder from an endpointRef.
 *  "V3/categories/create-category.md" → "categories"
 *  "articles/create-article.md" → "articles" */
function extractRefResource(ref: string): string | null {
  const parts = ref.split("/").filter(Boolean);
  // Skip version prefix segments (V3, v2, …)
  const meaningful = parts.filter((p) => !/^v\d+$/i.test(p));
  // The resource folder is the first meaningful segment (before the filename)
  return meaningful.length > 1 ? meaningful[0].toLowerCase() : null;
}

export function detectMismatchedEndpointRefs(
  flow: ParsedFlow,
  endpoints: SpecEndpoint[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    if (!step.endpointRef) continue;

    const pathResource = extractPathResource(step.path);
    const refResource = extractRefResource(step.endpointRef);

    if (pathResource && refResource && pathResource !== refResource) {
      issues.push({
        severity: "error",
        step: step.number,
        category: "mismatched-ref",
        message: `Step path targets "${pathResource}" but endpointRef references "${refResource}" spec`,
        field: step.endpointRef,
        suggestion: `Fix the endpointRef to match the path's resource (${pathResource})`,
      });
    }
  }

  return issues;
}

export function detectPathParamIssues(flow: ParsedFlow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const step of flow.steps) {
    const paramNames = extractPathParamNames(step.path);
    for (const param of paramNames) {
      const hasPathParam = param in step.pathParams;
      if (!hasPathParam) {
        issues.push({
          severity: "error",
          step: step.number,
          category: "missing-path-param",
          message: `Path contains {${param}} but no <pathParams> entry provides a value`,
          field: param,
          suggestion: `Add <param name="${param}">{{state.${param}}}</param> to <pathParams>`,
        });
      }
    }
  }

  return issues;
}

// ── Main validator ────────────────────────────────────────────────────

export function validateFlowXml(
  flowXml: string,
  specContext: string,
  projVars: { name: string; value: string }[],
): ValidationResult {
  const allIssues: ValidationIssue[] = [];

  // 1. Structural issues (parse the flow)
  const { issues: structIssues, flow } = detectStructuralIssues(flowXml);
  allIssues.push(...structIssues);

  if (!flow) {
    // Can't run further checks without a parsed flow
    const errors = allIssues.filter((i) => i.severity === "error").length;
    const warnings = allIssues.filter((i) => i.severity === "warning").length;
    const info = allIssues.filter((i) => i.severity === "info").length;
    return { valid: errors === 0, issues: allIssues, summary: { errors, warnings, info } };
  }

  // Parse spec endpoints for field-level checks
  const endpoints = specContext ? parseSpecEndpoints(specContext) : [];

  // 2-13. Run all detectors
  allIssues.push(...detectMissingRequiredFields(flow, endpoints));
  allIssues.push(...detectExtraFields(flow, endpoints));
  allIssues.push(...detectBadCaptures(flow, endpoints));
  allIssues.push(...detectMissingCaptures(flow));
  allIssues.push(...detectCircularAssertions(flow));
  allIssues.push(...detectTimestampAssertions(flow));
  allIssues.push(...detectBareAssertionFields(flow));
  allIssues.push(...detectMissingPrerequisites(flow, projVars));
  allIssues.push(...detectMissingTeardown(flow));
  allIssues.push(...detectUnresolvedVariables(flowXml, projVars));
  allIssues.push(...detectMismatchedEndpointRefs(flow, endpoints));
  allIssues.push(...detectPathParamIssues(flow));

  const errors = allIssues.filter((i) => i.severity === "error").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;
  const info = allIssues.filter((i) => i.severity === "info").length;

  return {
    valid: errors === 0,
    issues: allIssues,
    summary: { errors, warnings, info },
  };
}
