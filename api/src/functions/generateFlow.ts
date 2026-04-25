import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";
import { loadApiRules, injectApiRules, extractVersionFolder } from "../lib/apiRules";
import { loadProjectVariables, injectProjectVariables } from "../lib/projectVariables";
import { extractCommonRequiredFields } from "../lib/specRequiredFields";
import { readDistilledContent } from "../lib/specDistillCache";

/** Strip markdown fences AND any preamble text before the XML declaration. */
function cleanXmlResponse(raw: string): string {
  let xml = raw
    .replace(/^```(?:xml)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  // Strip any commentary/preamble before the XML declaration
  const xmlStart = xml.indexOf("<?xml");
  if (xmlStart > 0) xml = xml.slice(xmlStart);
  return xml;
}

/**
 * Post-process generated XML: inject missing common required fields into
 * POST/PUT step bodies.  The AI often omits fields like project_version_id
 * for prerequisite steps that lack a spec file.  This function ensures all
 * POST/PUT bodies include the common required fields.
 *
 * @param xml        The generated flow XML
 * @param fields     Common required field names (e.g. ["project_version_id"])
 * @param projVarMap Map of field name → project variable token (e.g. "project_version_id" → "{{proj.projectVersionId}}")
 */
function injectMissingRequiredFields(
  xml: string,
  fields: string[],
  projVarMap: Record<string, string>,
): string {
  if (fields.length === 0) return xml;

  // Match each <step> that contains a POST or PUT method and has a <body> CDATA
  const stepRe = /<step\b[^>]*>[\s\S]*?<\/step>/g;

  return xml.replace(stepRe, (stepXml) => {
    // Only process POST and PUT steps
    const methodMatch = stepXml.match(/<method>(POST|PUT|PATCH)<\/method>/i);
    if (!methodMatch) return stepXml;

    // Find the CDATA body
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (!cdataMatch) return stepXml;

    const bodyText = cdataMatch[2];
    if (!bodyText.trim().startsWith("{")) return stepXml; // Not JSON

    // Use string-based check (not JSON.parse) because body contains
    // interpolation tokens like {{timestamp}} which aren't valid JSON
    const missingFields: string[] = [];
    for (const field of fields) {
      // Check if the field name appears as a JSON key in the body
      if (!bodyText.includes(`"${field}"`)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length === 0) return stepXml;

    // Insert missing fields before the last closing brace
    const additions = missingFields
      .map(f => `  "${f}": "${projVarMap[f] ?? `{{proj.${f}}}`}"`)
      .join(",\n");

    // Find the last } in the body and insert before it
    const lastBrace = bodyText.lastIndexOf("}");
    if (lastBrace < 0) return stepXml;

    // Check if there are existing fields (need a comma)
    const beforeBrace = bodyText.slice(0, lastBrace).trimEnd();
    const needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith("{") && !beforeBrace.endsWith(",");
    const separator = needsComma ? ",\n" : "\n";

    const newBody = bodyText.slice(0, lastBrace).trimEnd() +
      separator + additions + "\n" +
      bodyText.slice(lastBrace).trimStart().replace(/^}/, "      }");

    return stepXml.replace(cdataRe, `$1${newBody}$3`);
  });
}

/** Build a map from required field names to their best project variable token. */
function buildProjVarMap(
  fields: string[],
  projVars: { name: string; value: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    // Try exact match first (e.g. projVars has "projectVersionId" for field "project_version_id")
    // Convert snake_case to camelCase for matching
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const matchedVar = projVars.find(v =>
      v.name === field || v.name === camel ||
      v.name.toLowerCase() === field.toLowerCase() ||
      v.name.toLowerCase() === camel.toLowerCase()
    );
    if (matchedVar) {
      map[field] = `{{proj.${matchedVar.name}}}`;
    } else {
      map[field] = `{{proj.${camel}}}`;
    }
  }
  return map;
}

function scopedPath(projectId: string, name: string): string {
  if (!projectId || projectId === "unknown") return name;
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FLOW_SYSTEM_PROMPT = `You are an expert at creating API test flow definitions for the FlowForge API test runner.

You generate structured XML flow files that describe a sequence of API test steps. Each flow tests a specific user journey or lifecycle, and MUST validate against the Flow Definition Schema (flow.xsd) used by the runtime interpreter. If your output does not match the schema EXACTLY, the flow will be rejected as invalid and unusable.

## Flow XML Schema (flow.xsd v1)

### Root

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0"
      xmlns="https://flowforge.io/qa/flow/v1">
  <name>Human readable flow name</name>        <!-- required, element -->
  <entity>ResourceName</entity>                 <!-- required, element -->
  <description>What this flow covers</description>  <!-- required -->
  <stopOnFailure>true</stopOnFailure>           <!-- optional; default true -->
  <steps>                                        <!-- required wrapper -->
    <step number="1">...</step>
    <step number="2">...</step>
  </steps>
</flow>
\`\`\`

**Notes**
- \`name\`, \`entity\`, \`description\`, \`stopOnFailure\` are child **elements**, NOT attributes on \`<flow>\`.
- Steps live inside a single \`<steps>\` wrapper.
- \`<step>\` uses a \`number\` attribute (1-based, sequential integers).

### Step

The child elements of \`<step>\` must appear in this order:

1. \`<name>\` — step title shown in logs (required)
2. \`<endpointRef>\` — relative path to the endpoint MD file (optional)
3. \`<method>\` — one of \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\` (required). Use the method specified in the API spec.
4. \`<path>\` — URL template with \`{placeholder}\` tokens (required)
5. \`<pathParams>\` — bindings for \`{placeholders}\` in the path (required if path has placeholders)
6. \`<queryParams>\` — query-string bindings (optional)
7. \`<body>\` — JSON request body wrapped in CDATA (optional; omit for GET/DELETE with no body)
8. \`<captures>\` — values to extract for later steps (optional)
9. \`<assertions>\` — at least one assertion required
10. \`<flags>\` — optional behavioural flags (\`teardown\`, \`optional\`, \`noAuth\`)
11. \`<notes>\` — free-text QA context (optional)

### Params (path & query)

\`\`\`xml
<pathParams>
  <param name="myParam">proj.myVariable</param>            <!-- project variable (no {{ }} wrapper for pathParam values) -->
  <param name="resource_id">{{state.createdResourceId}}</param>  <!-- state variable ({{ }} in body/query, bare in pathParam) -->
</pathParams>
<queryParams>
  <param name="some_param">proj.someVariable</param>
</queryParams>
\`\`\`

**IMPORTANT**: Use the exact project variable names as listed in the "Available Project Variables" section below. Do NOT rename, convert case, or add underscores.

### Body

Wrap JSON in CDATA. Interpolation tokens (\`{{state.x}}\`, \`{{ctx.y}}\`, \`{{timestamp}}\`) are supported.
**CRITICAL**: The JSON body MUST include ALL fields marked as \`required\` in the API spec's request schema. Read the spec carefully for required arrays and "(required)" annotations.

\`\`\`xml
<body><![CDATA[
{
  "name": "[TEST] Example - {{timestamp}}",
  "parent_id": "{{state.createdParentId}}"
}
]]></body>
\`\`\`

### Captures

\`\`\`xml
<captures>
  <capture variable="state.createdResourceId" source="response.data.id"/>
  <capture variable="state.createdName"       source="response.data.name"/>
  <!-- From the request you sent (useful for path params): -->
  <capture variable="state.deletedVersionNumber"
           source="pathParam.version_number" from="request"/>
</captures>
\`\`\`

Attributes: \`variable\` (required), \`source\` (required), \`from\` (optional: \`response\` | \`request\` | \`computed\`, default \`response\`).

### Assertions

\`\`\`xml
<assertions>
  <assertion type="status"         code="200"/>                            <!-- use 'code', not 'value' -->
  <assertion type="field-exists"   field="data.id"/>
  <assertion type="field-equals"   field="data.status" value="{{state.expectedStatus}}"/>
  <assertion type="array-not-empty" field="data.items"/>
</assertions>
\`\`\`

**The element is \`<assertion>\` (singular), NOT \`<assert>\`.**
Supported types (exact strings): \`status\`, \`field-equals\`, \`field-exists\`, \`array-not-empty\`.

### Flags (teardown / optional / noAuth)

\`\`\`xml
<flags teardown="true"/>  <!-- this step always runs, even after earlier failures -->
<flags optional="true"/>  <!-- graceful skip if precondition can't be met -->
<flags noAuth="true"/>    <!-- omit the Authorization header for this step (use for 401 tests) -->
\`\`\`

**Teardown is set via \`<flags teardown="true"/>\` — NOT as an attribute on \`<step>\`.**
**For steps that test unauthenticated access (expecting 401), set \`<flags noAuth="true"/>\` to omit the Authorization header.**

### Interpolation tokens (allowed in any text/attr value)

- \`{{proj.variableName}}\` — project-level variable defined in Settings → Variables. Use the EXACT names from the "Available Project Variables" section.
- \`{{ctx.apiVersion}}\`, \`{{ctx.baseUrl}}\` — runtime context (API version, base URL)
- \`{{state.variableName}}\` — value captured from a previous step
- \`{{timestamp}}\` — Unix ms timestamp at execution time
- \`{{!state.boolVar}}\` — logical NOT of a boolean state variable

## Golden example — copy this structure exactly

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Resource CRUD Lifecycle</name>
  <entity>Resources</entity>
  <description>Creates a resource, verifies it, updates it, then cleans up.</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Resource</name>
      <endpointRef>resources/create-resource.md</endpointRef>
      <method>POST</method>
      <path>/v1/resources</path>
      <body><![CDATA[
{
  "name": "[TEST] Lifecycle - {{timestamp}}"
}
      ]]></body>
      <captures>
        <capture variable="state.createdId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status"       code="201"/>
        <assertion type="field-exists" field="data.id"/>
      </assertions>
    </step>

    <step number="2">
      <name>Delete Resource (cleanup)</name>
      <method>DELETE</method>
      <path>/v1/resources/{resource_id}</path>
      <pathParams>
        <param name="resource_id">{{state.createdId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
      <notes>teardown: true — runs even if earlier steps failed.</notes>
    </step>
  </steps>
</flow>
\`\`\`

## Hard rules (read before writing anything)

1. **STRICT SCOPE — NO PRIOR KNOWLEDGE**: Only use API endpoints, methods, and paths explicitly described in the provided spec files. Do NOT use your training data or prior knowledge about this API — treat the specs as if you are seeing this API for the first time. For prerequisite setup/teardown steps not in the specs, construct the path by following the EXACT same URL pattern and version prefix as the provided specs.
2. **Entity dependencies**: If the API has dependent entities (e.g., a child resource that requires a parent), create the prerequisites first and clean them up last. Check the spec for required fields and dependencies.
3. **Request body MUST include ALL required fields**: When the spec file documents a request body schema, you MUST include EVERY field listed as \`required\`. Parse the schema carefully — look for \`required: [field1, field2, ...]\` arrays, "Required" labels, or "(required)" annotations next to properties. For each required field, use: a project variable (\`{{proj.X}}\`) if one matches, a state variable (\`{{state.X}}\`) captured from a prior step, or a sensible test value. Omitting a required field will cause the API call to fail at runtime — this is a critical error. **For prerequisite/dependency steps** (e.g., creating a parent entity) where no spec is provided: check the "Common Required Fields" section at the end of the spec context and include those fields in the request body too.
4. **Teardown is MANDATORY for every flow**: Every flow — regardless of complexity — MUST end with teardown steps that delete ALL resources created during the flow. The testing environment must be left exactly as it was before the flow ran. Delete child resources before parent. Mark every teardown step with \`<flags teardown="true"/>\`.
5. **State passing**: Use \`<capture variable="state.X" source="response.data.Y"/>\` then reference \`{{state.X}}\` in later steps.
6. **Unique names**: For resource names, use \`[TEST] Something - {{timestamp}}\`.
7. **Assertions**: Every step needs at least one \`<assertion type="status" code="…"/>\`. Write operations should also assert \`field-exists\` on the created resource id. **Read the spec file carefully** — use the exact status code and response structure documented there. Do NOT guess.
8. **HTTP status codes**: Use these defaults unless the spec file explicitly states otherwise:
   - GET → \`200\`
   - POST (create) → \`201\`
   - PUT/PATCH (update) → \`200\`
   - DELETE → \`204\` (No Content) — the response body is typically EMPTY. Do not add body-level assertions on DELETE steps unless the spec explicitly documents a response body.
9. **Spec-driven assertions**: When spec files are provided, read the documented response schema and status codes carefully. The spec is the source of truth.
10. **Schema exactness**: Elements must appear in the order listed above. Use \`<assertion>\` not \`<assert>\`. Use \`code\` not \`value\` for status. Use \`field-exists\` / \`field-equals\` / \`array-not-empty\` — no other assertion types exist.
11. **Request body fields MUST match the endpoint's schema**: Only include fields that are defined in the endpoint's request body schema. Do NOT add extra fields like \`project_version_id\` unless the spec explicitly lists them in the request body for that specific endpoint. Many APIs use \`additionalProperties: false\` and will reject or error on unknown fields. Also never send fields marked \`readOnly: true\` in request bodies — those are response-only fields.

## Output format — MANDATORY

Your response MUST begin with \`<?xml version="1.0" encoding="UTF-8"?>\` as the very first characters.
Do NOT include ANY text before the XML declaration — no analysis, no commentary, no explanation, no preamble.
Do NOT wrap the XML in markdown code fences.
If spec files are missing or incomplete, still output valid XML using reasonable defaults — NEVER explain what you're doing instead.
Your entire response is the XML document and nothing else.`;

// Cap spec context to ~50k characters (~12k tokens) to keep flow generation
// cost-effective. Each flow only needs the endpoints it references, not every
// spec in the project.
const MAX_SPEC_CONTEXT_CHARS = 50_000;
const MAX_SPEC_FILES = 15;

async function buildSpecContext(specFiles: string[], projectId: string): Promise<{ context: string; failedFiles: string[] }> {
  if (!specFiles || specFiles.length === 0) {
    // Load a default set of available spec files
    try {
      const prefix = projectId !== "unknown" ? `${projectId}/` : undefined;
      const blobs = await listBlobs(prefix);
      const mdFiles = blobs.filter((b) => b.name.endsWith(".md")).slice(0, MAX_SPEC_FILES);
      if (mdFiles.length === 0) return { context: "", failedFiles: [] };
      const contents = await Promise.all(mdFiles.map((b) => downloadBlob(b.name)));
      const projPrefix = projectId !== "unknown" ? projectId + "/" : "";
      return {
        context: truncateContext(
          contents.map((c, i) => {
            const displayName = projPrefix && mdFiles[i].name.startsWith(projPrefix)
              ? mdFiles[i].name.slice(projPrefix.length) : mdFiles[i].name;
            return `## ${displayName}\n\n${c}`;
          }),
        ),
        failedFiles: [],
      };
    } catch {
      return { context: "", failedFiles: [] };
    }
  }

  // Only process up to MAX_SPEC_FILES — read pre-distilled versions when available
  const capped = specFiles.slice(0, MAX_SPEC_FILES);
  const failedFiles: string[] = [];
  const contents = await Promise.all(
    capped.map(async (name) => {
      const blobPath = scopedPath(projectId, name);
      try {
        const content = await readDistilledContent(blobPath);
        return `## ${name}\n\n${content}`;
      } catch (err) {
        console.error(`[generateFlow] Failed to read spec: ${blobPath}`, err);
        failedFiles.push(name);
        return "";
      }
    })
  );
  const validContents = contents.filter(c => c.length > 0);
  return { context: truncateContext(validContents), failedFiles };
}

function truncateContext(sections: string[]): string {
  const result: string[] = [];
  let totalChars = 0;
  for (const section of sections) {
    if (totalChars + section.length > MAX_SPEC_CONTEXT_CHARS) {
      // Add a truncation notice
      result.push("(Remaining spec files omitted to stay within token budget)");
      break;
    }
    result.push(section);
    totalChars += section.length;
  }
  return result.join("\n\n---\n\n");
}


/** POST /api/generate-flow
 *  Body: { prompt: string; specFiles?: string[]; stream?: boolean }
 *  Response: SSE stream of text chunks, or JSON { xml: string }
 */
async function generateFlow(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

  let body: { prompt: string; specFiles?: string[]; stream?: boolean; model?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.prompt) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "prompt is required" }),
    };
  }

  const client = new Anthropic({ apiKey });

  // Build spec context from selected files
  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  // ── Credit check ──
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
      console.warn("[generateFlow] credit check failed, proceeding anyway:", e);
    }
  }
  // buildSpecContext now reads pre-distilled versions (cached at upload time)
  const specFiles = body.specFiles ?? [];
  const { context: specContext, failedFiles } = await buildSpecContext(specFiles, projectId);

  // Fail early if ALL requested spec files couldn't be read
  if (specFiles.length > 0 && failedFiles.length === specFiles.length) {
    return {
      status: 422,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Could not read any of the ${specFiles.length} spec files. The AI would generate without spec context, producing incorrect request bodies. Check that the project has spec files uploaded.`,
        failedFiles,
      }),
    };
  }

  const specCount = specFiles.length;
  const scopeNote = specCount === 1
    ? `\n\nIMPORTANT: You are working with a SINGLE endpoint specification. The primary test steps of the flow MUST focus on this endpoint. However, you MUST still add prerequisite setup and teardown steps as required by the hard rules and project-specific API rules — these are ALWAYS allowed regardless of scope.`
    : specCount > 1
      ? `\n\nIMPORTANT: You are working with ${specCount} endpoint specifications. The primary test steps MUST focus on endpoints described in the specs above. However, you MUST still add prerequisite setup and teardown steps as required by the hard rules and project-specific API rules — these are ALWAYS allowed regardless of scope.`
      : "";

  // Load and inject version-folder API rules (falls back to project-level)
  const versionFolder = extractVersionFolder(body.specFiles ?? []);
  const { rules: apiRules } = await loadApiRules(projectId, versionFolder ?? undefined);
  const projVars = await loadProjectVariables(projectId);
  console.log(`[generateFlow] specContext: ${specContext.length} chars (pre-distilled)`);

  // Detect API version — prefer folder path (unambiguous), fall back to spec content
  let canonicalVersion: string | null = null;
  if (versionFolder) {
    const fm = versionFolder.match(/^v(\d+)$/i);
    if (fm) canonicalVersion = `v${fm[1]}`;
  }
  if (!canonicalVersion) {
    const versionSet = new Set<string>();
    const versionRe = /\/v(\d+)\//g;
    let vm: RegExpExecArray | null;
    while ((vm = versionRe.exec(specContext)) !== null) {
      versionSet.add(`v${vm[1]}`);
    }
    if (versionSet.size === 1) canonicalVersion = [...versionSet][0];
  }
  const versionDirective = canonicalVersion
    ? `\n\n**CRITICAL — API VERSION**: This API uses ${canonicalVersion} endpoints EXCLUSIVELY. ALL paths in your XML — including prerequisite/setup/teardown steps — MUST use /${canonicalVersion}/ prefix. Do NOT use any other version.`
    : "";

  const userMessage = specContext
    ? `${body.prompt}${scopeNote}${versionDirective}\n\n# Relevant API Specification\n\n${specContext}`
    : body.prompt;

  const shouldStream = body.stream !== false; // default to streaming
  const model = resolveModel(body.model, DEFAULT_FLOW_MODEL);

  // Build system prompt once (used by both streaming and non-streaming paths)
  let flowSystemPrompt = FLOW_SYSTEM_PROMPT;

  // Extract common required fields for both prompt injection AND post-processing
  const commonFields = specContext ? extractCommonRequiredFields(specContext) : [];
  const projVarMap = buildProjVarMap(commonFields, projVars);
  // Diagnostic: log required fields patterns found in specContext
  const reqFieldLines = specContext.split("\n").filter(l => l.includes("REQUIRED FIELDS") || l.includes("**YES**"));
  console.log(`[generateFlow] specContext length=${specContext.length}, specFiles=${JSON.stringify(body.specFiles)}`);
  console.log(`[generateFlow] REQUIRED FIELDS lines found: ${reqFieldLines.length}`, reqFieldLines.slice(0, 10));
  console.log(`[generateFlow] commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);

  if (commonFields.length > 0) {
    const fieldList = commonFields.map(f => `\`${f}\``).join(", ");
    flowSystemPrompt += `\n\n**COMMON REQUIRED FIELDS**: These fields appear as required across multiple endpoints in this API: ${fieldList}. When creating ANY resource (including prerequisite/setup steps without a spec file), include these fields using project variables (\`{{proj.X}}\`) or state variables (\`{{state.X}}\`).`;
  }

  const systemPrompt = injectProjectVariables(injectApiRules(flowSystemPrompt, apiRules), projVars);

  if (shouldStream) {
    // SSE streaming response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          });

          // Collect full text for post-processing while also streaming chunks
          let fullText = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              const sseData = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
          }

          // Post-process the complete XML (version fix + required fields injection)
          let xml = cleanXmlResponse(fullText);
          if (canonicalVersion) {
            xml = xml.replace(/(<path>(?:GET|POST|PUT|PATCH|DELETE)\s+)\/v\d+\//gi, `$1/${canonicalVersion}/`);
            xml = xml.replace(/(<path>)\/v\d+\//gi, `$1/${canonicalVersion}/`);
          }
          console.log(`[generateFlow] stream post-process: commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);
          xml = injectMissingRequiredFields(xml, commonFields, projVarMap);

          // Send the corrected XML so the frontend can replace the raw streamed text
          const correctedData = `data: ${JSON.stringify({ corrected: xml })}\n\n`;
          controller.enqueue(encoder.encode(correctedData));

          // Send usage data before closing
          const finalMsg = await stream.finalMessage();
          const inTok = finalMsg.usage.input_tokens;
          const outTok = finalMsg.usage.output_tokens;
          const cost = computeCost(model, inTok, outTok);

          // Record AI credit usage
          if (projectId !== "unknown") {
            try { await recordUsage(projectId, oid, displayName, cost); } catch (e) {
              console.warn("[generateFlow] credit recording failed:", e);
            }
          }

          const usageData = `data: ${JSON.stringify({ usage: { inputTokens: inTok, outputTokens: outTok, totalTokens: inTok + outTok, costUsd: cost } })}\n\n`;
          controller.enqueue(encoder.encode(usageData));

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const sseData = `data: ${JSON.stringify({ error: msg })}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        }
      },
    });

    return {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: readable,
    };
  } else {
    // Non-streaming: collect full response
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const finalMessage = await stream.finalMessage();
      const textBlock = finalMessage.content.find((b) => b.type === "text");
      const rawXml = textBlock && textBlock.type === "text" ? textBlock.text : "";
      let xml = cleanXmlResponse(rawXml);

      // Post-process: fix wrong API version prefixes in <path> elements
      if (canonicalVersion) {
        xml = xml.replace(/(<path>(?:GET|POST|PUT|PATCH|DELETE)\s+)\/v\d+\//gi, `$1/${canonicalVersion}/`);
        xml = xml.replace(/(<path>)\/v\d+\//gi, `$1/${canonicalVersion}/`);
      }

      // Post-process: inject missing common required fields into POST/PUT bodies
      console.log(`[generateFlow] post-process: commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);
      xml = injectMissingRequiredFields(xml, commonFields, projVarMap);

      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      const costUsd = computeCost(model, inputTokens, outputTokens);

      // Record AI credit usage
      if (projectId !== "unknown") {
        try { await recordUsage(projectId, oid, displayName, costUsd); } catch (e) {
          console.warn("[generateFlow] credit recording failed:", e);
        }
      }

      return {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd },
          ...(failedFiles.length > 0 ? { warning: `${failedFiles.length} of ${specFiles.length} spec files could not be read. Flow may be missing required fields.`, failedFiles } : {}),
          _debug: { projectId, commonFields, projVarMap, specFilesReceived: specFiles.length, specContextLength: specContext.length },
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
}

app.http("generateFlow", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-flow",
  handler: withAuth(generateFlow),
});
