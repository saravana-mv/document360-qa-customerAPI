// Server-side scenario executor.
// Takes a ParsedFlow + RunContext and executes every step sequentially,
// calling upstream APIs directly (no browser proxy). Returns a structured result.

import type {
  ParsedFlow,
  ParsedStep,
  ParsedCapture,
  ParsedAssertion,
  RunContext,
  StepResult,
  StepStatus,
  AssertionResult,
  ScenarioRunResult,
  ScenarioStatus,
} from "./types";
import {
  rewriteApiVersion,
  substitute,
  substituteStrict,
  resolveParam,
  readDotPath,
  readPath,
  fieldExists,
  jsonEqual,
  coerce,
  type RunState,
} from "./interpolation";

/**
 * Execute a parsed flow end-to-end. Returns a structured result object.
 *
 * Execution order:
 *   1. All non-teardown steps in order (setup + main)
 *   2. If stopOnFailure and a step fails → skip remaining main steps
 *   3. All teardown steps always run (cleanup must happen even on failure)
 */
export async function executeScenario(
  flow: ParsedFlow,
  ctx: RunContext,
  scenarioId: string,
): Promise<ScenarioRunResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const state: RunState = {};
  const warnings: string[] = [];

  const mainSteps = flow.steps.filter((s) => !s.teardown);
  const teardownSteps = flow.steps.filter((s) => s.teardown);

  const stepResults: StepResult[] = [];
  let aborted = false;

  const stepDelay = ctx.delayBetweenStepsMs ?? 0;

  // Run main steps
  for (let i = 0; i < mainSteps.length; i++) {
    const step = mainSteps[i];
    if (aborted) {
      stepResults.push(skipResult(step, "Skipped — previous step failed"));
      continue;
    }
    if (i > 0 && stepDelay > 0) {
      await new Promise((r) => setTimeout(r, stepDelay));
    }
    const result = await executeStep(step, ctx, state, warnings);
    stepResults.push(result);
    if (result.status === "fail" || result.status === "error") {
      if (flow.stopOnFailure) aborted = true;
    }
  }

  // Teardown steps always run
  for (const step of teardownSteps) {
    const result = await executeStep(step, ctx, state, warnings);
    stepResults.push(result);
    // Teardown failures are warnings, not scenario-level failures
    if (result.status === "fail" || result.status === "error") {
      warnings.push(`Teardown step ${step.number} (${step.name}) ${result.status}: ${result.failureReason ?? "unknown"}`);
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const summary = {
    total: stepResults.length,
    pass: stepResults.filter((r) => r.status === "pass").length,
    fail: stepResults.filter((r) => r.status === "fail").length,
    skip: stepResults.filter((r) => r.status === "skip").length,
    error: stepResults.filter((r) => r.status === "error").length,
    durationMs,
  };

  let status: ScenarioStatus = "pass";
  if (summary.error > 0) status = "error";
  else if (summary.fail > 0) status = "fail";

  return {
    scenarioId,
    scenarioName: flow.name,
    status,
    summary,
    steps: stepResults,
    warnings,
    startedAt,
    completedAt,
  };
}

// ── Step execution ──────────────────────────────────────────────────────────

async function executeStep(
  step: ParsedStep,
  ctx: RunContext,
  state: RunState,
  warnings: string[],
): Promise<StepResult> {
  const start = Date.now();
  let resolvedPath: string;
  let queryString = "";
  const resolvedPathParams: Record<string, string> = {};

  try {
    // Resolve path params
    for (const [key, raw] of Object.entries(step.pathParams)) {
      const v = resolveParam(raw, ctx, state);
      if (v === undefined || v === null || v === "") {
        return makeResult(step, start, "skip", { failureReason: `Path param "${key}" is empty (expression: ${raw})` });
      }
      resolvedPathParams[key] = String(v);
    }
    resolvedPath = step.path.replace(/\{(\w+)\}/g, (_, name) => {
      if (resolvedPathParams[name] !== undefined) return resolvedPathParams[name];
      // Auto-resolve unspecified path params from project variables
      const projValue = ctx.projectVariables?.[name];
      if (projValue !== undefined && projValue !== "") return projValue;
      throw new Error(`Path placeholder {${name}} has no value — define it as a project variable`);
    });
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
    const msg = err instanceof Error ? err.message : String(err);
    return makeResult(step, start, "error", { failureReason: msg });
  }

  const requestUrl = `${ctx.baseUrl}${resolvedPath}${queryString}`;

  // Resolve body — fail the step if any state/proj variables are unresolved
  let requestBody: unknown = undefined;
  if (step.body) {
    try {
      const { result: interpolated, unresolved } = substituteStrict(step.body, ctx, state);
      if (unresolved.length > 0) {
        const varList = unresolved.map((v) => `{{${v}}}`).join(", ");
        return makeResult(step, start, "fail", {
          failureReason: `Request body has unresolved variables: ${varList} — expected values were not captured by a previous step or are not defined`,
          requestUrl,
        });
      }
      requestBody = JSON.parse(interpolated);
    } catch (err) {
      return makeResult(step, start, "error", {
        failureReason: `Failed to interpolate request body: ${(err as Error).message}`,
        requestUrl,
      });
    }
  }

  // Build headers — call upstream API directly (no proxy)
  const headers: Record<string, string> = {};
  if (requestBody !== undefined) headers["Content-Type"] = "application/json";
  if (!step.noAuth) {
    if (ctx.authMethod === "oauth" && ctx.accessToken) {
      headers["Authorization"] = `Bearer ${ctx.accessToken}`;
    } else if (ctx.authMethod === "apikey" && ctx.apiKey) {
      headers["api_token"] = ctx.apiKey;
    }
  }

  let httpStatus: number;
  let responseBody: unknown = undefined;
  let failureReason: string | undefined;

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
    const msg = err instanceof Error ? err.message : String(err);
    if (step.noAuth) {
      // Expected — noAuth steps may get 401
      httpStatus = 401;
      failureReason = "HTTP 401";
    } else {
      return makeResult(step, start, "error", {
        failureReason: `Network error: ${msg}`,
        requestUrl,
        requestBody,
      });
    }
  }

  // Apply captures — failed captures mark the step as failed because
  // downstream steps depend on the captured state variables.
  const captureErrors: string[] = [];
  for (const cap of step.captures) {
    try {
      const value = resolveCapture(cap, {
        request: { body: requestBody, pathParams: resolvedPathParams },
        response: responseBody,
      });
      const variable = cap.variable.startsWith("state.")
        ? cap.variable.slice("state.".length)
        : cap.variable;
      if (value === undefined || value === null) {
        captureErrors.push(`Capture "${cap.variable}" resolved to ${value === null ? "null" : "undefined"} (source: ${cap.from}.${cap.source})`);
      } else {
        state[variable] = value;
      }
    } catch (err) {
      captureErrors.push(`Capture "${cap.variable}" threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Capture failures → fail the step so downstream steps don't run with missing state
  if (captureErrors.length > 0 && !failureReason) {
    failureReason = `State capture failed: ${captureErrors.join("; ")}`;
  }

  // Run assertions
  const assertionResults = runAssertions(step.assertions, httpStatus!, responseBody, state, ctx);
  const anyAssertionFailed = assertionResults.some((a) => !a.passed);

  // Determine step status
  let status: StepStatus;
  if (failureReason && !step.assertions.some((a) => a.type === "status")) {
    // Non-ok HTTP without an explicit status assertion = fail
    status = "fail";
  } else if (anyAssertionFailed) {
    status = "fail";
    if (!failureReason) {
      const failed = assertionResults.filter((a) => !a.passed).map((a) => a.description);
      failureReason = `Assertion failed: ${failed.join("; ")}`;
    }
  } else {
    // If there's a status assertion that passed, clear the failureReason
    // (e.g. step expects 404 and got 404 — that's a pass, not a fail)
    if (failureReason && step.assertions.some((a) => a.type === "status")) {
      const statusAssertion = assertionResults.find((a) => a.id.startsWith("status-"));
      if (statusAssertion?.passed) failureReason = undefined;
    }
    status = failureReason ? "fail" : "pass";
  }

  return makeResult(step, start, status, {
    httpStatus: httpStatus!,
    failureReason,
    assertionResults,
    requestUrl,
    requestBody,
    responseBody,
  });
}

// ── Assertions ──────────────────────────────────────────────────────────────

/** Strip `response.` prefix from assertion fields for consistency with captures. */
function normalizeAssertionField(field: string): string {
  return field.startsWith("response.") ? field.slice("response.".length) : field;
}

function runAssertions(
  assertions: ParsedAssertion[],
  httpStatus: number,
  responseBody: unknown,
  state: RunState,
  ctx: RunContext,
): AssertionResult[] {
  return assertions.map((a) => {
    if (a.type === "status") {
      return {
        id: `status-${a.code}`,
        description: `Response status is ${a.code}`,
        passed: httpStatus === a.code,
      };
    }
    if (a.type === "field-exists") {
      const field = normalizeAssertionField(a.field);
      return {
        id: `field-exists-${a.field}`,
        description: `Response body has field "${a.field}"`,
        passed: fieldExists(responseBody, field),
      };
    }
    if (a.type === "array-not-empty") {
      const field = normalizeAssertionField(a.field);
      const v = readPath(responseBody, field);
      return {
        id: `array-not-empty-${a.field}`,
        description: `Field "${a.field}" is a non-empty array`,
        passed: Array.isArray(v) && v.length > 0,
      };
    }
    // field-equals
    const field = normalizeAssertionField(a.field);
    const actual = readPath(responseBody, field);
    const expected = coerce(substitute(a.value, ctx, state));
    return {
      id: `field-equals-${a.field}`,
      description: `Field "${a.field}" equals ${a.value}`,
      passed: jsonEqual(actual, expected),
    };
  });
}

// ── Captures ────────────────────────────────────────────────────────────────

interface CaptureSources {
  request: { body: unknown; pathParams: Record<string, string> };
  response: unknown;
}

function resolveCapture(
  cap: { source: string; from: "response" | "request" | "computed" },
  sources: CaptureSources,
): unknown {
  const { source, from } = cap;
  if (from === "computed") return undefined;
  if (from === "request") {
    if (source.startsWith("body.")) return readDotPath(sources.request.body, source.slice("body.".length));
    if (source.startsWith("pathParam.")) return sources.request.pathParams[source.slice("pathParam.".length)];
    return undefined;
  }
  if (source.startsWith("response.")) return readDotPath(sources.response, source.slice("response.".length));
  return readDotPath(sources.response, source);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function skipResult(step: ParsedStep, reason: string): StepResult {
  return {
    number: step.number,
    name: `Step ${step.number}: ${step.name}`,
    status: "skip",
    durationMs: 0,
    failureReason: reason,
    assertionResults: [],
  };
}

function makeResult(
  step: ParsedStep,
  startMs: number,
  status: StepStatus,
  extra: Partial<StepResult> = {},
): StepResult {
  return {
    number: step.number,
    name: `Step ${step.number}: ${step.name}`,
    status,
    durationMs: Date.now() - startMs,
    assertionResults: [],
    ...extra,
  };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;

  if (Array.isArray(b.errors) && b.errors.length > 0) {
    const parts = (b.errors as Array<Record<string, unknown>>)
      .map((e) => {
        const msg = typeof e.message === "string" ? e.message : "";
        const field = typeof e.field === "string" ? e.field : "";
        const code = typeof e.code === "string" ? e.code : "";
        return field ? `${msg} (field: ${field})` : code ? `${msg} [${code}]` : msg;
      })
      .filter(Boolean);
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
