import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob, uploadBlob, deleteBlob, renameBlob } from "../lib/blobClient";
import { withAuth, getUserInfo, getProjectId } from "../lib/auth";
import { audit } from "../lib/auditLog";

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

/** GET /api/spec-files?prefix=<folder>  — list blobs */
async function listFiles(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const projectId = safeProjectId(req);
    const userPrefix = req.query.get("prefix") ?? undefined;
    // Scope to project — all blobs live under {projectId}/
    const blobPrefix = projectId !== "unknown"
      ? (userPrefix ? `${projectId}/${userPrefix}` : `${projectId}/`)
      : userPrefix;
    const blobs = await listBlobs(blobPrefix);
    // Strip project prefix from names so frontend sees clean paths
    if (projectId !== "unknown") {
      const prefix = projectId + "/";
      for (const b of blobs) {
        if (b.name.startsWith(prefix)) b.name = b.name.slice(prefix.length);
      }
    }
    return ok(blobs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

/** GET /api/spec-files/content?name=<blobName>  — download blob content */
async function getFileContent(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    const projectId = safeProjectId(req);
    const blobName = projectId !== "unknown" ? scopedPath(projectId, name) : name;
    const content = await downloadBlob(blobName);
    return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "text/plain" }, body: content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
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
    await uploadBlob(blobName, body.content, body.contentType);
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
      if (body.content !== undefined) {
        await uploadBlob(newBlobName, body.content);
      }
      audit(projectId, "spec.rename", user, body.name, { newName: body.newName });
      return ok({ renamed: true, name: body.newName });
    }
    if (body.content !== undefined) {
      await uploadBlob(blobName, body.content);
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
