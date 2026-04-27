import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError } from "../lib/aiClient";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM_PROMPT = `You generate short, descriptive titles for API test flow prompts.

Rules:
- Output ONLY the title text, nothing else — no quotes, no prefix, no explanation.
- Max 80 characters.
- Use sentence case (capitalize first word only, plus proper nouns).
- The title should summarize what the test flow does, e.g. "Create article with category and verify settings".
- If the prompt already contains a "Title:" line, refine it to be concise but do not invent new scope.`;

/** POST /api/generate-title
 *  Body: { prompt: string }
 *  Response: { title: string }
 */
async function generateTitle(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: { prompt: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.prompt?.trim()) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "prompt is required" }),
    };
  }

  try {
    const result = await callAI({
      source: "generateTitle",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: body.prompt.slice(0, 2000) }],
      maxTokens: 100,
      // No credits param — title generation is free
    });

    const title = result.text.trim().slice(0, 80);

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          costUsd: result.usage.costUsd,
        },
      }),
    };
  } catch (e) {
    if (e instanceof AiConfigError) {
      return {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: e.message }),
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: msg }),
    };
  }
}

app.http("generateTitle", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-title",
  handler: withAuth(generateTitle),
});
