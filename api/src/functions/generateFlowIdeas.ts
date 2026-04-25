import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { readDistilledContent } from "../lib/specDistillCache";
import { readDigest, rebuildDigest } from "../lib/specDigest";
import { DEFAULT_IDEAS_MODEL, resolveModel, priceFor, computeCost } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { checkCredits, recordUsage } from "../lib/aiCredits";
import { loadApiRules, injectApiRules, extractVersionFolder } from "../lib/apiRules";
import { loadProjectVariables, injectProjectVariables } from "../lib/projectVariables";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function scopedPath(projectId: string, name: string): string {
  if (!projectId || projectId === "unknown") return name;
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

const CHARS_PER_TOKEN = 3.5;  // conservative estimate
const MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_BUDGET_USD = 1.0;
const MAX_FILES = 50;
/** Folders with more than this many specs use the lightweight digest */
const DIGEST_THRESHOLD = 20;

const MAX_IDEAS_PER_RUN = 10;

const SYSTEM_PROMPT = `You are an expert QA test architect analyzing API specifications.

Your job: given a set of API endpoint specifications, generate test flow ideas. A "flow" is a sequence of API calls that tests a real user journey or lifecycle.

IMPORTANT: Generate exactly up to ${MAX_IDEAS_PER_RUN} NEW ideas per request. If the user provides a list of existing ideas, do NOT repeat any of them — generate only fresh, different ideas.

## What to analyze
- Each spec file describes one API endpoint (method, path, request/response schema, business rules)
- Look for CRUD lifecycles (create -> read -> update -> delete)
- Look for state transitions and workflows
- Look for bulk operations and their relationship to single operations
- Look for dependencies between entities (e.g., child resources requiring parent resources)
- Look for edge cases: invalid inputs, missing required fields, duplicate creation
- Look for ordering constraints: what must happen before what

## Output format
Return a JSON array. Each item:
{
  "id": "idea-N",
  "title": "Short descriptive name (under 60 chars)",
  "description": "One sentence describing the test scenario",
  "steps": ["POST /v1/resources", "GET /v1/resources/{id}", ...],
  "entities": ["resources", "sub-resources"],
  "complexity": "simple|moderate|complex"
}

## Complexity guide
- simple: 3-4 steps, single entity CRUD (including setup + teardown)
- moderate: 5-7 steps, may involve state changes or 2 entities
- complex: 8+ steps, multi-entity dependencies, bulk operations, error scenarios

## Idea ordering — IMPORTANT
Generate ideas in this priority order (first ideas should be simplest):

1. **Basic success (happy-path)**: For each endpoint, verify the core operation works.
   - POST creates a resource and returns 201 with the created object
   - GET retrieves a resource by ID and returns 200
   - PUT/PATCH updates a resource and returns 200 with updated data
   - DELETE removes a resource and returns 204
2. **Simple parameter validation**: Missing required fields, invalid IDs (non-existent, malformed), empty body on POST/PUT
3. **Authentication / authorization**: Request without auth token returns 401
4. **CRUD lifecycle**: Full create → read → update → delete in a single flow
5. **State transitions & business logic**: workflow state changes, bulk operations
6. **Complex multi-entity scenarios**: Cross-entity dependencies, ordering constraints, edge cases

Always start with the simplest scenarios before progressing to complex ones. The first 3-4 ideas should be simple or moderate complexity.

## Rules
1. Generate up to ${MAX_IDEAS_PER_RUN} ideas maximum per request
2. **STRICT SCOPE — NO PRIOR KNOWLEDGE**: Only use API endpoints explicitly described in the provided spec files. Do NOT use your training data or prior knowledge about this API — treat the specs as if you are seeing this API for the first time. For prerequisite setup/teardown steps not in the specs, construct the path by following the EXACT same URL pattern and version prefix as the provided specs.
3. Always note entity dependencies (e.g., child resource flows need parent setup/teardown)
4. Include both happy-path and error-path flows
5. Group related flows logically
6. Return ONLY valid JSON — no markdown fences, no explanation text
7. If existing ideas are provided, generate DIFFERENT ideas that cover new scenarios
8. **TEARDOWN IS MANDATORY**: Every flow — no matter how simple — MUST include cleanup/teardown steps that delete all resources created during the flow. The testing environment must be left exactly as it was before the flow ran. Even a simple "POST creates a resource" test must include a DELETE step at the end. Include these teardown steps in the "steps" array.

Return the JSON array directly.`;

function ok(data: unknown): HttpResponseInit {
  return {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

function err(status: number, data: unknown): HttpResponseInit {
  const body = typeof data === "string" ? JSON.stringify({ error: data }) : JSON.stringify(data);
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body,
  };
}

export async function generateFlowIdeasHandler(
  req: HttpRequest,
  _ctx: InvocationContext
): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  // ── Validate API key ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return err(500, "ANTHROPIC_API_KEY is not configured");
  }

  // ── Parse body ──
  let body: { folderPath?: string; maxBudgetUsd?: number; existingIdeas?: string[]; model?: string; maxCount?: number; filePaths?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.folderPath) {
    return err(400, "folderPath is required");
  }

  const budget = typeof body.maxBudgetUsd === "number" && body.maxBudgetUsd > 0
    ? body.maxBudgetUsd
    : DEFAULT_BUDGET_USD;

  const contextPath = body.folderPath;
  const hasExplicitFiles = Array.isArray(body.filePaths) && body.filePaths.length > 0;
  const isSingleFile = !hasExplicitFiles && contextPath.endsWith(".md");

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
        return err(402, {
          error: creditCheck.reason,
          projectCredits: creditCheck.projectCredits,
          userCredits: creditCheck.userCredits,
        });
      }
    } catch (e) {
      console.warn("[generateFlowIdeas] credit check failed, proceeding anyway:", e);
    }
  }

  // ── Resolve spec files based on context (explicit paths, single file, or folder) ──
  let specContents: { name: string; content: string }[];
  let filesAnalyzed = 0;
  let useDigest = false;

  if (hasExplicitFiles) {
    // Explicit file paths — read exactly those files (multi-select context)
    const paths = body.filePaths!.filter(p => p.endsWith(".md")).slice(0, MAX_FILES);
    if (paths.length === 0) {
      return ok({
        ideas: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, filesAnalyzed: 0, totalSpecCharacters: 0 },
        message: "No .md files in selection",
      });
    }
    filesAnalyzed = paths.length;
    try {
      specContents = await Promise.all(
        paths.map(async (name) => ({ name, content: await readDistilledContent(scopedPath(projectId, name)) })),
      );
    } catch (e) {
      return err(500, `Failed to read spec files: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (isSingleFile) {
    // Single file context — read just this one file
    try {
      const content = await readDistilledContent(scopedPath(projectId, contextPath));
      specContents = [{ name: contextPath, content }];
      filesAnalyzed = 1;
    } catch (e) {
      return err(500, `Failed to read spec file: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // Folder context — read all .md files in the folder
    const localPrefix = contextPath.endsWith("/") ? contextPath : `${contextPath}/`;
    const prefix = scopedPath(projectId, localPrefix);
    let allBlobs;
    try {
      allBlobs = await listBlobs(prefix);
    } catch (e) {
      return err(500, `Failed to list blobs: ${e instanceof Error ? e.message : String(e)}`);
    }

    const mdBlobs = allBlobs.filter((b) => b.name.endsWith(".md") && !b.name.endsWith("/.keep") && !b.name.includes("/_distilled/") && !b.name.includes("/_system/"));

    if (mdBlobs.length === 0) {
      return ok({
        ideas: [],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          filesAnalyzed: 0,
          totalSpecCharacters: 0,
        },
        message: "No .md files found in this folder",
      });
    }

    filesAnalyzed = mdBlobs.length;

    if (mdBlobs.length > DIGEST_THRESHOLD) {
      // Large folder — use lightweight digest instead of reading every file
      useDigest = true;
      let digest = await readDigest(projectId, contextPath);
      if (!digest) {
        // Build digest on-demand (first time or stale)
        try {
          digest = await rebuildDigest(projectId, contextPath);
        } catch (e) {
          return err(500, `Failed to build spec digest: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      specContents = [{ name: "API Endpoint Digest", content: digest }];
    } else {
      // Small folder — read full distilled specs (existing behavior)
      try {
        const projPrefix = projectId !== "unknown" ? projectId + "/" : "";
        specContents = await Promise.all(
          mdBlobs.map(async (b) => ({
            name: projPrefix && b.name.startsWith(projPrefix) ? b.name.slice(projPrefix.length) : b.name,
            content: await readDistilledContent(b.name),
          }))
        );
      } catch (e) {
        return err(500, `Failed to read spec files: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const specText = specContents
    .map((s) => `## ${s.name}\n\n${s.content}`)
    .join("\n\n---\n\n");

  // Resolve version folder early — needed for version detection and API rules
  const versionFolder = extractVersionFolder(body.folderPath ?? "");

  // Detect API version — prefer folder path (unambiguous), fall back to spec content
  let canonicalVersion: string | null = null;
  if (versionFolder) {
    const fm = versionFolder.match(/^v(\d+)$/i);
    if (fm) canonicalVersion = `v${fm[1]}`;
  }
  if (!canonicalVersion) {
    const versionSet = new Set<string>();
    const versionRe = /\/v(\d+)\//g;
    for (const s of specContents) {
      let m: RegExpExecArray | null;
      while ((m = versionRe.exec(s.content)) !== null) {
        versionSet.add(`v${m[1]}`);
      }
    }
    if (versionSet.size === 1) canonicalVersion = [...versionSet][0];
  }
  const versionDirective = canonicalVersion
    ? `\n\n**CRITICAL — API VERSION**: This API uses ${canonicalVersion} endpoints EXCLUSIVELY. ALL paths — including prerequisite/setup/teardown steps — MUST use /${canonicalVersion}/ prefix. Do NOT use any other version (e.g. /v1/, /v2/) under any circumstances.`
    : "";

  const existingList = body.existingIdeas && body.existingIdeas.length > 0
    ? `\n\n## Already Generated Ideas (DO NOT repeat these)\n\n${body.existingIdeas.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const scopeNote = isSingleFile
    ? `\n\nIMPORTANT: You are analyzing a SINGLE endpoint specification. Generate ideas using ONLY this endpoint. Do not reference any other endpoints outside this file.`
    : `\n\nYou are analyzing ${filesAnalyzed} endpoint specifications. Only use endpoints from these files in your ideas.`;

  const requestedCount = typeof body.maxCount === "number" && body.maxCount > 0 && body.maxCount <= MAX_IDEAS_PER_RUN
    ? body.maxCount
    : MAX_IDEAS_PER_RUN;
  const userMessage = `Analyze these API specifications and generate up to ${requestedCount} NEW test flow ideas.${scopeNote}${versionDirective}${existingList}\n\n## Spec Files\n\n${specText}`;

  // Load and inject version-folder API rules (falls back to project-level)
  const { rules: apiRules } = await loadApiRules(projectId, versionFolder ?? undefined);
  const projVars = await loadProjectVariables(projectId);
  const systemPrompt = injectProjectVariables(injectApiRules(SYSTEM_PROMPT, apiRules), projVars);

  // ── Resolve model ──
  const model = resolveModel(body.model, DEFAULT_IDEAS_MODEL);
  const { inputPrice, outputPrice } = priceFor(model);

  // ── Pre-estimate cost and enforce budget ──
  const totalChars = systemPrompt.length + userMessage.length;
  const estimatedInputTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const estimatedCostUsd =
    estimatedInputTokens * inputPrice +
    MAX_OUTPUT_TOKENS * outputPrice;

  if (estimatedCostUsd > budget) {
    return err(422, {
      error: `Estimated cost $${estimatedCostUsd.toFixed(4)} exceeds budget $${budget.toFixed(2)}`,
      estimatedInputTokens,
      estimatedOutputTokens: MAX_OUTPUT_TOKENS,
      estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(4)),
      budget,
      filesFound: filesAnalyzed,
      totalChars,
    });
  }

  // ── Call Claude API ──
  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    return err(500, `Claude API error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Extract usage ──
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = computeCost(model, inputTokens, outputTokens);

  // Record AI credit usage
  if (projectId !== "unknown") {
    try { await recordUsage(projectId, oid, displayName, costUsd); } catch (e) {
      console.warn("[generateFlowIdeas] credit recording failed:", e);
    }
  }

  const usage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd,
    filesAnalyzed,
    totalSpecCharacters: specText.length,
    usedDigest: useDigest,
  };

  // ── Parse response ──
  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

  let ideas;
  try {
    // Strip markdown code fences if Claude adds them despite instructions
    const cleaned = rawText.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    ideas = JSON.parse(cleaned);
    if (!Array.isArray(ideas)) {
      ideas = [ideas];
    }
  } catch {
    // Return raw text so the frontend can still display something
    return ok({
      ideas: [],
      rawText,
      parseError: true,
      usage,
    });
  }

  // Post-process: fix wrong API version prefixes in step paths.
  // The AI sometimes uses memorised paths from training data (e.g. /v2/)
  // instead of the version found in the specs (e.g. /v3/).
  if (canonicalVersion) {
    for (const idea of ideas) {
      if (Array.isArray(idea.steps)) {
        idea.steps = idea.steps.map((step: string) =>
          step.replace(/\/v\d+\//g, `/${canonicalVersion}/`)
        );
      }
    }
  }

  return ok({ ideas, usage });
}

app.http("generateFlowIdeas", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-flow-ideas",
  handler: withAuth(generateFlowIdeasHandler),
});
