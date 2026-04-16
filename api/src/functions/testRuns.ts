import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getTestRunsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";

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

/** POST /api/test-runs — save a completed test run */
async function saveRun(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      id: string;
      startedAt: string;
      completedAt: string;
      summary: unknown;
      tagResults: unknown;
      testResults: unknown;
      log: unknown[];
    };
    if (!body.id) return err(400, "id is required");

    const container = await getTestRunsContainer();
    const doc = {
      id: body.id,
      projectId,
      type: "test_run",
      triggeredBy: { oid: user.oid, name: user.name },
      startedAt: body.startedAt,
      completedAt: body.completedAt,
      summary: body.summary,
      tagResults: body.tagResults,
      testResults: body.testResults,
      log: Array.isArray(body.log) ? body.log.slice(0, 500) : [], // cap at 500
    };

    await container.items.upsert(doc);
    return ok({ saved: true, id: body.id });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/test-runs — list recent runs (most recent first) */
async function listRuns(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const limit = parseInt(req.query.get("limit") ?? "20", 10);
    const container = await getTestRunsContainer();

    const query = `SELECT c.id, c.triggeredBy, c.startedAt, c.completedAt, c.summary FROM c WHERE c.type="test_run" AND c.projectId=@pid ORDER BY c.startedAt DESC OFFSET 0 LIMIT @limit`;
    const { resources } = await container.items.query(
      { query, parameters: [{ name: "@pid", value: projectId }, { name: "@limit", value: limit }] },
      { partitionKey: projectId },
    ).fetchAll();

    return ok(resources);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** GET /api/test-runs/{id} — full run details */
async function getRun(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const runId = parts[parts.length - 1];
    if (!runId) return err(400, "run id is required");

    const container = await getTestRunsContainer();
    try {
      const { resource } = await container.item(runId, projectId).read();
      if (!resource) return err(404, "Run not found");
      return ok(resource);
    } catch {
      return err(404, "Run not found");
    }
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/test-runs/{id} */
async function deleteRun(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const runId = parts[parts.length - 1];
    if (!runId) return err(400, "run id is required");

    const container = await getTestRunsContainer();
    try {
      await container.item(runId, projectId).delete();
    } catch {
      // idempotent
    }
    return ok({ deleted: true, id: runId });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function testRunsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return listRuns(req);
    case "POST":    return saveRun(req);
    default:        return err(405, "Method Not Allowed");
  }
}

async function testRunDetailRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getRun(req);
    case "DELETE":  return deleteRun(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("testRuns", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "test-runs",
  handler: withAuth(testRunsRouter),
});

app.http("testRunDetail", {
  methods: ["GET", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "test-runs/{id}",
  handler: withAuth(testRunDetailRouter),
});
