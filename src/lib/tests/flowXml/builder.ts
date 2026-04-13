// Converts a ParsedFlow into a list of runnable TestDef objects.

import type {
  TestDef,
  TestContext,
  RunState,
  TestExecutionResult,
  AssertionDef,
} from "../../../types/test.types";
import type { ParsedFlow, ParsedStep, ParsedAssertion } from "./types";

interface BuiltFlow {
  tag: string;             // ParsedFlow.name
  group: string;
  tests: TestDef[];
}

/** Slugify a flow name into a stable ID prefix. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow";
}

/**
 * Replace the leading /vN/ version segment of a path with the user's selected
 * API version. Paths without a version segment are returned unchanged.
 */
export function rewriteApiVersion(path: string, apiVersion: string): string {
  return path.replace(/^\/v\d+(?=\/)/, `/${apiVersion}`);
}

export function buildFlow(parsed: ParsedFlow, flowFileName?: string): BuiltFlow {
  const flowSlug = slug(parsed.name);
  const tests: TestDef[] = parsed.steps.map((step) => buildStep(parsed, flowSlug, step, flowFileName));
  return { tag: parsed.name, group: parsed.group, tests };
}

function buildStep(flow: ParsedFlow, flowSlug: string, step: ParsedStep, flowFileName?: string): TestDef {
  const id = `xml:${flowSlug}.s${step.number}`;
  const description = step.notes?.trim() || undefined;

  // Build path-params metadata for the Design tab (for state-based params only).
  const pathParamsMeta: TestDef["pathParamsMeta"] = {};
  for (const [key, raw] of Object.entries(step.pathParams)) {
    if (raw.startsWith("ctx.")) continue; // resolved automatically
    pathParamsMeta[key] = { value: raw };
  }

  // Build a sample body (placeholders intact) for the Design tab.
  let sampleRequestBody: unknown = undefined;
  if (step.body) {
    try {
      sampleRequestBody = JSON.parse(step.body);
    } catch {
      sampleRequestBody = step.body; // fall back to raw string
    }
  }

  const assertions: AssertionDef[] = step.assertions.map(toAssertionDef);

  const def: TestDef = {
    id,
    name: `Step ${step.number}: ${step.name}`,
    tag: flow.name,
    group: flow.group,
    path: step.path,
    method: step.method,
    description,
    sampleRequestBody,
    queryParams: Object.keys(step.queryParams).length > 0 ? step.queryParams : undefined,
    pathParamsMeta: Object.keys(pathParamsMeta).length > 0 ? pathParamsMeta : undefined,
    assertions,
    isTeardown: step.teardown || undefined,
    flowFileName,
    execute: (ctx, state) => executeStep(step, ctx, state),
  };

  return def;
}

// ── Assertion conversion ──────────────────────────────────────────────────────

function toAssertionDef(a: ParsedAssertion): AssertionDef {
  if (a.type === "status") {
    return {
      id: `status-${a.code}`,
      description: `Response status is ${a.code}`,
      check: (result) => result.httpStatus === a.code,
    };
  }
  if (a.type === "field-exists") {
    return {
      id: `field-exists-${a.field}`,
      description: `Response body has field "${a.field}"`,
      check: (result) => fieldExists(result.responseBody, a.field),
    };
  }
  if (a.type === "array-not-empty") {
    return {
      id: `array-not-empty-${a.field}`,
      description: `Response body field "${a.field}" is a non-empty array`,
      check: (result) => {
        const v = readPath(result.responseBody, a.field);
        return Array.isArray(v) && v.length > 0;
      },
    };
  }
  // field-equals
  return {
    id: `field-equals-${a.field}`,
    description: `Response body field "${a.field}" equals ${a.value}`,
    check: (result, state) => {
      const actual = readPath(result.responseBody, a.field);
      const expected = coerce(substitute(a.value, makeCtxStub(), state));
      return jsonEqual(actual, expected);
    },
  };
}

