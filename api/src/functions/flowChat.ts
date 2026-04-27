import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { extractVersionFolder } from "../lib/apiRules";
import { readDistilledContent } from "../lib/specDistillCache";
import { loadAiContext } from "../lib/aiContext";
import { analyzeCrossStepDependencies } from "../lib/specRequiredFields";

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
- **Entity dependencies — CRITICAL**: Scan request body fields for foreign-key references (any field ending in \`_id\` like \`category_id\`, \`parent_id\`, \`folder_id\`, \`group_id\`). If the field description says "retrieve from GET /…" or the field name matches a sibling resource, you MUST include a setup step to create it (\`POST\`) and a teardown step to delete it (\`DELETE\`) — even if the field is optional/nullable. Always create parent entities before children and delete in reverse order. Example: an article flow must create a prerequisite category first and delete it last.
- **Teardown is MANDATORY**: Every flow MUST end with teardown steps that delete ALL resources created. Mark each with the "teardown" flag.
- **Scope**: Only use endpoints from the provided spec files. Do not invent endpoints. For prerequisite setup/teardown steps, use the same API version prefix (e.g., /v3/) as the provided specs — NEVER use a different version.
- **HTTP methods**: Use the exact methods documented in the API spec (GET, POST, PUT, PATCH, DELETE).
- **DELETE typically returns 204**: No body assertions on DELETE steps unless the spec says otherwise.
- **Request body MUST include ALL required fields**: Parse the spec schema for \`required\` arrays / "(required)" labels. Every required field must appear in the plan's step body. Omitting a required field will cause the API call to fail at runtime.
- **Cross-step data flow — CAPTURE fields needed downstream**: Before planning any step, check if later steps require fields that come from earlier step responses. If a later step requires a field (e.g., \`version_number\`) that appears in an earlier step's response, plan to capture it. Example: POST /articles returns \`version_number\` → capture it → POST /articles/{id}/publish needs \`version_number\` in its body.

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
        const content = await readDistilledContent(scopedPath(projectId, name));
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

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  const specFiles = body.specFiles ?? [];
  const specContext = await buildSpecContext(specFiles, projectId);

  // Load AI context (rules, variables, dependencies) via shared module
  const versionFolder = extractVersionFolder(specFiles);
  const ctx = await loadAiContext({
    projectId, versionFolder,
    loadSpec: false, // spec loaded separately via buildSpecContext above
  });

  // Inject spec content into the system prompt so the AI always has access
  let systemPrompt = ctx.enrichSystemPrompt(FLOW_CHAT_SYSTEM_PROMPT);
  if (specContext) {
    const depMap = ctx.dependencyInfo ? `\n\n${ctx.dependencyInfo}` : "";
    const crossStepDeps = analyzeCrossStepDependencies(specContext);
    systemPrompt += `\n\n# Available API Specifications (${specFiles.length} file${specFiles.length !== 1 ? "s" : ""})\n\nThe user has provided the following API endpoint specifications. Use ONLY these endpoints when designing flows.\n\n${specContext}${depMap}${crossStepDeps}`;
  }

  const apiMessages: ChatMessage[] = [...body.messages];

  try {
    const result = await callAI({
      source: "flowChat",
      system: systemPrompt,
      messages: apiMessages,
      maxTokens: 4096,
      requestedModel: body.model,
      credits: { projectId, userId: oid, displayName },
    });

    let reply = result.text;

    // Post-process: fix wrong API version prefixes in flowplan paths
    let chatCanonicalVersion: string | null = null;
    if (versionFolder) {
      const fm = versionFolder.match(/^v(\d+)$/i);
      if (fm) chatCanonicalVersion = `v${fm[1]}`;
    }
    if (!chatCanonicalVersion && specContext) {
      const specVersions = new Set<string>();
      const svRe = /\/v(\d+)\//g;
      let sv: RegExpExecArray | null;
      while ((sv = svRe.exec(specContext)) !== null) {
        specVersions.add(`v${sv[1]}`);
      }
      if (specVersions.size === 1) chatCanonicalVersion = [...specVersions][0];
    }
    if (chatCanonicalVersion) {
      reply = reply.replace(/((?:GET|POST|PUT|PATCH|DELETE)\s+)\/v\d+\//gi, `$1/${chatCanonicalVersion}/`);
      reply = reply.replace(/"path":\s*"\/v\d+\//g, `"path": "/${chatCanonicalVersion}/`);
    }

    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        reply,
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
      return { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };
    }
    if (e instanceof CreditDeniedError) {
      return { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: e.creditDenied.reason, projectCredits: e.creditDenied.projectCredits, userCredits: e.creditDenied.userCredits }) };
    }
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
