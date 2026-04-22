import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getUsersContainer } from "../lib/cosmosClient";
import { withAuth, withRole, getUserInfo, lookupUser, type UserDocument, type AppRole } from "../lib/auth";
import { audit } from "../lib/auditLog";

const TENANT_ID = "kovai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(body: unknown): HttpResponseInit {
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

// ── GET /api/users/me ───────────────────────────────────────────────────────
// Called by frontend after Entra auth. Returns user doc or 403.
// This endpoint only needs withAuth (NOT withRole — it IS the registration check).

async function getMe(req: HttpRequest): Promise<HttpResponseInit> {
  const { oid, name } = getUserInfo(req);
  const principal = (() => {
    const header = req.headers.get("x-ms-client-principal");
    if (!header) return null;
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { userDetails?: string; claims?: Array<{ typ: string; val: string }> };
    } catch { return null; }
  })();
  const email = principal?.userDetails ?? "";

  const user = await lookupUser(oid, name, email);
  if (!user) {
    return { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: "not_registered", displayName: name, email }) };
  }

  const { _rid, _self, _etag, _attachments, _ts, ...clean } = user as Record<string, unknown>;
  return ok(clean);
}

// ── GET /api/users ──────────────────────────────────────────────────────────
// Owner only — list all users.

async function listUsers(_req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const container = await getUsersContainer();
    const { resources } = await container.items.query<UserDocument>({
      query: "SELECT * FROM c WHERE c.tenantId = @tid ORDER BY c.displayName",
      parameters: [{ name: "@tid", value: TENANT_ID }],
    }).fetchAll();

    const clean = resources.map((u) => {
      const { _rid, _self, _etag, _attachments, _ts, ...rest } = u as Record<string, unknown>;
      return rest;
    });
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── POST /api/users/invite ──────────────────────────────────────────────────
// Owner only — invite a user by email + role.

async function inviteUser(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const { oid } = getUserInfo(req);
    const body = (await req.json()) as { email?: string; role?: string };
    const email = body.email?.trim().toLowerCase();
    const role = body.role as AppRole | undefined;

    if (!email || !role) return err(400, "email and role are required");
    if (!["owner", "project_owner", "qa_manager", "qa_engineer", "member"].includes(role)) return err(400, "Invalid role");

    const container = await getUsersContainer();

    // Check if already exists
    const { resources: existing } = await container.items.query({
      query: "SELECT * FROM c WHERE c.tenantId = @tid AND c.email = @email",
      parameters: [
        { name: "@tid", value: TENANT_ID },
        { name: "@email", value: email },
      ],
    }).fetchAll();

    if (existing.length > 0) return err(409, "User already exists or has a pending invite");

    const now = new Date().toISOString();
    const doc: UserDocument = {
      id: `invite_${Date.now()}`,  // placeholder — replaced with real OID on accept
      tenantId: TENANT_ID,
      type: "user",
      email,
      displayName: email.split("@")[0],
      role,
      status: "invited",
      invitedBy: oid,
      invitedAt: now,
      updatedAt: now,
      updatedBy: oid,
    };

    await container.items.create(doc);
    audit("system", "user.invite", { oid, name: "System" }, email, { role });
    const { _rid, _self, _etag, _attachments, _ts, ...clean } = doc as Record<string, unknown>;
    return { status: 201, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(clean) };
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/users/:id/role ─────────────────────────────────────────────────
// Owner only — change a user's role.

async function changeRole(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const userId = req.params.id;
    if (!userId) return err(400, "User ID is required");

    const { oid } = getUserInfo(req);
    const body = (await req.json()) as { role?: string };
    const role = body.role as AppRole | undefined;
    if (!role || !["owner", "project_owner", "qa_manager", "qa_engineer", "member"].includes(role)) return err(400, "Invalid role");

    const container = await getUsersContainer();
    const { resource } = await container.item(userId, TENANT_ID).read<UserDocument>();
    if (!resource) return err(404, "User not found");

    // Prevent removing the last owner
    if (resource.role === "owner" && role !== "owner") {
      const { resources: owners } = await container.items.query<UserDocument>({
        query: "SELECT c.id FROM c WHERE c.tenantId = @tid AND c.role = 'owner' AND c.status != 'disabled'",
        parameters: [{ name: "@tid", value: TENANT_ID }],
      }).fetchAll();
      if (owners.length <= 1) {
        return err(400, "Cannot change role — at least one owner is required");
      }
    }

    const previousRole = resource.role;
    resource.role = role;
    resource.updatedAt = new Date().toISOString();
    resource.updatedBy = oid;
    await container.item(userId, TENANT_ID).replace(resource);

    audit("system", "user.role_change", { oid, name: "System" }, resource.email, { previousRole, newRole: role });
    const { _rid, _self, _etag, _attachments, _ts, ...clean } = resource as Record<string, unknown>;
    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── DELETE /api/users/:id ───────────────────────────────────────────────────
// Owner only — remove a user.

async function removeUser(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const userId = req.params.id;
    if (!userId) return err(400, "User ID is required");

    const { oid } = getUserInfo(req);
    if (userId === oid) return err(400, "Cannot remove yourself");

    const container = await getUsersContainer();

    // Check if removing an owner — prevent if last one
    const { resource } = await container.item(userId, TENANT_ID).read<UserDocument>();
    if (resource?.role === "owner") {
      const { resources: owners } = await container.items.query<UserDocument>({
        query: "SELECT c.id FROM c WHERE c.tenantId = @tid AND c.role = 'owner' AND c.status != 'disabled'",
        parameters: [{ name: "@tid", value: TENANT_ID }],
      }).fetchAll();
      if (owners.length <= 1) {
        return err(400, "Cannot remove the last owner");
      }
    }

    await container.item(userId, TENANT_ID).delete();
    audit("system", "user.remove", { oid, name: "System" }, userId, resource ? { email: resource.email, role: resource.role } : undefined);
    return { status: 204, headers: CORS_HEADERS };
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

async function usersRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/users\/?/, "");

  // GET /api/users/me — special, only needs withAuth (handled separately)
  if (req.method === "GET" && path === "me") {
    return getMe(req);
  }

  // All other endpoints require owner role — checked by the registered handler
  if (req.method === "GET" && (path === "" || path === "/")) return listUsers(req);
  if (req.method === "POST" && path === "invite") return inviteUser(req);

  // Routes with :id parameter
  const roleMatch = path.match(/^([^/]+)\/role$/);
  if (req.method === "PUT" && roleMatch) {
    req.params = { ...req.params, id: roleMatch[1] };
    return changeRole(req);
  }

  // DELETE /api/users/:id
  if (req.method === "DELETE" && path && !path.includes("/")) {
    req.params = { ...req.params, id: path };
    return removeUser(req);
  }

  return err(404, "Not found");
}

// /api/users/me needs only withAuth (it IS the access check)
app.http("usersMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/me",
  handler: withAuth(async (req, ctx) => getMe(req)),
});

// All management endpoints need owner role
app.http("users", {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/{*restOfPath}",
  handler: withRole(["owner"], usersRouter),
});

// List users (exact /api/users path)
app.http("usersList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users",
  handler: withRole(["owner"], async (req, _ctx) => {
    if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
    return listUsers(req);
  }),
});
