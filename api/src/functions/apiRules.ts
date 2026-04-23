// Project-level API Rules API.
//
// GET    /api/api-rules     — get API rules for the current project
// PUT    /api/api-rules     — save API rules for the current project
//
// Stored in the settings Cosmos container with:
//   id: "api_rules", partitionKey (userId): projectId

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getProjectId, getUserInfo, lookupProjectMember, isSuperOwner, parseClientPrincipal } from "../lib/auth";
import { getSettingsContainer } from "../lib/cosmosClient";
import { audit } from "../lib/auditLog";

const DOC_ID = "api_rules";

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

interface ApiRulesDoc {
  id: string;
  userId: string; // partition key — set to projectId
  projectId: string;
  rules: string;
  enumAliases: string;
  updatedBy: string;
  updatedAt: string;
}

/** Read API rules */
async function handleGet(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

  const container = await getSettingsContainer();
  try {
    const { resource } = await container.item(DOC_ID, projectId).read<ApiRulesDoc>();
    return ok({ rules: resource?.rules ?? "", enumAliases: resource?.enumAliases ?? "" });
  } catch {
    return ok({ rules: "", enumAliases: "" });
  }
}

/** Save API rules — body: { rules: string, enumAliases?: string } */
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
      return err(403, "QA Manager or above required to manage API rules");
    }
  }

  let body: { rules?: string; enumAliases?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  const rules = typeof body.rules === "string" ? body.rules : "";
  const enumAliases = typeof body.enumAliases === "string" ? body.enumAliases : "";

  const now = new Date().toISOString();
  const doc: ApiRulesDoc = {
    id: DOC_ID,
    userId: projectId,
    projectId,
    rules,
    enumAliases,
    updatedBy: oid,
    updatedAt: now,
  };

  const container = await getSettingsContainer();
  await container.items.upsert(doc);

  audit(projectId, "project.apiRules.update", { oid, name: userName }, `${rules.length} chars`);

  return ok({ rules, enumAliases });
}

// ── Router ──────────────────────────────────────────────────────────────────

async function apiRulesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleGet(req);
  if (req.method === "PUT") return handlePut(req);
  return err(405, "Method Not Allowed");
}

app.http("apiRules", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "api-rules",
  handler: withAuth(apiRulesRouter),
});
