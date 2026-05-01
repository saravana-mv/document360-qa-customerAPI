import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { readDistilledContent } from "../lib/specDistillCache";
import { readDigest, rebuildDigest } from "../lib/specDigest";
import { DEFAULT_IDEAS_MODEL, priceFor } from "../lib/modelPricing";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { extractVersionFolder } from "../lib/apiRules";
import { loadAiContext } from "../lib/aiContext";
import { resolveCrossFolderDeps } from "../lib/specFileSelection";
import { createIdeasTraceBuilder } from "../lib/ideasTrace";

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

type IdeaMode = "full" | "no-prereqs" | "no-prereqs-no-teardown";

function buildSystemPrompt(mode: IdeaMode, maxIdeas: number, useDigest: boolean): string {
  const base = `You are an expert QA test architect analyzing API specifications.

Your job: given a set of API endpoint specifications, generate test flow ideas. A "flow" is a sequence of API calls that tests a real user journey or lifecycle.

IMPORTANT: Generate exactly up to ${maxIdeas} NEW ideas per request. If the user provides a list of existing ideas, do NOT repeat any of them — generate only fresh, different ideas.

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
  "complexity": "simple|moderate|complex"${useDigest ? "" : ',\n  "specFiles": ["path/to/resource/create-resource.md", ...]'}
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

Always start with the simplest scenarios before progressing to complex ones. The first 3-4 ideas should be simple or moderate complexity.`;

  // Mode-specific rules for prerequisites and teardown
  let modeRules: string;
  if (mode === "no-prereqs") {
    modeRules = `
3. **NO PREREQUISITES — USE PROJECT VARIABLES**: Do NOT create prerequisite entities (no setup steps for parent resources). Instead, use \`{{proj.variableName}}\` for any foreign key IDs (e.g., \`{{proj.categoryId}}\`). The user will configure these in Settings → Variables. Only include the core API operations in the steps.
8. **TEARDOWN — FLOW-CREATED RESOURCES ONLY**: Include DELETE teardown steps ONLY for resources this flow creates (not for project-variable resources). If the flow creates an article, delete that article at the end. Do NOT delete the prerequisite entities referenced via \`{{proj.*}}\` variables.`;
  } else if (mode === "no-prereqs-no-teardown") {
    modeRules = `
3. **NO PREREQUISITES — USE PROJECT VARIABLES**: Do NOT create prerequisite entities (no setup steps for parent resources). Instead, use \`{{proj.variableName}}\` for any foreign key IDs (e.g., \`{{proj.categoryId}}\`). The user will configure these in Settings → Variables. Only include the core API operations in the steps.
8. **NO TEARDOWN**: Do NOT include teardown/DELETE steps. The flow tests only the core operations. This mode is for quick smoke tests and debugging.`;
  } else {
    // "full" mode — current behavior
    modeRules = `
3. **ENTITY DEPENDENCIES — CRITICAL**: Scan every endpoint's request body for foreign-key fields (any field ending in \`_id\` that references another resource, e.g. \`category_id\`, \`parent_id\`, \`folder_id\`, \`group_id\`). If a field description says "retrieve from GET /…" or the field name matches a sibling resource, the idea MUST include:
   - A setup step BEFORE the main logic: \`POST /vN/…/{resource}\` to create the dependency
   - A teardown step AFTER the main logic: \`DELETE /vN/…/{resource}/{id}\` to clean up
   Even if the field is marked optional/nullable. Example: an article idea must include "POST /v3/projects/{project_id}/categories — create prerequisite category" as step 1 and "DELETE /v3/projects/{project_id}/categories/{category_id} — teardown category" as the final step before other teardown. Use the SAME version prefix as the provided specs.
   **EXCEPTION — PROJECT VARIABLES REPLACE PREREQUISITES**: If a foreign-key field is already covered by an entry in the "## Available Project Variables" section of this prompt, do NOT add a setup step to create that entity. Use \`{{proj.variableName}}\` directly in paths and body fields instead. For example, if \`{{proj.projectId}}\` is defined, omit the "Create Project" setup step and reference the variable wherever \`{project_id}\` appears. Only generate prerequisites for entities that have no matching project variable.
8. **TEARDOWN IS MANDATORY**: Every flow — no matter how simple — MUST include cleanup/teardown steps that delete all resources created during the flow. The testing environment must be left exactly as it was before the flow ran. Even a simple "POST creates a resource" test must include a DELETE step at the end. Include these teardown steps in the "steps" array. Do NOT tear down resources backed by project variables — only clean up entities the flow itself created.`;
  }

  // Spec file references rule — only when NOT using digest
  const specFilesRule = useDigest ? "" : `
9. **SPEC FILE REFERENCES**: For each idea, populate "specFiles" with the EXACT file paths from the "## {path}" headers in the spec content below. Include spec files for ALL steps in this idea (including setup/teardown steps if their specs are visible). If you cannot see the spec file for a prerequisite step (it is from a different folder), omit it — the system will resolve it automatically. Only include paths you can see in the provided spec headers.`;

  return `${base}

## Rules
1. Generate up to ${maxIdeas} ideas maximum per request
2. **STRICT SCOPE — NO PRIOR KNOWLEDGE**: Only use API endpoints explicitly described in the provided spec files. Do NOT use your training data or prior knowledge about this API — treat the specs as if you are seeing this API for the first time. For prerequisite setup/teardown steps not in the specs, construct the path by following the EXACT same URL pattern and version prefix as the provided specs.${modeRules}
4. Include both happy-path and error-path flows
5. Group related flows logically
6. Return ONLY valid JSON — no markdown fences, no explanation text
7. If existing ideas are provided, generate DIFFERENT ideas that cover new scenarios${specFilesRule}

Return the JSON array directly.`;
}


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

  // ── Parse body ──
  let body: { folderPath?: string; maxBudgetUsd?: number; existingIdeas?: string[]; model?: string; maxCount?: number; filePaths?: string[]; mode?: IdeaMode; prompt?: string; scope?: "folder" | "version" | "custom" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.folderPath) {
    return err(400, "folderPath is required");
  }

  const mode: IdeaMode = (body.mode === "no-prereqs" || body.mode === "no-prereqs-no-teardown") ? body.mode : "full";

  const budget = typeof body.maxBudgetUsd === "number" && body.maxBudgetUsd > 0
    ? body.maxBudgetUsd
    : DEFAULT_BUDGET_USD;

  const scope = body.scope ?? "folder";
  // When scope is "version", use the version folder as context and force digest mode
  const versionFolderEarly = extractVersionFolder(body.folderPath ?? "");
  const contextPath = scope === "version" && versionFolderEarly ? versionFolderEarly : body.folderPath;
  const hasExplicitFiles = Array.isArray(body.filePaths) && body.filePaths.length > 0;
  const isSingleFile = !hasExplicitFiles && contextPath.endsWith(".md");
  const forceDigest = scope === "version";

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;

  // ── Trace builder ──
  const trace = createIdeasTraceBuilder(projectId, oid, displayName);

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

    if (forceDigest || mdBlobs.length > DIGEST_THRESHOLD) {
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

  // ── Trace: request & spec context ──
  trace.setRequest({
    folderPath: body.folderPath ?? "",
    mode,
    maxCount: typeof body.maxCount === "number" ? body.maxCount : MAX_IDEAS_PER_RUN,
    scope,
    prompt: body.prompt?.trim() || null,
    filePaths: hasExplicitFiles ? (body.filePaths ?? []) : [],
    existingIdeasCount: body.existingIdeas?.length ?? 0,
  });
  trace.setSpecContext({
    source: hasExplicitFiles ? "explicit" : isSingleFile ? "single-file" : "folder",
    usedDigest: useDigest,
    filesAnalyzed,
    totalSpecCharacters: specText.length,
    fileNames: specContents.map(s => s.name),
  });

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

  // Load AI context (rules, variables, dependencies) via shared module
  const ctx = await loadAiContext({
    projectId, versionFolder,
    loadSpec: false, // spec loaded separately above
  });
  const dependencyMap = ctx.dependencyInfo ? `\n\n${ctx.dependencyInfo}` : "";

  const requestedCount = typeof body.maxCount === "number" && body.maxCount > 0 && body.maxCount <= MAX_IDEAS_PER_RUN
    ? body.maxCount
    : MAX_IDEAS_PER_RUN;

  const modeNote = mode === "no-prereqs"
    ? `\n\n**MODE: No Prerequisites** — Do NOT create prerequisite entities. Use \`{{proj.variableName}}\` for foreign key IDs. Include DELETE teardown only for resources this flow creates.`
    : mode === "no-prereqs-no-teardown"
      ? `\n\n**MODE: Minimal (No Prerequisites, No Teardown)** — Do NOT create prerequisite entities. Use \`{{proj.variableName}}\` for foreign key IDs. Do NOT include teardown/DELETE steps.`
      : "";

  // "__random__" sentinel: pick a random focus pattern for variety
  const RANDOM_PATTERNS = [
    "Generate CRUD lifecycle flows for each entity — create, read, update, delete with proper setup and teardown.",
    "Focus on error scenarios: missing required fields (400), unauthorized access (401), resource not found (404), and validation errors (422).",
    "Test foreign key relationships between resources — verify that child resources correctly reference parent entities and that cascading operations work.",
    "Test bulk create/update/delete endpoints and verify their interaction with single-resource CRUD endpoints.",
    "Test state transition workflows: publish/unpublish, lock/unlock, draft/active, enable/disable — verify correct status changes and constraints.",
    "Test authentication and authorization: missing token (401), invalid token (401), insufficient permissions (403), expired token scenarios.",
  ];

  const rawPrompt = body.prompt?.trim() === "__random__"
    ? RANDOM_PATTERNS[Math.floor(Math.random() * RANDOM_PATTERNS.length)]
    : body.prompt?.trim();

  const focusPrompt = rawPrompt
    ? `\n\n## Focus Area\nThe QA engineer wants to focus on: ${rawPrompt}\nGenerate ideas aligned with this focus while still covering the provided specs.`
    : "";

  const userMessage = `Analyze these API specifications and generate up to ${requestedCount} NEW test flow ideas.${scopeNote}${versionDirective}${modeNote}${focusPrompt}${existingList}${dependencyMap}\n\n## Spec Files\n\n${specText}`;

  const SYSTEM_PROMPT = buildSystemPrompt(mode, requestedCount, useDigest);
  const systemPrompt = ctx.enrichSystemPrompt(SYSTEM_PROMPT);

  // ── Trace: prompts ──
  trace.setPrompt(systemPrompt, userMessage);

  // ── Pre-estimate cost and enforce budget ──
  const { inputPrice, outputPrice } = priceFor(DEFAULT_IDEAS_MODEL);
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

  // ── Call Claude API via centralized client ──
  let result;
  try {
    result = await callAI({
      source: "generateFlowIdeas",
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: MAX_OUTPUT_TOKENS,
      requestedModel: body.model,
      defaultModel: DEFAULT_IDEAS_MODEL,
      credits: { projectId, userId: oid, displayName },
    });
  } catch (e) {
    if (e instanceof AiConfigError) return err(500, e.message);
    if (e instanceof CreditDeniedError) {
      return err(402, { error: e.creditDenied.reason, projectCredits: e.creditDenied.projectCredits, userCredits: e.creditDenied.userCredits });
    }
    return err(500, `Claude API error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const usage = {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    costUsd: result.usage.costUsd,
    filesAnalyzed,
    totalSpecCharacters: specText.length,
    usedDigest: useDigest,
  };

  // ── Trace: model usage ──
  trace.setModelUsage({
    name: body.model ?? DEFAULT_IDEAS_MODEL,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: result.usage.costUsd,
  });

  // ── Parse response ──
  const rawText = result.text;

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
    trace.setResult({ ideasGenerated: 0, parseError: true, crossFolderAugmented: 0 });
    const traceId = await trace.save();
    return ok({
      ideas: [],
      rawText,
      parseError: true,
      usage,
      traceId,
    });
  }

  // Post-process ideas
  for (const idea of ideas) {
    // Fix wrong API version prefixes in step paths
    if (canonicalVersion && Array.isArray(idea.steps)) {
      idea.steps = idea.steps.map((step: string) =>
        step.replace(/\/v\d+\//g, `/${canonicalVersion}/`)
      );
    }
    // Store mode on each idea for flow generation to use
    idea.mode = mode;
    // Validate specFiles entries (must end with .md, must contain /)
    if (Array.isArray(idea.specFiles)) {
      idea.specFiles = idea.specFiles.filter(
        (f: string) => typeof f === "string" && f.endsWith(".md") && f.includes("/")
      );
      if (idea.specFiles.length === 0) delete idea.specFiles;
    }
  }

  // ── Cross-folder spec augmentation ──
  // Ideas may reference prerequisite endpoints from sibling folders (e.g., articles
  // ideas needing categories specs). Resolve those now so specFiles is complete.
  if (versionFolder && mode === "full") {
    try {
      const versionPrefix = scopedPath(projectId, versionFolder.endsWith("/") ? versionFolder : `${versionFolder}/`);
      const allVersionBlobs = await listBlobs(versionPrefix);
      const allMdFiles = allVersionBlobs
        .filter(b => b.name.endsWith(".md") && !b.name.includes("/_system/") && !b.name.includes("/_distilled/"))
        .map(b => {
          // Strip projectId prefix to get relative paths matching specFiles format
          const projPrefix = projectId !== "unknown" ? projectId + "/" : "";
          return projPrefix && b.name.startsWith(projPrefix) ? b.name.slice(projPrefix.length) : b.name;
        });

      for (const idea of ideas) {
        if (!Array.isArray(idea.steps) || idea.steps.length === 0) continue;
        const currentSpecFiles: string[] = idea.specFiles ?? [];
        const crossFolderFiles = resolveCrossFolderDeps(idea.steps, currentSpecFiles, allMdFiles);
        if (crossFolderFiles.length > 0) {
          idea.specFiles = [...currentSpecFiles, ...crossFolderFiles];
          console.log(`[generateFlowIdeas] Augmented idea "${idea.title}" with ${crossFolderFiles.length} cross-folder spec(s): ${crossFolderFiles.join(", ")}`);
        }
      }
    } catch (e) {
      // Non-fatal — ideas still work, flow generator will attempt resolution at generation time
      console.warn(`[generateFlowIdeas] Cross-folder spec resolution failed (non-fatal):`, e);
    }
  }

  // ── Trace: result & save ──
  const crossFolderAugmented = ideas.filter((i: { specFiles?: string[] }) =>
    Array.isArray(i.specFiles) && i.specFiles.length > 0
  ).length;
  trace.setResult({
    ideasGenerated: ideas.length,
    parseError: false,
    crossFolderAugmented,
  });
  const traceId = await trace.save();

  return ok({ ideas, usage, traceId });
}

app.http("generateFlowIdeas", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-flow-ideas",
  handler: withAuth(generateFlowIdeasHandler),
});
