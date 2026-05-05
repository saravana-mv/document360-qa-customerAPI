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
import { uploadBlobBuffer, deleteBlob, SPEC_CONTAINER } from "../lib/blobClient";

const DOC_ID = "project_variables";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
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
  type?: "text" | "file";
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
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

/** Upload a file variable — multipart/form-data with "name" and "file" fields */
async function handleFileUpload(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

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

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err(400, "Expected multipart/form-data with 'name' and 'file' fields");
  }

  const varName = formData.get("name");
  if (!varName || typeof varName !== "string") {
    return err(400, "Missing 'name' field");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
    return err(400, `Invalid variable name: "${varName}". Must be a valid identifier.`);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return err(400, "Missing 'file' field");
  }
  if (file.size > MAX_FILE_SIZE) {
    return err(400, `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 10 MB limit`);
  }

  const fileName = file.name || "file";
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  // Store file in blob storage
  const blobPath = `${projectId}/_variables/${varName}/${fileName}`;
  await uploadBlobBuffer(blobPath, buffer, mimeType, SPEC_CONTAINER);

  // Build sentinel value
  const sentinel = `__ff_file__:${blobPath}|${fileName}|${mimeType}`;

  // Upsert the variable in Cosmos
  const container = await getSettingsContainer();
  let variables: ProjectVariable[] = [];
  try {
    const { resource } = await container.item(DOC_ID, projectId).read<ProjectVariablesDoc>();
    variables = resource?.variables ?? [];
  } catch { /* new doc */ }

  const existing = variables.find(v => v.name === varName);
  if (existing) {
    existing.value = sentinel;
    existing.type = "file";
    existing.fileName = fileName;
    existing.mimeType = mimeType;
    existing.fileSize = file.size;
  } else {
    variables.push({ name: varName, value: sentinel, type: "file", fileName, mimeType, fileSize: file.size });
  }

  const now = new Date().toISOString();
  const doc: ProjectVariablesDoc = {
    id: DOC_ID,
    userId: projectId,
    projectId,
    variables,
    updatedBy: oid,
    updatedAt: now,
  };
  await container.items.upsert(doc);

  audit(projectId, "project.variables.file.upload", { oid, name: userName }, `${varName}: ${fileName} (${(file.size / 1024).toFixed(1)} KB)`);

  const updated = variables.find(v => v.name === varName)!;
  return ok(updated);
}

/** Delete a file variable — removes blob and clears the variable entry */
async function handleFileDelete(req: HttpRequest): Promise<HttpResponseInit> {
  let projectId: string;
  try { projectId = getProjectId(req); } catch { return err(400, "Project ID header is required"); }

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

  const varName = req.params?.varName;
  if (!varName) return err(400, "Missing variable name in URL");

  const container = await getSettingsContainer();
  let variables: ProjectVariable[] = [];
  try {
    const { resource } = await container.item(DOC_ID, projectId).read<ProjectVariablesDoc>();
    variables = resource?.variables ?? [];
  } catch {
    return err(404, `Variable "${varName}" not found`);
  }

  const variable = variables.find(v => v.name === varName);
  if (!variable) return err(404, `Variable "${varName}" not found`);

  // Delete blob if it's a file variable with sentinel
  if (variable.value.startsWith("__ff_file__:")) {
    const blobPath = variable.value.slice("__ff_file__:".length).split("|")[0];
    try { await deleteBlob(blobPath, SPEC_CONTAINER); } catch { /* best-effort */ }
  }

  // Remove variable from list
  const updated = variables.filter(v => v.name !== varName);
  const now = new Date().toISOString();
  const doc: ProjectVariablesDoc = {
    id: DOC_ID,
    userId: projectId,
    projectId,
    variables: updated,
    updatedBy: oid,
    updatedAt: now,
  };
  await container.items.upsert(doc);

  audit(projectId, "project.variables.file.delete", { oid, name: userName }, varName);

  return ok({ success: true });
}

// ── Router ──────────────────────────────────────────────────────────────────

async function projectVariablesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleGet(req);
  if (req.method === "PUT") return handlePut(req);
  if (req.method === "POST") return handleFileUpload(req);
  return err(405, "Method Not Allowed");
}

async function projectVariablesFilesRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "DELETE") return handleFileDelete(req);
  return err(405, "Method Not Allowed");
}

app.http("projectVariables", {
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "project-variables",
  handler: withAuth(projectVariablesRouter),
});

app.http("projectVariablesFiles", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "project-variables/files/{varName}",
  handler: withAuth(projectVariablesFilesRouter),
});
