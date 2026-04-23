import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

const SCENARIO_ORG_ID = "__scenario_org__";

interface ScenarioOrgDoc {
  id: string;
  projectId: string;
  type: "scenario_org";
  versionConfigs: Record<string, { baseUrl: string; apiVersion: string }>;
  scenarioConfigs?: Record<string, Record<string, unknown>>;
  folders: Record<string, string[]>;
  placements: Record<string, string>;
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

async function readDoc(projectId: string): Promise<ScenarioOrgDoc | null> {
  const container = await getFlowsContainer();
  try {
    const { resource } = await container.item(SCENARIO_ORG_ID, projectId).read<ScenarioOrgDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

async function writeDoc(projectId: string, doc: ScenarioOrgDoc): Promise<ScenarioOrgDoc> {
  const container = await getFlowsContainer();
  await container.items.upsert(doc);
  return doc;
}

async function getScenarioOrg(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const doc = await readDoc(projectId);
    if (!doc) {
      return ok({ versionConfigs: {}, scenarioConfigs: {}, folders: {}, placements: {} });
    }
    return ok({
      versionConfigs: doc.versionConfigs,
      scenarioConfigs: doc.scenarioConfigs ?? {},
      folders: doc.folders,
      placements: doc.placements,
    });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function putScenarioOrg(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      versionConfigs: Record<string, { baseUrl: string; apiVersion: string }>;
      scenarioConfigs?: Record<string, Record<string, unknown>>;
      folders: Record<string, string[]>;
      placements: Record<string, string>;
    };

    if (!body.versionConfigs || !body.folders || !body.placements) {
      return err(400, "versionConfigs, folders, and placements are required");
    }

    const doc: ScenarioOrgDoc = {
      id: SCENARIO_ORG_ID,
      projectId,
      type: "scenario_org",
      versionConfigs: body.versionConfigs,
      scenarioConfigs: body.scenarioConfigs ?? {},
      folders: body.folders,
      placements: body.placements,
      updatedAt: new Date().toISOString(),
      updatedBy: user,
    };

    const saved = await writeDoc(projectId, doc);
    return ok({
      versionConfigs: saved.versionConfigs,
      scenarioConfigs: saved.scenarioConfigs ?? {},
      folders: saved.folders,
      placements: saved.placements,
    });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function scenarioOrgRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getScenarioOrg(req);
    case "PUT":     return putScenarioOrg(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("scenarioOrg", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "scenario-org",
  handler: withAuth(scenarioOrgRouter),
});