function fieldExists(obj: unknown, path: string): boolean {
  if (obj === null || obj === undefined) return false;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return false;
    if (!(p in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur !== undefined;
}

function readPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Loose number/string compare for "5" vs 5
  if (typeof a === "number" && typeof b === "string") return String(a) === b;
  if (typeof a === "string" && typeof b === "number") return a === String(b);
  return false;
}

// ── Step execution ────────────────────────────────────────────────────────────

async function executeStep(step: ParsedStep, ctx: TestContext, state: RunState): Promise<TestExecutionResult> {
  const start = Date.now();
  let resolvedPath: string;
  let queryString = "";
  const resolvedPathParams: Record<string, string> = {};

  try {
    // Resolve path params
    for (const [key, raw] of Object.entries(step.pathParams)) {
      const v = resolveParam(raw, ctx, state);
      if (v === undefined || v === null || v === "") {
        return failSkip(start, `Path param "${key}" is empty (expression: ${raw})`);
      }
      resolvedPathParams[key] = String(v);
    }
    resolvedPath = step.path.replace(/\{(\w+)\}/g, (_, name) => {
      if (resolvedPathParams[name] !== undefined) return resolvedPathParams[name];
      // Auto-resolve unspecified ctx-style params from the test context.
      if (name === "project_id") return ctx.projectId;
      if (name === "version_id") return ctx.versionId;
      if (name === "article_id" && ctx.articleId) return ctx.articleId;
      throw new Error(`Path placeholder {${name}} has no value`);
    });
    // Force the path to use the currently selected API version. Flow XML files
    // may hard-code /v2/ or /v3/ (for historical reasons); the selected
    // version in Settings is authoritative at runtime.
    resolvedPath = rewriteApiVersion(resolvedPath, ctx.apiVersion);

    // Resolve query params
    const qParts: string[] = [];
    for (const [key, raw] of Object.entries(step.queryParams)) {
      const v = resolveParam(raw, ctx, state);
      if (v === undefined || v === null || v === "") continue;
      qParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
    if (qParts.length > 0) queryString = `?${qParts.join("&")}`;
  } catch (err) {
    return failError(start, err);
  }

  const requestUrl = `${ctx.baseUrl}${resolvedPath}${queryString}`;

  // Resolve body
  let requestBody: unknown = undefined;
  if (step.body) {
    try {
      const interpolated = substitute(step.body, ctx, state);
      requestBody = JSON.parse(interpolated);
    } catch (err) {
      return failError(start, new Error(`Failed to interpolate request body: ${(err as Error).message}`));
    }
  }

  // Make the HTTP call. We bypass apiClient so each step's request URL/body
  // is captured exactly for the Detail Pane.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.token}`,
    "Content-Type": "application/json",
  };

  let httpStatus: number;
  let responseBody: unknown = undefined;
  let failureReason: string | undefined;
  let networkError: Error | null = null;

  try {
    const res = await fetch(requestUrl, {
      method: step.method,
      headers,
      body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });
    httpStatus = res.status;
    if (res.status !== 204) {
      const text = await res.text();
      if (text) {
        try { responseBody = JSON.parse(text); } catch { responseBody = text; }
      }
    }
    if (!res.ok) {
      failureReason = extractErrorMessage(responseBody) || `HTTP ${res.status}`;
    }
  } catch (err) {
    networkError = err instanceof Error ? err : new Error(String(err));
    httpStatus = 0;
    failureReason = `Network error: ${networkError.message}`;
  }

  // Apply captures (best-effort — capture failures don't break the step).
  for (const cap of step.captures) {
    try {
      const value = resolveCapture(cap, { request: { body: requestBody, pathParams: resolvedPathParams }, response: responseBody });
      if (value !== undefined) {
        const variable = cap.variable.startsWith("state.") ? cap.variable.slice("state.".length) : cap.variable;
        state[variable] = value;
      }
    } catch { /* ignore individual capture failures */ }
  }

  const durationMs = Date.now() - start;
  const stateSnapshot: Record<string, unknown> = { ...state };

  // Status: pass on 2xx unless an assertion fails (the runner runs assertions and
  // downgrades). For network errors we report "error".
  if (networkError) {
    return {
      status: "error",
      durationMs,
      requestUrl,
      requestBody,
      failureReason,
      assertionResults: [],
      stateSnapshot,
    };
  }

  return {
    status: failureReason ? "fail" : "pass",
    httpStatus,
    durationMs,
    requestUrl,
    requestBody,
    responseBody,
    failureReason,
    assertionResults: [],
    stateSnapshot,
  };
}

function failSkip(start: number, reason: string): TestExecutionResult {
  return { status: "skip", durationMs: Date.now() - start, failureReason: reason, assertionResults: [] };
}

function failError(start: number, err: unknown): TestExecutionResult {
  const message = err instanceof Error ? err.message : String(err);
  return { status: "error", durationMs: Date.now() - start, failureReason: message, assertionResults: [] };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    const first = b.errors[0] as Record<string, unknown>;
    if (typeof first.message === "string") return first.message;
  }
  if (typeof b.detail === "string") return b.detail;
  if (typeof b.message === "string") return b.message;
  if (typeof b.title === "string") return b.title;
  return undefined;
}

