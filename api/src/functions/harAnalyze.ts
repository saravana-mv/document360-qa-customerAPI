import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI } from "../lib/aiClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_DESCRIPTION_CHARS = 500;
const MAX_CALLS = 50;
const MAX_OUTPUT_TOKENS = 1024;

const SYSTEM_PROMPT = `You are an API call classifier. Given a QA engineer's description of what they were testing and a list of API calls recorded from their browser session, select which calls are relevant to the described test scenario(s).

Rules:
- Only select calls directly related to the described testing intent
- Background/noise calls (font loading, analytics, settings fetches unrelated to the test) should be excluded
- If the description mentions multiple distinct scenarios, group the calls by scenario
- If the description mentions only one scenario, return a single scenario group
- Return valid JSON only, no markdown fences`;

interface HarCall {
  seq: number;
  method: string;
  path: string;
  status: number;
}

interface RequestBody {
  description?: string;
  calls?: HarCall[];
}

interface Scenario {
  name: string;
  callIndices: number[];
}

function err(status: number, error: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error }) };
}

async function harAnalyzeHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const description = typeof body.description === "string"
    ? body.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
    : "";
  if (!description) return err(400, "description is required");

  if (!Array.isArray(body.calls) || body.calls.length === 0) {
    return err(400, "calls array is required and must not be empty");
  }

  const calls = body.calls.slice(0, MAX_CALLS);

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  const callList = calls
    .map(c => `[${c.seq}] ${c.method} ${c.path} → ${c.status}`)
    .join("\n");

  const userMessage = `## QA Description\n${description}\n\n## Recorded API Calls\n${callList}\n\nReturn JSON: { "scenarios": [{ "name": "...", "callIndices": [seq numbers] }] }`;

  let result;
  try {
    result = await callAI({
      source: "harAnalyze",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: MAX_OUTPUT_TOKENS,
      requestedModel: "claude-haiku-4-5-20251001",
      credits: {
        projectId,
        userId: oid,
        displayName,
      },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e) {
      const named = e as { name: string; creditDenied?: unknown };
      if (named.name === "CreditDeniedError") {
        return {
          status: 402,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Credit budget exhausted", creditDenied: named.creditDenied }),
        };
      }
      if (named.name === "AiConfigError") {
        return err(500, (e as Error).message);
      }
    }
    return err(500, "AI call failed");
  }

  // Parse AI response
  let scenarios: Scenario[];
  try {
    const parsed = JSON.parse(result.text) as { scenarios?: Scenario[] };
    scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
    // Validate: each scenario must have name + callIndices array of numbers
    scenarios = scenarios
      .filter(s => typeof s.name === "string" && Array.isArray(s.callIndices))
      .map(s => ({
        name: s.name,
        callIndices: s.callIndices.filter(n => typeof n === "number"),
      }))
      .filter(s => s.callIndices.length > 0);
  } catch {
    // If JSON parsing fails, fall back to selecting all calls as one scenario
    scenarios = [{ name: "All calls", callIndices: calls.map(c => c.seq) }];
  }

  return {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarios,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      },
    }),
  };
}

app.http("harAnalyze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "har-analyze",
  handler: withAuth(harAnalyzeHandler),
});
