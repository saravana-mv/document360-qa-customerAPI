export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TestStatus = "idle" | "running" | "pass" | "fail" | "skip" | "error";
export type RollupStatus = "idle" | "running" | "pass" | "fail" | "partial";

export type AuthType = "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie" | "oauth" | "none";

export interface TestContext {
  projectId: string;
  versionId: string;
  langCode: string;
  token: string;
  baseUrl: string;
  apiVersion: string; // e.g. "v3"
  /** Auth type for the target endpoint */
  authType?: AuthType;
  /** Version hint for proxy credential lookup (e.g. "v2") */
  authVersion?: string;
  /** Header name for apikey_header auth (e.g. "X-Api-Key") */
  authHeaderName?: string;
  /** Query param name for apikey_query auth (e.g. "api_key") */
  authQueryParam?: string;
  /** Project-level variables (proj.varName). */
  projectVariables?: Record<string, string>;
}

export interface RunState {
  [key: string]: unknown;
}

export interface AssertionDef {
  id: string;
  description: string;
  check: (result: TestExecutionResult, state: RunState) => boolean;
}

export interface AssertionResult {
  id: string;
  description: string;
  passed: boolean;
}

export interface TestDef {
  id: string;
  name: string;
  tag: string;         // Flow name (e.g. "Full Article CRUD Lifecycle")
  entity?: string;      // Domain entity (e.g. "Articles", "Categories")
  path: string;
  method: HttpMethod;
  description?: string;           // Human-readable explanation shown in Design tab
  sampleRequestBody?: unknown;    // Example request body shown in Design tab
  queryParams?: Record<string, string>;  // Static query params shown in Design tab
  // Per-param metadata for Design tab (keyed by param name without braces, e.g. "version_number").
  // Only needed for state-based params — ctx params are resolved automatically from setup store.
  pathParamsMeta?: Record<string, {
    value: string;     // Display value, e.g. "{{state.firstVersionNumber}}"
    tooltip?: string;  // Hover explanation, e.g. "Captured in Step 1 · response.data[0].version_number"
  }>;
  setup?: (ctx: TestContext, state: RunState) => Promise<void>;
  execute: (ctx: TestContext, state: RunState) => Promise<TestExecutionResult>;
  teardown?: (ctx: TestContext, state: RunState) => Promise<void>;
  /**
   * If true, this step is a cleanup/teardown step. The runner will still
   * execute it even if a preceding step in the same flow failed (so that
   * created resources are torn down). Non-teardown remaining steps are
   * skipped as usual.
   */
  isTeardown?: boolean;
  assertions: AssertionDef[];
  /**
   * For tests built from a .flow.xml file: the blob name of the source file
   * (e.g. "articles/article-version-lifecycle.flow.xml"). Undefined for
   * programmatically registered tests. Used by the detail pane's Flow XML tab.
   */
  flowFileName?: string;
}

export interface TestExecutionResult {
  status: "pass" | "fail" | "skip" | "error";
  httpStatus?: number;
  durationMs: number;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  failureReason?: string;
  assertionResults: AssertionResult[];
  // Additional context for skip/fail debugging — shown in Run tab as "State Snapshot"
  stateSnapshot?: Record<string, unknown>;
}

export interface TestResult {
  testId: string;
  testName: string;
  tag: string;
  path: string;
  method: HttpMethod;
  status: TestStatus;
  durationMs?: number;
  httpStatus?: number;
  failureReason?: string;
  assertionResults: AssertionResult[];
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  stateSnapshot?: Record<string, unknown>;
  startedAt?: number;
  completedAt?: number;
}

export interface TagResult {
  tag: string;
  status: RollupStatus;
  tests: TestResult[];
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  skip: number;
  error: number;
  durationMs: number;
  startedAt: number;
  completedAt?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "success" | "error" | "warn";
  message: string;
  testId?: string;
  testName?: string;
  tag?: string;
}
