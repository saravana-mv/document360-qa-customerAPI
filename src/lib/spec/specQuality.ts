// Pure spec quality scoring. Operates on the already-parsed ParsedSpec /
// ParsedEndpointDoc that the Spec Manager loads from _system/_swagger.json.
// No I/O, no React — safe to call anywhere.
//
// The score (0-100) reflects how much an AI flow generator can rely on the
// spec without hallucinating: descriptions, examples, error responses, and
// schema completeness all factor in. Skipped factors (e.g., body factors on
// a GET) are excluded from the denominator so the score is always 0-100.

import type { Schema } from "../../types/spec.types";
import type { ParsedEndpointDoc, ParsedSpec } from "./swaggerParser";
import { buildEndpointFileMap } from "./swaggerParser";

// ─── Public types ────────────────────────────────────────────────────────────

export type FactorStatus = "pass" | "partial" | "fail" | "skipped";

export interface FactorResult {
  id: string;
  label: string;
  weight: number;
  earned: number; // 0..1, only meaningful when applicable
  applicable: boolean;
  status: FactorStatus;
  detail: string;
  fixHint?: string;
}

export interface EndpointScore {
  score: number; // 0..100 integer
  band: "red" | "amber" | "green";
  factors: FactorResult[];
  applicableWeight: number;
  earnedWeight: number;
}

export interface FolderScore {
  score: number;
  band: "red" | "amber" | "green";
  endpointCount: number;
}

export interface SpecQuality {
  perEndpoint: Map<string, EndpointScore>; // key: full tree path "v3/articles/create-article.md"
  perFolder: Map<string, FolderScore>; // key: folder path "v3", "v3/articles"
  overall: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MEANINGFUL_DENY_SET = new Set([
  "",
  "ok",
  "error",
  "success",
  "todo",
  "tbd",
  "-",
  "n/a",
]);

function isMeaningful(text: string | undefined | null, minLen = 10): boolean {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < minLen) return false;
  if (MEANINGFUL_DENY_SET.has(trimmed.toLowerCase())) return false;
  return true;
}

function fractionStatus(earned: number): FactorStatus {
  if (earned >= 0.95) return "pass";
  if (earned <= 0.05) return "fail";
  return "partial";
}

function applicable(weight: number, earned: number, label: string, id: string, detail: string, fixHint?: string): FactorResult {
  return {
    id,
    label,
    weight,
    earned,
    applicable: true,
    status: fractionStatus(earned),
    detail,
    ...(fixHint !== undefined && { fixHint }),
  };
}

function skipped(weight: number, label: string, id: string, reason: string): FactorResult {
  return { id, label, weight, earned: 0, applicable: false, status: "skipped", detail: reason };
}

// ─── Schema traversal (cycle-safe, depth-bounded) ────────────────────────────

interface SchemaWalkStats {
  totalProps: number;
  describedProps: number;
  enumLikeProps: number; // string fields whose names suggest enums
  enumLikePropsWithEnum: number;
  objectsWithProperties: number; // ≥3 properties
  objectsDeclaringRequired: number; // those with `required` array (even empty)
  /** Field paths that lack a description. */
  missingDescriptionPaths: string[];
  /** Field paths that look like enums (status/type/kind/...) but have no `enum` array. */
  enumLikeMissingEnumPaths: string[];
  /** Object paths (≥3 properties) where the `required` array is missing. */
  objectsMissingRequiredPaths: string[];
}

const ENUM_NAME_PATTERN = /^(status|state|type|kind|mode|level|category|priority|severity|stage|phase|visibility)$/i;

function joinPath(prefix: string, segment: string): string {
  if (!prefix) return segment;
  if (prefix.endsWith("[]")) return `${prefix}.${segment}`;
  return `${prefix}.${segment}`;
}

