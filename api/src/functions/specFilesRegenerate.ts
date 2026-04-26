import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { downloadBlob, listBlobs } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { distillAndStoreWithResult } from "../lib/specDistillCache";
import { rebuildDigest } from "../lib/specDigest";
import { rebuildDependencies } from "../lib/specDependencies";

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

/**
 * POST /api/spec-files/regenerate-system
 *
 * Body: { folderPath: string }
 *
 * Re-generates all system files for a version folder:
 * 1. _distilled/*.md — re-distills each spec file
 * 2. _system/_digest.md — rebuilds the endpoint digest
 * 3. _system/_dependencies.md — rebuilds entity dependencies from _swagger.json
 */
async function regenerateSystemHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as { folderPath: string };
    if (!body.folderPath) return err(400, "folderPath is required");

    const projectId = safeProjectId(req);
    const folderPath = body.folderPath;
    const prefix = projectId !== "unknown" ? `${projectId}/${folderPath}` : folderPath;
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

    // ── 1. Re-distill all spec .md files ──
    const allBlobs = await listBlobs(normalizedPrefix);
    const mdBlobs = allBlobs.filter(b =>
      b.name.endsWith(".md") &&
      !b.name.includes("/_distilled/") &&
      !b.name.includes("/_versions/") &&
      !b.name.includes("/_system/") &&
      !b.name.endsWith("/.keep"),
    );

    const distillResults: Array<{ file: string; status: string; error?: string }> = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < mdBlobs.length; i += BATCH_SIZE) {
      const batch = mdBlobs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (blob) => {
          try {
            const content = await downloadBlob(blob.name);
            const status = await distillAndStoreWithResult(blob.name, content);
            return { file: blob.name, status };
          } catch (e) {
            return { file: blob.name, status: "error", error: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      distillResults.push(...batchResults);
    }

    // ── 2. Rebuild digest ──
    let digestBuilt = false;
    let digestError: string | undefined;
    try {
      await rebuildDigest(projectId, folderPath);
      digestBuilt = true;
    } catch (e) {
      digestError = e instanceof Error ? e.message : String(e);
    }

    // ── 3. Rebuild dependencies from _swagger.json ──
    let depsBuilt = false;
    let depsError: string | undefined;
    const swaggerPath = `${normalizedPrefix}_system/_swagger.json`;
    try {
      const swaggerContent = await downloadBlob(swaggerPath);
      const specJson = JSON.parse(swaggerContent) as Record<string, unknown>;
      await rebuildDependencies(projectId, folderPath, specJson);
      depsBuilt = true;
    } catch (e) {
      depsError = e instanceof Error ? e.message : String(e);
    }

    // Audit log
    const user = getUserInfo(req);
    audit(projectId, "spec.regenerate-system", user, folderPath, {
      specFiles: mdBlobs.length,
      distilled: distillResults.filter(r => r.status === "distilled").length,
      digestBuilt,
      depsBuilt,
    });

    return ok({
      distillation: {
        total: distillResults.length,
        distilled: distillResults.filter(r => r.status === "distilled").length,
        unchanged: distillResults.filter(r => r.status === "unchanged").length,
        errors: distillResults.filter(r => r.status === "error").length,
        errorDetails: distillResults.filter(r => r.status === "error").map(r => ({ file: r.file, error: r.error ?? "Unknown error" })),
      },
      digest: {
        built: digestBuilt,
        ...(digestError ? { error: digestError } : {}),
      },
      dependencies: {
        built: depsBuilt,
        ...(depsError ? { error: depsError } : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[regenerate-system] error:", e);
    return err(500, msg);
  }
}

app.http("specFilesRegenerateSystem", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/regenerate-system",
  handler: withAuth(regenerateSystemHandler),
});
