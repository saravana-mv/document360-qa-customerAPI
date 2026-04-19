import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";
import { audit } from "../lib/auditLog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

const ACTIVE_TESTS_ID = "__active_tests__";

interface ActiveTestsDoc {
  id: string;
  projectId: string;
  type: "active_tests";
  flows: string[];
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

async function readDoc(projectId: string): Promise<ActiveTestsDoc | null> {
  const container = await getFlowsContainer();
  try {
    const { resource } = await container.item(ACTIVE_TESTS_ID, projectId).read<ActiveTestsDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

async function writeDoc(projectId: string, flows: string[], user: { oid: string; name: string }): Promise<ActiveTestsDoc> {
  const container = await getFlowsContainer();
  const doc: ActiveTestsDoc = {
    id: ACTIVE_TESTS_ID,
    projectId,
    type: "active_tests",
    flows,
    updatedAt: new Date().toISOString(),
    updatedBy: user,
  };
  await container.items.upsert(doc);
  return doc;
}

/** GET /api/active-tests — returns { flows: string[] } */
async function getActiveTests(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const doc = await readDoc(projectId);
    return ok({ flows: doc?.flows ?? [] });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** PUT /api/active-tests — replace entire flows array */
async function putActiveTests(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { flows: string[] };
    if (!Array.isArray(body.flows)) return err(400, "flows array is required");
    const doc = await writeDoc(projectId, body.flows, user);
    return ok({ flows: doc.flows });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/active-tests/activate — add flow(s) to active set */
async function activateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { flows: string[] };
    if (!Array.isArray(body.flows)) return err(400, "flows array is required");

    const existing = await readDoc(projectId);
    const set = new Set(existing?.flows ?? []);
    for (const f of body.flows) set.add(f);

    const doc = await writeDoc(projectId, [...set], user);
    for (const f of body.flows) audit(projectId, "scenario.activate", user, f);
    return ok({ flows: doc.flows });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/active-tests/deactivate — remove flow(s) from active set */
async function deactivateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as { flows: string[] };
    if (!Array.isArray(body.flows)) return err(400, "flows array is required");

    const existing = await readDoc(projectId);
    const set = new Set(existing?.flows ?? []);
    for (const f of body.flows) set.delete(f);

    const doc = await writeDoc(projectId, [...set], user);
    for (const f of body.flows) audit(projectId, "scenario.deactivate", user, f);
    return ok({ flows: doc.flows });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function activeTestsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getActiveTests(req);
    case "PUT":     return putActiveTests(req);
    default:        return err(405, "Method Not Allowed");
  }
}

async function activeTestsActionRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method !== "POST") return err(405, "Method Not Allowed");

  const url = new URL(req.url);
  if (url.pathname.endsWith("/activate")) return activateHandler(req);
  if (url.pathname.endsWith("/deactivate")) return deactivateHandler(req);
  return err(404, "Unknown action");
}

app.http("activeTests", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "active-tests",
  handler: withAuth(activeTestsRouter),
});

app.http("activeTestsActivate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "active-tests/activate",
  handler: withAuth(activeTestsActionRouter),
});

app.http("activeTestsDeactivate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "active-tests/deactivate",
  handler: withAuth(activeTestsActionRouter),
});
