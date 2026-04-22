import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import Anthropic from "@anthropic-ai/sdk";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { DEFAULT_IDEAS_MODEL, resolveModel, priceFor, computeCost } from "../lib/modelPricing";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const CHARS_PER_TOKEN = 3.5;  // conservative estimate
const MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_BUDGET_USD = 1.0;
const MAX_FILES = 50;

const MAX_IDEAS_PER_RUN = 10;

const SYSTEM_PROMPT = `You are an expert QA test architect analyzing API specifications.

Your job: given a set of API endpoint specifications, generate test flow ideas. A "flow" is a sequence of API calls that tests a real user journey or lifecycle.

IMPORTANT: Generate exactly up to ${MAX_IDEAS_PER_RUN} NEW ideas per request. If the user provides a list of existing ideas, do NOT repeat any of them — generate only fresh, different ideas.

## What to analyze
- Each spec file describes one API endpoint (method, path, request/response schema, business rules)
- Look for CRUD lifecycles (create -> read -> update -> delete)
- Look for state transitions (draft -> published -> unpublished)
- Look for bulk operations and their relationship to single operations
- Look for dependencies between entities (e.g., articles require categories)
- Look for edge cases: invalid inputs, missing required fields, duplicate creation
- Look for ordering constraints: what must happen before what

## Output format
Return a JSON array. Each item:
{
  "id": "idea-N",
  "title": "Short descriptive name (under 60 chars)",
  "description": "One sentence describing the test scenario",
  "steps": ["POST /v3/.../resource", "GET /v3/.../resource/{id}", ...],
  "entities": ["articles", "categories"],
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
5. **State transitions & business logic**: publish/unpublish, version management, bulk operations
6. **Complex multi-entity scenarios**: Cross-entity dependencies, ordering constraints, edge cases

Always start with the simplest scenarios before progressing to complex ones. The first 3-4 ideas should be simple or moderate complexity.

## Rules
1. Generate up to ${MAX_IDEAS_PER_RUN} ideas maximum per request
2. **STRICT SCOPE**: Only use API endpoints that are explicitly described in the provided spec files. Do NOT reference, invent, or assume endpoints that are not in the provided context — even if you know they exist in the broader API. Every step in a flow must map to an endpoint from the specs given.
3. Always note entity dependencies (e.g., article flows need category setup/teardown)
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

  // ── Resolve spec files based on context (explicit paths, single file, or folder) ──
  let specContents: { name: string; content: string }[];
  let filesAnalyzed = 0;

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
        paths.map(async (name) => ({ name, content: await downloadBlob(name) })),
      );
    } catch (e) {
      return err(500, `Failed to read spec files: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (isSingleFile) {
    // Single file context — read just this one file
    try {
      const content = await downloadBlob(contextPath);
      specContents = [{ name: contextPath, content }];
      filesAnalyzed = 1;
    } catch (e) {
      return err(500, `Failed to read spec file: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // Folder context — read all .md files in the folder
    const prefix = contextPath.endsWith("/") ? contextPath : `${contextPath}/`;
    let allBlobs;
    try {
      allBlobs = await listBlobs(prefix);
    } catch (e) {
      return err(500, `Failed to list blobs: ${e instanceof Error ? e.message : String(e)}`);
    }

    const mdBlobs = allBlobs.filter((b) => b.name.endsWith(".md") && !b.name.endsWith("/.keep"));

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

    if (mdBlobs.length > MAX_FILES) {
      return err(422, `Folder contains ${mdBlobs.length} .md files (max ${MAX_FILES}). Use a subfolder or reduce file count.`);
    }

    try {
      specContents = await Promise.all(
        mdBlobs.map(async (b) => ({
          name: b.name,
          content: await downloadBlob(b.name),
        }))
      );
    } catch (e) {
      return err(500, `Failed to read spec files: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const specText = specContents
    .map((s) => `## ${s.name}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const existingList = body.existingIdeas && body.existingIdeas.length > 0
    ? `\n\n## Already Generated Ideas (DO NOT repeat these)\n\n${body.existingIdeas.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const scopeNote = isSingleFile
    ? `\n\nIMPORTANT: You are analyzing a SINGLE endpoint specification. Generate ideas using ONLY this endpoint. Do not reference any other endpoints outside this file.`
    : `\n\nYou are analyzing ${filesAnalyzed} endpoint specifications. Only use endpoints from these files in your ideas.`;

  const requestedCount = typeof body.maxCount === "number" && body.maxCount > 0 && body.maxCount <= MAX_IDEAS_PER_RUN
    ? body.maxCount
    : MAX_IDEAS_PER_RUN;
  const userMessage = `Analyze these API specifications and generate up to ${requestedCount} NEW test flow ideas.${scopeNote}${existingList}\n\n## Spec Files\n\n${specText}`;

  // ── Resolve model ──
  const model = resolveModel(body.model, DEFAULT_IDEAS_MODEL);
  const { inputPrice, outputPrice } = priceFor(model);

  // ── Pre-estimate cost and enforce budget ──
  const totalChars = SYSTEM_PROMPT.length + userMessage.length;
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
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    return err(500, `Claude API error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Extract usage ──
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = computeCost(model, inputTokens, outputTokens);

  const usage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd,
    filesAnalyzed,
    totalSpecCharacters: specText.length,
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

  return ok({ ideas, usage });
}

app.http("generateFlowIdeas", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-flow-ideas",
  handler: withAuth(generateFlowIdeasHandler),
});
