import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";

// Claude Opus 4 pricing
const OPUS_INPUT_PRICE_PER_TOKEN = 15 / 1_000_000;   // $15 per million
const OPUS_OUTPUT_PRICE_PER_TOKEN = 75 / 1_000_000;   // $75 per million

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FLOW_SYSTEM_PROMPT = `You are an expert at creating API test flow definitions.

You generate structured XML flow files that describe a sequence of API test steps. Each flow tests a specific user journey or lifecycle.

## Flow XML Schema

Each flow file must conform to this structure:

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow id="unique.flow.id" name="Human Readable Name" group="GroupName">
  <description>Brief description of what this flow tests</description>

  <step id="stepId" name="Step Name" method="GET|POST|PUT|PATCH|DELETE">
    <path>/v3/projects/{project_id}/resource</path>
    <description>What this step does</description>
    <!-- For write operations: -->
    <requestBody>
      <field name="fieldName" value="<expression>" type="string|number|boolean"/>
    </requestBody>
    <!-- Path parameters that come from state: -->
    <pathParams>
      <param name="resource_id" source="state.createdResourceId" tooltip="Created in Step N"/>
    </pathParams>
    <!-- What to capture from response for subsequent steps: -->
    <captures>
      <capture field="response.data.id" into="state.createdResourceId"/>
    </captures>
    <!-- Expected HTTP status: -->
    <assertions>
      <assert type="status" value="201"/>
      <assert type="bodyHasField" value="id"/>
    </assertions>
    <!-- Set teardown="true" for cleanup steps that must always run: -->
    <!-- <step ... teardown="true"> -->
  </step>

  <!-- More steps... -->
</flow>
\`\`\`

## Key Rules

1. **Category dependency**: If a flow creates articles, ALWAYS add a Create Category step first and a Delete Category teardown step last. The API requires category_id for article creation.

2. **Teardown order**: Delete child resources before parent resources (e.g., delete article before category).

3. **State passing**: Use state.* variables to pass IDs between steps. Capture them from response.data.* fields.

4. **Step IDs**: Use dot notation like "articles.create", "articles.publish", "articles.delete".

5. **Version paths**: Use /{apiVersion}/ or /v3/ for paths. Category endpoints use /{apiVersion}/, article endpoints use /v3/.

6. **Timestamps**: For unique names, use expressions like "[TEST] Name - <timestamp>".

7. **Assertions**: Every step needs at minimum an assertStatus assertion. Write operations also need assertBodyHasField for the created resource ID.

Output ONLY the XML — no markdown code fences, no explanation, just the raw XML starting with <?xml.`;

async function buildSpecContext(specFiles: string[]): Promise<string> {
  if (!specFiles || specFiles.length === 0) {
    // Load a default set of available spec files
    try {
      const blobs = await listBlobs();
      const mdFiles = blobs.filter((b) => b.name.endsWith(".md")).slice(0, 5);
      if (mdFiles.length === 0) return "";
      const contents = await Promise.all(mdFiles.map((b) => downloadBlob(b.name)));
      return contents
        .map((c, i) => `## ${mdFiles[i].name}\n\n${c}`)
        .join("\n\n---\n\n");
    } catch {
      return "";
    }
  }

  const contents = await Promise.all(
    specFiles.map(async (name) => {
      try {
        const content = await downloadBlob(name);
        return `## ${name}\n\n${content}`;
      } catch {
        return `## ${name}\n\n(File not found)`;
      }
    })
  );
  return contents.join("\n\n---\n\n");
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

  let body: { prompt: string; specFiles?: string[]; stream?: boolean };
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
  const specContext = await buildSpecContext(body.specFiles ?? []);
  const userMessage = specContext
    ? `${body.prompt}\n\n# Relevant API Specification\n\n${specContext}`
    : body.prompt;

  const shouldStream = body.stream !== false; // default to streaming

  if (shouldStream) {
    // SSE streaming response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: "claude-opus-4-6",
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
          const cost = parseFloat(
            ((inTok * OPUS_INPUT_PRICE_PER_TOKEN) + (outTok * OPUS_OUTPUT_PRICE_PER_TOKEN)).toFixed(6)
          );
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
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: FLOW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const finalMessage = await stream.finalMessage();
      const textBlock = finalMessage.content.find((b) => b.type === "text");
      const xml = textBlock && textBlock.type === "text" ? textBlock.text : "";

      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      const costUsd = parseFloat(
        ((inputTokens * OPUS_INPUT_PRICE_PER_TOKEN) + (outputTokens * OPUS_OUTPUT_PRICE_PER_TOKEN)).toFixed(6)
      );

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
  handler: generateFlow,
});