function walkSchemaForStats(
  schema: Schema | undefined,
  stats: SchemaWalkStats,
  pathPrefix = "",
  depth = 0,
): void {
  if (!schema || depth > 5) return;
  if (schema.type === "array" && schema.items) {
    walkSchemaForStats(schema.items, stats, `${pathPrefix}[]`, depth + 1);
    return;
  }
  if (schema.properties) {
    const propNames = Object.keys(schema.properties);
    if (propNames.length >= 3) {
      stats.objectsWithProperties += 1;
      if (Array.isArray(schema.required)) {
        stats.objectsDeclaringRequired += 1;
      } else {
        stats.objectsMissingRequiredPaths.push(pathPrefix || "(root)");
      }
    }
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const fieldPath = joinPath(pathPrefix, propName);
      stats.totalProps += 1;
      if (isMeaningful(propSchema.description)) {
        stats.describedProps += 1;
      } else {
        stats.missingDescriptionPaths.push(fieldPath);
      }
      if (propSchema.type === "string" && ENUM_NAME_PATTERN.test(propName)) {
        stats.enumLikeProps += 1;
        if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
          stats.enumLikePropsWithEnum += 1;
        } else {
          stats.enumLikeMissingEnumPaths.push(fieldPath);
        }
      }
      walkSchemaForStats(propSchema, stats, fieldPath, depth + 1);
    }
  }
  if (schema.allOf) for (const s of schema.allOf) walkSchemaForStats(s, stats, pathPrefix, depth + 1);
  if (schema.oneOf) for (const s of schema.oneOf) walkSchemaForStats(s, stats, pathPrefix, depth + 1);
  if (schema.anyOf) for (const s of schema.anyOf) walkSchemaForStats(s, stats, pathPrefix, depth + 1);
}

function emptyStats(): SchemaWalkStats {
  return {
    totalProps: 0,
    describedProps: 0,
    enumLikeProps: 0,
    enumLikePropsWithEnum: 0,
    objectsWithProperties: 0,
    objectsDeclaringRequired: 0,
    missingDescriptionPaths: [],
    enumLikeMissingEnumPaths: [],
    objectsMissingRequiredPaths: [],
  };
}

