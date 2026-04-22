import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob, uploadBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

interface SourceEntry {
  sourceUrl: string;
  importedAt: string;
  lastSyncedAt: string | null;
}

type SourcesManifest = Record<string, SourceEntry>;

/**
 * GET /api/spec-files/sources?prefix=v3
 * Returns a merged map: { "v3/articles/file.md": { sourceUrl, importedAt, lastSyncedAt } }
 *
 * PUT /api/spec-files/sources
 * Body: { filePath: string, sourceUrl: string }
 * Updates the source URL for a file in its folder's _sources.json manifest.
 */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  if (req.method === "PUT") {
    return handleUpdateSource(req);
  }

  try {
    const prefix = req.query.get("prefix") ?? undefined;
    const blobs = await listBlobs(prefix);

    // Find all _sources.json manifests
    const manifestBlobs = blobs.filter((b) => b.name.endsWith("/_sources.json") || b.name === "_sources.json");

    const merged: Record<string, SourceEntry> = {};

    for (const mb of manifestBlobs) {
      try {
        const raw = await downloadBlob(mb.name);
        const manifest = JSON.parse(raw) as SourcesManifest;
        // Derive folder path from manifest blob name
        const folderPath = mb.name.replace(/\/?_sources\.json$/, "");
        for (const [filename, entry] of Object.entries(manifest)) {
          const fullPath = folderPath ? `${folderPath}/${filename}` : filename;
          merged[fullPath] = entry;
        }
      } catch {
        // Skip corrupt manifests
      }
    }

    return ok(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

/** Update the source URL for a specific file in its manifest. */
async function handleUpdateSource(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as { filePath?: string; sourceUrl?: string };
    const filePath = body.filePath?.trim();
    const sourceUrl = body.sourceUrl?.trim();

    if (!filePath) return err(400, "filePath is required");
    if (!sourceUrl) return err(400, "sourceUrl is required");

    // Validate URL
    try { new URL(sourceUrl); } catch { return err(400, "Invalid sourceUrl"); }

    // Derive folder and filename
    const lastSlash = filePath.lastIndexOf("/");
    const folderPath = lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
    const filename = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
    const manifestPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";

    // Read existing manifest
    let manifest: SourcesManifest;
    try {
      const raw = await downloadBlob(manifestPath);
      manifest = JSON.parse(raw) as SourcesManifest;
    } catch {
      manifest = {};
    }

    const existing = manifest[filename];
    if (!existing) return err(404, `"${filename}" not found in _sources.json`);

    // Update the source URL
    manifest[filename] = { ...existing, sourceUrl };
    await uploadBlob(manifestPath, JSON.stringify(manifest, null, 2), "application/json");

    const user = getUserInfo(req);
    let projectId: string;
    try { projectId = getProjectId(req); } catch { projectId = "unknown"; }
    audit(projectId, "spec.update_source", user, filePath, { oldUrl: existing.sourceUrl, newUrl: sourceUrl });

    return ok({ filePath, sourceUrl, updated: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesSources", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/sources",
  handler: withAuth(handler),
});
