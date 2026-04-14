import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob, downloadBlob, listBlobs } from "../lib/blobClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const FETCH_TIMEOUT = 15_000;

async function readManifest(folderPath: string): Promise<SourcesManifest> {
  const manifestPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  try {
    const raw = await downloadBlob(manifestPath);
    return JSON.parse(raw) as SourcesManifest;
  } catch {
    return {};
  }
}

async function writeManifest(folderPath: string, manifest: SourcesManifest): Promise<void> {
  const manifestPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  await uploadBlob(manifestPath, JSON.stringify(manifest, null, 2), "application/json");
}

/** Save current version to _versions/ before overwriting. */
async function preserveVersion(folderPath: string, filename: string): Promise<void> {
  const blobPath = folderPath ? `${folderPath}/${filename}` : filename;
  try {
    const currentContent = await downloadBlob(blobPath);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const versionPath = folderPath
      ? `${folderPath}/_versions/${filename}.${ts}`
      : `_versions/${filename}.${ts}`;
    await uploadBlob(versionPath, currentContent, "text/markdown");
  } catch {
    // File may not exist yet — nothing to preserve
  }
}

interface SyncResult {
  name: string;
  updated: boolean;
  error?: string;
}

/** Sync a single file: preserve old version, fetch new content, upload, update manifest. */
async function syncOneFile(
  folderPath: string,
  filename: string,
  entry: SourceEntry,
  manifest: SourcesManifest,
): Promise<SyncResult> {
  const blobPath = folderPath ? `${folderPath}/${filename}` : filename;
  try {
    // Preserve current version
    await preserveVersion(folderPath, filename);

    // Fetch fresh content
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    let response: Response;
    try {
      response = await fetch(entry.sourceUrl, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timer);
      throw new Error(`Fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`URL returned HTTP ${response.status}`);
    }

    const content = await response.text();

    // Upload new content
    await uploadBlob(blobPath, content, "text/markdown");

    // Update lastSyncedAt
    manifest[filename] = { ...entry, lastSyncedAt: new Date().toISOString() };

    return { name: blobPath, updated: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: blobPath, updated: false, error: msg };
  }
}

/**
 * POST /api/spec-files/sync
 * Body: { folderPath: string; filename?: string }
 * If filename is provided, syncs just that file.
 * If omitted, syncs all URL-sourced files under folderPath (recursively).
 */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as { folderPath?: string; filename?: string };
    const folderPath = body.folderPath?.trim() ?? "";
    const filename = body.filename?.trim();

    if (filename) {
      // Single file sync
      const manifest = await readManifest(folderPath);
      const entry = manifest[filename];
      if (!entry) return err(404, `No source URL found for "${filename}" in _sources.json`);

      const result = await syncOneFile(folderPath, filename, entry, manifest);
      await writeManifest(folderPath, manifest);
      return ok({ synced: [result] });
    }

    // Folder-level sync: find all _sources.json manifests under folderPath
    const prefix = folderPath || undefined;
    const blobs = await listBlobs(prefix);
    const manifestBlobs = blobs.filter(
      (b) => b.name.endsWith("/_sources.json") || b.name === "_sources.json",
    );

    const results: SyncResult[] = [];

    for (const mb of manifestBlobs) {
      const mFolder = mb.name.replace(/\/?_sources\.json$/, "");
      let manifest: SourcesManifest;
      try {
        const raw = await downloadBlob(mb.name);
        manifest = JSON.parse(raw) as SourcesManifest;
      } catch {
        continue;
      }

      let changed = false;
      for (const [fname, entry] of Object.entries(manifest)) {
        const result = await syncOneFile(mFolder, fname, entry, manifest);
        results.push(result);
        if (result.updated) changed = true;
      }

      if (changed) {
        await writeManifest(mFolder, manifest);
      }
    }

    if (results.length === 0) {
      return ok({ synced: [], message: "No URL-sourced files found under this path" });
    }

    return ok({ synced: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesSync", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/sync",
  handler,
});