/** Format a list of names with a cap and " (and N more)" suffix when over. */
function formatList(names: string[], max = 5): string {
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} (and ${names.length - max} more)`;
}

// ─── Per-factor evaluation ───────────────────────────────────────────────────

function evalOperationMeta(ep: ParsedEndpointDoc): FactorResult[] {
  const out: FactorResult[] = [];
  out.push(applicable(
    4,
    isMeaningful(ep.summary, 10) ? 1 : 0,
    "Summary present",
    "op.summary",
    isMeaningful(ep.summary, 10) ? "Summary present" : "Add a clear summary (≥10 chars)",
    isMeaningful(ep.summary, 10) ? undefined : "Edit the operation `summary` in the spec MD",
  ));
  out.push(applicable(
    8,
    isMeaningful(ep.description, 30) ? 1 : 0,
    "Operation description",
    "op.description",
    isMeaningful(ep.description, 30) ? "Detailed description provided" : "Description missing or too short (need ≥30 chars of meaningful prose)",
    isMeaningful(ep.description, 30) ? undefined : "Add a description explaining what the endpoint does and when to use it",
  ));
  out.push(applicable(
    2,
    ep.operationId ? 1 : 0,
    "OperationId set",
    "op.operationId",
    ep.operationId ? `operationId = ${ep.operationId}` : "operationId missing",
    ep.operationId ? undefined : "Set an operationId in the spec",
  ));
  const goodTag = ep.tags.length > 0 && ep.tags[0] !== "Other";
  out.push(applicable(
    1,
    goodTag ? 1 : 0,
    "Tag assigned",
    "op.tags",
    goodTag ? `Tagged: ${ep.tags.join(", ")}` : "No tag (defaulted to 'Other')",
    goodTag ? undefined : "Add a tag so the endpoint groups correctly",
  ));
  return out;
}

function evalParameters(ep: ParsedEndpointDoc): FactorResult[] {
  const out: FactorResult[] = [];
  const total = ep.parameters.length;

  if (total === 0) {
    out.push(skipped(7, "Parameters described", "params.descriptions", "no parameters"));
    out.push(skipped(6, "Parameters typed/examplified", "params.examples", "no parameters"));
  } else {
    const undescribed = ep.parameters.filter((p) => !isMeaningful(p.description)).map((p) => `${p.in}.${p.name}`);
    const untyped = ep.parameters
      .filter((p) => !(p.example !== undefined || (p.schema && (p.schema.format || (Array.isArray(p.schema.enum) && p.schema.enum.length > 0)))))
      .map((p) => `${p.in}.${p.name}`);
    const described = total - undescribed.length;
    const typed = total - untyped.length;
    out.push(applicable(
      7,
      described / total,
      "Parameters described",
      "params.descriptions",
      undescribed.length > 0
        ? `${described} of ${total} parameter${total === 1 ? "" : "s"} have a meaningful description. Missing: ${formatList(undescribed)}`
        : `${described} of ${total} parameter${total === 1 ? "" : "s"} have a meaningful description`,
      undescribed.length > 0 ? "Add `description` to each parameter listed above" : undefined,
    ));
    out.push(applicable(
      6,
      typed / total,
      "Parameters typed/examplified",
      "params.examples",
      untyped.length > 0
        ? `${typed} of ${total} parameter${total === 1 ? "" : "s"} have an example, format, or enum. Missing: ${formatList(untyped)}`
        : `${typed} of ${total} parameter${total === 1 ? "" : "s"} have an example, format, or enum`,
      untyped.length > 0 ? "Add an `example` value or `schema.format` (e.g. uuid, date-time) to the parameters listed above" : undefined,
    ));
  }

  const placeholders = Array.from(ep.path.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]);
  if (placeholders.length === 0) {
    out.push(skipped(2, "Path placeholders declared", "params.pathConsistency", "path has no {placeholders}"));
  } else {
    const declared = placeholders.filter((name) =>
      ep.parameters.some((p) => p.in === "path" && p.name === name && p.required === true),
    ).length;
    out.push(applicable(
      2,
      declared / placeholders.length,
      "Path placeholders declared",
      "params.pathConsistency",
      `${declared} of ${placeholders.length} path placeholder${placeholders.length === 1 ? "" : "s"} declared as required path parameter`,
      declared < placeholders.length ? "Declare every {placeholder} in the URL as a `path` parameter with `required: true`" : undefined,
    ));
  }
  return out;
}

function evalRequestBody(ep: ParsedEndpointDoc): FactorResult[] {
  const out: FactorResult[] = [];
  const body = ep.requestBody;
  if (!body) {
    out.push(skipped(4, "Body schema present", "body.schema", "no requestBody"));
    out.push(skipped(8, "Body example present", "body.example", "no requestBody"));
    out.push(skipped(3, "Body description", "body.description", "no requestBody"));
    out.push(skipped(5, "Required fields documented", "body.requiredFields", "no requestBody"));
    return out;
  }

  out.push(applicable(
    4,
    body.schema ? 1 : 0,
    "Body schema present",
    "body.schema",
    body.schema ? "Schema declared" : "No schema for the request body",
    body.schema ? undefined : "Add a schema describing the request body shape",
  ));

  const hasExample = body.example !== undefined || (body.examples && Object.keys(body.examples).length > 0);
  out.push(applicable(
    8,
    hasExample ? 1 : 0,
    "Body example present",
    "body.example",
    hasExample ? "At least one request body example is defined" : "No request body example",
    hasExample ? undefined : "Click 'Enhance Docs example' after a Try-it call",
  ));

  const bodyDesc = isMeaningful(body.description) || (body.schema && isMeaningful(body.schema.description));
  out.push(applicable(
    3,
    bodyDesc ? 1 : 0,
    "Body description",
    "body.description",
    bodyDesc ? "Description provided" : "No body description",
    bodyDesc ? undefined : "Add a `description` to the requestBody (or its top-level schema)",
  ));

  if (!body.schema || !body.schema.properties) {
    out.push(skipped(5, "Required fields documented", "body.requiredFields", "schema has no properties"));
  } else {
    const required = Array.isArray(body.schema.required) ? body.schema.required : [];
    const properties = body.schema.properties;
    if (required.length === 0) {
      out.push(applicable(
        5,
        1,
        "Required fields documented",
        "body.requiredFields",
        "No required fields declared (vacuously satisfied)",
      ));
    } else {
      const inconsistent = required.filter((name) => !(name in properties));
      const undescribedRequired = required.filter((name) => {
        const f = properties[name];
        return name in properties && !(f && isMeaningful(f.description));
      });
      const consistent = inconsistent.length === 0;
      const describedRequired = required.length - undescribedRequired.length - inconsistent.length;
      const earned = consistent ? (required.length - undescribedRequired.length) / required.length : 0;
      const detail = !consistent
        ? `\`required\` array references field(s) not in \`properties\`: ${formatList(inconsistent)}`
        : undescribedRequired.length > 0
          ? `${describedRequired} of ${required.length} required field${required.length === 1 ? "" : "s"} have descriptions. Missing: ${formatList(undescribedRequired)}`
          : `${describedRequired} of ${required.length} required field${required.length === 1 ? "" : "s"} have descriptions`;
      out.push(applicable(
        5,
        earned,
        "Required fields documented",
        "body.requiredFields",
        detail,
        earned < 1 ? "Add a `description` to every field listed in `schema.required`" : undefined,
      ));
    }
  }
  return out;
}

