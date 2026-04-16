import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "../lib/modelPricing";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Always use Haiku — this is a trivial summarisation task
const MODEL = "claude-haiku-4-5-20251001" as const;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: body.prompt.slice(0, 2000) }], // cap input to save tokens
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const title = (textBlock && textBlock.type === "text" ? textBlock.text : "").trim().slice(0, 80);

    const costUsd = computeCost(MODEL, response.usage.input_tokens, response.usage.output_tokens);

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          costUsd,
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

app.http("generateTitle", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-title",
  handler: withAuth(generateTitle),
});
