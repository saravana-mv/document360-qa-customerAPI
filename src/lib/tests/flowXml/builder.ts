// Converts a ParsedFlow into a list of runnable TestDef objects.

import type {
  TestDef,
  TestContext,
  RunState,
  TestExecutionResult,
  AssertionDef,
} from "../../../types/test.types";
import type { ParsedFlow, ParsedStep, ParsedAssertion } from "./types";
import { enumMatches } from "./enumAliases";

interface BuiltFlow {
  tag: string;             // ParsedFlow.name
  entity: string;
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
  return { tag: parsed.name, entity: parsed.entity, tests };
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
    entity: flow.entity,
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
  if (typeof a === "number" && typeof b === "string") {
    if (String(a) === b) return true;
    // Enum aliases: API returns integers (e.g. 0) while specs and flow
    // XML often use the string name (e.g. "draft"). Treat them as equal.
    if (enumMatches(b, a)) return true;
  }
  if (typeof a === "string" && typeof b === "number") {
    if (a === String(b)) return true;
    if (enumMatches(a, b)) return true;
  }
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
      // Auto-resolve unspecified path params from project variables (proj.*)
      const projValue = ctx.projectVariables?.[name];
      if (projValue !== undefined && projValue !== "") return projValue;
      throw new Error(`Path placeholder {${name}} has no value — define it as a project variable`);
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

  // requestUrl is what we CAPTURE and DISPLAY — the upstream API URL so the
  // Detail pane matches the public API docs. fetchUrl is what we actually
  // call, which goes through our server-side proxy so credentials never
  // reach the browser.
  const requestUrl = `${ctx.baseUrl}${resolvedPath}${queryString}`;
  const fetchUrl = `/api/proxy${resolvedPath}${queryString}`;

  // Resolve body — fail the step if any state/proj variables are unresolved
  // so we don't send a body with null values that the API will reject.
  let requestBody: unknown = undefined;
  if (step.body) {
    try {
      const { result: interpolated, unresolved } = substituteStrict(step.body, ctx, state);
      if (unresolved.length > 0) {
        const varList = unresolved.map((v) => `{{${v}}}`).join(", ");
        return {
          status: "fail",
          durationMs: Date.now() - start,
          failureReason: `Request body has unresolved variables: ${varList} — expected values were not captured by a previous step or are not defined`,
          assertionResults: [],
          stateSnapshot: { ...state },
        };
      }
      requestBody = JSON.parse(interpolated);
    } catch (err) {
      return failError(start, new Error(`Failed to interpolate request body: ${(err as Error).message}`));
    }
  }

  // Make the HTTP call. We bypass apiClient so each step's request URL/body
  // is captured exactly for the Detail Pane.
  //
  // The request goes through /api/proxy, which injects credentials server-side.
  // We signal noAuth steps so the proxy forwards without auth — X-FF-No-Auth: 1.
  // Only declare a Content-Type when we actually send a body. Many APIs return
  // 500 when DELETE/GET arrives with Content-Type: application/json but no
  // payload — the model binder tries to parse the empty body as JSON and throws.
  //
  const headers: Record<string, string> = {};
  if (requestBody !== undefined) headers["Content-Type"] = "application/json";
  if (step.noAuth) headers["X-FF-No-Auth"] = "1";
  if (ctx.authType && ctx.authType !== "none" && ctx.authVersion) {
    headers["X-FF-Auth-Type"] = ctx.authType;
    headers["X-FF-Version"] = ctx.authVersion;
    if (ctx.authHeaderName) headers["X-FF-Auth-Header-Name"] = ctx.authHeaderName;
    if (ctx.authQueryParam) headers["X-FF-Auth-Query-Param"] = ctx.authQueryParam;
  }
  if (ctx.connectionId) headers["X-FF-Connection-Id"] = ctx.connectionId;
  if (ctx.baseUrl) headers["X-FF-Base-Url"] = ctx.baseUrl;

  let httpStatus: number;
  let responseBody: unknown = undefined;
  let responseHeaders: Record<string, string> = {};
  let failureReason: string | undefined;
  let networkError: Error | null = null;

  try {
    const res = await fetch(fetchUrl, {
      method: step.method,
      headers,
      body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });
    httpStatus = res.status;
    res.headers.forEach((value, key) => { responseHeaders[key] = value; });
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
    // For noAuth steps, a CORS/network error is expected — the API returns 401
    // without CORS headers, so the browser blocks the response. Treat it as 401.
    if (step.noAuth) {
      httpStatus = 401;
      failureReason = "HTTP 401";
    } else {
      httpStatus = 0;
      failureReason = `Network error: ${networkError.message}`;
    }
  }

