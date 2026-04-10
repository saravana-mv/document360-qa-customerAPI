import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listBlobs, downloadBlob, uploadBlob, deleteBlob, renameBlob } from "../lib/blobClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

/** GET /api/spec-files?prefix=<folder>  — list blobs */
async function listFiles(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const prefix = req.query.get("prefix") ?? undefined;
    const blobs = await listBlobs(prefix);
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
    const content = await downloadBlob(name);
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
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const body = (await req.json()) as { name: string; content: string; contentType?: string };
    if (!body.name || body.content === undefined) return err(400, "name and content are required");
    await uploadBlob(body.name, body.content, body.contentType);
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
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const body = (await req.json()) as { name: string; content?: string; newName?: string };
    if (!body.name) return err(400, "name is required");
    if (body.newName && body.newName !== body.name) {
      await renameBlob(body.name, body.newName);
      if (body.content !== undefined) {
        await uploadBlob(body.newName, body.content);
      }
      return ok({ renamed: true, name: body.newName });
    }
    if (body.content !== undefined) {
      await uploadBlob(body.name, body.content);
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
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    await deleteBlob(name);
    return ok({ deleted: true, name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(500, msg);
  }
}

// Register functions
app.http("specFilesList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files",
  handler: listFiles,
});

app.http("specFilesContent", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/content",
  handler: getFileContent,
});

app.http("specFilesCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files",
  handler: createFile,
});

app.http("specFilesUpdate", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files",
  handler: updateFile,
});

app.http("specFilesDelete", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files",
  handler: deleteFile,
});
