import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { DEFAULT_FLOW_MODEL, resolveModel, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";
import { loadApiRules, injectApiRules, extractVersionFolder } from "../lib/apiRules";
import { loadProjectVariables, injectProjectVariables } from "../lib/projectVariables";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Cap spec context to ~50k characters (~12k tokens)
const MAX_SPEC_CONTEXT_CHARS = 50_000;
const MAX_SPEC_FILES = 5;

const FLOW_CHAT_SYSTEM_PROMPT = `You are an expert API test flow designer for the FlowForge API testing platform.

You help users interactively design test flows through conversation. Your role has TWO phases:

## Phase 1: Planning (default mode)

When the user describes what they want to test, you should:

1. **Understand the intent** — ask clarifying questions if the request is ambiguous.
2. **Propose a structured flow plan** using the exact format below.
3. **Iterate** — the user may ask you to add, remove, or modify steps.

### Flow Plan Format

When you have enough information to propose a plan, output it inside a JSON block like this:

\`\`\`flowplan
{
  "name": "Human readable flow name",
  "entity": "Primary entity (e.g. Users, Orders)",
  "description": "What this flow tests",
  "steps": [
    {
      "number": 1,
      "name": "Step name",
      "method": "POST",
      "path": "/v1/resources",
      "captures": ["state.createdId from response.data.id"],
      "assertions": ["status 201", "field-exists data.id"],
      "flags": []
    },
    {
      "number": 2,
      "name": "Delete resource (cleanup)",
      "method": "DELETE",
      "path": "/v1/resources/{resource_id}",
      "captures": [],
      "assertions": ["status 204"],
      "flags": ["teardown"]
    }
  ]
}
\`\`\`

### Planning Rules

- **ONE FLOW AT A TIME (CRITICAL)**: Each conversation produces exactly ONE flow. If the user asks for multiple flows, politely decline and explain that the Flow Designer creates one flow per session.
- **Entity dependencies**: If the API has dependent entities (e.g., child resources that require a parent), create prerequisites first and clean them up last in teardown.
- **Teardown is MANDATORY**: Every flow MUST end with teardown steps that delete ALL resources created. Mark each with the "teardown" flag.
- **Scope**: Only use endpoints from the provided spec files. Do not invent endpoints.
- **HTTP methods**: Use the exact methods documented in the API spec (GET, POST, PUT, PATCH, DELETE).
- **DELETE typically returns 204**: No body assertions on DELETE steps unless the spec says otherwise.

### Conversation Guidelines

- Be concise but helpful.
- When proposing a plan, include a brief explanation BEFORE the flowplan block.
- If the user's request is clear enough, propose a plan right away — don't over-ask.
- When the user says "looks good", "generate", "create it", or similar confirmation, respond with exactly: "CONFIRMED: Generating the flow XML now..." and nothing else. The system will take over from there.
- You may include text commentary alongside the flowplan block — the client parses the JSON block separately.

## Phase 2: XML Generation

When the system tells you to generate XML, you switch to XML generation mode. You will receive the confirmed plan and must output ONLY the raw XML. This phase uses a different system prompt — you do not handle it directly.

Remember: keep responses concise. Propose plans proactively when you have enough information. Ask at most 1-2 clarifying questions before showing a plan.`;

function scopedPath(projectId: string, name: string): string {
  if (!projectId || projectId === "unknown") return name;
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

async function buildSpecContext(specFiles: string[], projectId: string): Promise<string> {
  if (!specFiles || specFiles.length === 0) {
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
            ? mdFiles[i].name.slice(projPrefix.length)
            : mdFiles[i].name;
          return `## ${displayName}\n\n${c}`;
        }),
      );
    } catch {
      return "";
    }
  }

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
      result.push("(Remaining spec files omitted to stay within token budget)");
      break;
    }
    result.push(section);
    totalChars += section.length;
  }
  return result.join("\n\n---\n\n");
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FlowChatBody {
  messages: ChatMessage[];
  specFiles?: string[];
  model?: string;
}

/** POST /api/flow-chat
 *  Body: { messages: [{role, content}], specFiles?: string[], model?: string }
 *  Response: { reply: string, usage: {...} }
 */
async function flowChat(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
    };
  }

  let body: FlowChatBody;
  try {
    body = (await req.json()) as FlowChatBody;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.messages || body.messages.length === 0) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "messages array is required" }),
    };
  }

  const client = new Anthropic({ apiKey });
  const model = resolveModel(body.model, DEFAULT_FLOW_MODEL);

  // Build spec context from referenced files
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
      console.warn("[flowChat] credit check failed, proceeding anyway:", e);
    }
  }
  const specFiles = body.specFiles ?? [];
  const specContext = await buildSpecContext(specFiles, projectId);

  // Load and inject version-folder API rules (falls back to project-level)
  const versionFolder = extractVersionFolder(specFiles);
  const { rules: apiRules } = await loadApiRules(projectId, versionFolder ?? undefined);
  const projVars = await loadProjectVariables(projectId);

  // Inject spec content into the system prompt so the AI always has access,
  // regardless of conversation length or message position.
  let systemPrompt = injectProjectVariables(injectApiRules(FLOW_CHAT_SYSTEM_PROMPT, apiRules), projVars);
  if (specContext) {
    systemPrompt += `\n\n# Available API Specifications (${specFiles.length} file${specFiles.length !== 1 ? "s" : ""})\n\nThe user has provided the following API endpoint specifications. Use ONLY these endpoints when designing flows.\n\n${specContext}`;
  }

  // Pass messages through as-is — spec context is in the system prompt
  const apiMessages: ChatMessage[] = [...body.messages];

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    // Record AI credit usage
    if (projectId !== "unknown") {
      try { await recordUsage(projectId, oid, displayName, costUsd); } catch (e) {
        console.warn("[flowChat] credit recording failed:", e);
      }
    }

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        reply,
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

app.http("flowChat", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-chat",
  handler: withAuth(flowChat),
});
