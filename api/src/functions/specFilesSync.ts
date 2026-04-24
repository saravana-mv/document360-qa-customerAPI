import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob, downloadBlob, listBlobs } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { browserFetch } from "../lib/browserFetch";
import { distillAndStore } from "../lib/specDistillCache";

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

interface SourceEntry {
  sourceUrl: string;
  importedAt: string;
  lastSyncedAt: string | null;
}

type SourcesManifest = Record<string, SourceEntry>;

function scopedPath(projectId: string, name: string): string {
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

async function readManifest(projectId: string, folderPath: string): Promise<SourcesManifest> {
  const localPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  const blobPath = projectId !== "unknown" ? scopedPath(projectId, localPath) : localPath;
  try {
    const raw = await downloadBlob(blobPath);
    return JSON.parse(raw) as SourcesManifest;
  } catch {
    return {};
  }
}

async function writeManifest(projectId: string, folderPath: string, manifest: SourcesManifest): Promise<void> {
  const localPath = folderPath ? `${folderPath}/_sources.json` : "_sources.json";
  const blobPath = projectId !== "unknown" ? scopedPath(projectId, localPath) : localPath;
  await uploadBlob(blobPath, JSON.stringify(manifest, null, 2), "application/json");
}

async function preserveVersion(projectId: string, folderPath: string, filename: string): Promise<void> {
  const localPath = folderPath ? `${folderPath}/${filename}` : filename;
  const blobPath = projectId !== "unknown" ? scopedPath(projectId, localPath) : localPath;
  try {
    const currentContent = await downloadBlob(blobPath);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const versionLocal = folderPath
      ? `${folderPath}/_versions/${filename}.${ts}`
      : `_versions/${filename}.${ts}`;
    const versionPath = projectId !== "unknown" ? scopedPath(projectId, versionLocal) : versionLocal;
    await uploadBlob(versionPath, currentContent, "text/markdown");
  } catch {
    // File may not exist yet
  }
}

interface SyncResult {
  name: string;
  updated: boolean;
  error?: string;
}

async function syncOneFile(
  projectId: string,
  folderPath: string,
  filename: string,
  entry: SourceEntry,
  manifest: SourcesManifest,
  accessToken?: string,
): Promise<SyncResult> {
  const localPath = folderPath ? `${folderPath}/${filename}` : filename;
  const blobPath = projectId !== "unknown" ? scopedPath(projectId, localPath) : localPath;
  try {
    await preserveVersion(projectId, folderPath, filename);
    const fetchResult = await browserFetch(entry.sourceUrl, accessToken);
    if (fetchResult.redirected) throw new Error("Redirection detected — authentication may be required");
    if (!fetchResult.response.ok) throw new Error(`URL returned HTTP ${fetchResult.response.status}`);
    const content = await fetchResult.response.text();
    const trimmedContent = content.trimStart().toLowerCase();
    if (trimmedContent.startsWith("<!doctype") || trimmedContent.startsWith("<html")) {
      throw new Error("URL returned HTML instead of markdown — authentication may be required");
    }
    await uploadBlob(blobPath, content, "text/markdown");
    distillAndStore(blobPath, content).catch(() => {});
    manifest[filename] = { ...entry, lastSyncedAt: new Date().toISOString() };
    return { name: localPath, updated: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: localPath, updated: false, error: msg };
  }
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as { folderPath?: string; filename?: string; accessToken?: string };
    const folderPath = body.folderPath?.trim() ?? "";
    const filename = body.filename?.trim();
    const accessToken = body.accessToken?.trim();

    const user = getUserInfo(req);
    let projectId: string;
    try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

    if (filename) {
      const manifest = await readManifest(projectId, folderPath);
      const entry = manifest[filename];
      if (!entry) return err(404, `No source URL found for "${filename}" in _sources.json`);

      const result = await syncOneFile(projectId, folderPath, filename, entry, manifest, accessToken);
      await writeManifest(projectId, folderPath, manifest);
      const target = folderPath ? `${folderPath}/${filename}` : filename;
      audit(projectId, "spec.sync", user, target, { updated: result.updated });
      return ok({ synced: [result] });
    }

    // Folder-level sync: find all _sources.json manifests under the project-scoped path
    const blobPrefix = projectId !== "unknown"
      ? (folderPath ? `${projectId}/${folderPath}` : `${projectId}/`)
      : (folderPath || undefined);
    const blobs = await listBlobs(blobPrefix);
    const manifestBlobs = blobs.filter(
      (b) => b.name.endsWith("/_sources.json") || b.name === "_sources.json",
    );

    const results: SyncResult[] = [];

    for (const mb of manifestBlobs) {
      // Derive local folder from manifest blob name (strip project prefix)
      let manifestBlobName = mb.name;
      if (projectId !== "unknown" && manifestBlobName.startsWith(projectId + "/")) {
        manifestBlobName = manifestBlobName.slice(projectId.length + 1);
      }
      const mFolder = manifestBlobName.replace(/\/?_sources\.json$/, "");
      let manifest: SourcesManifest;
      try {
        const rawBlobName = projectId !== "unknown" ? scopedPath(projectId, manifestBlobName) : manifestBlobName;
        const raw = await downloadBlob(rawBlobName);
        manifest = JSON.parse(raw) as SourcesManifest;
      } catch {
        continue;
      }

      let changed = false;
      for (const [fname, entry] of Object.entries(manifest)) {
        const result = await syncOneFile(projectId, mFolder, fname, entry, manifest, accessToken);
        results.push(result);
        if (result.updated) changed = true;
      }

      if (changed) {
        await writeManifest(projectId, mFolder, manifest);
      }
    }

    if (results.length === 0) {
      return ok({ synced: [], message: "No URL-sourced files found under this path" });
    }

    const updatedCount = results.filter((r) => r.updated).length;
    audit(projectId, "spec.sync", user, folderPath || "/", { total: results.length, updated: updatedCount });

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
  handler: withAuth(handler),
});