function evalResponses(ep: ParsedEndpointDoc): FactorResult[] {
  const out: FactorResult[] = [];
  const responses = ep.responses;

  // responses.success — best 2xx
  const success = responses.find((r) => /^2/.test(r.status));
  if (success) {
    let signals = 0;
    if (isMeaningful(success.description)) signals += 1;
    if (success.schema) signals += 1;
    if (success.example !== undefined || (success.examples && Object.keys(success.examples).length > 0)) signals += 1;
    const earned = signals / 3;
    out.push(applicable(
      12,
      earned,
      "2xx response documented",
      "responses.success",
      `${success.status} signals: ${isMeaningful(success.description) ? "✓" : "✗"} description, ${success.schema ? "✓" : "✗"} schema, ${success.example !== undefined || (success.examples && Object.keys(success.examples).length > 0) ? "✓" : "✗"} example`,
      earned < 1 ? "Add description, schema, and an example to the 2xx response" : undefined,
    ));
  } else {
    out.push(applicable(
      12,
      0,
      "2xx response documented",
      "responses.success",
      "No 2xx response declared",
      "Add a 2xx response with description, schema, and example",
    ));
  }

  // responses.error — at least one 4xx OR 5xx with meaningful description
  const errorResp = responses.find((r) => /^[45]/.test(r.status) && isMeaningful(r.description));
  out.push(applicable(
    8,
    errorResp ? 1 : 0,
    "Error response declared",
    "responses.error",
    errorResp ? `${errorResp.status} response is documented` : "No 4xx/5xx response with a meaningful description",
    errorResp ? undefined : "Document at least one error response (e.g. 400, 404, 500) with a real description",
  ));

  // responses.descriptions
  if (responses.length === 0) {
    out.push(skipped(8, "Every response described", "responses.descriptions", "no responses declared"));
    out.push(skipped(7, "Every response has an example", "responses.examples", "no responses declared"));
  } else {
    const undescribedStatuses = responses.filter((r) => !isMeaningful(r.description)).map((r) => r.status);
    const described = responses.length - undescribedStatuses.length;
    out.push(applicable(
      8,
      described / responses.length,
      "Every response described",
      "responses.descriptions",
      undescribedStatuses.length > 0
        ? `${described} of ${responses.length} response${responses.length === 1 ? "" : "s"} have a meaningful description. Missing on: ${formatList(undescribedStatuses)}`
        : `${described} of ${responses.length} response${responses.length === 1 ? "" : "s"} have a meaningful description`,
      undescribedStatuses.length > 0 ? "Replace generic descriptions like 'OK'/'Error' with explanatory text on the statuses above" : undefined,
    ));

    const noExampleStatuses: string[] = [];
    const schemaOnlyStatuses: string[] = [];
    let exampleCredit = 0;
    for (const r of responses) {
      if (r.example !== undefined || (r.examples && Object.keys(r.examples).length > 0)) {
        exampleCredit += 1;
      } else if (r.schema) {
        exampleCredit += 0.5;
        schemaOnlyStatuses.push(r.status);
      } else {
        noExampleStatuses.push(r.status);
      }
    }
    const exampleDetailParts: string[] = [];
    if (noExampleStatuses.length > 0) exampleDetailParts.push(`No example: ${formatList(noExampleStatuses)}`);
    if (schemaOnlyStatuses.length > 0) exampleDetailParts.push(`Schema only (counts as 0.5): ${formatList(schemaOnlyStatuses)}`);
    out.push(applicable(
      7,
      exampleCredit / responses.length,
      "Every response has an example",
      "responses.examples",
      exampleDetailParts.length > 0
        ? `Example credit ${exampleCredit.toFixed(1)} of ${responses.length}. ${exampleDetailParts.join(". ")}`
        : `${responses.length} response${responses.length === 1 ? "" : "s"} all have explicit examples`,
      exampleCredit < responses.length
        ? "Use 'Enhance Docs example' to capture a real call for each status, or add inline examples in the spec"
        : undefined,
    ));
  }
  return out;
}

