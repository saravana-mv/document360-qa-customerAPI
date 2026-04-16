import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Reuse the same schema prompt from generateFlow but with an edit-specific wrapper
const FLOW_EDIT_SYSTEM_PROMPT = `You are an expert at editing API test flow definitions for the Document360 QA Customer API test runner.

You will be given an existing flow XML and a user instruction describing changes to make. Your job is to apply the requested changes and return the FULL updated XML. The output MUST validate against the Flow Definition Schema (flow.xsd v1).

## Flow XML Schema (flow.xsd v1)

### Root

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0"
      xmlns="https://document360.io/qa/flow/v1">
  <name>Human readable flow name</name>        <!-- required, element -->
  <entity>Articles</entity>                      <!-- required, element -->
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
3. \`<method>\` — one of \`GET\`, \`POST\`, \`PATCH\`, \`DELETE\` (required). **The D360 API uses PATCH for all updates — NEVER use PUT.**
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
  <param name="project_id">ctx.projectId</param>
  <param name="article_id">{{state.createdArticleId}}</param>
</pathParams>
<queryParams>
  <param name="lang_code">ctx.langCode</param>
</queryParams>
\`\`\`

### Body

Wrap JSON in CDATA. Interpolation tokens (\`{{state.x}}\`, \`{{ctx.y}}\`, \`{{timestamp}}\`) are supported.

\`\`\`xml
<body><![CDATA[
{
  "title": "[TEST] Example - {{timestamp}}",
  "category_id": "{{state.createdCategoryId}}",
  "project_version_id": "{{ctx.versionId}}"
}
]]></body>
\`\`\`

### Captures

\`\`\`xml
<captures>
  <capture variable="state.createdArticleId" source="response.data.id"/>
  <capture variable="state.createdTitle"     source="response.data.title"/>
  <capture variable="state.deletedVersionNumber"
           source="pathParam.version_number" from="request"/>
</captures>
\`\`\`

Attributes: \`variable\` (required), \`source\` (required), \`from\` (optional: \`response\` | \`request\` | \`computed\`, default \`response\`).

### Assertions

\`\`\`xml
<assertions>
  <assertion type="status"         code="200"/>
  <assertion type="field-exists"   field="data.id"/>
  <assertion type="field-equals"   field="data.version_number" value="{{state.draftVersionNumber}}"/>
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

### Interpolation tokens (allowed in any text/attr value)

- \`{{ctx.projectId}}\`, \`{{ctx.versionId}}\`, \`{{ctx.langCode}}\`, \`{{ctx.token}}\`, \`{{ctx.baseUrl}}\`
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
8. **HTTP status codes (CRITICAL)**: GET → 200, POST (create) → 201, PATCH (update) → 200, **DELETE → 204 (No Content)**. DELETE responses have an EMPTY body — NEVER add \`field-equals\`, \`field-exists\`, or \`array-not-empty\` assertions on DELETE steps. The ONLY assertion for a DELETE should be \`<assertion type="status" code="204"/>\`. **NEVER use PUT — the D360 API does not support PUT (returns 405). All updates use PATCH.**
9. If you see incorrect assertions or methods in the existing XML (e.g. DELETE with status 200, body field checks on DELETE, or PUT instead of PATCH), fix them as part of your edit.

## Output format

Output ONLY the raw XML starting with \`<?xml\`. No markdown code fences. No commentary. No explanation.`;

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

  let body: { xml: string; prompt: string; model?: string };
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

  try {
    const userMessage = `Here is the current flow XML:\n\n\`\`\`xml\n${body.xml}\n\`\`\`\n\nPlease apply the following changes:\n${body.prompt}`;

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: FLOW_EDIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    let xml = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Strip markdown code fences if the model wraps its output
    xml = xml.replace(/^```xml\s*\n?/, "").replace(/\n?```\s*$/, "").trim();

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
