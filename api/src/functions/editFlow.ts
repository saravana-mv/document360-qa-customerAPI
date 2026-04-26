import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId } from "../lib/auth";
import { loadAiContext } from "../lib/aiContext";

/** Strip markdown fences AND any preamble text before the XML declaration. */
function cleanXmlResponse(raw: string): string {
  let xml = raw
    .replace(/^```(?:xml)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  const xmlStart = xml.indexOf("<?xml");
  if (xmlStart > 0) xml = xml.slice(xmlStart);
  return xml;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Reuse the same schema prompt from generateFlow but with an edit-specific wrapper
const FLOW_EDIT_SYSTEM_PROMPT = `You are an expert at editing API test flow definitions for the FlowForge API test runner.

You will be given an existing flow XML and a user instruction describing changes to make. Your job is to apply the requested changes and return the FULL updated XML. The output MUST validate against the Flow Definition Schema (flow.xsd v1).

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
  <param name="myParam">{{proj.myVariable}}</param>
  <param name="resource_id">{{state.createdResourceId}}</param>
</pathParams>
<queryParams>
  <param name="some_param">{{proj.someVariable}}</param>
</queryParams>
\`\`\`

**IMPORTANT**: Use the exact project variable names as listed in the "Available Project Variables" section below. Do NOT rename, convert case, or add underscores.

### Body

Wrap JSON in CDATA. Interpolation tokens (\`{{state.x}}\`, \`{{ctx.y}}\`, \`{{timestamp}}\`) are supported.

### Captures

\`\`\`xml
<captures>
  <capture variable="state.createdResourceId" source="response.data.id"/>
  <capture variable="state.createdName"       source="response.data.name"/>
</captures>
\`\`\`

Attributes: \`variable\` (required), \`source\` (required), \`from\` (optional: \`response\` | \`request\` | \`computed\`, default \`response\`).

### Assertions

\`\`\`xml
<assertions>
  <assertion type="status"         code="200"/>
  <assertion type="field-exists"   field="data.id"/>
  <assertion type="field-equals"   field="data.status" value="{{state.expectedStatus}}"/>
  <assertion type="array-not-empty" field="data.items"/>
</assertions>
\`\`\`

**The element is \`<assertion>\` (singular), NOT \`<assert>\`.**
Supported types (exact strings): \`status\`, \`field-equals\`, \`field-exists\`, \`array-not-empty\`.

### Flags (teardown / optional / noAuth)

\`\`\`xml
<flags teardown="true"/>
<flags optional="true"/>
<flags noAuth="true"/>
\`\`\`

**Teardown is set via \`<flags teardown="true"/>\` — NOT as an attribute on \`<step>\`.**
**For steps that test unauthenticated access (expecting 401), set \`<flags noAuth="true"/>\` to omit the Authorization header.**

### Interpolation tokens — ALWAYS use \`{{…}}\` syntax

**CRITICAL**: ALL variable references MUST use \`{{…}}\` mustache braces — in pathParams, queryParams, body, assertions, everywhere. Never use bare \`proj.xxx\` or \`state.xxx\` without braces.

- \`{{proj.variableName}}\` — project-level variable defined in Settings → Variables. Use the EXACT names from the "Available Project Variables" section.
- \`{{ctx.apiVersion}}\`, \`{{ctx.baseUrl}}\` — runtime context (API version, base URL)
- \`{{state.variableName}}\` — value captured from a previous step
- \`{{timestamp}}\` — Unix ms timestamp at execution time
- \`{{!state.boolVar}}\` — logical NOT of a boolean state variable

## Edit rules

1. Apply the user's requested changes while preserving the rest of the flow structure.
2. Keep all existing steps, captures, assertions, and teardown flags unless the user explicitly asks to remove them.
3. Renumber steps sequentially (1, 2, 3, …) after any insertions or deletions.
4. Every step must have at least one assertion (at minimum a status assertion).
5. Teardown steps must keep \`<flags teardown="true"/>\`.
6. Element order within \`<step>\` must match the schema order listed above.
7. Use \`<assertion>\` not \`<assert>\`. Use \`code\` not \`value\` for status assertions.
8. **HTTP status codes**: Use these defaults unless the spec or project API rules state otherwise: GET → 200, POST (create) → 201, PUT/PATCH (update) → 200, DELETE → 204 (No Content). DELETE responses typically have an empty body — do not add body assertions on DELETE unless the spec says otherwise.
9. If you see incorrect assertions in the existing XML, fix them as part of your edit.
10. **Request body MUST include ALL required fields**: When the spec or API rules document a request body schema, every field listed as \`required\` must be present in the \`<body>\` CDATA. If the existing XML is missing required fields, add them as part of your edit. Use project variables (\`{{proj.X}}\`), state variables (\`{{state.X}}\`), or sensible test values.
11. **Cross-step data flow (CRITICAL)**: When specs for multiple steps are provided, analyze the data flow between steps. If a later step requires a field (e.g., \`version_number\`) that is available in a prior step's response, you MUST: (a) add a \`<capture>\` to the prior step to extract the field into \`{{state.xxx}}\`, and (b) use \`{{state.xxx}}\` in the later step's body. Always check the response schema of prior steps for fields needed downstream.

## Output format — MANDATORY

Your response MUST begin with \`<?xml version="1.0" encoding="UTF-8"?>\` as the very first characters.
Do NOT include ANY text before the XML declaration — no analysis, no commentary, no explanation, no preamble.
Do NOT wrap the XML in markdown code fences.
Your entire response is the XML document and nothing else.`;

/** POST /api/edit-flow
 *  Body: { xml: string; prompt: string; model?: string }
 *  Response: { xml: string; usage: { inputTokens, outputTokens, totalTokens, costUsd } }
 */
async function editFlow(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

  let body: { xml: string; prompt: string; model?: string; versionFolder?: string; method?: string; path?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.xml || !body.prompt) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "xml and prompt are required" }),
    };
  }

  const client = new Anthropic({ apiKey });
  const model = resolveModel(body.model, DEFAULT_FLOW_MODEL);

  // Load AI context — when method/path provided (Fix-it path), include specs for ALL steps
  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }
  const versionFolder = body.versionFolder?.trim() || null;
  const hasEndpointHint = !!(body.method && body.path);
  const ctx = await loadAiContext({
    projectId,
    versionFolder,
    endpointHint: hasEndpointHint ? { method: body.method!, path: body.path! } : undefined,
    flowXml: hasEndpointHint ? body.xml : undefined,
    loadSpec: hasEndpointHint,
    loadDependencies: hasEndpointHint,
  });
  const systemPrompt = ctx.enrichSystemPrompt(FLOW_EDIT_SYSTEM_PROMPT);

  try {
    // When flow step specs are available (Fix-it path), inject ALL step specs
    const flowStepContext = ctx.formatFlowStepSpecs();
    const specSection = flowStepContext
      ? `\n\n${flowStepContext}`
      : ctx.specContext
        ? `\n\n## Endpoint Specification (source: ${ctx.specSource})\n\n${ctx.specContext}`
        : "";
    const depsSection = ctx.dependencyInfo ? `\n\n${ctx.dependencyInfo}` : "";
    const userMessage = `Here is the current flow XML:\n\n\`\`\`xml\n${body.xml}\n\`\`\`${specSection}${depsSection}\n\nPlease apply the following changes:\n${body.prompt}`;

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawXml = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const xml = cleanXmlResponse(rawXml);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        xml,
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

app.http("editFlow", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "edit-flow",
  handler: withAuth(editFlow),
});
