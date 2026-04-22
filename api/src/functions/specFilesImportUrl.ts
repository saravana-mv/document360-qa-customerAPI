import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob, downloadBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { browserFetch } from "../lib/browserFetch";

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

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

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

function filenameFromUrl(url: string): string {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "imported.md";
  return last.endsWith(".md") ? last : `${last}.md`;
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await req.json()) as {
      url?: string;
      folderPath?: string;
      filename?: string;
      accessToken?: string;
      content?: string;
    };
    const url = body.url?.trim();
    const folderPath = body.folderPath?.trim() ?? "";
    const filenameOverride = body.filename?.trim();
    const accessToken = body.accessToken?.trim();
    const clientContent = body.content;

    if (!url) return err(400, "url is required");

    let parsed: URL;
    try { parsed = new URL(url); } catch { return err(400, "Invalid URL"); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err(400, "Only HTTP/HTTPS URLs are supported");
    }

    const filename = filenameOverride || filenameFromUrl(url);
    const localBlobPath = folderPath ? `${folderPath}/${filename}` : filename;

    let projectId: string;
    try { projectId = getProjectId(req); } catch { projectId = "unknown"; }

    const blobPath = projectId !== "unknown" ? scopedPath(projectId, localBlobPath) : localBlobPath;

    let content: string;

    if (clientContent != null) {
      content = clientContent;
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    } else {
      let response: Response;
      try { response = await browserFetch(url, accessToken); } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return err(502, `Failed to fetch URL: ${msg}`);
      }
      if (!response.ok) return err(502, `URL returned HTTP ${response.status}`);
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
      content = await response.text();
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    }

    await uploadBlob(blobPath, content, "text/markdown");

    const manifest = await readManifest(projectId, folderPath);
    manifest[filename] = { sourceUrl: url, importedAt: new Date().toISOString(), lastSyncedAt: null };
    await writeManifest(projectId, folderPath, manifest);

    const user = getUserInfo(req);
    audit(projectId, "spec.import_url", user, localBlobPath, { sourceUrl: url, size: content.length });

    return ok({ name: localBlobPath, filename, uploaded: true, sourceUrl: url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesImportUrl", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/import-url",
  handler: withAuth(handler),
});
