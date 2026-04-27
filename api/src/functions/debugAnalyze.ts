import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { loadAiContext } from "../lib/aiContext";
import { resolveScenario, ScenarioNotFoundError } from "../lib/flowRunner/scenarioResolver";
import { parseFlowXml } from "../lib/flowRunner/parser";
import { getTestRunsContainer } from "../lib/cosmosClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

11. **When the spec and the flow XML contradict each other** (e.g., the flow sends a request body but the spec shows no requestBody, or vice versa), the spec is ALWAYS correct. If the flow is sending a body to an endpoint that doesn't accept one, diagnose THAT as the issue — the flow XML needs to be fixed to match the spec.

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

## Runtime diagnostic context (when available):
You may receive additional context captured at test run time:
- **Runtime Endpoint Configuration** — base URL, API version, connection ID used during the actual test run
- **Project Variables (at time of test run)** — actual \`{{proj.*}}\` values used when the test ran (may differ from current live values)
- **State Variables (after failing step)** — the \`{{state.*}}\` variable snapshot after the failing step executed, showing what was captured
- **Prior Steps in This Scenario** — actual request/response data from steps that ran BEFORE the failing step, including their state snapshots

Use this runtime context to:
- Verify that state variables were captured correctly by prior steps (check stateSnapshot)
- Check if the prior step's response actually contained the expected data (e.g., IDs, version numbers)
- Detect timing issues (e.g., create followed immediately by an operation that requires propagation)
- Compare runtime project variable values against what the flow XML expects
- Identify if the failure is caused by a prior step's response not matching expectations (e.g., empty data array)

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

/** Diagnostic context extracted from the test run alongside the step result. */
interface RunDiagnosticContext {
  /** Project variables captured at run time (may differ from current live values). */
  runtimeProjectVariables?: Record<string, string>;
  /** Endpoint configuration at run time. */
  baseUrl?: string;
  apiVersion?: string;
  connectionId?: string;
  /** Flow XML snapshot captured at run time. */
  flowXmlSnapshot?: string;
  /** State snapshot after the failing step executed. */
  stateSnapshot?: Record<string, unknown>;
  /** Prior steps in the same scenario — gives AI cross-step data flow visibility. */
  priorSteps?: Array<{
    name: string;
    status: string;
    httpStatus?: number;
    requestBody?: unknown;
    responseBody?: unknown;
    stateSnapshot?: Record<string, unknown>;
  }>;
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
 * Also extracts diagnostic context (runtime project vars, flow XML snapshot,
 * state snapshots, prior step results) for richer AI diagnosis.
 */
async function findStepResult(
  projectId: string,
  flowName: string,
  stepNumber: number,
  flowFileName?: string,
): Promise<{ stepData: StepData; runContext: RunDiagnosticContext } | null> {
  const container = await getTestRunsContainer();
  const flowSlug = slug(flowName);
  const testIdKey = `xml:${flowSlug}.s${stepNumber}`;

  interface TestResultEntry {
    status: string;
    httpStatus?: number;
    failureReason?: string;
    requestUrl?: string;
    requestBody?: unknown;
    responseBody?: unknown;
    stateSnapshot?: Record<string, unknown>;
    testName?: string;
    assertionResults?: Array<{ id?: string; description: string; passed: boolean }>;
  }

  const { resources: runs } = await container.items
    .query<{
      testResults?: Record<string, TestResultEntry>;
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
      context?: {
        baseUrl?: string;
        apiVersion?: string;
        connectionId?: string;
        projectVariables?: Record<string, string>;
      };
      flowSnapshots?: Record<string, string>;
    }>({
      query:
        "SELECT c.testResults, c.steps, c.context, c.flowSnapshots FROM c WHERE c.type='test_run' AND c.projectId=@pid ORDER BY c.startedAt DESC OFFSET 0 LIMIT 5",
      parameters: [{ name: "@pid", value: projectId }],
    }, { partitionKey: projectId })
    .fetchAll();

  for (const run of runs) {
    // Browser run format: testResults keyed by testId
    if (run.testResults?.[testIdKey]) {
      const r = run.testResults[testIdKey];

      // Collect prior steps in the same scenario (same flow slug prefix)
      const prefix = `xml:${flowSlug}.s`;
      const priorSteps: RunDiagnosticContext["priorSteps"] = [];
      for (let i = 1; i < stepNumber; i++) {
        const priorKey = `${prefix}${i}`;
        const prior = run.testResults[priorKey];
        if (prior) {
          priorSteps.push({
            name: prior.testName ?? priorKey,
            status: prior.status,
            httpStatus: prior.httpStatus,
            requestBody: prior.requestBody,
            responseBody: prior.responseBody,
            stateSnapshot: prior.stateSnapshot,
          });
        }
      }

      // Resolve flow XML snapshot if available
      let flowXmlSnapshot: string | undefined;
      if (run.flowSnapshots) {
        if (flowFileName && run.flowSnapshots[flowFileName]) {
          flowXmlSnapshot = run.flowSnapshots[flowFileName];
        } else {
          // Try to find by partial match
          const key = Object.keys(run.flowSnapshots).find(k => k.includes(flowSlug));
          if (key) flowXmlSnapshot = run.flowSnapshots[key];
        }
      }

      return {
        stepData: {
          name: testIdKey,
          method: "",
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
        runContext: {
          runtimeProjectVariables: run.context?.projectVariables,
          baseUrl: run.context?.baseUrl,
          apiVersion: run.context?.apiVersion,
          connectionId: run.context?.connectionId,
          flowXmlSnapshot,
          stateSnapshot: r.stateSnapshot,
          priorSteps: priorSteps.length > 0 ? priorSteps : undefined,
        },
      };
    }
    // API run format: steps array indexed by number
    if (run.steps) {
      const s = run.steps.find((st) => st.number === stepNumber);
      if (s) {
        const priorSteps: RunDiagnosticContext["priorSteps"] = [];
        for (const ps of run.steps) {
          if (ps.number < stepNumber) {
            priorSteps.push({
              name: ps.name,
              status: ps.status,
              httpStatus: ps.httpStatus,
              requestBody: ps.requestBody,
              responseBody: ps.responseBody,
            });
          }
        }

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
          runContext: {
            runtimeProjectVariables: run.context?.projectVariables,
            baseUrl: run.context?.baseUrl,
            apiVersion: run.context?.apiVersion,
            connectionId: run.context?.connectionId,
            priorSteps: priorSteps.length > 0 ? priorSteps : undefined,
          },
        };
      }
    }
  }

  return null;
}


async function debugAnalyze(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

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

  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  // ── Minimal mode: scenarioId + stepNumber → resolve everything server-side ──
  let step: StepData;
  let flowXml: string | undefined;
  let runDiagCtx: RunDiagnosticContext | undefined;

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
    let flowFileName: string | undefined;
    try {
      const resolved = await resolveScenario(body.scenarioId, projectId);
      xml = resolved.xml;
      flowXml = xml;
      flowFileName = resolved.fileName;
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

    // 3. Find latest test run with step results + diagnostic context
    const found = await findStepResult(projectId, parsed.name, body.stepNumber, flowFileName);
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

    // Use flow XML snapshot from test run if available (reflects what actually ran)
    if (found.runContext.flowXmlSnapshot) {
      flowXml = found.runContext.flowXmlSnapshot;
    }
    runDiagCtx = found.runContext;
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

  // ── Inject runtime diagnostic context from the test run snapshot ──
  if (runDiagCtx) {
    // Endpoint configuration at run time
    if (runDiagCtx.baseUrl || runDiagCtx.apiVersion || runDiagCtx.connectionId) {
      const configLines: string[] = [];
      if (runDiagCtx.baseUrl) configLines.push(`- **Base URL:** ${runDiagCtx.baseUrl}`);
      if (runDiagCtx.apiVersion) configLines.push(`- **API Version:** ${runDiagCtx.apiVersion}`);
      if (runDiagCtx.connectionId) configLines.push(`- **Connection ID:** ${runDiagCtx.connectionId}`);
      parts.push(`\n\n## Runtime Endpoint Configuration\n\n${configLines.join("\n")}`);
    }

    // Runtime project variables (snapshot from when the test actually ran)
    if (runDiagCtx.runtimeProjectVariables && Object.keys(runDiagCtx.runtimeProjectVariables).length > 0) {
      const runtimeVarList = Object.entries(runDiagCtx.runtimeProjectVariables)
        .map(([k, v]) => `- \`{{proj.${k}}}\` = \`${v}\``)
        .join("\n");
      parts.push(`\n\n## Project Variables (at time of test run)\n\n${runtimeVarList}`);
    }

    // State snapshot — what state variables existed after the failing step
    if (runDiagCtx.stateSnapshot && Object.keys(runDiagCtx.stateSnapshot).length > 0) {
      const stateList = Object.entries(runDiagCtx.stateSnapshot)
        .map(([k, v]) => `- \`{{state.${k}}}\` = \`${JSON.stringify(v)}\``)
        .join("\n");
      parts.push(`\n\n## State Variables (after failing step)\n\n${stateList}`);
    }

    // Prior steps — what happened before this step (data flow visibility)
    if (runDiagCtx.priorSteps && runDiagCtx.priorSteps.length > 0) {
      const priorLines: string[] = [];
      for (const ps of runDiagCtx.priorSteps) {
        const icon = ps.status === "pass" ? "✓" : ps.status === "fail" ? "✗" : "◌";
        priorLines.push(`### ${icon} ${ps.name} [${ps.status}] HTTP ${ps.httpStatus ?? "—"}`);
        if (ps.requestBody !== undefined) {
          priorLines.push(`**Request Body:**\n\`\`\`json\n${JSON.stringify(ps.requestBody, null, 2)}\n\`\`\``);
        }
        if (ps.responseBody !== undefined) {
          const respStr = JSON.stringify(ps.responseBody, null, 2);
          // Truncate very long responses to avoid bloating the prompt
          priorLines.push(`**Response Body:**\n\`\`\`json\n${respStr.length > 2000 ? respStr.slice(0, 2000) + "\n... (truncated)" : respStr}\n\`\`\``);
        }
        if (ps.stateSnapshot && Object.keys(ps.stateSnapshot).length > 0) {
          const snapList = Object.entries(ps.stateSnapshot)
            .map(([k, v]) => `\`{{state.${k}}}\` = \`${JSON.stringify(v)}\``)
            .join(", ");
          priorLines.push(`**State after step:** ${snapList}`);
        }
      }
      parts.push(`\n\n## Prior Steps in This Scenario\n\n${priorLines.join("\n\n")}`);
    }
  }

  // Check if the failing step's spec defines a request body
  const failingStepSpec = ctx.flowStepSpecs.find(
    s => s.stepNumber === body.stepNumber && s.spec,
  );
  const specHasRequestBody = failingStepSpec?.spec
    ? /### Request Body/i.test(failingStepSpec.spec)
    : null; // null = spec not available, can't determine

  parts.push(`## Failed Step: ${step.name}\n`);
  parts.push(`**Method:** ${step.method}`);
  parts.push(`**Path:** ${step.path}`);
  if (step.requestUrl) parts.push(`**Request URL:** ${step.requestUrl}`);
  if (step.httpStatus !== undefined) parts.push(`**HTTP Status:** ${step.httpStatus}`);
  if (step.failureReason) parts.push(`**Failure Reason:** ${step.failureReason}`);

  // If spec confirms no request body, annotate strongly regardless of what was sent
  if (specHasRequestBody === false) {
    parts.push(`\n**⚠ IMPORTANT: According to the API specification, this endpoint does NOT accept a request body. It only uses path parameters. Any request body content is IRRELEVANT to this failure. Do NOT diagnose body field issues. Focus on path parameters and resource state.**`);
    if (step.requestBody !== undefined) {
      parts.push(`\n### Request Body (IGNORED BY API — this endpoint accepts no body)\n\`\`\`json\n${JSON.stringify(step.requestBody, null, 2)}\n\`\`\``);
    }
  } else if (step.requestBody !== undefined) {
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

  try {
    const result = await callAI({
      source: "debugAnalyze",
      system: DEBUG_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 2048,
      requestedModel: body.model,
      credits: { projectId, userId: oid, displayName },
    });

    let rawText = result.text || "{}";

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

    // ── Post-AI guardrails ──
    // If the spec shows no request body but the AI diagnosed body field issues,
    // force low confidence — the AI is hallucinating.
    if (specHasRequestBody === false && diagnosis.confidence === "high") {
      const category = String(diagnosis.category ?? "");
      const bodyFieldCategories = ["extra_field", "missing_field", "wrong_value", "schema_mismatch"];
      if (bodyFieldCategories.includes(category)) {
        console.warn("[debugAnalyze] Guardrail: AI diagnosed body field issue for no-body endpoint, forcing low confidence");
        diagnosis.confidence = "low";
        diagnosis.canYouFixIt = false;
        diagnosis.summary = `${diagnosis.summary} (Note: The API specification shows this endpoint does NOT accept a request body — this diagnosis may be inaccurate.)`;
      }
    }

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        diagnosis,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          costUsd: result.usage.costUsd,
        },
        _debug: {
          specFound: ctx.specSource !== "none",
          specSource: ctx.specSource !== "none" ? ctx.specSource : null,
          hasApiRules: !!ctx.rules,
          hasProjectVars: ctx.projectVariables.length > 0,
          hasDependencies: !!ctx.dependencyInfo,
          flowStepSpecsLoaded: ctx.flowStepSpecs.length,
          flowStepSpecsFound: ctx.flowStepSpecs.filter(s => s.spec !== null).length,
          flowStepSpecDetails: ctx.flowStepSpecs.map(s => ({
            step: s.stepNumber,
            method: s.method,
            path: s.path,
            specFound: s.spec !== null,
            specSource: s.specSource,
            hasRequestBody: s.spec ? /### Request Body/i.test(s.spec) : null,
          })),
          model: result.usage.model,
          // Diagnostic context availability
          hasRunContext: !!runDiagCtx,
          hasFlowXmlSnapshot: !!runDiagCtx?.flowXmlSnapshot,
          hasRuntimeProjectVars: !!runDiagCtx?.runtimeProjectVariables,
          hasStateSnapshot: !!runDiagCtx?.stateSnapshot,
          priorStepsCount: runDiagCtx?.priorSteps?.length ?? 0,
        },
      }),
    };
  } catch (e) {
    if (e instanceof AiConfigError) {
      return { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };
    }
    if (e instanceof CreditDeniedError) {
      return { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: e.creditDenied.reason, projectCredits: e.creditDenied.projectCredits, userCredits: e.creditDenied.userCredits }) };
    }
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
