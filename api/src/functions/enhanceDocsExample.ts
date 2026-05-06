// Enhance Docs example — POST /api/spec-files/enhance-example
//
// After a Try-it call, qa_managers can rewrite the spec MD's embedded OpenAPI
// example using the captured request/response. AI surgically updates only the
// example values; the markdown wrapper and 4-backtick fence are preserved.
//
// The endpoint does NOT persist the new MD. It returns originalMd + updatedMd
// for a frontend diff modal; the user confirms and a separate PUT /api/spec-files
// call writes the file (which auto-fires distillAndStore).

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { downloadBlob } from "../lib/blobClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal, lookupProjectMember, isSuperOwner } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { loadAiContext } from "../lib/aiContext";
import {
  extractOpenApiBlock,
  spliceOpenApiBlock,
  findOperation,
  extractTargetSlice,
  applyTargetSlice,
} from "../lib/specOpenApiBlock";
import {
  stripAuthHeaders,
  detectResidualSecrets,
  truncateForAi,
} from "../lib/exampleSanitization";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, code: string, extra?: Record<string, unknown>): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: code, ...extra }) };
}

function scopedPath(projectId: string, name: string): string {
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

interface EnhanceRequest {
  specPath?: string;
  versionFolder?: string;
  method?: string;
  pathTemplate?: string;
  capturedUrl?: string;
  capturedStatus?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string | null;
  requestContentType?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  responseContentType?: string;
  model?: string;
}

const FLOW_ENHANCE_SYSTEM_PROMPT = `You are a documentation maintenance assistant for the FlowForge QA platform. Your sole job is to rewrite the example values inside an OpenAPI 3.x operation object so they reflect a real captured API call, while sanitizing all secrets and identifiers.

## Input

You will receive (in the user message):
1. The OpenAPI operation object — a JSON object containing requestBody and responses keys. This is a slice of a larger spec; surrounding paths/components have been removed.
2. Captured Try-it metadata: HTTP method, path template, captured URL, response status code, request body (text), response body (parsed JSON or text), and the request/response Content-Type values. Authorization-bearing request headers have already been stripped.
3. The name of the existing default example for the response (or null if none), and the same for the request body, plus the response media-type hint to use when adding a new status.

## Output

Output a SINGLE JSON object with this exact shape — nothing else, no prose, no markdown fences:

{
  "requestBody": <updated requestBody object, or null if no change>,
  "response": {
    "status": "<status code as string>",
    "value": <full updated responses[<status>] object — includes description, content, etc.>
  },
  "summary": {
    "requestBodyExampleName": "<name updated/created or null>",
    "responseExampleName": "<name updated/created>",
    "addedNewExample": <boolean — true only if you created a new named example>
  }
}

The first character of your response MUST be "{". The last character MUST be "}". No commentary before or after.

## Rules — what to update

1. Keep the OBJECT SHAPE identical. Only change example value fields. Do NOT modify schemas, parameters, descriptions, required fields, or response status codes other than the targeted one.
2. If responses[status].content[mediaType].examples[<name>] exists, replace its value and reuse the same <name>.
3. If only responses[status].content[mediaType].example (singular) exists, replace it.
4. If responses[status] exists but has no examples/example, ADD examples: { "tryit-<status>": { value: <sanitized response body> } }. Use the captured response Content-Type as the media type, defaulting to application/json or to the supplied media-type hint.
5. If responses[status] does NOT exist, CREATE it with description "<HTTP reason phrase>" and the examples structure from rule 4. Set summary.addedNewExample = true.
6. For the request body: if requestBody.content[mediaType].examples exists, update the first/default; otherwise add tryit-default. Skip entirely (return requestBody: null) if the captured request had no body, the operation has no requestBody, or the method is GET/HEAD.

## Rules — sanitization (mandatory, applied to every string value you emit)

You are rewriting public documentation. Apply these transformations to EVERY string you emit, not just at the top level:

A. IDs in URL paths and ID-keyed body fields:
   - Replace IDs with "{{proj.<fieldName>}}" placeholders ONLY when the surrounding field key matches /(_id|Id|^id$|_uuid|_key|_token)/i OR when the value sits in a URL path parameter.
   - Convert snake_case to camelCase for the placeholder (article_id → {{proj.articleId}}, project_id → {{proj.projectId}}).
   - For path parameters: use the parameter name from the path template, NOT the surrounding JSON field name.
   - DO NOT redact slugs, titles, names, status enums, or values in non-ID-keyed fields. Real values like "getting-started-guide" or "Test Article" must stay.

B. Tokens & secrets:
   - JWTs (eyJ followed by base64url + dots) → "<redacted>"
   - "Bearer " followed by anything → "<redacted>"
   - Long random 32+ char strings that look like secrets and live in token/secret/key-suffixed fields → "<redacted>"

C. PII:
   - Email addresses → "user@example.com"
   - Phone numbers (E.164 or (xxx) xxx-xxxx) → "+15555550100"
   - Names in fields keyed first_name/last_name/full_name/display_name → "Jane"/"Doe"/"Jane Doe"
   - IP addresses → "192.0.2.1"
   - Internal hostnames inside URL strings → "https://api.example.com/..." (preserve path & query structure)

D. NEVER include in the output:
   - The captured Authorization header value (full or partial)
   - Cookies, Set-Cookie values
   - Any value that resembles a session, csrf, signature, or api-key

E. Preserve everything else: enum values, status codes, response timing, schema-required fields, structurally meaningful constants. Realistic example data, not redacted-to-uselessness data.

## Edge cases

- Captured response body is plain text or HTML (Content-Type not JSON): emit the example value as the sanitized string (single-line summarization is OK; <500 chars).
- Captured response body is empty/null: emit "value": null or "" matching the captured shape.
- Captured request body was multipart/form-data: emit requestBody: null (out of scope).
- Captured response was truncated: emit a representative subset; truncate large arrays to ~3 items.

## Format reminders

- Output is ONE JSON object. First char "{", last char "}".
- No markdown fences. No explanation. No "Here is the updated..." preamble.
- response.value is the FULL responses[<status>] object — includes description, content, etc.
- Use the same media-type key the captured response used (default application/json or the supplied hint).`;

interface AiSliceShape {
  requestBody: Record<string, unknown> | null;
  response: { status: string; value: Record<string, unknown> };
  summary: {
    requestBodyExampleName: string | null;
    responseExampleName: string | null;
    addedNewExample: boolean;
  };
}

function tryParseJson(text: string): AiSliceShape | null {
  let cleaned = text.trim();
  // Strip code fences if the AI ignored instructions.
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).response === "object"
    ) {
      const resp = (parsed as { response: { status?: unknown; value?: unknown } }).response;
      if (typeof resp.status === "string" && resp.value && typeof resp.value === "object") {
        return parsed as AiSliceShape;
      }
    }
  } catch {
    // fall through
  }
  return null;
}

