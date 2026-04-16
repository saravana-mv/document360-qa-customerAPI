import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
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

interface FlowDocument {
  id: string;
  projectId: string;
  type: "flow";
  path: string;
  xml: string;
  size: number;
  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

function flowDocId(path: string): string {
  return "flow:" + path;
}

/** GET /api/flow-files?prefix=<folder> — list flow files */
async function listFiles(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const prefix = req.query.get("prefix") ?? "";
    const container = await getFlowsContainer();

    const query = prefix
      ? `SELECT c.path, c.size, c.updatedAt FROM c WHERE c.type="flow" AND c.projectId=@pid AND STARTSWITH(c.path, @prefix)`
      : `SELECT c.path, c.size, c.updatedAt FROM c WHERE c.type="flow" AND c.projectId=@pid`;

    const params = prefix
      ? [{ name: "@pid", value: projectId }, { name: "@prefix", value: prefix }]
      : [{ name: "@pid", value: projectId }];

    const { resources } = await container.items.query({ query, parameters: params }, { partitionKey: projectId }).fetchAll();

    // Map to same shape frontend expects
    const items = resources.map((r: { path: string; size: number; updatedAt: string }) => ({
      name: r.path,
      size: r.size,
      lastModified: r.updatedAt,
      contentType: "application/xml",
    }));

    return ok(items);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/flow-files/content?name=<blobName> — download flow XML */
async function getFileContent(req: HttpRequest): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  try {
    const projectId = getProjectId(req);
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");

    const container = await getFlowsContainer();
    const { resource } = await container.item(flowDocId(name), projectId).read<FlowDocument>();
    if (!resource) return err(404, `Flow not found: ${name}`);

    return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/xml" }, body: resource.xml };
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/flow-files — create / overwrite a flow file */
async function createFile(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { name: string; xml: string; overwrite?: boolean };
    if (!body.name || body.xml === undefined) return err(400, "name and xml are required");

    const container = await getFlowsContainer();
    const docId = flowDocId(body.name);
    const now = new Date().toISOString();

    if (!body.overwrite) {
      try {
        const { resource } = await container.item(docId, projectId).read();
        if (resource) {
          return err(409, `A flow already exists at ${body.name}`, { conflict: true, name: body.name });
        }
      } catch {
        // 404 = doesn't exist, which is what we want
      }
    }

    // Read existing to preserve createdAt/createdBy
    let createdAt = now;
    let createdBy = { oid: user.oid, name: user.name };
    try {
      const { resource: existing } = await container.item(docId, projectId).read<FlowDocument>();
      if (existing) {
        createdAt = existing.createdAt;
        createdBy = existing.createdBy;
      }
    } catch {
      // new doc
    }

    const doc: FlowDocument = {
      id: docId,
      projectId,
      type: "flow",
      path: body.name,
      xml: body.xml,
      size: Buffer.byteLength(body.xml, "utf8"),
      createdAt,
      createdBy,
      updatedAt: now,
      updatedBy: { oid: user.oid, name: user.name },
    };

    await container.items.upsert(doc);
    return ok({ name: body.name, uploaded: true });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/flow-files?name=<blobName> */
async function deleteFile(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");

    const container = await getFlowsContainer();
    try {
      await container.item(flowDocId(name), projectId).delete();
    } catch {
      // Ignore if not found — idempotent delete
    }
    return ok({ deleted: true, name });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
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
  handler: withAuth(flowFilesRouter),
});

app.http("flowFilesContent", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-files/content",
  handler: withAuth(getFileContent),
});
