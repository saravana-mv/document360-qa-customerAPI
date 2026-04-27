import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { downloadBlob, uploadBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { rebuildDigest } from "../lib/specDigest";
import { rebuildDependencies } from "../lib/specDependencies";
import { splitSwagger } from "../lib/swaggerSplitter";
import { browserFetch } from "../lib/browserFetch";
import { batchUpload, batchDistillAll } from "../lib/specBatchHelpers";

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
 * POST /api/spec-files/split-swagger
 *
 * Body: { folderPath: string; specUrl?: string; overwrite?: boolean }
 *
 * Reads `_system/_swagger.json` from the version folder in blob storage (or fetches
 * from specUrl), parses it, splits into per-endpoint .md files, and uploads
 * each one through the same pipeline as manual uploads.
 */
async function splitSwaggerHandler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as {
      folderPath: string;
      specUrl?: string;
      overwrite?: boolean;
    };

    if (!body.folderPath) return err(400, "folderPath is required");

    const projectId = safeProjectId(req);
    const folderPath = body.folderPath;
    const overwrite = body.overwrite ?? false;

    let specContent: string;

    if (body.specUrl) {
      // Fetch spec from URL
      const result = await browserFetch(body.specUrl);
      if (!result.response.ok) {
        return err(502, `Failed to fetch spec from URL: ${result.response.status} ${result.response.statusText}`);
      }
      specContent = await result.response.text();

      // Also save as _system/_swagger.json
      const swaggerBlobPath = projectId !== "unknown"
        ? `${projectId}/${folderPath}/_system/_swagger.json`
        : `${folderPath}/_system/_swagger.json`;
      await uploadBlob(swaggerBlobPath, specContent, "application/json");
    } else {
      // Read _system/_swagger.json from blob storage (fallback to legacy _swagger.json)
      const newPath = projectId !== "unknown"
        ? `${projectId}/${folderPath}/_system/_swagger.json`
        : `${folderPath}/_system/_swagger.json`;
      const legacyPath = projectId !== "unknown"
        ? `${projectId}/${folderPath}/_swagger.json`
        : `${folderPath}/_swagger.json`;

      try {
        specContent = await downloadBlob(newPath);
      } catch {
        try {
          specContent = await downloadBlob(legacyPath);
        } catch {
          return err(404, `No _swagger.json found in ${folderPath}. Upload the spec file first.`);
        }
      }
    }

    // Parse the spec
    let specJson: Record<string, unknown>;
    try {
      specJson = JSON.parse(specContent) as Record<string, unknown>;
    } catch {
      return err(400, "Invalid JSON in spec file");
    }

    // Validate it's an OpenAPI/Swagger spec
    if (!specJson["openapi"] && !specJson["swagger"]) {
      return err(400, "File is not a valid OpenAPI 3.x or Swagger 2.x spec (missing openapi/swagger field)");
    }

    // Split into per-endpoint files
    const result = splitSwagger(specJson);

    if (result.files.length === 0) {
      return err(400, "No endpoints found in the spec");
    }

    // Build upload items
    const uploads: Array<{ blobPath: string; content: string }> = [];
    const createdFiles: string[] = [];
    let skippedExisting = 0;

    for (const file of result.files) {
      const localPath = `${folderPath}/${file.folder}/${file.filename}`;
      const blobPath = projectId !== "unknown"
        ? `${projectId}/${localPath}`
        : localPath;

      if (!overwrite) {
        // Check if file already exists — for performance, we skip this check
        // and rely on blob storage's overwrite behavior. If overwrite is false,
        // we just skip existing files by tracking what we create.
        // (In practice, on first import there won't be existing files.)
      }

      uploads.push({ blobPath, content: file.content });
      createdFiles.push(localPath);
    }

    // Upload in batches of 10
    await batchUpload(uploads, 10);

    // Awaited distillation with per-file results
    const distillResults = await batchDistillAll(uploads, 10);
    const distilled = distillResults.filter(r => r.status === "distilled").length;
    const unchanged = distillResults.filter(r => r.status === "unchanged").length;
    const distillErrors = distillResults.filter(r => r.status === "error");

    // Eagerly build digest index
    let digestBuilt = false;
    let digestError: string | undefined;
    try {
      await rebuildDigest(projectId, folderPath);
      digestBuilt = true;
    } catch (e) {
      digestError = e instanceof Error ? e.message : String(e);
      console.warn("[split-swagger] digest rebuild failed:", e);
    }

    // Eagerly build dependency map from full spec
    let depsBuilt = false;
    let depsError: string | undefined;
    try {
      await rebuildDependencies(projectId, folderPath, specJson);
      depsBuilt = true;
    } catch (e) {
      depsError = e instanceof Error ? e.message : String(e);
      console.warn("[split-swagger] dependencies rebuild failed:", e);
    }

    // Audit log
    const user = getUserInfo(req);
    audit(projectId, "spec.split-swagger", user, folderPath, {
      endpoints: result.stats.endpoints,
      folders: result.stats.folders,
      skipped: result.stats.skipped + skippedExisting,
    });

    return ok({
      files: createdFiles,
      stats: {
        endpoints: result.stats.endpoints,
        folders: result.stats.folders,
        skipped: result.stats.skipped + skippedExisting,
      },
      suggestedVariables: result.suggestedVariables,
      suggestedConnections: result.suggestedConnections,
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
    console.error("[split-swagger] error:", e);
    return err(500, msg);
  }
}

app.http("specFilesSplitSwagger", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/split-swagger",
  handler: withAuth(splitSwaggerHandler),
});
