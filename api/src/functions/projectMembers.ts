// Project membership management API for FlowForge.
//
// GET    /api/project-members?projectId={id}   — list members of a project
// POST   /api/project-members                  — add a member to a project
// PUT    /api/project-members/{id}             — change a member's project role
// DELETE /api/project-members/{id}?projectId=  — remove a member from a project

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getUserInfo, parseClientPrincipal, lookupUser, isSuperOwner, lookupProjectMember } from "../lib/auth";
import type { ProjectMemberDocument, ProjectRole, UserDocument } from "../lib/auth";
import { getProjectMembersContainer, getProjectsContainer, getUsersContainer } from "../lib/cosmosClient";
import { audit } from "../lib/auditLog";

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

const VALID_ROLES: ProjectRole[] = ["owner", "qa_manager", "qa_engineer"];

/** Check if caller can manage members (Super Owner, or project-level owner/qa_manager). */
async function canManageMembers(
  oid: string, displayName: string, email: string, projectId: string, requireOwner = false,
): Promise<{ allowed: boolean; reason?: string }> {
  if (await isSuperOwner(oid, displayName, email)) return { allowed: true };
  const member = await lookupProjectMember(oid, projectId);
  if (!member) return { allowed: false, reason: "no_project_access" };
  if (requireOwner && member.role !== "owner") return { allowed: false, reason: "project_owner_required" };
  if (!requireOwner && member.role !== "owner" && member.role !== "qa_manager") {
    return { allowed: false, reason: "insufficient_project_role" };
  }
  return { allowed: true };
}

