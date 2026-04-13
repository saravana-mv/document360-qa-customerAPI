import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  listBlobs,
  downloadBlob,
  uploadBlob,
  deleteBlob,
  blobExists,
  FLOW_CONTAINER,
} from "../lib/blobClient";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string, extra?: Record<string, unknown>): HttpResponseInit {
  return {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ error: message, ...extra }),
  };
}

/** GET /api/flow-files?prefix=<folder> — list flow files */
async function listFiles(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const prefix = req.query.get("prefix") ?? undefined;
    const blobs = await listBlobs(prefix, FLOW_CONTAINER);
    return ok(blobs);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/flow-files/content?name=<blobName> — download flow XML */
async function getFileContent(req: HttpRequest): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    const content = await downloadBlob(name, FLOW_CONTAINER);
    return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/xml" }, body: content };
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/flow-files — create / overwrite a flow file
 *  Body: { name: string; xml: string; overwrite?: boolean }
 *  Returns 409 with { error, conflict: true } when the target already exists
 *  and `overwrite` is not true.
 */
async function createFile(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as { name: string; xml: string; overwrite?: boolean };
    if (!body.name || body.xml === undefined) return err(400, "name and xml are required");

    if (!body.overwrite) {
      const exists = await blobExists(body.name, FLOW_CONTAINER);
      if (exists) {
        return err(409, `A flow already exists at ${body.name}`, { conflict: true, name: body.name });
      }
    }

    await uploadBlob(body.name, body.xml, "application/xml", FLOW_CONTAINER);
    return ok({ name: body.name, uploaded: true });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/flow-files?name=<blobName> */
async function deleteFile(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");
    await deleteBlob(name, FLOW_CONTAINER);
    return ok({ deleted: true, name });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

export async function flowFilesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return listFiles(req);
    case "POST":    return createFile(req);
    case "DELETE":  return deleteFile(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("flowFiles", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-files",
  handler: flowFilesRouter,
});

app.http("flowFilesContent", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-files/content",
  handler: getFileContent,
});
