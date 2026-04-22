import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";

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

const FLOW_SYSTEM_PROMPT = `You are an expert at creating API test flow definitions for the Document360 QA Customer API test runner.

You generate structured XML flow files that describe a sequence of API test steps. Each flow tests a specific user journey or lifecycle, and MUST validate against the Flow Definition Schema (flow.xsd) used by the runtime interpreter. If your output does not match the schema EXACTLY, the flow will be rejected as invalid and unusable.

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
2. \`<endpointRef>\` — relative path to the endpoint MD file, e.g. \`articles/get-an-article-by-id.md\` (optional)
3. \`<method>\` — one of \`GET\`, \`POST\`, \`PATCH\`, \`DELETE\` (required). **The D360 API uses PATCH for all updates — NEVER use PUT.**
4. \`<path>\` — URL template with \`{placeholder}\` tokens, e.g. \`/v3/projects/{project_id}/articles/{article_id}\` (required)
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
  <param name="project_id">ctx.projectId</param>          <!-- value is TEXT, not attr -->
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
  <assertion type="field-equals"   field="data.version_number" value="{{state.draftVersionNumber}}"/>
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

- \`{{ctx.projectId}}\`, \`{{ctx.versionId}}\`, \`{{ctx.langCode}}\`, \`{{ctx.token}}\`, \`{{ctx.baseUrl}}\`
- \`{{state.variableName}}\` — value captured from a previous step
- \`{{proj.variableName}}\` — project-level variable defined in Settings → Variables
- \`{{timestamp}}\` — Unix ms timestamp at execution time
- \`{{!state.boolVar}}\` — logical NOT of a boolean state variable

## Golden example — copy this structure exactly

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://document360.io/qa/flow/v1">
  <name>Article Version Lifecycle</name>
  <entity>Articles</entity>
  <description>Creates category + article, publishes, forks, verifies, cleans up.</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Category</name>
      <endpointRef>categories/create-a-category.md</endpointRef>
      <method>POST</method>
      <path>/v2/projects/{project_id}/categories</path>
      <pathParams>
        <param name="project_id">ctx.projectId</param>
      </pathParams>
      <body><![CDATA[
{
  "name": "[TEST] Version Lifecycle - {{timestamp}}",
  "project_version_id": "{{ctx.versionId}}"
}
      ]]></body>
      <captures>
        <capture variable="state.createdCategoryId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status"       code="201"/>
        <assertion type="field-exists" field="data.id"/>
      </assertions>
    </step>

    <step number="2">
      <name>Delete Category (cleanup)</name>
      <method>DELETE</method>
      <path>/v2/projects/{project_id}/categories/{category_id}</path>
      <pathParams>
        <param name="project_id">ctx.projectId</param>
        <param name="category_id">{{state.createdCategoryId}}</param>
      </pathParams>
      <queryParams>
        <param name="project_version_id">ctx.versionId</param>
      </queryParams>
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

1. **STRICT SCOPE**: Only use API endpoints, methods, and paths explicitly described in the provided spec files. Do not invent endpoints.
2. **Article dependency (CRITICAL — overrides scope rules)**: Flows MUST NEVER assume a pre-existing article or category. EVERY flow that operates on an article MUST start with: (a) Create Category (POST /v2/projects/{project_id}/categories), (b) Create Article (POST /v3/projects/{project_id}/articles with category_id from step a). End with teardown: delete article, then delete category. This applies even for single-endpoint flows like "Delete Article" — you must first create the article you intend to delete. The API requires category_id even though the spec marks it nullable.
3. **Teardown is MANDATORY for every flow**: Every flow — regardless of complexity — MUST end with teardown steps that delete ALL resources created during the flow. The testing environment must be left exactly as it was before the flow ran. Delete child resources before parent (article before category). Mark every teardown step with \`<flags teardown="true"/>\`.
4. **State passing**: Use \`<capture variable="state.X" source="response.data.Y"/>\` then reference \`{{state.X}}\` in later steps.
5. **Version paths**: Use \`/v3/…\` for every endpoint — the test runner rewrites the version segment at runtime to match the user's selected API version.
6. **Unique names**: For resource names, use \`[TEST] Something - {{timestamp}}\`.
7. **Assertions**: Every step needs at least one \`<assertion type="status" code="…"/>\`. Write operations should also assert \`field-exists\` on the created resource id. **Read the spec file carefully** — use the exact status code and response structure documented there. Do NOT guess.
8. **HTTP status codes (CRITICAL)**: Use these defaults unless the spec file explicitly states otherwise:
   - GET → \`200\`
   - POST (create) → \`201\`
   - PATCH (update) → \`200\`
   - **DELETE → \`204\` (No Content) — the response body is EMPTY. NEVER add \`field-equals\`, \`field-exists\`, or \`array-not-empty\` assertions on DELETE steps. The ONLY assertion for a DELETE step should be \`<assertion type="status" code="204"/>\`.**
   - **NEVER use PUT — the Document360 API does not support PUT. All update operations use PATCH. Using PUT will result in a 405 Method Not Allowed error.**
9. **Spec-driven assertions**: When spec files are provided, read the documented response schema and status codes carefully. The spec is the source of truth. If the spec says a DELETE returns 200 with a body, follow the spec. If silent, use the defaults from rule 8.
10. **Schema exactness**: Elements must appear in the order listed above. Use \`<assertion>\` not \`<assert>\`. Use \`code\` not \`value\` for status. Use \`field-exists\` / \`field-equals\` / \`array-not-empty\` — no other assertion types exist.
11. **Article update body (CRITICAL)**: When PATCHing an article, the request body MUST include both \`"title"\` and \`"content"\` fields with non-null string values. The API returns 400 "The content is required" if \`content\` is missing or null, even though the spec marks it nullable. Use literal test content like \`"<p>Updated test content - {{timestamp}}</p>"\` — do NOT rely on capturing and echoing back the original content unless the flow explicitly reads and captures it first.
12. **additionalProperties: false (CRITICAL)**: Many D360 request schemas reject unknown fields. In particular, the article PATCH body only accepts: \`title\`, \`content\`, \`category_id\`, \`hidden\`, \`version_number\`, \`translation_option\`, \`source\`, \`order\`, \`auto_fork\`. Do NOT include \`project_version_id\` in PATCH bodies — it is NOT a valid field and causes 400 errors. Always check the spec schema's properties list before adding fields to request bodies.

## Output format

Output ONLY the raw XML starting with \`<?xml\`. No markdown code fences. No commentary. No explanation.`;

