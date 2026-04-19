import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowsContainer } from "../lib/cosmosClient";
import { withRole, getUserInfo, getProjectId, parseClientPrincipal, lookupUser, ProjectIdMissingError } from "../lib/auth";
import type { AppRole } from "../lib/auth";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

const LOCK_ROLES: AppRole[] = ["owner", "qa_manager"];

function flowDocId(path: string): string {
  return "flow:" + path.replace(/\//g, "|");
}

/** POST /api/flow-locks  body: { name: string } — lock a flow */
async function lockFlow(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { name: string };
    if (!body.name) return err(400, "name is required");

    const container = await getFlowsContainer();
    const docId = flowDocId(body.name);

    let doc: Record<string, unknown> | undefined;
    try {
      const { resource } = await container.item(docId, projectId).read();
      doc = resource as Record<string, unknown> | undefined;
    } catch {
      // not found
    }

    if (!doc) return err(404, `Flow not found: ${body.name}`);

    if (doc.lockedBy) {
      const lb = doc.lockedBy as { oid: string; name: string };
      if (lb.oid === user.oid) return ok({ locked: true, lockedBy: lb, lockedAt: doc.lockedAt });
      return err(409, `Already locked by ${lb.name}`);
    }

    const now = new Date().toISOString();
    doc.lockedBy = { oid: user.oid, name: user.name };
    doc.lockedAt = now;
    await container.items.upsert(doc);

    audit(projectId, "flow.lock", { oid: user.oid, name: user.name }, body.name);
    return ok({ locked: true, lockedBy: doc.lockedBy, lockedAt: now });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/flow-locks?name=<path> — unlock a flow */
async function unlockFlow(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const name = req.query.get("name");
    if (!name) return err(400, "name query param is required");

    const container = await getFlowsContainer();
    const docId = flowDocId(name);

    let doc: Record<string, unknown> | undefined;
    try {
      const { resource } = await container.item(docId, projectId).read();
      doc = resource as Record<string, unknown> | undefined;
    } catch {
      // not found
    }

    if (!doc) return err(404, `Flow not found: ${name}`);

    if (!doc.lockedBy) return ok({ locked: false });

    // Clear lock
    const previousLocker = doc.lockedBy as { oid: string; name: string } | undefined;
    doc.lockedBy = undefined;
    doc.lockedAt = undefined;
    await container.items.upsert(doc);

    const user = getUserInfo(req);
    audit(projectId, "flow.unlock", { oid: user.oid, name: user.name }, name, previousLocker ? { previousLockedBy: previousLocker.name } : undefined);
    return ok({ locked: false });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function flowLocksRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "POST":    return lockFlow(req);
    case "DELETE":  return unlockFlow(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("flowLocks", {
  methods: ["POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-locks",
  handler: withRole(LOCK_ROLES, flowLocksRouter),
});
