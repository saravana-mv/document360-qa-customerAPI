/**
 * Golden Response Injection — queries Cosmos for recent successful step
 * results matching endpoints in the flow being generated. Provides real
 * API response examples to improve AI-generated assertions.
 */

import { getTestRunsContainer } from "./cosmosClient";

export interface GoldenResponse {
  method: string;
  path: string;
  statusCode: number;
  responseBody: string;
  requestBody?: string;
  /** Source run metadata for trace logging */
  _runId: string;
  _stepIndex: number;
}

/** Max golden responses injected into the prompt */
const MAX_GOLDEN_RESPONSES = 5;
/** Max chars for the entire golden block */
const MAX_GOLDEN_BLOCK_CHARS = 10_000;
/** Max chars per individual response body */
const MAX_BODY_CHARS = 2000;

/**
 * Truncate a JSON string to maxChars. Tries to parse + re-stringify
 * for clean formatting, falls back to raw slice.
 */
export function truncateBody(json: string, maxChars = MAX_BODY_CHARS): string {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    formatted = json;
  }
  if (formatted.length <= maxChars) return formatted;
  return formatted.slice(0, maxChars) + "\n... (truncated)";
}

/**
 * Format golden responses into a markdown block for injection into
 * the AI user message.
 */
export function formatGoldenResponses(responses: GoldenResponse[]): string {
  if (responses.length === 0) return "";

  const sections: string[] = [];
  let totalChars = 0;

  for (const r of responses) {
    const bodyBlock = truncateBody(r.responseBody);
    let section = `### ${r.method} ${r.path}\nStatus: ${r.statusCode}\nResponse body:\n\`\`\`json\n${bodyBlock}\n\`\`\``;
    if (r.requestBody) {
      const reqBlock = truncateBody(r.requestBody);
      section += `\nRequest body:\n\`\`\`json\n${reqBlock}\n\`\`\``;
    }

    if (totalChars + section.length > MAX_GOLDEN_BLOCK_CHARS) break;
    sections.push(section);
    totalChars += section.length;
  }

  if (sections.length === 0) return "";

  return `## Real API Response Examples\nThese are actual responses from recent successful test runs. Use them to write richer, more accurate assertions.\n\n${sections.join("\n\n")}`;
}

/**
 * Step-like structure from test run results.
 * Browser-side: testResults object values have path+method as template paths.
 * Server-side: steps array items have requestUrl (resolved) + method.
 */
interface StepLike {
  status?: string;
  method?: string;
  path?: string;
  requestUrl?: string;
  httpStatus?: number;
  responseBody?: unknown;
  requestBody?: unknown;
}

/**
 * Normalize an endpoint path into a structural pattern for matching.
 * - Strips version prefix (/v3/ → /)
 * - Replaces {placeholder} tokens with *
 * - Replaces UUID-like segments with * (for resolved URLs from server-side runs)
 * - Replaces numeric segments that look like IDs with *
 * - Lowercases
 */
export function normalizePath(p: string): string {
  return p
    .replace(/^\/v\d+\//, "/")                           // strip version prefix
    .replace(/\{[^}]+\}/g, "*")                          // {placeholder} → *
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/*") // UUID segments → *
    .replace(/\/\d{5,}/g, "/*")                          // long numeric IDs → *
    .replace(/\?.*$/, "")                                // strip query string
    .toLowerCase();
}

function extractMethodPath(step: StepLike): { method: string; path: string } | null {
  // Browser-side runs: testResult has path (template) + method
  // Prefer this over requestUrl because templates match spec endpoints better
  if (step.method && step.path) {
    return { method: step.method, path: step.path };
  }

  // Server-side runs: step has method + requestUrl (resolved, full URL)
  if (step.method && step.requestUrl) {
    let path = step.requestUrl;
    try {
      const url = new URL(path.startsWith("http") ? path : `https://dummy${path}`);
      path = url.pathname;
    } catch { /* use as-is */ }
    return { method: step.method, path };
  }

  return null;
}

/**
 * Collect all step-like results from a test run document.
 * Handles both browser-side format (tagResults object + testResults object)
 * and server-side format (steps array).
 */
function collectSteps(run: Record<string, unknown>): StepLike[] {
  const steps: StepLike[] = [];

  // Server-side runs: .steps[] array
  if (Array.isArray(run.steps)) {
    steps.push(...(run.steps as StepLike[]));
  }

  // Browser-side runs: .testResults is an OBJECT keyed by testId, not an array
  // e.g., { "xml:flow.s1": { status: "pass", path: "...", method: "POST", ... } }
  if (run.testResults && typeof run.testResults === "object" && !Array.isArray(run.testResults)) {
    steps.push(...Object.values(run.testResults as Record<string, StepLike>));
  }

  // Browser-side: .tagResults is an OBJECT keyed by tag name
  // e.g., { "Flow Name": { tests: [...] } }
  // The tests inside tagResults are the initial TestDef snapshots (status:"idle"),
  // not the final results — prefer testResults above which has the actual results.
  // Only fall back to tagResults if testResults is missing.
  if (steps.length === 0 && run.tagResults && typeof run.tagResults === "object" && !Array.isArray(run.tagResults)) {
    for (const tag of Object.values(run.tagResults as Record<string, { tests?: StepLike[] }>)) {
      if (Array.isArray(tag.tests)) {
        steps.push(...tag.tests);
      }
    }
  }

  return steps;
}

