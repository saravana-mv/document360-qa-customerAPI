// Project-level variables API.
//
// GET    /api/project-variables     — list all variables for the current project
// PUT    /api/project-variables     — save all variables for the current project
//
// Variables are stored in the settings Cosmos container with:
//   id: "project_variables", partitionKey (userId): projectId

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getProjectId, getUserInfo, lookupProjectMember, isSuperOwner, parseClientPrincipal } from "../lib/auth";
import { getSettingsContainer } from "../lib/cosmosClient";
import { audit } from "../lib/auditLog";

const DOC_ID = "project_variables";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

export interface ProjectVariable {
  name: string;
  value: string;
}

interface ProjectVariablesDoc {
  id: string;
  userId: string; // partition key — set to projectId
  projectId: string;
  variables: ProjectVariable[];
  updatedBy: string;
  updatedAt: string;
}

/** Read project variables — returns { variables: [...] } */
async function handleGet(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

  const container = await getSettingsContainer();
  try {
    const { resource } = await container.item(DOC_ID, projectId).read<ProjectVariablesDoc>();
    return ok({ variables: resource?.variables ?? [] });
  } catch {
    return ok({ variables: [] });
  }
}

/** Save project variables — body: { variables: [{ name, value }] } */
async function handlePut(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

  // Access check: Super Owner or project owner/qa_manager
  const { oid, name: userName } = getUserInfo(req);
  const principal = parseClientPrincipal(req);
  const email = principal?.userDetails ?? "";
  const superOwner = await isSuperOwner(oid, userName, email);
  if (!superOwner) {
    const member = await lookupProjectMember(oid, projectId);
    if (!member || !["owner", "qa_manager"].includes(member.role)) {
      return err(403, "QA Manager or above required to manage project variables");
    }
  }

  let body: { variables?: ProjectVariable[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const variables = Array.isArray(body.variables) ? body.variables : [];

  // Validate: name must be a valid identifier, no duplicates
  const seen = new Set<string>();
  for (const v of variables) {
    if (!v.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name)) {
      return err(400, `Invalid variable name: "${v.name}". Must be a valid identifier (letters, numbers, underscores).`);
    }
    if (seen.has(v.name)) {
      return err(400, `Duplicate variable name: "${v.name}"`);
    }
    seen.add(v.name);
    if (typeof v.value !== "string") {
      return err(400, `Variable "${v.name}" value must be a string`);
    }
  }

  const now = new Date().toISOString();
  const doc: ProjectVariablesDoc = {
    id: DOC_ID,
    userId: projectId, // partition key
    projectId,
    variables,
    updatedBy: oid,
    updatedAt: now,
  };

  const container = await getSettingsContainer();
  await container.items.upsert(doc);

  audit(projectId, "project.variables.update", { oid, name: userName }, `${variables.length} variable(s)`);

  return ok({ variables });
}

// ── Router ──────────────────────────────────────────────────────────────────

async function projectVariablesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleGet(req);
  if (req.method === "PUT") return handlePut(req);
  return err(405, "Method Not Allowed");
}

app.http("projectVariables", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "project-variables",
  handler: withAuth(projectVariablesRouter),
});
