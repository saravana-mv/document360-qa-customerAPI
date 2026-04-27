import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

const SYSTEM_PROMPT = `You are an expert QA rules editor for FlowForge, an API testing platform.

Your job: given the current contents of a _skills.md file and a user's instruction, produce the UPDATED file content with the requested change applied precisely.

## What _skills.md is

The _skills.md file contains rules and lessons that are injected into ALL AI prompts (flow generation, idea generation, flow chat, diagnostics). These rules guide the AI when generating test flows and ideas for this specific API.

The file has these sections (create them if missing):

### ## Rules
Free-text rules that apply to all AI operations. Each rule should be:
- Clear and actionable — the AI must know exactly what to do or not do
- Specific — reference endpoint paths, field names, or HTTP methods when relevant
- Concise — one rule per line or short paragraph

### ## Lessons Learned
Auto-appended diagnostic lessons from "Fix it" operations. Each lesson records endpoint, category, problematic fields, fix description, and date.

### ## Enum Aliases
Optional section with code block containing field=value alias mappings for integer enum fields.

## Your task

1. Read the user's instruction carefully
2. Determine what change to make (add rule, modify rule, remove rule, etc.)
3. Output ONLY the complete updated _skills.md content — no explanation, no markdown fences, no preamble
4. If adding a new rule, write it as a clear, precise instruction that an AI system will follow literally
5. Preserve all existing content that isn't being modified
6. Keep the file well-organized with proper markdown headings

## Rules for writing rules

- Be precise and unambiguous — the AI reading these rules has no context beyond the text
- Use imperative language: "Do X", "Never Y", "Always Z"
- Reference specific API paths, field names, or patterns when the user mentions them
- If the user's instruction is vague, refine it into a precise actionable rule
- Each rule should be self-contained (readable without needing the user's original prompt)

## Output format

Your response must be ONLY the complete updated file content. No explanation text before or after. No markdown code fences wrapping the output. Just the raw markdown content of the file.`;

function ok(body: unknown): HttpResponseInit {
  return {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function err(status: number, message: string): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * POST /api/skills-chat
 *
 * Body: { currentContent: string; instruction: string; model?: string }
 *
 * Takes the current _skills.md content and a user instruction,
 * returns the AI-refined updated content.
 */
async function skillsChatHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: { currentContent: string; instruction: string; model?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.instruction?.trim()) return err(400, "instruction is required");

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  const currentContent = body.currentContent ?? "";
  const userMessage = currentContent
    ? `Here is the current _skills.md content:\n\n---\n${currentContent}\n---\n\nUser instruction: ${body.instruction}`
    : `The _skills.md file is currently empty. Create it with the following rule:\n\nUser instruction: ${body.instruction}`;

  try {
    const result = await callAI({
      source: "skillsChat",
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 4096,
      requestedModel: body.model,
      credits: { projectId, userId: oid, displayName },
    });

    // Strip any accidental markdown fences the AI might add
    let updatedContent = result.text
      .replace(/^```(?:markdown|md)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    return ok({
      updatedContent,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        costUsd: result.usage.costUsd,
      },
    });
  } catch (e) {
    if (e instanceof AiConfigError) return err(500, e.message);
    if (e instanceof CreditDeniedError) return err(402, e.creditDenied.reason);
    return err(500, `AI error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

app.http("skillsChat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "skills-chat",
  handler: withAuth(skillsChatHandler),
});
