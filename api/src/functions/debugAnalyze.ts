import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";
import { loadAiContext } from "../lib/aiContext";
import { resolveScenario, ScenarioNotFoundError } from "../lib/flowRunner/scenarioResolver";
import { parseFlowXml } from "../lib/flowRunner/parser";
import { getTestRunsContainer } from "../lib/cosmosClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Use the same default as all other AI functions — user can override via Settings
const DEFAULT_DEBUG_MODEL = DEFAULT_FLOW_MODEL;

const DEBUG_SYSTEM_PROMPT = `You are an API debugging assistant for the FlowForge test runner. Your audience is QA engineers with limited API or technical background. Write clearly and simply — avoid jargon.

Given a failed API test step, diagnose the root cause by cross-referencing the request against the endpoint's OpenAPI specification.

## CRITICAL: No Hallucination Policy

You MUST follow these rules strictly. Violating them produces dangerous false diagnoses:

1. **Only reference information explicitly provided to you.** If no "Endpoint Specification" section is provided, you do NOT know what fields the endpoint accepts or rejects. Never invent, assume, or recall endpoint schemas from memory.

2. **Never claim an endpoint "accepts no request body" or "has no required fields" unless the specification explicitly states this.** If you don't have the spec, say so.

3. **Never fabricate field names, types, or schema details.** If you don't see a schema in the provided context, set confidence to "low" and explain that the spec was not available for cross-referencing.

4. **When in doubt, say "I don't have enough information" rather than guessing.** A wrong diagnosis is far worse than an honest "I can't determine the root cause without the endpoint specification."

5. **If the spec is missing**, limit your analysis to:
   - What the HTTP status code generally means (e.g., 400 = bad request, 500 = server error)
   - What the error response body says (if provided)
   - Obvious issues visible in the request itself (e.g., empty body, malformed JSON)
   - Set canYouFixIt to false and confidence to "low"
   - Recommend the user check the API documentation manually

6. **Never suggest removing fields from the request body unless the spec explicitly shows those fields are not accepted.** The most common hallucination is telling users to remove valid fields.

7. **If API Rules or Skills context is provided**, use it to understand known patterns and constraints for this API, but never contradict the actual endpoint specification with rule-based assumptions.

8. **For 404 RESOURCE_NOT_FOUND errors:** The most common cause is that the resource referenced by path parameters doesn't exist — the ID is wrong, a prerequisite step failed to create it, or the resource is in a state that doesn't support the operation (e.g., forking requires a published article). Do NOT blame request body fields for a 404 unless the spec explicitly says body fields affect resource lookup. Focus your analysis on:
   - Whether path parameter values (IDs) are correct and came from a prior step
   - Whether prerequisite steps actually succeeded
   - Whether the resource is in the required state for this operation
   - Whether there's a timing/propagation issue between steps

9. **When the spec defines NO request body (no requestBody schema):** The endpoint uses only path parameters and/or query parameters. Do NOT invent request body issues, do NOT suggest adding or fixing body fields, and do NOT attribute failures to body content. Any request body sent to such an endpoint is irrelevant to the failure.

10. **Base your diagnosis ONLY on the ACTUAL request and response data provided**, not on what other steps capture or use. If the actual request body is shown, analyze THOSE values — do not speculate about what "might have been" captured or passed. The actual data is the ground truth.

## Common failure patterns (only diagnose these when you have supporting evidence):
1. Extra fields in body (additionalProperties: false rejects unknown fields) — ONLY if spec lists the accepted properties
2. Missing required fields — ONLY if spec marks them as required
3. Wrong types (string vs integer, wrong enum value) — ONLY if spec defines the expected type
4. readOnly fields sent in request (response-only fields) — ONLY if spec marks them readOnly
5. Wrong HTTP method for this endpoint — ONLY if spec defines allowed methods
6. Upstream server bug (500 not caused by the request) — can diagnose from status code alone
7. Authentication/authorization failure — can diagnose from 401/403 status codes

## When endpoint specification IS provided:
- Carefully compare EVERY field in the request body against the schema
- Flag any field that is NOT in the schema's properties list
- Check required vs optional fields
- Verify data types match

## Cross-step analysis (CRITICAL for multi-step flows):
When specs for ALL flow steps are provided, analyze the data flow between steps:
- Check if the failing step requires fields that should have been captured from a PRIOR step's response
- Look at the response schema of prior steps to identify capturable fields (e.g., \`version_number\`, \`id\`, etc.)
- **IMPORTANT: Only suggest adding body fields if the failing step's spec defines a requestBody schema.** If the endpoint has no requestBody (e.g., fork, delete), do NOT suggest adding captured fields to its body — the endpoint doesn't accept one.
- If the failing step DOES have a requestBody and needs a field from a prior step's response:
  1. Add a \`<capture>\` to the prior step to extract that field into \`{{state.xxx}}\`
  2. Add the field to the failing step's request body using \`{{state.xxx}}\`
- The \`fixPrompt\` must describe BOTH changes (capture in prior step + use in failing step)
- For endpoints that only use path parameters, check that the path param values (\`{{state.xxx}}\` or \`{{proj.xxx}}\`) are correct and populated

## When endpoint specification is NOT provided:
- State clearly: "The endpoint specification was not available for this diagnosis"
- Only analyze the HTTP status code and response body
- Do NOT guess what fields the endpoint accepts or rejects
- Set confidence to "low"

Output ONLY valid JSON (no markdown, no commentary):
{
  "summary": "Plain-English explanation a QA engineer can understand. 2-4 sentences. What happened, why it happened, and what to do next. If the spec was not available, say so explicitly.",
  "whatWentWrong": "Human-friendly label. Use 'Unable to determine — endpoint spec not available' when you lack the spec.",
  "category": "extra_field|missing_field|wrong_value|schema_mismatch|auth_error|upstream_error|no_spec|other",
  "canYouFixIt": true,
  "howToFix": "Step-by-step instructions for QA to fix in the flow XML. Set to null if you cannot confidently determine the fix.",
  "fixPrompt": "Precise instruction for an AI to edit the flow XML. Only present when canYouFixIt is true AND you have high confidence. Omit otherwise.",
  "developerNote": "Technical root cause details for developers — schema details, field names, types, status codes. When spec is missing, note this explicitly.",
  "problematicFields": [{ "field": "name", "issue": "why it's wrong", "suggestion": "how to fix" }],
  "suggestedFix": { "description": "what to change", "before": "snippet before", "after": "corrected snippet" },
  "confidence": "high|medium|low"
}

Rules:
- "summary" replaces both rootCause and details — write ONE clear paragraph for QA.
- "canYouFixIt" is true ONLY when you have the spec AND the fix is a clear flow XML edit. False for anything uncertain, upstream bugs, auth issues, environment problems, or missing spec.
- "howToFix" should be step-by-step. Null when canYouFixIt is false or when you're not confident.
- "fixPrompt" must be a precise AI-ready instruction to edit the XML. Omit when canYouFixIt is false or confidence is low.
- "developerNote" is technical — include schema details, field types, HTTP status analysis.
- Omit problematicFields if none or if you're guessing. Omit suggestedFix if not applicable.
- When confidence is "low", do NOT suggest specific field changes — only describe what you observe.`;

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
  step?: StepData;
  flowXml?: string;
  model?: string;
  // Minimal mode — backend resolves everything from Cosmos
  scenarioId?: string;
  stepNumber?: number;
}

