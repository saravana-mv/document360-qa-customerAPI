import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { callAI, streamAI, AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { withAuth, getProjectId, getUserInfo, parseClientPrincipal } from "../lib/auth";
import { extractVersionFolder } from "../lib/apiRules";
import { extractCommonRequiredFields, analyzeCrossStepDependencies, injectCrossStepCaptures, injectSpecRequiredFields, injectEndpointRefs } from "../lib/specRequiredFields";
import { readDistilledContent } from "../lib/specDistillCache";
import { loadAiContext } from "../lib/aiContext";
import { getIdeasContainer } from "../lib/cosmosClient";
import { filterRelevantSpecs } from "../lib/specFileSelection";

/** Strip markdown fences AND any preamble text before the XML declaration. */
function cleanXmlResponse(raw: string): string {
  let xml = raw
    .replace(/^```(?:xml)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  // Strip any commentary/preamble before the XML declaration
  const xmlStart = xml.indexOf("<?xml");
  if (xmlStart > 0) xml = xml.slice(xmlStart);
  return xml;
}

/**
 * Post-process generated XML: inject missing common required fields into
 * POST/PUT step bodies.  The AI often omits fields like project_version_id
 * for prerequisite steps that lack a spec file.  This function ensures all
 * POST/PUT bodies include the common required fields.
 *
 * @param xml        The generated flow XML
 * @param fields     Common required field names (e.g. ["project_version_id"])
 * @param projVarMap Map of field name → project variable token (e.g. "project_version_id" → "{{proj.projectVersionId}}")
 */
function injectMissingRequiredFields(
  xml: string,
  fields: string[],
  projVarMap: Record<string, string>,
): string {
  if (fields.length === 0) return xml;

  // Match each <step> that contains a POST or PUT method and has a <body> CDATA
  const stepRe = /<step\b[^>]*>[\s\S]*?<\/step>/g;

  return xml.replace(stepRe, (stepXml) => {
    // Only process POST and PUT steps
    const methodMatch = stepXml.match(/<method>(POST|PUT|PATCH)<\/method>/i);
    if (!methodMatch) return stepXml;

    // Find the CDATA body
    const cdataRe = /(<body><!\[CDATA\[)([\s\S]*?)(\]\]><\/body>)/;
    const cdataMatch = stepXml.match(cdataRe);
    if (!cdataMatch) return stepXml;

    const bodyText = cdataMatch[2];
    if (!bodyText.trim().startsWith("{")) return stepXml; // Not JSON

    // Use string-based check (not JSON.parse) because body contains
    // interpolation tokens like {{timestamp}} which aren't valid JSON
    const missingFields: string[] = [];
    for (const field of fields) {
      // Only inject fields that have a real project variable mapping
      if (!projVarMap[field]) continue;
      // Check if the field name appears as a JSON key in the body
      if (!bodyText.includes(`"${field}"`)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length === 0) return stepXml;

    // Insert missing fields before the last closing brace
    const additions = missingFields
      .map(f => `  "${f}": "${projVarMap[f] ?? `{{proj.${f}}}`}"`)
      .join(",\n");

    // Find the last } in the body and insert before it
    const lastBrace = bodyText.lastIndexOf("}");
    if (lastBrace < 0) return stepXml;

    // Check if there are existing fields (need a comma)
    const beforeBrace = bodyText.slice(0, lastBrace).trimEnd();
    const needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith("{") && !beforeBrace.endsWith(",");
    const separator = needsComma ? ",\n" : "\n";

    const newBody = bodyText.slice(0, lastBrace).trimEnd() +
      separator + additions + "\n" +
      bodyText.slice(lastBrace).trimStart().replace(/^}/, "      }");

    return stepXml.replace(cdataRe, `$1${newBody}$3`);
  });
}

/** Build a map from required field names to their best project variable token. */
function buildProjVarMap(
  fields: string[],
  projVars: { name: string; value: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    // Try exact match first (e.g. projVars has "projectVersionId" for field "project_version_id")
    // Convert snake_case to camelCase for matching
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const matchedVar = projVars.find(v =>
      v.name === field || v.name === camel ||
      v.name.toLowerCase() === field.toLowerCase() ||
      v.name.toLowerCase() === camel.toLowerCase()
    );
    if (matchedVar) {
      map[field] = `{{proj.${matchedVar.name}}}`;
    }
    // No fallback — if no project variable matches, don't inject as proj var.
    // Cross-step fields (e.g. version_number) will be handled by injectCrossStepCaptures instead.
  }
  return map;
}

function scopedPath(projectId: string, name: string): string {
  if (!projectId || projectId === "unknown") return name;
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FLOW_SYSTEM_PROMPT = `You are an expert at creating API test flow definitions for the FlowForge API test runner.

You generate structured XML flow files that describe a sequence of API test steps. Each flow tests a specific user journey or lifecycle, and MUST validate against the Flow Definition Schema (flow.xsd) used by the runtime interpreter. If your output does not match the schema EXACTLY, the flow will be rejected as invalid and unusable.

## Flow XML Schema (flow.xsd v1)

### Root

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0"
      xmlns="https://flowforge.io/qa/flow/v1">
  <name>Human readable flow name</name>        <!-- required, element -->
  <entity>ResourceName</entity>                 <!-- required, element -->
  <description>What this flow covers</description>  <!-- required -->
  <stopOnFailure>true</stopOnFailure>           <!-- optional; default true -->
  <steps>                                        <!-- required wrapper -->
    <step number="1">...</step>
    <step number="2">...</step>
  </steps>
</flow>
\`\`\`

**Notes**
- \`name\`, \`entity\`, \`description\`, \`stopOnFailure\` are child **elements**, NOT attributes on \`<flow>\`.
- Steps live inside a single \`<steps>\` wrapper.
- \`<step>\` uses a \`number\` attribute (1-based, sequential integers).

### Step

The child elements of \`<step>\` must appear in this order:

1. \`<name>\` — step title shown in logs (required)
2. \`<endpointRef>\` — relative path to the endpoint spec file (REQUIRED when the step uses a spec-provided endpoint — copy the file path from the \`## filename.md\` header in the spec context). Omit ONLY for setup/teardown steps where no spec file exists.
3. \`<method>\` — one of \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\` (required). Use the method specified in the API spec.
4. \`<path>\` — URL template with \`{placeholder}\` tokens (required)
5. \`<pathParams>\` — bindings for \`{placeholders}\` in the path (required if path has placeholders)
6. \`<queryParams>\` — query-string bindings (optional)
7. \`<body>\` — JSON request body wrapped in CDATA (optional; omit for GET/DELETE with no body)
8. \`<captures>\` — values to extract for later steps (optional)
9. \`<assertions>\` — at least one assertion required
10. \`<flags>\` — optional behavioural flags (\`teardown\`, \`optional\`, \`noAuth\`)
11. \`<notes>\` — free-text QA context (optional)

### Params (path & query)

\`\`\`xml
<pathParams>
  <param name="myParam">{{proj.myVariable}}</param>
  <param name="resource_id">{{state.createdResourceId}}</param>
</pathParams>
<queryParams>
  <param name="some_param">{{proj.someVariable}}</param>
</queryParams>
\`\`\`

**IMPORTANT**: Use the exact project variable names as listed in the "Available Project Variables" section below. Do NOT rename, convert case, or add underscores.

### Body

Wrap JSON in CDATA. Interpolation tokens (\`{{state.x}}\`, \`{{ctx.y}}\`, \`{{timestamp}}\`) are supported.
**CRITICAL**: The JSON body MUST include ALL fields marked as \`required\` in the API spec's request schema. Read the spec carefully for required arrays and "(required)" annotations.
**CRITICAL**: Use the EXACT field names from the spec schema — do NOT substitute similar-sounding names. If the spec says \`title\`, write \`"title"\`, NOT \`"name"\`. If the spec says \`name\`, write \`"name"\`, NOT \`"title"\`. Copy field names character-for-character from the schema properties list.

\`\`\`xml
<body><![CDATA[
{
  "required_field": "[TEST] Example - {{timestamp}}",
  "parent_id": "{{state.createdParentId}}"
}
]]></body>
\`\`\`

### Captures

\`\`\`xml
<captures>
  <capture variable="state.createdResourceId" source="response.data.id"/>
  <capture variable="state.createdName"       source="response.data.name"/>
  <!-- From the request you sent (useful for path params): -->
  <capture variable="state.deletedVersionNumber"
           source="pathParam.version_number" from="request"/>
</captures>
\`\`\`

Attributes: \`variable\` (required), \`source\` (required), \`from\` (optional: \`response\` | \`request\` | \`computed\`, default \`response\`).

### Assertions

\`\`\`xml
<assertions>
  <assertion type="status"         code="200"/>                            <!-- use 'code', not 'value' -->
  <assertion type="field-exists"   field="data.id"/>
  <assertion type="field-equals"   field="data.status" value="{{state.expectedStatus}}"/>
  <assertion type="array-not-empty" field="data.items"/>
</assertions>
\`\`\`

**The element is \`<assertion>\` (singular), NOT \`<assert>\`.**
Supported types (exact strings): \`status\`, \`field-equals\`, \`field-exists\`, \`array-not-empty\`.

### Flags (teardown / optional / noAuth)

\`\`\`xml
<flags teardown="true"/>  <!-- this step always runs, even after earlier failures -->
<flags optional="true"/>  <!-- graceful skip if precondition can't be met -->
<flags noAuth="true"/>    <!-- omit the Authorization header for this step (use for 401 tests) -->
\`\`\`

**Teardown is set via \`<flags teardown="true"/>\` — NOT as an attribute on \`<step>\`.**
**For steps that test unauthenticated access (expecting 401), set \`<flags noAuth="true"/>\` to omit the Authorization header.**

### Interpolation tokens — ALWAYS use \`{{…}}\` syntax

**CRITICAL**: ALL variable references MUST use \`{{…}}\` mustache braces — in pathParams, queryParams, body, assertions, everywhere. Never use bare \`proj.xxx\` or \`state.xxx\` without braces.

- \`{{proj.variableName}}\` — project-level variable defined in Settings → Variables. Use the EXACT names from the "Available Project Variables" section.
- \`{{ctx.apiVersion}}\`, \`{{ctx.baseUrl}}\` — runtime context (API version, base URL)
- \`{{state.variableName}}\` — value captured from a previous step
- \`{{timestamp}}\` — Unix ms timestamp at execution time
- \`{{!state.boolVar}}\` — logical NOT of a boolean state variable

## Golden example — copy this structure exactly

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Resource CRUD Lifecycle</name>
  <entity>Resources</entity>
  <description>Creates a resource, verifies it, updates it, then cleans up.</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Resource</name>
      <endpointRef>resources/create-resource.md</endpointRef>
      <method>POST</method>
      <path>/v1/resources</path>
      <body><![CDATA[
{
  "name": "[TEST] Lifecycle - {{timestamp}}"
}
      ]]></body>
      <captures>
        <capture variable="state.createdId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status"       code="201"/>
        <assertion type="field-exists" field="data.id"/>
      </assertions>
    </step>

    <step number="2">
      <name>Delete Resource (cleanup)</name>
      <method>DELETE</method>
      <path>/v1/resources/{resource_id}</path>
      <pathParams>
        <param name="resource_id">{{state.createdId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
      <notes>teardown: true — runs even if earlier steps failed.</notes>
    </step>
  </steps>
</flow>
\`\`\`

## Hard rules (read before writing anything)

1. **STRICT SCOPE — NO PRIOR KNOWLEDGE**: Only use API endpoints, methods, and paths explicitly described in the provided spec files. Do NOT use your training data or prior knowledge about this API — treat the specs as if you are seeing this API for the first time. For prerequisite setup/teardown steps not in the specs, construct the path by following the EXACT same URL pattern and version prefix as the provided specs.
2. **Entity dependencies — ALWAYS create prerequisites**: If a request body contains a foreign-key field referencing another resource (e.g., \`category_id\`, \`parent_id\`, \`folder_id\`, \`group_id\`), you MUST create that resource as a setup step and delete it as a teardown step — even if the field is marked optional/nullable in the schema. In practice, omitting a parent entity often causes runtime failures or places the resource in an unusable state. When in doubt, create the dependency. Check field descriptions for hints like "retrieve from GET /…" which confirm a dependency. Delete child resources before parents in teardown.
3. **Request body MUST include ALL required fields with EXACT names**: When the spec file documents a request body schema, you MUST include EVERY field listed as \`required\`, using the EXACT field name from the schema. Copy field names character-for-character — do NOT substitute similar names (e.g., do NOT use \`name\` when the spec says \`title\`, or \`description\` when the spec says \`content\`). Parse the schema carefully — look for \`required: [field1, field2, ...]\` arrays, the **REQUIRED FIELDS** line, "Required" labels, or "(required)" annotations next to properties. For each required field, use: a project variable (\`{{proj.X}}\`) if one matches, a state variable (\`{{state.X}}\`) captured from a prior step, or a sensible test value. Omitting a required field will cause the API call to fail at runtime — this is a critical error. **For prerequisite/dependency steps** (e.g., creating a parent entity) where no spec is provided: check the "Common Required Fields" section at the end of the spec context and include those fields in the request body too.
4. **Teardown is MANDATORY for every flow**: Every flow — regardless of complexity — MUST end with teardown steps that delete ALL resources created during the flow. The testing environment must be left exactly as it was before the flow ran. Delete child resources before parent. Mark every teardown step with \`<flags teardown="true"/>\`.
5. **State passing**: Use \`<capture variable="state.X" source="response.data.Y"/>\` then reference \`{{state.X}}\` in later steps.
6. **Unique names**: For resource names, use \`[TEST] Something - {{timestamp}}\`.
7. **Assertions**: Every step needs at least one \`<assertion type="status" code="…"/>\`. Write operations should also assert \`field-exists\` on the created resource id. **Read the spec file carefully** — use the exact status code and response structure documented there. Do NOT guess.
8. **HTTP status codes**: Use these defaults unless the spec file explicitly states otherwise:
   - GET → \`200\`
   - POST (create) → \`201\`
   - PUT/PATCH (update) → \`200\`
   - DELETE → \`204\` (No Content) — the response body is typically EMPTY. Do not add body-level assertions on DELETE steps unless the spec explicitly documents a response body.
9. **Spec-driven assertions**: When spec files are provided, read the documented response schema and status codes carefully. The spec is the source of truth.
10. **Schema exactness**: Elements must appear in the order listed above. Use \`<assertion>\` not \`<assert>\`. Use \`code\` not \`value\` for status. Use \`field-exists\` / \`field-equals\` / \`array-not-empty\` — no other assertion types exist.
11. **Request body fields MUST match the endpoint's schema**: Only include fields that are defined in the endpoint's request body schema. Do NOT add extra fields like \`project_version_id\` unless the spec explicitly lists them in the request body for that specific endpoint. Many APIs use \`additionalProperties: false\` and will reject or error on unknown fields. Also never send fields marked \`readOnly: true\` in request bodies — those are response-only fields.
12. **Cross-step data flow — CAPTURE fields needed by downstream steps (CRITICAL)**: Before writing any step, scan ALL later steps' request body schemas for required fields. If a later step requires a field (e.g., \`version_number\`, \`slug\`, \`status\`) that appears in an earlier step's RESPONSE schema, you MUST:
   - Add a \`<capture variable="state.fieldName" source="response.data.fieldName"/>\` to the earlier step
   - Use \`{{state.fieldName}}\` in the later step's request body
   This is especially critical for action endpoints (publish, fork, approve) that require fields from the entity creation response. Example: if POST /articles returns \`version_number\` in the response and POST /articles/{id}/publish requires \`version_number\` in its body, capture it from the create step and use \`{{state.versionNumber}}\` in the publish step.

## Output format — MANDATORY

Your response MUST begin with \`<?xml version="1.0" encoding="UTF-8"?>\` as the very first characters.
Do NOT include ANY text before the XML declaration — no analysis, no commentary, no explanation, no preamble.
Do NOT wrap the XML in markdown code fences.
If spec files are missing or incomplete, still output valid XML using reasonable defaults — NEVER explain what you're doing instead.
Your entire response is the XML document and nothing else.`;

// Cap spec context to ~50k characters (~12k tokens) to keep flow generation
// cost-effective. Each flow only needs the endpoints it references, not every
// spec in the project.
const MAX_SPEC_CONTEXT_CHARS = 50_000;
const MAX_SPEC_FILES = 15;

async function buildSpecContext(specFiles: string[], projectId: string): Promise<{ context: string; failedFiles: string[] }> {
  if (!specFiles || specFiles.length === 0) {
    // Load a default set of available spec files
    try {
      const prefix = projectId !== "unknown" ? `${projectId}/` : undefined;
      const blobs = await listBlobs(prefix);
      const mdFiles = blobs.filter((b) => b.name.endsWith(".md")).slice(0, MAX_SPEC_FILES);
      if (mdFiles.length === 0) return { context: "", failedFiles: [] };
      const contents = await Promise.all(mdFiles.map((b) => downloadBlob(b.name)));
      const projPrefix = projectId !== "unknown" ? projectId + "/" : "";
      return {
        context: truncateContext(
          contents.map((c, i) => {
            const displayName = projPrefix && mdFiles[i].name.startsWith(projPrefix)
              ? mdFiles[i].name.slice(projPrefix.length) : mdFiles[i].name;
            return `## ${displayName}\n\n${c}`;
          }),
        ),
        failedFiles: [],
      };
    } catch {
      return { context: "", failedFiles: [] };
    }
  }

  // Only process up to MAX_SPEC_FILES — read pre-distilled versions when available
  const capped = specFiles.slice(0, MAX_SPEC_FILES);
  const failedFiles: string[] = [];
  const contents = await Promise.all(
    capped.map(async (name) => {
      const blobPath = scopedPath(projectId, name);
      try {
        const content = await readDistilledContent(blobPath);
        return `## ${name}\n\n${content}`;
      } catch (err) {
        console.error(`[generateFlow] Failed to read spec: ${blobPath}`, err);
        failedFiles.push(name);
        return "";
      }
    })
  );
  const validContents = contents.filter(c => c.length > 0);
  return { context: truncateContext(validContents), failedFiles };
}

function truncateContext(sections: string[]): string {
  const result: string[] = [];
  let totalChars = 0;
  for (const section of sections) {
    if (totalChars + section.length > MAX_SPEC_CONTEXT_CHARS) {
      // Add a truncation notice
      result.push("(Remaining spec files omitted to stay within token budget)");
      break;
    }
    result.push(section);
    totalChars += section.length;
  }
  return result.join("\n\n---\n\n");
}


/** Cosmos ID encoding for ideas — matches ideas.ts convention */
function ideasDocId(folderPath: string): string {
  return "ideas:" + folderPath.replace(/\//g, "|");
}

/**
 * Server-side spec file resolution: look up the idea from Cosmos DB,
 * list available spec blobs for the version folder, and run
 * filterRelevantSpecs to select the right files.
 *
 * This eliminates the need for the client to send 50+ file paths and
 * avoids the class of bugs where the client sends wrong/stale paths.
 */
async function resolveSpecFilesFromIdea(
  projectId: string,
  ideaId: string,
  versionFolder: string,
  folderPath?: string,
): Promise<string[]> {
  // 1. Find the idea in Cosmos DB
  const container = await getIdeasContainer();
  let idea: { steps: string[]; entities: string[]; description: string } | null = null;

  if (folderPath) {
    // Direct lookup — we know the folder path
    try {
      const { resource } = await container.item(ideasDocId(folderPath), projectId).read<{
        ideas: { id: string; steps: string[]; entities: string[]; description: string }[];
      }>();
      if (resource?.ideas) {
        idea = resource.ideas.find(i => i.id === ideaId) ?? null;
      }
    } catch { /* doc may not exist */ }
  }

  if (!idea) {
    // Broader search: query all idea docs in this project for the ideaId
    const query = {
      query: "SELECT * FROM c WHERE c.projectId = @pid AND c.type = 'ideas'",
      parameters: [{ name: "@pid", value: projectId }],
    };
    const { resources } = await container.items.query<{
      ideas: { id: string; steps: string[]; entities: string[]; description: string }[];
    }>(query).fetchAll();
    for (const doc of resources) {
      const found = doc.ideas?.find(i => i.id === ideaId);
      if (found) { idea = found; break; }
    }
  }

  if (!idea) {
    throw new Error(`Idea ${ideaId} not found in project ${projectId}`);
  }

  // 2. List all .md spec files under the version folder
  const prefix = projectId !== "unknown"
    ? `${projectId}/${versionFolder}/`
    : `${versionFolder}/`;
  const blobs = await listBlobs(prefix);
  const allMdFiles = blobs
    .filter(b => b.name.endsWith(".md"))
    .map(b => {
      // Strip projectId prefix so paths match what filterRelevantSpecs expects
      // e.g. "proj123/V3/articles/create.md" → "V3/articles/create.md"
      return projectId !== "unknown" && b.name.startsWith(projectId + "/")
        ? b.name.slice(projectId.length + 1)
        : b.name;
    });

  console.log(`[generateFlow] Blob listing for ${prefix}: ${allMdFiles.length} .md files`);

  // 3. Run server-side spec selection
  const selected = filterRelevantSpecs(idea, allMdFiles);
  console.log(`[generateFlow] filterRelevantSpecs selected ${selected.length} from ${allMdFiles.length}:`, selected);

  return selected;
}

/** POST /api/generate-flow
 *  Body: { prompt: string; specFiles?: string[]; ideaId?: string; versionFolder?: string; stream?: boolean }
 *  Response: SSE stream of text chunks, or JSON { xml: string }
 */
async function generateFlow(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  let body: {
    prompt: string;
    specFiles?: string[];
    stream?: boolean;
    model?: string;
    /** When provided, server resolves spec files from the idea's steps + blob listing */
    ideaId?: string;
    /** Version folder (e.g. "V3") — required when using ideaId for server-side spec selection */
    versionFolder?: string;
    /** Folder path where the idea is stored (e.g. "V3/articles") */
    folderPath?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  if (!body.prompt) {
    return {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "prompt is required" }),
    };
  }

  let projectId: string;
  try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const displayName = principal?.userDetails ?? userName;
  // ── Resolve spec files ──
  // Server-side selection: look up idea from Cosmos, list blobs, run filterRelevantSpecs
  // Falls back to client-provided specFiles for backward compatibility
  let specFiles: string[];
  if (body.ideaId && body.versionFolder) {
    try {
      specFiles = await resolveSpecFilesFromIdea(
        projectId, body.ideaId, body.versionFolder, body.folderPath,
      );
      console.log(`[generateFlow] Server-side spec selection: ${specFiles.length} files from idea ${body.ideaId}`, specFiles);
    } catch (e) {
      console.warn(`[generateFlow] Server-side spec resolution failed, falling back to client specFiles:`, e);
      specFiles = (body.specFiles ?? []).filter(
        (f: string) => !f.includes("/_system/") && !f.includes("/_distilled/")
      );
    }
  } else {
    // Legacy path: client sends specFiles directly
    specFiles = (body.specFiles ?? []).filter(
      (f: string) => !f.includes("/_system/") && !f.includes("/_distilled/")
    );
  }
  const { context: specContext, failedFiles } = await buildSpecContext(specFiles, projectId);

  // Fail early if ALL requested spec files couldn't be read
  if (specFiles.length > 0 && failedFiles.length === specFiles.length) {
    return {
      status: 422,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Could not read any of the ${specFiles.length} spec files. The AI would generate without spec context, producing incorrect request bodies. Check that the project has spec files uploaded.`,
        failedFiles,
      }),
    };
  }

  const specCount = specFiles.length;
  const scopeNote = specCount === 1
    ? `\n\nIMPORTANT: You are working with a SINGLE endpoint specification. The primary test steps of the flow MUST focus on this endpoint. However, you MUST still add prerequisite setup and teardown steps as required by the hard rules and project-specific API rules — these are ALWAYS allowed regardless of scope.`
    : specCount > 1
      ? `\n\nIMPORTANT: You are working with ${specCount} endpoint specifications. The primary test steps MUST focus on endpoints described in the specs above. However, you MUST still add prerequisite setup and teardown steps as required by the hard rules and project-specific API rules — these are ALWAYS allowed regardless of scope.`
      : "";

  // Load AI context (rules, variables, dependencies) via shared module
  const versionFolder = body.versionFolder || extractVersionFolder(body.specFiles ?? []);
  const ctx = await loadAiContext({
    projectId, versionFolder,
    loadSpec: false, // spec loaded separately via buildSpecContext above
  });
  const projVars = ctx.projectVariables;
  console.log(`[generateFlow] specContext: ${specContext.length} chars (pre-distilled)`);

  // Detect API version — prefer folder path (unambiguous), fall back to spec content
  let canonicalVersion: string | null = null;
  if (versionFolder) {
    const fm = versionFolder.match(/^v(\d+)$/i);
    if (fm) canonicalVersion = `v${fm[1]}`;
  }
  if (!canonicalVersion) {
    const versionSet = new Set<string>();
    const versionRe = /\/v(\d+)\//g;
    let vm: RegExpExecArray | null;
    while ((vm = versionRe.exec(specContext)) !== null) {
      versionSet.add(`v${vm[1]}`);
    }
    if (versionSet.size === 1) canonicalVersion = [...versionSet][0];
  }
  const versionDirective = canonicalVersion
    ? `\n\n**CRITICAL — API VERSION**: This API uses ${canonicalVersion} endpoints EXCLUSIVELY. ALL paths in your XML — including prerequisite/setup/teardown steps — MUST use /${canonicalVersion}/ prefix. Do NOT use any other version.`
    : "";

  // Analyze cross-step dependencies between endpoints in the spec context
  const crossStepDeps = specContext ? analyzeCrossStepDependencies(specContext, projVars) : "";
  if (crossStepDeps) {
    console.log(`[generateFlow] Cross-step dependencies detected:\n${crossStepDeps}`);
  }

  const userMessage = specContext
    ? `${body.prompt}${scopeNote}${versionDirective}\n\n# Relevant API Specification\n\n${specContext}${crossStepDeps}`
    : body.prompt;

  const shouldStream = body.stream !== false; // default to streaming
  const creditInfo = { projectId, userId: oid, displayName };

  // Build system prompt once (used by both streaming and non-streaming paths)
  let flowSystemPrompt = FLOW_SYSTEM_PROMPT;

  // Extract common required fields for both prompt injection AND post-processing
  const commonFields = specContext ? extractCommonRequiredFields(specContext) : [];
  const projVarMap = buildProjVarMap(commonFields, projVars);
  // Diagnostic: log required fields patterns found in specContext
  const reqFieldLines = specContext.split("\n").filter(l => l.includes("REQUIRED FIELDS") || l.includes("**YES**"));
  console.log(`[generateFlow] specContext length=${specContext.length}, specFiles=${JSON.stringify(body.specFiles)}`);
  console.log(`[generateFlow] REQUIRED FIELDS lines found: ${reqFieldLines.length}`, reqFieldLines.slice(0, 10));
  console.log(`[generateFlow] commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);

  if (commonFields.length > 0) {
    const fieldList = commonFields.map(f => `\`${f}\``).join(", ");
    flowSystemPrompt += `\n\n**COMMON REQUIRED FIELDS**: These fields appear as required across multiple endpoints in this API: ${fieldList}. When creating ANY resource (including prerequisite/setup steps without a spec file), include these fields using project variables (\`{{proj.X}}\`) or state variables (\`{{state.X}}\`).`;
  }

  // Inject dependency info from shared context
  if (ctx.dependencyInfo) {
    flowSystemPrompt += `\n\n${ctx.dependencyInfo}`;
  }

  const systemPrompt = ctx.enrichSystemPrompt(flowSystemPrompt);

  if (shouldStream) {
    // SSE streaming response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const { stream, finalize } = await streamAI({
            source: "generateFlow",
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
            maxTokens: 8192,
            requestedModel: body.model,
            credits: creditInfo,
          });

          // Collect full text for post-processing while also streaming chunks
          let fullText = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              const sseData = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(sseData));
            }
          }

          // Post-process the complete XML (version fix + required fields injection)
          let xml = cleanXmlResponse(fullText);
          if (canonicalVersion) {
            xml = xml.replace(/(<path>(?:GET|POST|PUT|PATCH|DELETE)\s+)\/v\d+\//gi, `$1/${canonicalVersion}/`);
            xml = xml.replace(/(<path>)\/v\d+\//gi, `$1/${canonicalVersion}/`);
          }
          console.log(`[generateFlow] stream post-process: commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);
          // Cross-step captures FIRST (injects state vars for cross-step deps like version_number)
          xml = injectCrossStepCaptures(xml, specContext, projVars);
          // Missing required fields SECOND (fills remaining gaps with proj vars)
          xml = injectMissingRequiredFields(xml, commonFields, projVarMap);
          // Spec-aware required fields THIRD (catches ALL remaining required fields like title, name)
          try { xml = injectSpecRequiredFields(xml, specContext, projVars); } catch (e) { console.warn("[generateFlow] injectSpecRequiredFields failed:", e); }
          // Endpoint refs FOURTH (links each step to its spec file for traceability)
          try { xml = injectEndpointRefs(xml, specContext); } catch (e) { console.warn("[generateFlow] injectEndpointRefs failed:", e); }

          // Send the corrected XML so the frontend can replace the raw streamed text
          const correctedData = `data: ${JSON.stringify({ corrected: xml })}\n\n`;
          controller.enqueue(encoder.encode(correctedData));

          // Finalize: compute cost + record usage
          const finalMsg = await stream.finalMessage();
          const usage = await finalize(finalMsg);

          const usageData = `data: ${JSON.stringify({ usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, costUsd: usage.costUsd } })}\n\n`;
          controller.enqueue(encoder.encode(usageData));

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          if (e instanceof CreditDeniedError) {
            const sseData = `data: ${JSON.stringify({ error: e.creditDenied.reason, creditDenied: true })}\n\n`;
            controller.enqueue(encoder.encode(sseData));
            controller.close();
            return;
          }
          const msg = e instanceof Error ? e.message : String(e);
          const sseData = `data: ${JSON.stringify({ error: msg })}\n\n`;
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        }
      },
    });

    return {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: readable,
    };
  } else {
    // Non-streaming: collect full response
    try {
      const result = await callAI({
        source: "generateFlow",
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 8192,
        requestedModel: body.model,
        credits: creditInfo,
      });

      let xml = cleanXmlResponse(result.text);

      // Post-process: fix wrong API version prefixes in <path> elements
      if (canonicalVersion) {
        xml = xml.replace(/(<path>(?:GET|POST|PUT|PATCH|DELETE)\s+)\/v\d+\//gi, `$1/${canonicalVersion}/`);
        xml = xml.replace(/(<path>)\/v\d+\//gi, `$1/${canonicalVersion}/`);
      }

      // Post-process: inject missing common required fields into POST/PUT bodies
      console.log(`[generateFlow] post-process: commonFields=${JSON.stringify(commonFields)}, projVarMap=${JSON.stringify(projVarMap)}`);
      // Cross-step captures FIRST (injects state vars for cross-step deps like version_number)
      xml = injectCrossStepCaptures(xml, specContext, projVars);
      // Missing required fields SECOND (fills remaining gaps with proj vars)
      xml = injectMissingRequiredFields(xml, commonFields, projVarMap);
      // Spec-aware required fields THIRD (catches ALL remaining required fields like title, name)
      xml = injectSpecRequiredFields(xml, specContext, projVars);
      // Endpoint refs FOURTH (links each step to its spec file for traceability)
      xml = injectEndpointRefs(xml, specContext);

      return {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          xml,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
            costUsd: result.usage.costUsd,
          },
          ...(failedFiles.length > 0 ? { warning: `${failedFiles.length} of ${specFiles.length} spec files could not be read. Flow may be missing required fields.`, failedFiles } : {}),
          _debug: { projectId, commonFields, projVarMap, specSource: body.ideaId ? "server" : "client", specFilesReceived: specFiles.length, specFilesRequested: specFiles, specContextLength: specContext.length },
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
      console.error("[generateFlow] Error:", msg, e instanceof Error ? e.stack : "");
      return {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: msg }),
      };
    }
  }
}

app.http("generateFlow", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "generate-flow",
  handler: withAuth(generateFlow),
});