// ── GET /api/project-members?projectId={id} ─────────────────────────────────
async function handleList(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = req.query.get("projectId");
    if (!projectId) return err(400, "projectId query param is required");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Must be Super Owner or a member of this project to see members
    const superOwner = await isSuperOwner(oid, userName, email);
    if (!superOwner) {
      const member = await lookupProjectMember(oid, projectId);
      if (!member) return err(403, "No access to this project");
    }

    const container = await getProjectMembersContainer();
    const { resources } = await container.items.query<ProjectMemberDocument>({
      query: "SELECT * FROM c WHERE c.projectId = @pid ORDER BY c.displayName",
      parameters: [{ name: "@pid", value: projectId }],
    }).fetchAll();

    const clean = resources.map((m) => {
      const { _rid, _self, _etag, _attachments, _ts, ...rest } = m as unknown as Record<string, unknown>;
      return rest;
    });
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── POST /api/project-members ───────────────────────────────────────────────
// Add a user to a project by email + role.
async function handleAdd(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const body = (await req.json()) as { projectId?: string; email?: string; role?: string; displayName?: string };
    const projectId = body.projectId?.trim();
    const email = body.email?.trim().toLowerCase();
    const role = body.role as ProjectRole | undefined;
    const displayName = body.displayName?.trim() ?? email?.split("@")[0] ?? "";

    if (!projectId || !email || !role) return err(400, "projectId, email, and role are required");
    if (!VALID_ROLES.includes(role)) return err(400, "Invalid role");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const callerEmail = principal?.userDetails ?? "";

    // Only project owner (or Super Owner) can add members
    const access = await canManageMembers(oid, userName, callerEmail, projectId, true);
    if (!access.allowed) return err(403, access.reason ?? "Access denied");

    const container = await getProjectMembersContainer();

    // Check if already a member (query by email since we may not know their OID yet)
    const { resources: existing } = await container.items.query<ProjectMemberDocument>({
      query: "SELECT * FROM c WHERE c.projectId = @pid AND c.email = @email",
      parameters: [
        { name: "@pid", value: projectId },
        { name: "@email", value: email },
      ],
    }).fetchAll();

    if (existing.length > 0) return err(409, "User is already a member of this project");

    const now = new Date().toISOString();
    // Use a placeholder userId for invited members (will be replaced on first login)
    const placeholderUserId = `invite_${Date.now()}`;
    const doc: ProjectMemberDocument = {
      id: `${placeholderUserId}_${projectId}`,
      projectId,
      userId: placeholderUserId,
      email,
      displayName,
      role,
      status: "invited",
      addedBy: oid,
      addedAt: now,
      updatedAt: now,
    };

    await container.items.create(doc);

    // Auto-create tenant-level user doc with "member" role if they don't exist yet.
    // This lets project owners invite people without needing a Super Owner to pre-register them.
    try {
      const usersContainer = await getUsersContainer();
      const { resources: existingUsers } = await usersContainer.items.query<UserDocument>({
        query: "SELECT * FROM c WHERE c.tenantId = @tid AND c.email = @email",
        parameters: [
          { name: "@tid", value: "kovai" },
          { name: "@email", value: email },
        ],
      }).fetchAll();
      if (existingUsers.length === 0) {
        const userDoc: UserDocument = {
          id: `invite_${Date.now()}`,
          tenantId: "kovai",
          type: "user",
          email,
          displayName,
          role: "member",
          status: "invited",
          invitedBy: oid,
          invitedAt: now,
          updatedAt: now,
          updatedBy: oid,
        };
        await usersContainer.items.create(userDoc);
      }
    } catch (e) {
      // Best-effort — project membership is already saved
      console.warn("[projectMembers] auto-create user doc failed:", e instanceof Error ? e.message : String(e));
    }

    // Increment member count on project
    try {
      const projContainer = await getProjectsContainer();
      const { resource: proj } = await projContainer.item(projectId, "kovai").read<{ memberCount?: number }>();
      if (proj) {
        (proj as unknown as Record<string, unknown>).memberCount = ((proj.memberCount ?? 0) + 1);
        await projContainer.item(projectId, "kovai").replace(proj);
      }
    } catch { /* best-effort */ }

    audit(projectId, "project.member_add", { oid, name: userName }, email, { role });

    const { _rid, _self, _etag, _attachments, _ts, ...clean } = doc as unknown as Record<string, unknown>;
    return ok(clean, 201);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/project-members/{id} ───────────────────────────────────────────
// Change a member's role within a project.
async function handleRoleChange(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const memberId = extractIdFromPath(req);
    if (!memberId) return err(400, "Member ID is required");

    const body = (await req.json()) as { projectId?: string; role?: string };
    const projectId = body.projectId?.trim();
    const newRole = body.role as ProjectRole | undefined;
    if (!projectId) return err(400, "projectId is required");
    if (!newRole || !VALID_ROLES.includes(newRole)) return err(400, "Invalid role");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Only project owner (or Super Owner) can change roles
    const access = await canManageMembers(oid, userName, email, projectId, true);
    if (!access.allowed) return err(403, access.reason ?? "Access denied");

    const container = await getProjectMembersContainer();
    const { resource } = await container.item(memberId, projectId).read<ProjectMemberDocument>();
    if (!resource) return err(404, "Member not found");

    // Prevent removing last project owner
    if (resource.role === "owner" && newRole !== "owner") {
      const { resources: owners } = await container.items.query<ProjectMemberDocument>({
        query: "SELECT c.id FROM c WHERE c.projectId = @pid AND c.role = 'owner' AND c.status = 'active'",
        parameters: [{ name: "@pid", value: projectId }],
      }).fetchAll();
      if (owners.length <= 1) return err(400, "Cannot change role — at least one project owner is required");
    }

    const previousRole = resource.role;
    resource.role = newRole;
    resource.updatedAt = new Date().toISOString();
    await container.item(memberId, projectId).replace(resource);

    audit(projectId, "project.member_role_change", { oid, name: userName }, resource.email, { previousRole, newRole });

    const { _rid, _self, _etag, _attachments, _ts, ...clean } = resource as unknown as Record<string, unknown>;
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── DELETE /api/project-members/{id}?projectId= ────────────────────────────
async function handleRemove(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const memberId = extractIdFromPath(req);
    if (!memberId) return err(400, "Member ID is required");

    const projectId = req.query.get("projectId");
    if (!projectId) return err(400, "projectId query param is required");

    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Only project owner (or Super Owner) can remove members
    const access = await canManageMembers(oid, userName, email, projectId, true);
    if (!access.allowed) return err(403, access.reason ?? "Access denied");

    const container = await getProjectMembersContainer();
    const { resource } = await container.item(memberId, projectId).read<ProjectMemberDocument>();
    if (!resource) return err(404, "Member not found");

    // Prevent removing last owner
    if (resource.role === "owner") {
      const { resources: owners } = await container.items.query<ProjectMemberDocument>({
        query: "SELECT c.id FROM c WHERE c.projectId = @pid AND c.role = 'owner' AND c.status = 'active'",
        parameters: [{ name: "@pid", value: projectId }],
      }).fetchAll();
      if (owners.length <= 1) return err(400, "Cannot remove the last project owner");
    }

    await container.item(memberId, projectId).delete();

    // Decrement member count
    try {
      const projContainer = await getProjectsContainer();
      const { resource: proj } = await projContainer.item(projectId, "kovai").read<{ memberCount?: number }>();
      if (proj) {
        (proj as unknown as Record<string, unknown>).memberCount = Math.max(0, ((proj.memberCount ?? 1) - 1));
        await projContainer.item(projectId, "kovai").replace(proj);
      }
    } catch { /* best-effort */ }

    audit(projectId, "project.member_remove", { oid, name: userName }, resource.email, { role: resource.role });

    return ok({ removed: true, id: memberId });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

function extractIdFromPath(req: HttpRequest): string | null {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("project-members");
  return idx >= 0 && segments[idx + 1] ? segments[idx + 1] : null;
}

// ── Routers ─────────────────────────────────────────────────────────────────

async function membersRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleList(req);
  if (req.method === "POST") return handleAdd(req);
  return err(405, "Method Not Allowed");
}

async function membersItemRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "PUT") return handleRoleChange(req);
  if (req.method === "DELETE") return handleRemove(req);
  return err(405, "Method Not Allowed");
}

// ── Registration ────────────────────────────────────────────────────────────

app.http("projectMembers", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "project-members",
  handler: withAuth(membersRouter),
});

app.http("projectMembersItem", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "project-members/{id}",
  handler: withAuth(membersItemRouter),
});
