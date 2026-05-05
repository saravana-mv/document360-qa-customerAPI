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
 * Extract method + path from step results across both browser-side
 * and server-side run document formats.
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

function extractMethodPath(step: StepLike, runBaseUrl?: string): { method: string; path: string } | null {
  // Server-side runs: step has method + url directly
  if (step.method && step.requestUrl) {
    let path = step.requestUrl;
    // Strip base URL to get just the path
    if (runBaseUrl && path.startsWith(runBaseUrl)) {
      path = path.slice(runBaseUrl.length);
    }
    try {
      const url = new URL(path.startsWith("http") ? path : `https://dummy${path}`);
      path = url.pathname;
    } catch { /* use as-is */ }
    return { method: step.method, path };
  }

  // Browser-side runs: testResult has path + method at top level
  if (step.method && step.path) {
    return { method: step.method, path: step.path };
  }

  return null;
}

/**
 * Query Cosmos for recent successful step results matching the given endpoints.
 * Returns deduplicated golden responses (most recent per method+path).
 */
export async function loadGoldenResponses(
  projectId: string,
  endpoints: string[],
): Promise<GoldenResponse[]> {
  if (!endpoints.length) return [];

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

    if (!runs || runs.length === 0) return [];

    // Normalize endpoint paths for matching (strip version prefix for flexible matching)
    const normalizeEndpoint = (p: string): string =>
      p.replace(/^\/v\d+\//, "/").replace(/\{[^}]+\}/g, "*").toLowerCase();

    const endpointPatterns = endpoints.map(normalizeEndpoint);

    // Collect passing step results across all runs
    const seen = new Map<string, GoldenResponse>(); // method+path → golden

    for (const run of runs) {
      const runId = run.id as string;

      // Server-side runs have .steps[]
      const serverSteps: StepLike[] = Array.isArray(run.steps) ? run.steps : [];

      // Browser-side runs have .tagResults[].tests[]
      const browserSteps: StepLike[] = [];
      if (Array.isArray(run.tagResults)) {
        for (const tag of run.tagResults) {
          if (Array.isArray(tag.tests)) {
            browserSteps.push(...tag.tests);
          }
        }
      }
      // Also check flat testResults array
      if (Array.isArray(run.testResults)) {
        browserSteps.push(...run.testResults);
      }

      const allSteps = [...serverSteps, ...browserSteps];

      for (let i = 0; i < allSteps.length; i++) {
        const step = allSteps[i];
        if (step.status !== "pass") continue;
        if (!step.responseBody) continue;

        const mp = extractMethodPath(step);
        if (!mp) continue;

        const normalizedPath = normalizeEndpoint(mp.path);
        const matches = endpointPatterns.some((ep) => normalizedPath === ep);
        if (!matches) continue;

        const key = `${mp.method} ${mp.path}`;
        if (seen.has(key)) continue; // keep most recent (first encountered)

        const responseStr = typeof step.responseBody === "string"
          ? step.responseBody
          : JSON.stringify(step.responseBody);

        const requestStr = step.requestBody
          ? (typeof step.requestBody === "string" ? step.requestBody : JSON.stringify(step.requestBody))
          : undefined;

        seen.set(key, {
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

    // Return up to MAX_GOLDEN_RESPONSES
    return [...seen.values()].slice(0, MAX_GOLDEN_RESPONSES);
  } catch (e) {
    console.error("[goldenResponses] Failed to load golden responses:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Extract endpoint paths from spec file names.
 * e.g., "v3/articles/create-article.md" → "/v3/projects/{project_id}/articles"
 * Falls back to extracting paths from idea step descriptions.
 */
export function extractEndpointsFromContext(
  specFiles: string[],
  specContext: string,
): string[] {
  const paths = new Set<string>();

  // Extract from <path> elements in spec context
  const pathRe = /(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  // Also try "Path: /v3/..." or "**Path**: /v3/..." patterns in spec markdown
  const mdPathRe = /\*?\*?Path\*?\*?:\s*`?(\/[^\s`\n]+)/gi;
  while ((m = mdPathRe.exec(specContext)) !== null) {
    paths.add(m[1]);
  }

  return [...paths];
}
