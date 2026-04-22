// Project management API for FlowForge.
//
// GET    /api/projects          — list all projects for the tenant
// POST   /api/projects          — create a new project
// PUT    /api/projects/{id}     — update project name/description
// DELETE /api/projects/{id}     — permanently delete project + all resources

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, withRole, getUserInfo, lookupUser, parseClientPrincipal, isSuperOwner, lookupProjectMember } from "../lib/auth";
import type { ProjectMemberDocument } from "../lib/auth";
import {
  getProjectsContainer, getProjectMembersContainer, getFlowsContainer,
  getIdeasContainer, getTestRunsContainer, getAuditLogContainer,
  getFlowChatSessionsContainer, getApiKeysContainer, getSettingsContainer,
} from "../lib/cosmosClient";
import { listBlobs, deleteBlob } from "../lib/blobClient";
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
  visibility: "team" | "personal";
  memberCount: number;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

// ── GET /api/projects ───────────────────────────────────────────────────────
// Super Owners see all active projects. Others see only projects they are members of.
// Auto-seeds a default project on first access if there's an existing projectId.
async function handleList(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";
    const superOwner = await isSuperOwner(oid, userName, email);

    const container = await getProjectsContainer();
    const { resources: allProjects } = await container.items.query<ProjectDocument>({
      query: "SELECT * FROM c WHERE c.tenantId = @tid AND c.status = 'active' ORDER BY c.name",
      parameters: [{ name: "@tid", value: TENANT_ID }],
    }).fetchAll();

    // Auto-backfill: if no projects exist but an existing projectId is in use,
    // create a default project doc using that ID so existing data stays linked.
    if (allProjects.length === 0) {
      const existingPid = req.headers.get("x-flowforge-projectid");
      if (existingPid) {
        const now = new Date().toISOString();
        const seedDoc: ProjectDocument = {
          id: existingPid,
          tenantId: TENANT_ID,
          type: "project",
          name: "Default Project",
          description: "Auto-created from existing data",
          visibility: "team",
          memberCount: 1,
          status: "active",
          createdBy: oid,
          createdAt: now,
          updatedBy: oid,
          updatedAt: now,
        };
        await container.items.upsert(seedDoc);
        allProjects.push(seedDoc);

        // Also create membership for the creator
        const membersContainer = await getProjectMembersContainer();
        const memberDoc: ProjectMemberDocument = {
          id: `${oid}_${existingPid}`,
          projectId: existingPid,
          userId: oid,
          email,
          displayName: userName,
          role: "owner",
          status: "active",
          addedBy: "system",
          addedAt: now,
          updatedAt: now,
        };
        await membersContainer.items.upsert(memberDoc);
      }
    }

    let projects: ProjectDocument[];

    if (superOwner) {
      // Super Owner sees everything
      projects = allProjects;
    } else {
      // Non-super-owners: find their memberships and filter
      const membersContainer = await getProjectMembersContainer();
      const { resources: memberships } = await membersContainer.items.query<ProjectMemberDocument>({
        query: "SELECT c.projectId FROM c WHERE c.userId = @uid AND c.status = 'active'",
        parameters: [{ name: "@uid", value: oid }],
      }).fetchAll();
      const memberProjectIds = new Set(memberships.map((m) => m.projectId));
      projects = allProjects.filter((p) => memberProjectIds.has(p.id));
    }

    const clean = projects.map((u) => {
      const { _rid, _self, _etag, _attachments, _ts, ...rest } = u as unknown as Record<string, unknown>;
      return rest;
    });
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── POST /api/projects ──────────────────────────────────────────────────────
// Any registered user can create a project. The creator becomes the project owner.
async function handleCreate(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    const body = (await req.json()) as { name?: string; description?: string; visibility?: string };
    const name = body.name?.trim();
    if (!name) return err(400, "name is required");

    const visibility = body.visibility === "personal" ? "personal" as const : "team" as const;

    const now = new Date().toISOString();
    const projectId = randomUUID();
    const doc: ProjectDocument = {
      id: projectId,
      tenantId: TENANT_ID,
      type: "project",
      name,
      description: body.description?.trim() ?? "",
      visibility,
      memberCount: 1,
      status: "active",
      createdBy: oid,
      createdAt: now,
      updatedBy: oid,
      updatedAt: now,
    };

    const container = await getProjectsContainer();
    await container.items.create(doc);

    // Auto-add creator as project owner
    const membersContainer = await getProjectMembersContainer();
    const memberDoc: ProjectMemberDocument = {
      id: `${oid}_${projectId}`,
      projectId,
      userId: oid,
      email,
      displayName: userName,
      role: "owner",
      status: "active",
      addedBy: "system",
      addedAt: now,
      updatedAt: now,
    };
    await membersContainer.items.create(memberDoc);

    audit(projectId, "project.create", { oid, name: userName }, doc.name, { visibility });

    const { _rid, _self, _etag, _attachments, _ts, ...clean } = doc as unknown as Record<string, unknown>;
    return ok(clean, 201);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/projects/{id} ──────────────────────────────────────────────────
// Requires Super Owner or project-level owner.
async function handleUpdate(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = extractIdFromPath(req);
    if (!projectId) return err(400, "Project ID is required");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Access check: Super Owner or project owner
    const superOwnerFlag = await isSuperOwner(oid, userName, email);
    if (!superOwnerFlag) {
      const member = await lookupProjectMember(oid, projectId);
      if (!member || member.role !== "owner") {
        return err(403, "Only project owners can update projects");
      }
    }

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

// ── DELETE /api/projects/{id} — hard-delete with full cleanup ────────────────
// Deletes the project and ALL related resources: blobs, flows, ideas, test-runs,
// audit-log, chat sessions, api-keys, and project-members.
// Requires Super Owner or project-level owner.
async function handleDelete(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = extractIdFromPath(req);
    if (!projectId) return err(400, "Project ID is required");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Access check: Super Owner or project owner
    const superOwnerFlag = await isSuperOwner(oid, userName, email);
    if (!superOwnerFlag) {
      const member = await lookupProjectMember(oid, projectId);
      if (!member || member.role !== "owner") {
        return err(403, "Only project owners can delete projects");
      }
    }

    const projContainer = await getProjectsContainer();
    const { resource } = await projContainer.item(projectId, TENANT_ID).read<ProjectDocument>();
    if (!resource) return err(404, "Project not found");

    const deleted: Record<string, number> = {};

    // ── Clean up Cosmos containers (all project-partitioned data) ──
    const cosmosCleanups: Array<{ name: string; getter: () => Promise<import("@azure/cosmos").Container> }> = [
      { name: "flows", getter: getFlowsContainer },
      { name: "ideas", getter: getIdeasContainer },
      { name: "test-runs", getter: getTestRunsContainer },
      { name: "audit-log", getter: getAuditLogContainer },
      { name: "flow-chat-sessions", getter: getFlowChatSessionsContainer },
      { name: "api-keys", getter: getApiKeysContainer },
      { name: "project-members", getter: getProjectMembersContainer },
    ];

    for (const { name, getter } of cosmosCleanups) {
      try {
        const container = await getter();
        const { resources: docs } = await container.items.query<{ id: string }>({
          query: "SELECT c.id FROM c WHERE c.projectId = @pid",
          parameters: [{ name: "@pid", value: projectId }],
        }).fetchAll();
        let count = 0;
        for (const doc of docs) {
          try {
            await container.item(doc.id, projectId).delete();
            count++;
          } catch { /* skip individual failures */ }
        }
        deleted[name] = count;
      } catch { deleted[name] = 0; }
    }

    // ── Clean up blob storage (spec-files under projectId/ prefix) ──
    try {
      const blobs = await listBlobs(`${projectId}/`);
      let blobCount = 0;
      for (const blob of blobs) {
        try {
          await deleteBlob(blob.name);
          blobCount++;
        } catch { /* skip */ }
      }
      deleted["spec-files"] = blobCount;
    } catch { deleted["spec-files"] = 0; }

    // ── Delete the project document itself ──
    await projContainer.item(projectId, TENANT_ID).delete();
    deleted["project"] = 1;

    // Return 200 with body (not 204 — Azure Functions 204 body bug)
    return ok({ deleted: true, id: projectId, cleanup: deleted });
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
  if (req.method === "POST") return handleCreate(req);
  return err(405, "Method Not Allowed");
}

async function projectsItemRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "PUT") return handleUpdate(req);
  if (req.method === "DELETE") return handleDelete(req);
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

// PUT/DELETE /api/projects/{id} — access checked inside handlers (Super Owner or project owner)
app.http("projectsItem", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "projects/{id}",
  handler: withAuth(projectsItemRouter),
});