async function handle(req: HttpRequest): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: EnhanceRequest;
  try {
    body = (await req.json()) as EnhanceRequest;
  } catch {
    return err(400, "invalid_json_body");
  }

  const { specPath, versionFolder, method, pathTemplate, capturedUrl, capturedStatus, model } = body;
  if (
    !specPath ||
    !versionFolder ||
    !method ||
    !pathTemplate ||
    !capturedUrl ||
    typeof capturedStatus !== "number"
  ) {
    return err(400, "missing_fields");
  }

  let projectId: string;
  try {
    projectId = getProjectId(req);
  } catch {
    return err(400, "missing_project_id");
  }

  // Role gate: super owner or project owner/qa_manager
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const email = principal?.userDetails ?? "";
  const displayName = principal?.userDetails ?? userName;
  const superOwner = await isSuperOwner(oid, userName, email);
  if (!superOwner) {
    const member = await lookupProjectMember(oid, projectId);
    if (!member || !["owner", "qa_manager"].includes(member.role)) {
      return err(403, "insufficient_project_role", { required: ["owner", "qa_manager"] });
    }
  }

  // Read original MD
  const blobName = scopedPath(projectId, specPath);
  let originalMd: string;
  try {
    originalMd = await downloadBlob(blobName);
  } catch {
    return err(404, "spec_not_found", { specPath });
  }

  // Parse the OpenAPI block
  const blockParts = extractOpenApiBlock(originalMd);
  if (!blockParts) return err(422, "no_openapi_block");

  // Locate the operation
  const found = findOperation(blockParts.json, method, capturedUrl);
  if (!found) return err(400, "path_template_mismatch", { method, capturedUrl, pathTemplateProvided: pathTemplate });

  // Extract the target slice (current state) and pre-strip auth
  const slice = extractTargetSlice(found.op, capturedStatus);
  const requestHeadersStripped = stripAuthHeaders(body.requestHeaders ?? {});
  const responseHeadersStripped = stripAuthHeaders(body.responseHeaders ?? {});
  const knownSecretValues = [
    ...requestHeadersStripped.strippedValues,
    ...responseHeadersStripped.strippedValues,
  ];

  // Truncate captured bodies
  const reqBodyText = truncateForAi(body.requestBody ?? null, 65536);
  const respBodyText = truncateForAi(
    typeof body.responseBody === "string"
      ? body.responseBody
      : body.responseBody === undefined || body.responseBody === null
        ? ""
        : JSON.stringify(body.responseBody, null, 2),
    65536,
  );

  // Load API rules for the version folder so AI naming conventions can match
  const ctx = await loadAiContext({
    projectId,
    versionFolder,
    loadSpec: false,
    loadDependencies: false,
    loadVariables: false,
    loadRules: true,
  });
  const systemPrompt = ctx.enrichSystemPrompt(FLOW_ENHANCE_SYSTEM_PROMPT);

  // Build user message — operation slice + captured artifacts
  const opSlice = {
    requestBody: slice.requestBody,
    responses: { [String(capturedStatus)]: slice.response },
  };
  const userMessage = [
    `## Operation`,
    `Method: ${method.toUpperCase()}`,
    `Path template: ${found.pathTemplate}`,
    `Captured URL: ${capturedUrl}`,
    `Response status: ${capturedStatus}`,
    "",
    `## Existing operation slice (JSON)`,
    "```json",
    JSON.stringify(opSlice, null, 2),
    "```",
    "",
    `## Existing example names`,
    `- Request body example: ${slice.existingRequestExampleName ?? "(none)"}`,
    `- Response[${capturedStatus}] example: ${slice.existingResponseExampleName ?? "(none)"}`,
    `- Response status existed before: ${slice.responseStatusExisted}`,
    `- Sibling-response media-type hint (use this when adding a new status): ${slice.responseMediaTypeHint ?? "application/json"}`,
    "",
    `## Captured request`,
    `Content-Type: ${body.requestContentType ?? "(none)"}`,
    `Headers (already auth-stripped): ${JSON.stringify(requestHeadersStripped.sanitized)}`,
    `Body (truncated=${reqBodyText.truncated}): `,
    "```",
    reqBodyText.text,
    "```",
    "",
    `## Captured response`,
    `Content-Type: ${body.responseContentType ?? "(none)"}`,
    `Headers (already auth-stripped): ${JSON.stringify(responseHeadersStripped.sanitized)}`,
    `Body (truncated=${respBodyText.truncated}):`,
    "```",
    respBodyText.text,
    "```",
  ].join("\n");

  // Call AI — try once, retry on invalid JSON
  let parsed: AiSliceShape | null = null;
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
  try {
    const first = await callAI({
      source: "enhanceDocsExample",
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 4096,
      requestedModel: model,
      credits: { projectId, userId: oid, displayName },
    });
    totalUsage = {
      inputTokens: first.usage.inputTokens,
      outputTokens: first.usage.outputTokens,
      totalTokens: first.usage.totalTokens,
      costUsd: first.usage.costUsd,
    };
    parsed = tryParseJson(first.text);

    if (!parsed) {
      const retry = await callAI({
        source: "enhanceDocsExample",
        system: systemPrompt,
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: first.text },
          {
            role: "user",
            content:
              "Your previous response was not valid JSON or did not match the required shape. Output ONLY the JSON object — no commentary, no markdown fences. The first character must be { and the last character must be }.",
          },
        ],
        maxTokens: 4096,
        requestedModel: model,
        credits: { projectId, userId: oid, displayName },
      });
      totalUsage = {
        inputTokens: totalUsage.inputTokens + retry.usage.inputTokens,
        outputTokens: totalUsage.outputTokens + retry.usage.outputTokens,
        totalTokens: totalUsage.totalTokens + retry.usage.totalTokens,
        costUsd: totalUsage.costUsd + retry.usage.costUsd,
      };
      parsed = tryParseJson(retry.text);
    }
  } catch (e) {
    if (e instanceof AiConfigError) return err(500, "ai_config_error", { message: e.message });
    if (e instanceof CreditDeniedError) {
      return err(402, "credit_denied", {
        reason: e.creditDenied.reason,
        projectCredits: e.creditDenied.projectCredits,
        userCredits: e.creditDenied.userCredits,
      });
    }
    const message = e instanceof Error ? e.message : String(e);
    return err(500, "ai_error", { message });
  }

  if (!parsed) return err(422, "ai_invalid_json");

  // Post-pass safety net
  const residual = detectResidualSecrets(parsed, knownSecretValues);
  if (residual.length > 0) {
    return err(422, "redaction_incomplete", { kinds: residual });
  }

  // Apply slice and rebuild MD
  const applied = applyTargetSlice(blockParts.json, found, parsed, slice.responseStatusExisted);
  const updatedMd = spliceOpenApiBlock(blockParts, applied.newSpec);

  // Extract the updated operation object so the frontend can also patch _swagger.json
  const updatedPaths = applied.newSpec.paths as Record<string, unknown>;
  const updatedPathItem = updatedPaths[found.pathTemplate] as Record<string, unknown>;
  const updatedOperation = updatedPathItem[found.method] as Record<string, unknown>;

  // Audit (separate from spec.update — fired even if user cancels)
  audit(projectId, "spec.enhance_example", { oid, name: userName }, specPath, {
    method,
    pathTemplate: found.pathTemplate,
    capturedStatus,
    addedNewResponseStatus: applied.addedNewResponseStatus,
    addedNewExample: parsed.summary.addedNewExample,
    costUsd: totalUsage.costUsd,
  });

  return ok({
    originalMd,
    updatedMd,
    updatedOperation,
    pathTemplate: found.pathTemplate,
    method: found.method,
    updatedSliceSummary: {
      requestBodyExampleName: parsed.summary.requestBodyExampleName,
      responseExampleName: parsed.summary.responseExampleName,
      addedNewExample: parsed.summary.addedNewExample,
      addedNewResponseStatus: applied.addedNewResponseStatus,
    },
    usage: totalUsage,
  });
}

app.http("enhanceDocsExample", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/enhance-example",
  handler: withAuth(handle),
});

export default handle;