function evalSchemaDepth(ep: ParsedEndpointDoc): FactorResult[] {
  const stats = emptyStats();
  if (ep.requestBody?.schema) walkSchemaForStats(ep.requestBody.schema, stats, "request");
  for (const r of ep.responses) {
    if (r.schema) walkSchemaForStats(r.schema, stats, `response.${r.status}`);
  }

  const out: FactorResult[] = [];

  if (stats.totalProps === 0) {
    out.push(skipped(6, "Schema field descriptions", "schema.fieldDescriptions", "no object schemas to walk"));
  } else {
    const earned = stats.describedProps / stats.totalProps;
    const missing = formatList(stats.missingDescriptionPaths, 5);
    out.push(applicable(
      6,
      earned,
      "Schema field descriptions",
      "schema.fieldDescriptions",
      missing
        ? `${stats.describedProps} of ${stats.totalProps} schema field${stats.totalProps === 1 ? "" : "s"} have descriptions. Missing: ${missing}`
        : `${stats.describedProps} of ${stats.totalProps} schema field${stats.totalProps === 1 ? "" : "s"} have descriptions`,
      earned < 1 ? "Add `description` to the fields above in request and response schemas" : undefined,
    ));
  }

  if (stats.enumLikeProps === 0) {
    out.push(skipped(2, "Enum-shaped fields enumerated", "schema.enums", "no enum-shaped field names found"));
  } else {
    const earned = stats.enumLikePropsWithEnum / stats.enumLikeProps;
    const missing = formatList(stats.enumLikeMissingEnumPaths, 5);
    out.push(applicable(
      2,
      earned,
      "Enum-shaped fields enumerated",
      "schema.enums",
      missing
        ? `${stats.enumLikePropsWithEnum} of ${stats.enumLikeProps} enum-shaped field${stats.enumLikeProps === 1 ? "" : "s"} (status/type/kind/...) have an explicit enum array. Missing: ${missing}`
        : `${stats.enumLikePropsWithEnum} of ${stats.enumLikeProps} enum-shaped field${stats.enumLikeProps === 1 ? "" : "s"} (status/type/kind/...) have an explicit enum array`,
      earned < 1 ? "Add an `enum` array listing valid values for the fields above" : undefined,
    ));
  }

  if (stats.objectsWithProperties === 0) {
    out.push(skipped(2, "`required` arrays declared", "schema.requiredAccuracy", "no large object schemas (≥3 properties)"));
  } else {
    const earned = stats.objectsDeclaringRequired / stats.objectsWithProperties;
    const missing = formatList(stats.objectsMissingRequiredPaths, 5);
    out.push(applicable(
      2,
      earned,
      "`required` arrays declared",
      "schema.requiredAccuracy",
      missing
        ? `${stats.objectsDeclaringRequired} of ${stats.objectsWithProperties} object schemas (≥3 props) declare a \`required\` array. Missing on: ${missing}`
        : `${stats.objectsDeclaringRequired} of ${stats.objectsWithProperties} object schemas (≥3 props) declare a \`required\` array`,
      earned < 1 ? "Add a `required` array to every object schema with 3+ properties (use `[]` if nothing is required)" : undefined,
    ));
  }
  return out;
}

