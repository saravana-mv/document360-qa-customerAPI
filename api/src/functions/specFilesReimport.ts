import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob, listBlobs, deleteBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { getFlowsContainer, getIdeasContainer, getFlowChatSessionsContainer } from "../lib/cosmosClient";
import { batchUpload, batchDistillAll } from "../lib/specBatchHelpers";
import { rebuildDigest } from "../lib/specDigest";
import { rebuildDependencies } from "../lib/specDependencies";
import { splitSwagger } from "../lib/swaggerSplitter";
import { browserFetch } from "../lib/browserFetch";

function safeProjectId(req: HttpRequest): string {
  try { return getProjectId(req); } catch { return "unknown"; }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

const ACTIVE_TESTS_ID = "__active_tests__";

/**
 * POST /api/spec-files/reimport
 *
 * Reimport an OpenAPI spec on an existing version folder.
 * Wipes spec blobs, ideas, flows, active tests (for folder), and chat sessions.
 * Preserves _skills.md and _rules.json.
 */
async function reimportHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as {
      folderPath: string;
      specContent?: string;
      specUrl?: string;
    };

    if (!body.folderPath) return err(400, "folderPath is required");
    if (!body.specContent && !body.specUrl) return err(400, "Either specContent or specUrl is required");

    const projectId = safeProjectId(req);
    const folderPath = body.folderPath;
    const blobPrefix = projectId !== "unknown" ? `${projectId}/${folderPath}/` : `${folderPath}/`;

    // ── 1. Parse & validate spec ──────────────────────────────────────────────
    let specContent: string;

    if (body.specUrl) {
      const result = await browserFetch(body.specUrl);
      if (!result.response.ok) {
        return err(502, `Failed to fetch spec from URL: ${result.response.status} ${result.response.statusText}`);
      }
      specContent = await result.response.text();
    } else {
      specContent = body.specContent!;
    }

    let specJson: Record<string, unknown>;
    try {
      specJson = JSON.parse(specContent) as Record<string, unknown>;
    } catch {
      return err(400, "Invalid JSON in spec content");
    }

    if (!specJson["openapi"] && !specJson["swagger"]) {
      return err(400, "Not a valid OpenAPI 3.x or Swagger 2.x spec (missing openapi/swagger field)");
    }

    // Validate it splits into at least one endpoint
    const splitResult = splitSwagger(specJson);
    if (splitResult.files.length === 0) {
      return err(400, "No endpoints found in the spec");
    }

    // ── 2. Preserve _skills.md and _rules.json ───────────────────────────────
    const skillsPath = `${blobPrefix}_system/_skills.md`;
    const rulesPath = `${blobPrefix}_system/_rules.json`;

    let preservedSkills: string | null = null;
    let preservedRules: string | null = null;

    try { preservedSkills = await downloadBlob(skillsPath); } catch { /* not found */ }
    try { preservedRules = await downloadBlob(rulesPath); } catch { /* not found */ }

    // ── 3. Wipe spec blobs ───────────────────────────────────────────────────
    const blobs = await listBlobs(blobPrefix);
    for (const blob of blobs) {
      try { await deleteBlob(blob.name); } catch { /* skip */ }
    }

    // ── 4. Wipe Cosmos data (parallel) ───────────────────────────────────────
    const wipeResults: Record<string, number> = {};

    await Promise.all([
      // Ideas: filter by folderPath prefix in doc IDs
      (async () => {
        try {
          const container = await getIdeasContainer();
          const { resources: docs } = await container.items.query<{ id: string }>({
            query: "SELECT c.id FROM c WHERE c.projectId = @pid",
            parameters: [{ name: "@pid", value: projectId }],
          }).fetchAll();
          let count = 0;
          for (const doc of docs) {
            if (doc.id.startsWith(`ideas:${folderPath}/`) || doc.id === `ideas:${folderPath}`) {
              try { await container.item(doc.id, projectId).delete(); count++; } catch { /* skip */ }
            }
          }
          wipeResults["ideas"] = count;
        } catch { wipeResults["ideas"] = 0; }
      })(),

      // Flows: filter by folderPath prefix in doc IDs
      (async () => {
        try {
          const container = await getFlowsContainer();
          const { resources: docs } = await container.items.query<{ id: string }>({
            query: "SELECT c.id FROM c WHERE c.projectId = @pid AND c.id != @activeId",
            parameters: [
              { name: "@pid", value: projectId },
              { name: "@activeId", value: ACTIVE_TESTS_ID },
            ],
          }).fetchAll();
          let count = 0;
          for (const doc of docs) {
            if (doc.id.startsWith(`flow:${folderPath}/`)) {
              try { await container.item(doc.id, projectId).delete(); count++; } catch { /* skip */ }
            }
          }
          wipeResults["flows"] = count;
        } catch { wipeResults["flows"] = 0; }
      })(),

      // Active tests: filter out flows matching folderPath prefix
      (async () => {
        try {
          const container = await getFlowsContainer();
          const { resource } = await container.item(ACTIVE_TESTS_ID, projectId).read<{
            id: string; projectId: string; flows: string[];
          }>();
          if (resource?.flows) {
            const filtered = resource.flows.filter(f => !f.startsWith(`${folderPath}/`));
            if (filtered.length !== resource.flows.length) {
              await container.items.upsert({ ...resource, flows: filtered, updatedAt: new Date().toISOString() });
              wipeResults["active_tests_removed"] = resource.flows.length - filtered.length;
            }
          }
        } catch { /* no active tests doc */ }
      })(),

      // Flow chat sessions: wipe all for project
      (async () => {
        try {
          const container = await getFlowChatSessionsContainer();
          const { resources: docs } = await container.items.query<{ id: string }>({
            query: "SELECT c.id FROM c WHERE c.projectId = @pid",
            parameters: [{ name: "@pid", value: projectId }],
          }).fetchAll();
          let count = 0;
          for (const doc of docs) {
            try { await container.item(doc.id, projectId).delete(); count++; } catch { /* skip */ }
          }
          wipeResults["chat_sessions"] = count;
        } catch { wipeResults["chat_sessions"] = 0; }
      })(),
    ]);

    // ── 5. Restore preserved files ───────────────────────────────────────────
    if (preservedSkills != null) {
      await uploadBlob(skillsPath, preservedSkills, "text/markdown");
    }
    if (preservedRules != null) {
      await uploadBlob(rulesPath, preservedRules, "application/json");
    }

    // ── 6. Upload new spec + run split pipeline ──────────────────────────────
    const swaggerBlobPath = projectId !== "unknown"
      ? `${projectId}/${folderPath}/_system/_swagger.json`
      : `${folderPath}/_system/_swagger.json`;
    await uploadBlob(swaggerBlobPath, specContent, "application/json");

    // Build upload items from split result
    const uploads: Array<{ blobPath: string; content: string }> = [];
    const createdFiles: string[] = [];

    for (const file of splitResult.files) {
      const localPath = `${folderPath}/${file.folder}/${file.filename}`;
      const blobPath = projectId !== "unknown" ? `${projectId}/${localPath}` : localPath;
      uploads.push({ blobPath, content: file.content });
      createdFiles.push(localPath);
    }

    await batchUpload(uploads, 10);

    // Distillation
    const distillResults = await batchDistillAll(uploads, 10);
    const distilled = distillResults.filter(r => r.status === "distilled").length;
    const unchanged = distillResults.filter(r => r.status === "unchanged").length;
    const distillErrors = distillResults.filter(r => r.status === "error");

    // Rebuild digest
    let digestBuilt = false;
    let digestError: string | undefined;
    try {
      await rebuildDigest(projectId, folderPath);
      digestBuilt = true;
    } catch (e) {
      digestError = e instanceof Error ? e.message : String(e);
      console.warn("[reimport] digest rebuild failed:", e);
    }

    // Rebuild dependencies
    let depsBuilt = false;
    let depsError: string | undefined;
    try {
      await rebuildDependencies(projectId, folderPath, specJson);
      depsBuilt = true;
    } catch (e) {
      depsError = e instanceof Error ? e.message : String(e);
      console.warn("[reimport] dependencies rebuild failed:", e);
    }

    // ── 7. Audit log ─────────────────────────────────────────────────────────
    const user = getUserInfo(req);
    audit(projectId, "spec.reimport", user, folderPath, {
      endpoints: splitResult.stats.endpoints,
      folders: splitResult.stats.folders,
      wiped: wipeResults,
    });

    return ok({
      files: createdFiles,
      stats: {
        endpoints: splitResult.stats.endpoints,
        folders: splitResult.stats.folders,
        skipped: splitResult.stats.skipped,
      },
      suggestedVariables: splitResult.suggestedVariables,
      suggestedConnections: splitResult.suggestedConnections,
      wiped: wipeResults,
      processing: {
        distillation: {
          total: distillResults.length,
          distilled,
          unchanged,
          errors: distillErrors.length,
          errorDetails: distillErrors.map(r => ({ file: r.file, error: r.error ?? "Unknown error" })),
        },
        digest: {
          built: digestBuilt,
          ...(digestError ? { error: digestError } : {}),
        },
        dependencies: {
          built: depsBuilt,
          ...(depsError ? { error: depsError } : {}),
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reimport] error:", e);
    return err(500, msg);
  }
}

app.http("specFilesReimport", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/reimport",
  handler: withAuth(reimportHandler),
});
