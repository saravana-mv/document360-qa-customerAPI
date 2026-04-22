// Project management API for FlowForge.
//
// GET    /api/projects          — list all projects for the tenant
// POST   /api/projects          — create a new project
// PUT    /api/projects/{id}     — update project name/description
// DELETE /api/projects/{id}     — archive a project (soft-delete)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, withRole, getUserInfo, lookupUser, parseClientPrincipal } from "../lib/auth";
import { getProjectsContainer } from "../lib/cosmosClient";
import { audit } from "../lib/auditLog";
import { randomUUID } from "node:crypto";

const TENANT_ID = "kovai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

interface ProjectDocument {
  id: string;
  tenantId: string;
  type: "project";
  name: string;
  description: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

// ── GET /api/projects ───────────────────────────────────────────────────────
// Auto-seeds a default project on first access if there's an existing projectId
// in the request header (from settings). This migrates existing data seamlessly.
async function handleList(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const container = await getProjectsContainer();
    const { resources } = await container.items.query<ProjectDocument>({
      query: "SELECT * FROM c WHERE c.tenantId = @tid AND c.status = 'active' ORDER BY c.name",
      parameters: [{ name: "@tid", value: TENANT_ID }],
    }).fetchAll();

    // Auto-backfill: if no projects exist but an existing projectId is in use,
    // create a default project doc using that ID so existing data stays linked.
    if (resources.length === 0) {
      const existingPid = req.headers.get("x-flowforge-projectid");
      if (existingPid) {
        const { oid } = getUserInfo(req);
        const now = new Date().toISOString();
        const seedDoc: ProjectDocument = {
          id: existingPid,
          tenantId: TENANT_ID,
          type: "project",
          name: "Default Project",
          description: "Auto-created from existing data",
          status: "active",
          createdBy: oid,
          createdAt: now,
          updatedBy: oid,
          updatedAt: now,
        };
        await container.items.upsert(seedDoc);
        resources.push(seedDoc);
      }
    }

    const clean = resources.map((u) => {
      const { _rid, _self, _etag, _attachments, _ts, ...rest } = u as unknown as Record<string, unknown>;
      return rest;
    });
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── POST /api/projects ──────────────────────────────────────────────────────
async function handleCreate(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const { oid } = getUserInfo(req);
    const body = (await req.json()) as { name?: string; description?: string };
    const name = body.name?.trim();
    if (!name) return err(400, "name is required");

    const now = new Date().toISOString();
    const doc: ProjectDocument = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      type: "project",
      name,
      description: body.description?.trim() ?? "",
      status: "active",
      createdBy: oid,
      createdAt: now,
      updatedBy: oid,
      updatedAt: now,
    };

    const container = await getProjectsContainer();
    await container.items.create(doc);

    audit(doc.id, "project.create", { oid, name: "System" }, doc.name, { projectId: doc.id });

    const { _rid, _self, _etag, _attachments, _ts, ...clean } = doc as unknown as Record<string, unknown>;
    return ok(clean, 201);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/projects/{id} ──────────────────────────────────────────────────
async function handleUpdate(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = extractIdFromPath(req);
    if (!projectId) return err(400, "Project ID is required");

    const { oid } = getUserInfo(req);
    const body = (await req.json()) as { name?: string; description?: string };

    const container = await getProjectsContainer();
    const { resource } = await container.item(projectId, TENANT_ID).read<ProjectDocument>();
    if (!resource || resource.status === "archived") return err(404, "Project not found");

    const previousName = resource.name;
    if (body.name?.trim()) resource.name = body.name.trim();
    if (body.description !== undefined) resource.description = body.description.trim();
    resource.updatedBy = oid;
    resource.updatedAt = new Date().toISOString();

    await container.item(projectId, TENANT_ID).replace(resource);

    audit(projectId, "project.update", { oid, name: "System" }, resource.name, { previousName, newName: resource.name });

    const { _rid, _self, _etag, _attachments, _ts, ...clean } = resource as unknown as Record<string, unknown>;
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── DELETE /api/projects/{id} — soft-delete (archive) ───────────────────────
async function handleArchive(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = extractIdFromPath(req);
    if (!projectId) return err(400, "Project ID is required");

    const { oid } = getUserInfo(req);
    const container = await getProjectsContainer();
    const { resource } = await container.item(projectId, TENANT_ID).read<ProjectDocument>();
    if (!resource) return err(404, "Project not found");
    if (resource.status === "archived") return err(400, "Project is already archived");

    resource.status = "archived";
    resource.updatedBy = oid;
    resource.updatedAt = new Date().toISOString();
    await container.item(projectId, TENANT_ID).replace(resource);

    audit(projectId, "project.archive", { oid, name: "System" }, resource.name);

    // Return 200 with body (not 204 — Azure Functions 204 body bug)
    return ok({ archived: true, id: projectId });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

function extractIdFromPath(req: HttpRequest): string | null {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // Pattern: /api/projects/{id}
  const idx = segments.indexOf("projects");
  return idx >= 0 && segments[idx + 1] ? segments[idx + 1] : null;
}

// ── Router ──────────────────────────────────────────────────────────────────

async function projectsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleList(req);
  if (req.method === "POST") {
    // Owner-only for creating projects
    const principal = parseClientPrincipal(req);
    if (principal) {
      const user = await lookupUser(principal.userId, principal.userDetails ?? "Unknown", principal.userDetails ?? "");
      if (!user || user.role !== "owner") {
        return err(403, "Only owners can create projects");
      }
    }
    return handleCreate(req);
  }
  return err(405, "Method Not Allowed");
}

async function projectsItemRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "PUT") return handleUpdate(req);
  if (req.method === "DELETE") return handleArchive(req);
  return err(405, "Method Not Allowed");
}

// ── Registration ────────────────────────────────────────────────────────────

// Single router for /api/projects — GET open to all auth'd users, POST owner-only
app.http("projects", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "projects",
  handler: withAuth(projectsRouter),
});

// PUT/DELETE /api/projects/{id} — owner only
app.http("projectsItem", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "projects/{id}",
  handler: withRole(["owner"], projectsItemRouter),
});