// Cap spec context to ~50k characters (~12k tokens) to keep flow generation
// cost-effective. Each flow only needs the endpoints it references, not every
// spec in the project.
const MAX_SPEC_CONTEXT_CHARS = 50_000;
const MAX_SPEC_FILES = 5;

async function buildSpecContext(specFiles: string[], projectId: string): Promise<string> {
  if (!specFiles || specFiles.length === 0) {
    // Load a default set of available spec files
    try {
      const prefix = projectId !== "unknown" ? `${projectId}/` : undefined;
      const blobs = await listBlobs(prefix);
      const mdFiles = blobs.filter((b) => b.name.endsWith(".md")).slice(0, MAX_SPEC_FILES);
      if (mdFiles.length === 0) return "";
      const contents = await Promise.all(mdFiles.map((b) => downloadBlob(b.name)));
      const projPrefix = projectId !== "unknown" ? projectId + "/" : "";
      return truncateContext(
        contents.map((c, i) => {
          const displayName = projPrefix && mdFiles[i].name.startsWith(projPrefix)
            ? mdFiles[i].name.slice(projPrefix.length) : mdFiles[i].name;
          return `## ${displayName}\n\n${c}`;
        }),
      );
    } catch {
      return "";
    }
  }

  // Only process up to MAX_SPEC_FILES — scope paths with project prefix
  const capped = specFiles.slice(0, MAX_SPEC_FILES);
  const contents = await Promise.all(
    capped.map(async (name) => {
      try {
        const content = await downloadBlob(scopedPath(projectId, name));
        return `## ${name}\n\n${content}`;
      } catch {
        return `## ${name}\n\n(File not found)`;
      }
    })
  );
  return truncateContext(contents);
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
  const specContext = await buildSpecContext(body.specFiles ?? [], projectId);
  const specCount = body.specFiles?.length ?? 0;
  const scopeNote = specCount === 1
    ? `\n\nIMPORTANT: You are working with a SINGLE endpoint specification. The primary test steps of the flow MUST focus on this endpoint. However, you MUST still add prerequisite setup steps (Create Category, Create Article) and teardown steps (Delete Article, Delete Category) as required by the hard rules — these are ALWAYS allowed regardless of scope.`
    : specCount > 1
      ? `\n\nIMPORTANT: You are working with ${specCount} endpoint specifications. The primary test steps MUST focus on endpoints described in the specs above. However, you MUST still add prerequisite setup steps (Create Category, Create Article) and teardown steps (Delete Article, Delete Category) as required by the hard rules — these are ALWAYS allowed regardless of scope.`
      : "";
  const userMessage = specContext
    ? `${body.prompt}${scopeNote}\n\n# Relevant API Specification\n\n${specContext}`
    : body.prompt;

  const shouldStream = body.stream !== false; // default to streaming
  const model = resolveModel(body.model, DEFAULT_FLOW_MODEL);

  if (shouldStream) {
    // SSE streaming response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model,
            max_tokens: 8192,
            system: FLOW_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          });

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const sseData = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
          }

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
        system: FLOW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const finalMessage = await stream.finalMessage();
      const textBlock = finalMessage.content.find((b) => b.type === "text");
      const xml = textBlock && textBlock.type === "text" ? textBlock.text : "";

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
