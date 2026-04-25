import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { listBlobs, downloadBlob } from "../lib/blobClient";
import { resolveModel, computeCost } from "../lib/modelPricing";
import type { ModelId } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";
import { readDistilledContent } from "../lib/specDistillCache";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_DEBUG_MODEL: ModelId = "claude-haiku-4-5-20251001";

const MAX_SPEC_SCAN = 50;

const DEBUG_SYSTEM_PROMPT = `You are an API debugging expert for the FlowForge test runner. Given a failed API test step, diagnose the root cause by cross-referencing the request against the endpoint's OpenAPI specification.

Common failure patterns:
1. Extra fields in body (additionalProperties: false rejects unknown fields)
2. Missing required fields
3. Wrong types (string vs integer, wrong enum value)
4. readOnly fields sent in request (response-only fields)
5. Wrong HTTP method for this endpoint
6. Upstream server bug (500 not caused by the request)

If an endpoint spec is provided, carefully compare every field in the request body against the schema. Flag any field that is NOT in the schema's properties list.

Output ONLY valid JSON (no markdown, no commentary):
{
  "rootCause": "1-2 sentence summary",
  "category": "extra_field|missing_field|wrong_value|schema_mismatch|auth_error|upstream_error|other",
  "details": "Detailed explanation with reasoning",
  "problematicFields": [{ "field": "name", "issue": "why it's wrong", "suggestion": "how to fix" }],
  "suggestedFix": { "description": "what to change", "before": "snippet before", "after": "corrected snippet" },
  "confidence": "high|medium|low"
}

Omit problematicFields if none. Omit suggestedFix if not applicable.`;

interface StepData {
  name: string;
  method: string;
  path: string;
  requestUrl?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  httpStatus?: number;
  failureReason?: string;
  assertionResults?: Array<{ description: string; passed: boolean }>;
}

interface DebugAnalyzeBody {
  step: StepData;
  flowXml?: string;
  model?: string;
}

/**
 * Try to find the matching distilled spec for a given method + path.
 * Scans blobs in the version folder and checks for METHOD /path pattern.
 */
async function findMatchingSpec(
  projectId: string,
  method: string,
  path: string,
): Promise<string | null> {
  // Extract version prefix (e.g., /v3/... -> V3)
  const versionMatch = path.match(/^\/(v\d+)\//i);
  if (!versionMatch) return null;

  const versionFolder = versionMatch[1].toUpperCase();
  const prefix = projectId !== "unknown" ? `${projectId}/${versionFolder}/` : `${versionFolder}/`;

  try {
    const blobs = await listBlobs(prefix);
    const mdBlobs = blobs
      .filter((b) => b.name.endsWith(".md") && !b.name.includes("_digest") && !b.name.includes("_distilled/"))
      .slice(0, MAX_SPEC_SCAN);

    // Try httpMethod metadata first (fast path)
    const methodUpper = method.toUpperCase();
    const methodMatches = mdBlobs.filter((b) => b.httpMethod === methodUpper);

    // Strip version prefix from path for matching: /v3/foo/bar -> /foo/bar
    const pathWithoutVersion = path.replace(/^\/v\d+/i, "");

    for (const blob of methodMatches.length > 0 ? methodMatches : mdBlobs) {
      try {
        const content = await readDistilledContent(blob.name);
        // Check if this spec contains the matching endpoint
        const patterns = [
          `${methodUpper} ${path}`,
          `${methodUpper} ${pathWithoutVersion}`,
          `${methodUpper} /${versionFolder.toLowerCase()}${pathWithoutVersion}`,
        ];
        const contentUpper = content.toUpperCase();
        if (patterns.some((p) => contentUpper.includes(p.toUpperCase()))) {
          return content;
        }
      } catch {
        // Skip unreadable blobs
      }
    }
  } catch {
    // Blob listing failed — continue without spec
  }

  return null;
}

async function debugAnalyze(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

  let body: DebugAnalyzeBody;
  try {
    body = (await req.json()) as DebugAnalyzeBody;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.step || !body.step.method || !body.step.path) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "step with method and path is required" }),
    };
  }

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  // Credit check
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;
  if (projectId !== "unknown") {
    try {
      const creditCheck = await checkCredits(projectId, oid, displayName);
      if (!creditCheck.allowed) {
        return {
          status: 402,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: creditCheck.reason,
            projectCredits: creditCheck.projectCredits,
            userCredits: creditCheck.userCredits,
          }),
        };
      }
    } catch (e) {
      console.warn("[debugAnalyze] credit check failed, proceeding anyway:", e);
    }
  }

  const model = resolveModel(body.model, DEFAULT_DEBUG_MODEL);
  const { step, flowXml } = body;

  // Try to find matching spec
  const specContent = await findMatchingSpec(projectId, step.method, step.path);

  // Build user message
  const parts: string[] = [];

  if (specContent) {
    parts.push(`## Endpoint Specification\n\n${specContent}`);
  }

  parts.push(`## Failed Step: ${step.name}\n`);
  parts.push(`**Method:** ${step.method}`);
  parts.push(`**Path:** ${step.path}`);
  if (step.requestUrl) parts.push(`**Request URL:** ${step.requestUrl}`);
  if (step.httpStatus !== undefined) parts.push(`**HTTP Status:** ${step.httpStatus}`);
  if (step.failureReason) parts.push(`**Failure Reason:** ${step.failureReason}`);

  if (step.requestBody !== undefined) {
    parts.push(`\n### Request Body\n\`\`\`json\n${JSON.stringify(step.requestBody, null, 2)}\n\`\`\``);
  }

  if (step.responseBody !== undefined) {
    parts.push(`\n### Response Body\n\`\`\`json\n${JSON.stringify(step.responseBody, null, 2)}\n\`\`\``);
  }

  if (step.assertionResults && step.assertionResults.length > 0) {
    const assertionLines = step.assertionResults
      .map((a) => `- ${a.passed ? "PASS" : "FAIL"}: ${a.description}`)
      .join("\n");
    parts.push(`\n### Assertion Results\n${assertionLines}`);
  }

  if (flowXml) {
    parts.push(`\n### Flow XML (for fix suggestions)\n\`\`\`xml\n${flowXml}\n\`\`\``);
  }

  const userMessage = parts.join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: DEBUG_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "{}";

    let diagnosis: Record<string, unknown>;
    try {
      diagnosis = JSON.parse(rawText);
    } catch {
      diagnosis = {
        rootCause: rawText,
        category: "other",
        details: rawText,
        confidence: "low",
      };
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    // Record usage
    if (projectId !== "unknown") {
      try { await recordUsage(projectId, oid, displayName, costUsd); } catch (e) {
        console.warn("[debugAnalyze] credit recording failed:", e);
      }
    }

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        diagnosis,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd },
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: msg }),
    };
  }
}

app.http("debugAnalyze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "debug-analyze",
  handler: withAuth(debugAnalyze),
});

export { debugAnalyze };
