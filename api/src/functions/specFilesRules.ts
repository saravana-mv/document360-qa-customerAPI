// Version-folder-level API Rules stored as _rules.json blobs.
//
// GET  /api/spec-files/rules?folder=v2     — read rules for a version folder
// PUT  /api/spec-files/rules               — save rules { folder, rules, enumAliases }

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getProjectId, getUserInfo, lookupProjectMember, isSuperOwner, parseClientPrincipal } from "../lib/auth";
import { downloadBlob, uploadBlob } from "../lib/blobClient";
import { audit } from "../lib/auditLog";

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

/** GET /api/spec-files/rules?folder=v2 */
async function handleGet(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

  const folder = req.query.get("folder");
  if (!folder?.trim()) return err(400, "folder query param is required");

  try {
    const blobPath = `${projectId}/${folder.trim()}/_rules.json`;
    const content = await downloadBlob(blobPath);
    const data = JSON.parse(content) as { rules?: string; enumAliases?: string };
    return ok({ rules: data.rules ?? "", enumAliases: data.enumAliases ?? "" });
  } catch {
    return ok({ rules: "", enumAliases: "" });
  }
}

/** PUT /api/spec-files/rules — body { folder, rules, enumAliases } */
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

  let body: { folder?: string; rules?: string; enumAliases?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (!body.folder?.trim()) return err(400, "folder is required");

  const folder = body.folder.trim();
  const rules = typeof body.rules === "string" ? body.rules : "";
  const enumAliases = typeof body.enumAliases === "string" ? body.enumAliases : "";

  const blobPath = `${projectId}/${folder}/_rules.json`;
  await uploadBlob(blobPath, JSON.stringify({ rules, enumAliases }, null, 2), "application/json");

  audit(projectId, "project.apiRules.update", { oid, name: userName }, `${folder}: ${rules.length} chars`);

  return ok({ rules, enumAliases });
}

async function specFilesRulesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleGet(req);
  if (req.method === "PUT") return handlePut(req);
  return err(405, "Method Not Allowed");
}

app.http("specFilesRules", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "spec-files/rules",
  handler: withAuth(specFilesRulesRouter),
});