export interface GoldenSearchResult {
  responses: GoldenResponse[];
  /** Search metadata for trace/debug visibility */
  meta: {
    endpointsSearched: string[];
    normalizedPatterns: string[];
    runsScanned: number;
    matchesFound: number;
  };
}

/**
 * Query Cosmos for recent successful step results matching the given endpoints.
 * Returns deduplicated golden responses (most recent per method+normalized path)
 * plus search metadata for observability.
 */
export async function loadGoldenResponses(
  projectId: string,
  endpoints: string[],
): Promise<GoldenSearchResult> {
  const emptyResult: GoldenSearchResult = {
    responses: [],
    meta: { endpointsSearched: endpoints, normalizedPatterns: endpoints.map(normalizePath), runsScanned: 0, matchesFound: 0 },
  };

  if (!endpoints.length) return emptyResult;

  try {
    const container = await getTestRunsContainer();

    // Query recent runs (limit 10) ordered by completedAt DESC
    const query = {
      query: `SELECT * FROM c WHERE c.projectId = @pid AND c.type = "test_run" ORDER BY c.completedAt DESC OFFSET 0 LIMIT 10`,
      parameters: [{ name: "@pid", value: projectId }],
    };

    const { resources: runs } = await container.items
      .query(query, { partitionKey: projectId })
      .fetchAll();

    if (!runs || runs.length === 0) {
      console.log("[goldenResponses] No recent runs found");
      return emptyResult;
    }

    const endpointPatterns = endpoints.map(normalizePath);
    console.log(`[goldenResponses] Searching ${runs.length} runs for ${endpointPatterns.length} endpoint patterns:`, endpointPatterns.slice(0, 10));

    // Collect passing step results across all runs, dedup by normalized method+path
    const seen = new Map<string, GoldenResponse>();

    for (const run of runs) {
      const runId = run.id as string;
      const allSteps = collectSteps(run as Record<string, unknown>);

      for (let i = 0; i < allSteps.length; i++) {
        const step = allSteps[i];
        if (step.status !== "pass") continue;
        if (!step.responseBody) continue;

        const mp = extractMethodPath(step);
        if (!mp) continue;

        const normalizedPath = normalizePath(mp.path);
        const matches = endpointPatterns.some((ep) => normalizedPath === ep);
        if (!matches) continue;

        // Dedup by method + normalized path (keep most recent = first encountered)
        const dedupKey = `${mp.method} ${normalizedPath}`;
        if (seen.has(dedupKey)) continue;

        const responseStr = typeof step.responseBody === "string"
          ? step.responseBody
          : JSON.stringify(step.responseBody);

        const requestStr = step.requestBody
          ? (typeof step.requestBody === "string" ? step.requestBody : JSON.stringify(step.requestBody))
          : undefined;

        seen.set(dedupKey, {
          method: mp.method,
          path: mp.path,
          statusCode: step.httpStatus ?? 200,
          responseBody: responseStr,
          requestBody: requestStr,
          _runId: runId,
          _stepIndex: i,
        });
      }
    }

    const responses = [...seen.values()].slice(0, MAX_GOLDEN_RESPONSES);
    console.log(`[goldenResponses] Found ${responses.length} golden responses from ${seen.size} unique matches`);
    return {
      responses,
      meta: {
        endpointsSearched: endpoints,
        normalizedPatterns: endpointPatterns,
        runsScanned: runs.length,
        matchesFound: seen.size,
      },
    };
  } catch (e) {
    console.error("[goldenResponses] Failed to load golden responses:", e instanceof Error ? e.message : String(e));
    return { ...emptyResult, meta: { ...emptyResult.meta, endpointsSearched: endpoints } };
  }
}

/**
 * Extract endpoint paths from spec context markdown.
 * Handles multiple formats:
 * - Distilled: "## Endpoint: GET /v3/projects/{project_id}/articles"
 * - Digest:    "- **GET /v3/projects/{project_id}/articles** — summary"
 * - Raw:       "GET /v3/projects/{project_id}/articles"
 * - Markdown:  "**Path**: `/v3/projects/{project_id}/articles`"
 */
export function extractEndpointsFromContext(
  _specFiles: string[],
  specContext: string,
): string[] {
  const paths = new Set<string>();
  let m: RegExpExecArray | null;

  // Distilled format: "## Endpoint: METHOD /path"
  const endpointHeaderRe = /^##\s+Endpoint:\s+(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s\n]+)/gim;
  while ((m = endpointHeaderRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  // Digest format: "- **METHOD /path**"
  const digestRe = /\*\*(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s*]+)\*\*/gi;
  while ((m = digestRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  // Generic: bare "METHOD /path" (catches raw spec and other formats)
  const bareRe = /(?:^|[\s>])(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s\n,)]+)/gim;
  while ((m = bareRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  // Markdown path label: "**Path**: `/v3/...`" or "Path: /v3/..."
  const mdPathRe = /\*?\*?Path\*?\*?:\s*`?(\/[^\s`\n]+)/gi;
  while ((m = mdPathRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  return [...paths];
}