/** Slugify a flow name into a stable ID prefix (same logic as builder.ts). */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow";
}

/**
 * Find step result data from the most recent test run for a given flow.
 * Checks both browser (testResults) and API (steps) run formats.
 */
async function findStepResult(
  projectId: string,
  flowName: string,
  stepNumber: number,
): Promise<{ stepData: StepData; flowXml?: string } | null> {
  const container = await getTestRunsContainer();
  const flowSlug = slug(flowName);
  const testIdKey = `xml:${flowSlug}.s${stepNumber}`;

  const { resources: runs } = await container.items
    .query<{
      testResults?: Record<string, {
        status: string;
        httpStatus?: number;
        failureReason?: string;
        requestUrl?: string;
        requestBody?: unknown;
        responseBody?: unknown;
        assertionResults?: Array<{ id?: string; description: string; passed: boolean }>;
      }>;
      steps?: Array<{
        number: number;
        name: string;
        status: string;
        httpStatus?: number;
        durationMs: number;
        failureReason?: string;
        assertionResults: Array<{ id?: string; description: string; passed: boolean }>;
        requestUrl?: string;
        requestBody?: unknown;
        responseBody?: unknown;
      }>;
    }>({
      query:
        "SELECT c.testResults, c.steps FROM c WHERE c.type='test_run' AND c.projectId=@pid ORDER BY c.startedAt DESC OFFSET 0 LIMIT 5",
      parameters: [{ name: "@pid", value: projectId }],
    }, { partitionKey: projectId })
    .fetchAll();

  for (const run of runs) {
    // Browser run format: testResults keyed by testId
    if (run.testResults?.[testIdKey]) {
      const r = run.testResults[testIdKey];
      return {
        stepData: {
          name: testIdKey,
          method: "", // will be filled by caller from parsed flow
          path: "",
          requestUrl: r.requestUrl,
          requestBody: r.requestBody,
          responseBody: r.responseBody,
          httpStatus: r.httpStatus,
          failureReason: r.failureReason,
          assertionResults: r.assertionResults?.map((a) => ({
            description: a.description,
            passed: a.passed,
          })),
        },
      };
    }
    // API run format: steps array indexed by number
    if (run.steps) {
      const s = run.steps.find((st) => st.number === stepNumber);
      if (s) {
        return {
          stepData: {
            name: s.name,
            method: "",
            path: "",
            requestUrl: s.requestUrl,
            requestBody: s.requestBody,
            responseBody: s.responseBody,
            httpStatus: s.httpStatus,
            failureReason: s.failureReason,
            assertionResults: s.assertionResults?.map((a) => ({
              description: a.description,
              passed: a.passed,
            })),
          },
        };
      }
    }
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

  // ── Minimal mode: scenarioId + stepNumber → resolve everything server-side ──
  let step: StepData;
  let flowXml: string | undefined;
  const model = resolveModel(body.model, DEFAULT_DEBUG_MODEL);

  if (body.scenarioId && typeof body.stepNumber === "number") {
    if (projectId === "unknown") {
      return {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "projectId is required for minimal mode" }),
      };
    }

    // 1. Resolve flow XML from Cosmos
    let xml: string;
    try {
      const resolved = await resolveScenario(body.scenarioId, projectId);
      xml = resolved.xml;
      flowXml = xml;
    } catch (e) {
      if (e instanceof ScenarioNotFoundError) {
        return {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: e.message }),
        };
      }
      throw e;
    }

    // 2. Parse flow XML to extract step metadata
    const parsed = parseFlowXml(xml);
    const parsedStep = parsed.steps[body.stepNumber - 1];
    if (!parsedStep) {
      return {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Step ${body.stepNumber} not found (flow has ${parsed.steps.length} steps)`,
        }),
      };
    }

    // 3. Find latest test run with step results
    const found = await findStepResult(projectId, parsed.name, body.stepNumber);
    if (!found) {
      return {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "No test run found for this scenario. Run it first, then diagnose.",
        }),
      };
    }

    // 4. Assemble step data — merge parsed flow metadata with run results
    step = {
      ...found.stepData,
      name: parsedStep.name,
      method: parsedStep.method,
      path: parsedStep.path,
    };
  } else if (body.step && body.step.method && body.step.path) {
    // ── Full payload mode (existing behavior) ──
    step = body.step;
    flowXml = body.flowXml;
  } else {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Either scenarioId+stepNumber or step with method and path is required" }),
    };
  }

  // Load full AI context: spec for ALL flow steps, rules, project variables, dependencies
  const ctx = await loadAiContext({
    projectId,
    endpointHint: { method: step.method, path: step.path },
    flowXml,
  });

  // Build user message
  const parts: string[] = [];

  // When we have multi-step specs, include ALL step specs so the AI has cross-step awareness
  const flowStepContext = ctx.formatFlowStepSpecs(body.stepNumber);
  if (flowStepContext) {
    parts.push(flowStepContext);
  } else if (ctx.specContext) {
    parts.push(`## Endpoint Specification (source: ${ctx.specSource})\n\n${ctx.specContext}`);
  } else {
    parts.push(`## Endpoint Specification\n\n**NOT AVAILABLE** — The specification for ${step.method} ${step.path} could not be found. Do NOT guess or assume what fields this endpoint accepts. Limit your analysis to the HTTP status code and response body only. Set confidence to "low".`);
  }

  if (ctx.rules) {
    parts.push(`\n\n## API Rules & Skills\n\n${ctx.rules}`);
  }

  if (ctx.projectVariables.length > 0) {
    const varList = ctx.projectVariables.map(v => `- \`{{proj.${v.name}}}\` = \`${v.value}\``).join("\n");
    parts.push(`\n\n## Available Project Variables\n\n${varList}`);
  }

  if (ctx.dependencyInfo) {
    parts.push(`\n\n${ctx.dependencyInfo}`);
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
    let rawText = textBlock && textBlock.type === "text" ? textBlock.text : "{}";

    // Strip markdown code fences that models sometimes add despite instructions
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    let diagnosis: Record<string, unknown>;
    try {
      diagnosis = JSON.parse(rawText);
    } catch {
      diagnosis = {
        summary: rawText,
        whatWentWrong: "Unknown",
        category: "other",
        canYouFixIt: false,
        developerNote: rawText,
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
        _debug: {
          specFound: ctx.specSource !== "none",
          specSource: ctx.specSource !== "none" ? ctx.specSource : null,
          hasApiRules: !!ctx.rules,
          hasProjectVars: ctx.projectVariables.length > 0,
          hasDependencies: !!ctx.dependencyInfo,
          flowStepSpecsLoaded: ctx.flowStepSpecs.length,
          flowStepSpecsFound: ctx.flowStepSpecs.filter(s => s.spec !== null).length,
          model,
        },
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
