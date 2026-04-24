// Server-side flow runner types.
// Self-contained — no browser or frontend dependencies.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// ── Parsed flow (output of XML parser) ──────────────────────────────────────

export interface ParsedFlow {
  name: string;
  entity: string;
  description?: string;
  stopOnFailure: boolean;
  steps: ParsedStep[];
}

export interface ParsedStep {
  number: number;
  name: string;
  endpointRef?: string;
  method: HttpMethod;
  path: string;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  body?: string;
  captures: ParsedCapture[];
  assertions: ParsedAssertion[];
  teardown: boolean;
  noAuth: boolean;
  notes?: string;
}

export interface ParsedCapture {
  variable: string;
  source: string;
  from: "response" | "request" | "computed";
}

export type ParsedAssertion =
  | { type: "status"; code: number }
  | { type: "field-exists"; field: string }
  | { type: "field-equals"; field: string; value: string }
  | { type: "array-not-empty"; field: string };

// ── Execution context (injected by the run-scenario endpoint) ───────────────

export interface RunContext {
  apiVersion: string;
  /** Absolute base URL for the upstream API. */
  baseUrl: string;
  /** Bearer/OAuth access token for upstream API calls. */
  accessToken?: string;
  /** API key (alternative to OAuth). */
  apiKey?: string;
  authMethod: "oauth" | "apikey" | "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie" | "none";
  /** Project-level variables (proj.varName). */
  projectVariables?: Record<string, string>;
}

// ── Execution results ───────────────────────────────────────────────────────

export interface AssertionResult {
  id: string;
  description: string;
  passed: boolean;
}

export type StepStatus = "pass" | "fail" | "skip" | "error";

export interface StepResult {
  number: number;
  name: string;
  status: StepStatus;
  httpStatus?: number;
  durationMs: number;
  failureReason?: string;
  assertionResults: AssertionResult[];
  requestUrl?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}

export type ScenarioStatus = "pass" | "fail" | "error";

export interface ScenarioRunResult {
  scenarioId: string;
  scenarioName: string;
  status: ScenarioStatus;
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    error: number;
    durationMs: number;
  };
  steps: StepResult[];
  warnings: string[];
  startedAt: string;
  completedAt: string;
}