  // Apply captures — failed captures mark the step as failed because
  // downstream steps depend on the captured state variables.
  const captureErrors: string[] = [];
  for (const cap of step.captures) {
    try {
      const value = resolveCapture(cap, { request: { body: requestBody, pathParams: resolvedPathParams }, response: responseBody });
      const variable = cap.variable.startsWith("state.") ? cap.variable.slice("state.".length) : cap.variable;
      if (value === undefined || value === null) {
        captureErrors.push(`Capture "${cap.variable}" resolved to ${value === null ? "null" : "undefined"} (source: ${cap.from}.${cap.source})`);
      } else {
        state[variable] = value;
      }
    } catch (err) {
      captureErrors.push(`Capture "${cap.variable}" threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const durationMs = Date.now() - start;
  const stateSnapshot: Record<string, unknown> = { ...state };

  // For genuine network errors (not noAuth CORS failures), report "error".
  if (networkError && !step.noAuth) {
    return {
      status: "error",
      durationMs,
      requestUrl,
      requestHeaders: headers,
      requestBody,
      failureReason,
      assertionResults: [],
      stateSnapshot,
    };
  }

  // Capture failures → fail the step so downstream steps don't run with missing state
  if (captureErrors.length > 0 && !failureReason) {
    failureReason = `State capture failed: ${captureErrors.join("; ")}`;
  }

  return {
    status: failureReason ? "fail" : "pass",
    httpStatus,
    durationMs,
    requestUrl,
    requestHeaders: headers,
    requestBody,
    responseBody,
    responseHeaders,
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

  // ProblemDetails / RFC 7807: collect all errors with field info for debugging
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    const parts = (b.errors as Array<Record<string, unknown>>).map((e) => {
      const msg = typeof e.message === "string" ? e.message : "";
      const field = typeof e.field === "string" ? e.field : "";
      const code = typeof e.code === "string" ? e.code : "";
      return field ? `${msg} (field: ${field})` : code ? `${msg} [${code}]` : msg;
    }).filter(Boolean);
    if (parts.length > 0) {
      const prefix = typeof b.detail === "string" ? `${b.detail} — ` : "";
      return `${prefix}${parts.join("; ")}`;
    }
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
  if (trimmed.startsWith("proj.")) return ctx.projectVariables?.[trimmed.slice("proj.".length)];
  if (trimmed.includes("{{")) {
    const out = substitute(trimmed, ctx, state);
    return tryParseJson(out);
  }
  return trimmed;
}

function resolveCtx(name: string, ctx: TestContext): unknown {
  if (name === "apiVersion") return ctx.apiVersion;
  // Backward compat: map old ctx.X to proj.* variables (try camelCase then snake_case)
  if (name === "projectId") return ctx.projectVariables?.["projectId"] ?? ctx.projectVariables?.["project_id"];
  if (name === "versionId") return ctx.projectVariables?.["versionId"] ?? ctx.projectVariables?.["version_id"];
  if (name === "langCode") return ctx.projectVariables?.["langCode"] ?? ctx.projectVariables?.["lang_code"];
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
 * Like substitute() but collects unresolved variable names instead of
 * silently replacing them with "null". Returns both the interpolated
 * string and the list of unresolved expressions.
 */
export function substituteStrict(
  template: string, ctx: TestContext, state: RunState,
): { result: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const result = template.replace(/\{\{(!?)([a-zA-Z][a-zA-Z0-9._]*)\}\}/g, (_match, neg, expr) => {
    let value = resolveExpr(expr, ctx, state);
    if (neg) value = !value;
    if (typeof value === "string") return escapeForJsonString(value);
    if (value === undefined || value === null) {
      unresolved.push(expr as string);
      return "null";
    }
    return JSON.stringify(value);
  });
  return { result, unresolved };
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
  if (expr.startsWith("proj.")) {
    const key = expr.slice("proj.".length);
    return ctx.projectVariables?.[key];
  }
  return undefined;
}

function readDotPath(obj: unknown, path: string): unknown {
  // Split on "." but also expand bracket notation: "data[0].id" → ["data", "0", "id"]
  const parts: string[] = [];
  for (const segment of path.split(".")) {
    const bracketMatch = segment.match(/^([^[]*)\[(\d+)]$/);
    if (bracketMatch) {
      if (bracketMatch[1]) parts.push(bracketMatch[1]);
      parts.push(bracketMatch[2]);
    } else {
      parts.push(segment);
    }
  }
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isNaN(idx) ? undefined : cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[p];
    }
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
  return { token: "", baseUrl: "", apiVersion: "" };
}

function coerce(s: string): unknown {
  // Try JSON first (handles numbers, booleans, null, objects)
  try { return JSON.parse(s); } catch { return s; }
}
