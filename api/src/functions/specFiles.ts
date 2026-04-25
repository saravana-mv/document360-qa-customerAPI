import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob, uploadBlob, deleteBlob, renameBlob, blobExists } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";
import { distillAndStore, deleteDistilled, renameDistilled } from "../lib/specDistillCache";

/** Safe project ID extraction — returns "unknown" if header missing. */
function safeProjectId(req: HttpRequest): string {
  try { return getProjectId(req); } catch { return "unknown"; }
}

/** Prepend project ID to a blob path for project-scoped storage. */
function scopedPath(projectId: string, name: string): string {
  // Already scoped — don't double-prefix
  if (name.startsWith(projectId + "/")) return name;
  return `${projectId}/${name}`;
}

/** Strip project prefix from a blob name for clean frontend paths. */
function unscopedName(projectId: string, name: string): string {
  const prefix = projectId + "/";
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

/**
 * Remap scattered _distilled/ blobs into _system/_distilled/ for the file tree.
 * e.g. "V3/articles/_distilled/create.md" → "V3/_system/_distilled/articles/create.md"
 * The version folder is the first segment matching /^v\d+$/i.
 */
function remapDistilledToSystem(blobName: string): string {
  const parts = blobName.split("/");
  const distIdx = parts.indexOf("_distilled");
  if (distIdx < 0) return blobName;
  // Find version folder — first segment matching v\d+
  let versionIdx = -1;
  for (let i = 0; i < distIdx; i++) {
    if (/^v\d+$/i.test(parts[i])) { versionIdx = i; break; }
  }
  if (versionIdx < 0) return blobName;
  // Segments between version and _distilled are the subfolder context
  const before = parts.slice(0, versionIdx + 1);       // e.g. ["V3"]
  const subfolders = parts.slice(versionIdx + 1, distIdx); // e.g. ["articles"]
  const after = parts.slice(distIdx + 1);                // e.g. ["create.md"]
  return [...before, "_system", "_distilled", ...subfolders, ...after].join("/");
}

/** GET /api/spec-files?prefix=<folder>  — list blobs */
async function listFiles(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const projectId = safeProjectId(req);
    const userPrefix = req.query.get("prefix") ?? undefined;
    // Scope to project — all blobs live under {projectId}/
    const blobPrefix = projectId !== "unknown"
      ? (userPrefix ? `${projectId}/${userPrefix}` : `${projectId}/`)
      : userPrefix;
    const allBlobs = await listBlobs(blobPrefix);
    // Remap _distilled/ blobs into _system/_distilled/ for the file tree
    for (const b of allBlobs) {
      b.name = remapDistilledToSystem(b.name);
    }
    // Strip project prefix from names so frontend sees clean paths
    if (projectId !== "unknown") {
      const prefix = projectId + "/";
      for (const b of allBlobs) {
        if (b.name.startsWith(prefix)) b.name = b.name.slice(prefix.length);
      }
    }
    return ok(allBlobs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

/**
 * Reverse-map _system/_distilled/ paths back to actual blob paths.
 * e.g. "V3/_system/_distilled/articles/create.md" → "V3/articles/_distilled/create.md"
 */
function unmapDistilledFromSystem(name: string): string {
  const marker = "_system/_distilled/";
  const markerIdx = name.indexOf(marker);
  if (markerIdx < 0) return name;
  const before = name.slice(0, markerIdx);              // e.g. "V3/"
  const rest = name.slice(markerIdx + marker.length);   // e.g. "articles/create.md"
  const lastSlash = rest.lastIndexOf("/");
  if (lastSlash < 0) return `${before}_distilled/${rest}`;
  const subfolder = rest.slice(0, lastSlash);            // e.g. "articles"
  const filename = rest.slice(lastSlash + 1);            // e.g. "create.md"
  return `${before}${subfolder}/_distilled/${filename}`;
}

/** GET /api/spec-files/content?name=<blobName>  — download blob content */
async function getFileContent(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    const projectId = safeProjectId(req);
    // Reverse-map _system/_distilled/ to actual blob path
    const resolvedName = unmapDistilledFromSystem(name);
    const blobName = projectId !== "unknown" ? scopedPath(projectId, resolvedName) : resolvedName;
    const content = await downloadBlob(blobName);
    return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "text/plain" }, body: content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Return 404 for missing blobs instead of 500
    if (msg.includes("does not exist") || msg.includes("BlobNotFound") || msg.includes("404")) {
      return err(404, "File not found");
    }
    return err(500, msg);
  }
}

/** Check if a filename (last segment) is _skills.md or legacy Skills.md (case-insensitive). */
function isSkillsFile(name: string): boolean {
  const filename = name.split("/").pop() ?? "";
  return filename.toLowerCase() === "_skills.md" || filename.toLowerCase() === "skills.md";
}

/** Snapshot the current version of a Skills.md file before overwriting. */
async function snapshotSkillsVersion(projectId: string, blobName: string, localName: string, newContent: string): Promise<void> {
  try {
    const exists = await blobExists(blobName);
    if (!exists) return;
    const currentContent = await downloadBlob(blobName);
    // Only snapshot if content actually changed
    if (currentContent === newContent) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const lastSlash = localName.lastIndexOf("/");
    const folder = lastSlash >= 0 ? localName.slice(0, lastSlash) : "";
    const filename = lastSlash >= 0 ? localName.slice(lastSlash + 1) : localName;
    const versionLocal = folder
      ? `${folder}/_versions/${filename}.${ts}`
      : `_versions/${filename}.${ts}`;
    const versionPath = projectId !== "unknown" ? scopedPath(projectId, versionLocal) : versionLocal;
    await uploadBlob(versionPath, currentContent, "text/markdown");
  } catch {
    // File may not exist yet — skip silently
  }
}

/** POST /api/spec-files  — upload/create a file
 *  Body: { name: string; content: string; contentType?: string }
 */
async function createFile(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as { name: string; content: string; contentType?: string };
    if (!body.name || body.content === undefined) return err(400, "name and content are required");
    const projectId = safeProjectId(req);
    const blobName = projectId !== "unknown" ? scopedPath(projectId, body.name) : body.name;
    // Snapshot Skills.md before overwriting
    if (isSkillsFile(body.name)) {
      await snapshotSkillsVersion(projectId, blobName, body.name, body.content);
    }
    await uploadBlob(blobName, body.content, body.contentType);
    // Pre-compute distilled version for AI consumption
    distillAndStore(blobName, body.content).catch(() => {});
    const user = getUserInfo(req);
    audit(projectId, "spec.upload", user, body.name, { size: body.content.length });
    return ok({ name: body.name, uploaded: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

/** PUT /api/spec-files  — update file content or rename
 *  Body: { name: string; content?: string; newName?: string }
 */
async function updateFile(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as { name: string; content?: string; newName?: string };
    if (!body.name) return err(400, "name is required");
    const user = getUserInfo(req);
    const projectId = safeProjectId(req);
    const blobName = projectId !== "unknown" ? scopedPath(projectId, body.name) : body.name;
    if (body.newName && body.newName !== body.name) {
      const newBlobName = projectId !== "unknown" ? scopedPath(projectId, body.newName) : body.newName;
      await renameBlob(blobName, newBlobName);
      renameDistilled(blobName, newBlobName).catch(() => {});
      if (body.content !== undefined) {
        await uploadBlob(newBlobName, body.content);
        distillAndStore(newBlobName, body.content).catch(() => {});
      }
      audit(projectId, "spec.rename", user, body.name, { newName: body.newName });
      return ok({ renamed: true, name: body.newName });
    }
    if (body.content !== undefined) {
      await uploadBlob(blobName, body.content);
      distillAndStore(blobName, body.content).catch(() => {});
      audit(projectId, "spec.update", user, body.name);
      return ok({ updated: true, name: body.name });
    }
    return err(400, "Provide content to update or newName to rename");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

/** DELETE /api/spec-files?name=<blobName>  — delete a blob */
async function deleteFile(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    const projectId = safeProjectId(req);
    const blobName = projectId !== "unknown" ? scopedPath(projectId, name) : name;
    await deleteBlob(blobName);
    deleteDistilled(blobName).catch(() => {});
    const user = getUserInfo(req);
    audit(projectId, "spec.delete", user, name);
    return ok({ deleted: true, name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

// Single function handles all methods on spec-files route to avoid
// Azure SWA routing issues when multiple functions share the same route.
export async function specFilesRouter(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return listFiles(req, ctx);
    case "POST":    return createFile(req, ctx);
    case "PUT":     return updateFile(req, ctx);
    case "DELETE":  return deleteFile(req, ctx);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("specFiles", {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files",
  handler: withAuth(specFilesRouter),
});

app.http("specFilesContent", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/content",
  handler: withAuth(getFileContent),
});

/** GET /api/spec-files/versions?name=<path/to/Skills.md>  — list version history */
async function listVersions(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    const projectId = safeProjectId(req);

    // Derive folder and filename from the path
    const lastSlash = name.lastIndexOf("/");
    const folder = lastSlash >= 0 ? name.slice(0, lastSlash) : "";
    const filename = lastSlash >= 0 ? name.slice(lastSlash + 1) : name;

    // List blobs under {projectId}/{folder}/_versions/{filename}.*
    const versionPrefix = folder
      ? `${folder}/_versions/${filename}.`
      : `_versions/${filename}.`;
    const blobPrefix = projectId !== "unknown" ? scopedPath(projectId, versionPrefix) : versionPrefix;
    const blobs = await listBlobs(blobPrefix);

    // Extract timestamp from each blob name and build response
    const versions = blobs.map((b) => {
      // Blob name ends with {filename}.{timestamp} — extract the timestamp part
      const blobName = projectId !== "unknown" ? unscopedName(projectId, b.name) : b.name;
      const tsStart = blobName.lastIndexOf(`${filename}.`) + filename.length + 1;
      const rawTs = blobName.slice(tsStart);
      // Convert back from safe format (2026-04-24T10-30-45-123Z) to ISO
      // Pattern: replace the 3rd, 4th, 5th hyphens (after T) back to : . :
      const timestamp = rawTs
        .replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "$1:$2:$3.$4Z");
      return { name: blobName, timestamp, size: b.size };
    });

    // Sort newest first
    versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return ok(versions);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

app.http("specFilesVersions", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/versions",
  handler: withAuth(listVersions),
});
