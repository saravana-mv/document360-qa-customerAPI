import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob } from "../lib/blobClient";
import { withAuth } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
 */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

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

app.http("specFilesSources", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/sources",
  handler: withAuth(handler),
});