// ── Param + body interpolation ────────────────────────────────────────────────

/** Resolve a single param value (path/query). Supports plain ctx.X, state.X, or {{expr}}. */
function resolveParam(raw: string, ctx: TestContext, state: RunState): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("ctx.")) return resolveCtx(trimmed.slice("ctx.".length), ctx);
  if (trimmed.startsWith("state.")) return state[trimmed.slice("state.".length)];
  if (trimmed.includes("{{")) {
    const out = substitute(trimmed, ctx, state);
    return tryParseJson(out);
  }
  return trimmed;
}

function resolveCtx(name: string, ctx: TestContext): unknown {
  if (name === "projectId") return ctx.projectId;
  if (name === "versionId") return ctx.versionId;
  if (name === "langCode") return ctx.langCode;
  if (name === "articleId") return ctx.articleId;
  if (name === "apiVersion") return ctx.apiVersion;
  return undefined;
}

/**
 * Replace {{expr}} placeholders in a template. Returns a string suitable for
 * JSON.parse — string values stay as text (preserving surrounding quotes in
 * the template), other types are JSON-encoded so unquoted placeholders like
 * `"version_number": {{state.x}}` become valid JSON literals.
 */
export function substitute(template: string, ctx: TestContext, state: RunState): string {
  return template.replace(/\{\{(!?)([a-zA-Z][a-zA-Z0-9._]*)\}\}/g, (_match, neg, expr) => {
    let value = resolveExpr(expr, ctx, state);
    if (neg) value = !value;
    if (typeof value === "string") return escapeForJsonString(value);
    if (value === undefined) return "null";
    return JSON.stringify(value);
  });
}

/**
 * Strings substituted into a JSON template might contain characters that
 * break the surrounding quotes (e.g. embedded ", \, newline). Escape just
 * those — the template's surrounding quotes remain.
 */
function escapeForJsonString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function resolveExpr(expr: string, ctx: TestContext, state: RunState): unknown {
  if (expr === "timestamp") return Date.now();
  if (expr.startsWith("ctx.")) return resolveCtx(expr.slice("ctx.".length), ctx);
  if (expr.startsWith("state.")) {
    const key = expr.slice("state.".length);
    // support nested state path (rare but cheap to allow)
    if (key.includes(".")) return readDotPath(state, key);
    return state[key];
  }
  return undefined;
}

function readDotPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ── Captures ──────────────────────────────────────────────────────────────────

interface CaptureSources {
  request: { body: unknown; pathParams: Record<string, string> };
  response: unknown;
}

function resolveCapture(
  cap: { source: string; from: "response" | "request" | "computed" },
  sources: CaptureSources,
): unknown {
  const { source, from } = cap;
  if (from === "computed") {
    // Runtime-derived values are described in prose in the source attribute.
    // The runtime interpreter can't execute them automatically — skip.
    return undefined;
  }
  if (from === "request") {
    if (source.startsWith("body.")) return readDotPath(sources.request.body, source.slice("body.".length));
    if (source.startsWith("pathParam.")) return sources.request.pathParams[source.slice("pathParam.".length)];
    return undefined;
  }
  // response
  if (source.startsWith("response.")) return readDotPath(sources.response, source.slice("response.".length));
  return readDotPath(sources.response, source);
}

// ── Misc ──────────────────────────────────────────────────────────────────────

function makeCtxStub(): TestContext {
  // Used by toAssertionDef when substituting field-equals values; ctx.* refs
  // in assertion values are unusual but supported. State refs are the common
  // case and resolve from the runner state at check time.
  return {
    projectId: "", versionId: "", langCode: "", token: "", baseUrl: "", apiVersion: "",
  };
}

function coerce(s: string): unknown {
  // Try JSON first (handles numbers, booleans, null, objects)
  try { return JSON.parse(s); } catch { return s; }
}
