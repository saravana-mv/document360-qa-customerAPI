import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_DESCRIPTION_CHARS = 2000;
const MAX_OUTPUT_TOKENS = 256;

const SYSTEM_PROMPT = `You are a keyword extractor for API test descriptions. Given a QA engineer's description of what they were testing, extract the core entity and action keywords that would appear in API endpoint paths.

Rules:
- Output ONLY a JSON array of lowercase keyword strings, nothing else
- Extract entity names (e.g. "snippet", "article", "category", "user")
- Extract action verbs that might appear in URL paths (e.g. "publish", "archive", "bulk")
- Do NOT include generic HTTP verbs (get, post, put, delete, patch)
- Do NOT include generic words (settings, api, project, data, request, response)
- Do NOT include stop words (the, a, an, is, was, were, and, or, but, for, with, from)
- Typically 2-8 keywords is the right range
- Think about what URL path segments would match the described actions`;

function err(status: number, error: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error }) };
}

async function harExtractKeywordsHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: { description?: string; model?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const description = typeof body.description === "string"
    ? body.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
    : "";
  if (!description) return err(400, "description is required");

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  try {
    const result = await callAI({
      source: "harExtractKeywords",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: description }],
      maxTokens: MAX_OUTPUT_TOKENS,
      requestedModel: body.model,
      credits: { projectId, userId: oid, displayName },
    });

    // Parse AI response — expect a JSON array of strings
    let keywords: string[];
    try {
      const parsed = JSON.parse(result.text);
      keywords = Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === "string").map(k => k.toLowerCase())
        : [];
    } catch {
      // If JSON parsing fails, try splitting by comma/newline
      keywords = result.text
        .replace(/[\[\]"']/g, "")
        .split(/[,\n]+/)
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 2);
    }

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          costUsd: result.usage.costUsd,
        },
      }),
    };
  } catch (e) {
    if (e instanceof CreditDeniedError) {
      return {
        status: 402,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Credit budget exhausted", creditDenied: e.creditDenied }),
      };
    }
    if (e instanceof AiConfigError) {
      return err(500, e.message);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("harExtractKeywords", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "har-extract-keywords",
  handler: withAuth(harExtractKeywordsHandler),
});
