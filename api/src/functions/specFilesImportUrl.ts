import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { uploadBlob, downloadBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { browserFetch } from "../lib/browserFetch";

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

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

interface SourceEntry {
  sourceUrl: string;
  importedAt: string;
  lastSyncedAt: string | null;
}

type SourcesManifest = Record<string, SourceEntry>;

/** Read or initialise the _sources.json manifest for a folder. */
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

/** Derive a filename from a URL (last path segment). */
function filenameFromUrl(url: string): string {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "imported.md";
  // Ensure it ends with .md
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
      content?: string;        // Pre-fetched content from client-side fetch
    };
    const url = body.url?.trim();
    const folderPath = body.folderPath?.trim() ?? "";
    const filenameOverride = body.filename?.trim();
    const accessToken = body.accessToken?.trim();
    const clientContent = body.content;

    if (!url) return err(400, "url is required");

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return err(400, "Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err(400, "Only HTTP/HTTPS URLs are supported");
    }

    const filename = filenameOverride || filenameFromUrl(url);
    const blobPath = folderPath ? `${folderPath}/${filename}` : filename;

    let content: string;

    if (clientContent != null) {
      // Content was pre-fetched client-side (browser had session cookies)
      content = clientContent;
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    } else {
      // Fetch content from URL server-side with browser-mimicking headers
      let response: Response;
      try {
        response = await browserFetch(url, accessToken);
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return err(502, `Failed to fetch URL: ${msg}`);
      }

      if (!response.ok) {
        return err(502, `URL returned HTTP ${response.status}`);
      }

      // Check size via Content-Length header first
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }

      content = await response.text();
      if (content.length > MAX_SIZE) {
        return err(413, `File too large (max ${MAX_SIZE / 1024 / 1024}MB)`);
      }
    }

    // Upload to blob storage
    await uploadBlob(blobPath, content, "text/markdown");

    // Update _sources.json manifest
    const manifest = await readManifest(folderPath);
    manifest[filename] = {
      sourceUrl: url,
      importedAt: new Date().toISOString(),
      lastSyncedAt: null,
    };
    await writeManifest(folderPath, manifest);

    const user = getUserInfo(req);
    let projectId: string;
    try { projectId = getProjectId(req); } catch { projectId = "unknown"; }
    audit(projectId, "spec.import_url", user, blobPath, { sourceUrl: url, size: content.length });

    return ok({ name: blobPath, filename, uploaded: true, sourceUrl: url });
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
