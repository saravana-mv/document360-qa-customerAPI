import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err(500, "ANTHROPIC_API_KEY is not configured");

  let body: { currentContent: string; instruction: string; model?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.instruction?.trim()) return err(400, "instruction is required");

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  // Credit check
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;
  if (projectId !== "unknown") {
    try {
      const creditCheck = await checkCredits(projectId, oid, displayName);
      if (!creditCheck.allowed) {
        return err(402, creditCheck.reason ?? "AI credits exhausted");
      }
    } catch (e) {
      console.warn("[skillsChat] credit check failed, proceeding:", e);
    }
  }

  const currentContent = body.currentContent ?? "";
  const userMessage = currentContent
    ? `Here is the current _skills.md content:\n\n---\n${currentContent}\n---\n\nUser instruction: ${body.instruction}`
    : `The _skills.md file is currently empty. Create it with the following rule:\n\nUser instruction: ${body.instruction}`;

  const model = resolveModel(body.model, DEFAULT_FLOW_MODEL);
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    let updatedContent = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Strip any accidental markdown fences the AI might add
    updatedContent = updatedContent
      .replace(/^```(?:markdown|md)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    // Record credit usage
    if (projectId !== "unknown") {
      try { await recordUsage(projectId, oid, displayName, costUsd); } catch (e) {
        console.warn("[skillsChat] credit recording failed:", e);
      }
    }

    return ok({
      updatedContent,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd },
    });
  } catch (e) {
    return err(500, `AI error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

app.http("skillsChat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "skills-chat",
  handler: withAuth(skillsChatHandler),
});