function evalSecurity(ep: ParsedEndpointDoc): FactorResult[] {
  const declared = Array.isArray(ep.security);
  return [
    applicable(
      5,
      declared ? 1 : 0,
      "Security declared",
      "security.declared",
      declared
        ? ep.security!.length === 0
          ? "Explicitly no auth (`security: []`)"
          : "Security requirements declared"
        : "No `security` declared (defaults inherit from spec — but explicit is better)",
      declared ? undefined : "Declare a `security` array on the operation (or `[]` for explicit no-auth)",
    ),
  ];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function computeEndpointScore(endpoint: ParsedEndpointDoc): EndpointScore {
  const factors: FactorResult[] = [
    ...evalOperationMeta(endpoint),
    ...evalParameters(endpoint),
    ...evalRequestBody(endpoint),
    ...evalResponses(endpoint),
    ...evalSchemaDepth(endpoint),
    ...evalSecurity(endpoint),
  ];

  let applicableWeight = 0;
  let earnedWeight = 0;
  for (const f of factors) {
    if (!f.applicable) continue;
    applicableWeight += f.weight;
    earnedWeight += f.weight * f.earned;
  }
  const score = applicableWeight === 0 ? 0 : Math.round((earnedWeight / applicableWeight) * 100);
  return {
    score,
    band: bandFor(score),
    factors,
    applicableWeight,
    earnedWeight,
  };
}

export function bandFor(score: number): "red" | "amber" | "green" {
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}

export function computeSpecQuality(spec: ParsedSpec, versionFolder: string): SpecQuality {
  const map = buildEndpointFileMap(spec);
  const perEndpoint = new Map<string, EndpointScore>();
  for (const [relativeKey, endpoint] of map) {
    const fullPath = `${versionFolder}/${relativeKey}`;
    perEndpoint.set(fullPath, computeEndpointScore(endpoint));
  }

  // Roll up to every ancestor folder
  const folderAcc = new Map<string, { sum: number; count: number }>();
  for (const [path, ep] of perEndpoint) {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      const folderPath = segments.slice(0, i).join("/");
      const acc = folderAcc.get(folderPath) ?? { sum: 0, count: 0 };
      acc.sum += ep.score;
      acc.count += 1;
      folderAcc.set(folderPath, acc);
    }
  }
  const perFolder = new Map<string, FolderScore>();
  for (const [k, { sum, count }] of folderAcc) {
    const score = Math.round(sum / count);
    perFolder.set(k, { score, band: bandFor(score), endpointCount: count });
  }

  let overallSum = 0;
  let overallCount = 0;
  for (const [, ep] of perEndpoint) {
    overallSum += ep.score;
    overallCount += 1;
  }
  const overall = overallCount === 0 ? 0 : Math.round(overallSum / overallCount);

  return { perEndpoint, perFolder, overall };
}
