// AI credits API endpoints for FlowForge.
//
// GET    /api/ai-credits              — get project + current user credits
// PUT    /api/ai-credits/project      — update project budget (Super Owner only)
// PUT    /api/ai-credits/user/{userId} — update user budget (Super Owner only)
// GET    /api/ai-credits/users        — list all user credit docs for a project (Super Owner only)

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withAuth, getUserInfo, getProjectId, parseClientPrincipal, isSuperOwner, lookupUser } from "../lib/auth";
import {
  getProjectCredits, getUserCredits, updateProjectBudget, updateUserBudget,
  seedProjectCredits,
} from "../lib/aiCredits";
import { getAiUsageContainer } from "../lib/cosmosClient";
import type { UserCreditsDoc } from "../lib/aiCredits";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-FlowForge-ProjectId",
};

function ok(data: unknown, status = 200): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

function err(status: number, message: string): HttpResponseInit {
  return { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ error: message }) };
}

// ── GET /api/ai-credits ─────────────────────────────────────────────────────
// Returns current project + user credit status.
async function handleGetCredits(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    let projCredits = await getProjectCredits(projectId);
    if (!projCredits) {
      await seedProjectCredits(projectId, "system");
      projCredits = await getProjectCredits(projectId);
    }

    const userCredits = await getUserCredits(oid, projectId);

    return ok({
      project: projCredits ? {
        totalBudgetUsd: projCredits.totalBudgetUsd,
        usedUsd: projCredits.usedUsd,
        remainingUsd: parseFloat((projCredits.totalBudgetUsd - projCredits.usedUsd).toFixed(6)),
        callCount: projCredits.callCount,
        lastUsedAt: projCredits.lastUsedAt,
      } : null,
      user: userCredits ? {
        totalBudgetUsd: userCredits.totalBudgetUsd,
        usedUsd: userCredits.usedUsd,
        remainingUsd: parseFloat((userCredits.totalBudgetUsd - userCredits.usedUsd).toFixed(6)),
        callCount: userCredits.callCount,
        lastUsedAt: userCredits.lastUsedAt,
      } : null,
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/ai-credits/project ─────────────────────────────────────────────
async function handleUpdateProjectBudget(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    // Super Owner check
    const superOwner = await isSuperOwner(oid, userName, email);
    if (!superOwner) return err(403, "Only Super Owners can update project credit budgets");

    const body = (await req.json()) as { totalBudgetUsd?: number };
    if (typeof body.totalBudgetUsd !== "number" || body.totalBudgetUsd < 0) {
      return err(400, "totalBudgetUsd must be a non-negative number");
    }

    const updated = await updateProjectBudget(projectId, body.totalBudgetUsd, oid);
    if (!updated) return err(404, "Project credits not found");

    return ok({
      totalBudgetUsd: updated.totalBudgetUsd,
      usedUsd: updated.usedUsd,
      remainingUsd: parseFloat((updated.totalBudgetUsd - updated.usedUsd).toFixed(6)),
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── PUT /api/ai-credits/user/{userId} ───────────────────────────────────────
async function handleUpdateUserBudget(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    const superOwner = await isSuperOwner(oid, userName, email);
    if (!superOwner) return err(403, "Only Super Owners can update user credit budgets");

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const userIdx = segments.indexOf("user");
    const targetUserId = userIdx >= 0 ? segments[userIdx + 1] : null;
    if (!targetUserId) return err(400, "User ID is required in path");

    const body = (await req.json()) as { totalBudgetUsd?: number };
    if (typeof body.totalBudgetUsd !== "number" || body.totalBudgetUsd < 0) {
      return err(400, "totalBudgetUsd must be a non-negative number");
    }

    const updated = await updateUserBudget(projectId, targetUserId, body.totalBudgetUsd, oid);
    if (!updated) return err(404, "User credits not found");

    return ok({
      totalBudgetUsd: updated.totalBudgetUsd,
      usedUsd: updated.usedUsd,
      remainingUsd: parseFloat((updated.totalBudgetUsd - updated.usedUsd).toFixed(6)),
    });
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── GET /api/ai-credits/users ───────────────────────────────────────────────
// List all user credit docs for the current project (Super Owner only).
async function handleListUserCredits(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const { oid, name: userName } = getUserInfo(req);
    const principal = parseClientPrincipal(req);
    const email = principal?.userDetails ?? "";

    const superOwner = await isSuperOwner(oid, userName, email);
    if (!superOwner) return err(403, "Only Super Owners can view all user credits");

    const container = await getAiUsageContainer();
    const { resources } = await container.items.query<UserCreditsDoc>({
      query: "SELECT * FROM c WHERE c.projectId = @pid AND c.type = 'user_credits' ORDER BY c.usedUsd DESC",
      parameters: [{ name: "@pid", value: projectId }],
    }).fetchAll();

    const clean = resources.map((d) => ({
      userId: d.userId,
      displayName: d.displayName,
      totalBudgetUsd: d.totalBudgetUsd,
      usedUsd: d.usedUsd,
      remainingUsd: parseFloat((d.totalBudgetUsd - d.usedUsd).toFixed(6)),
      callCount: d.callCount,
      lastUsedAt: d.lastUsedAt,
    }));

    return ok(clean);
  } catch (e) {
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

// ── Routers ─────────────────────────────────────────────────────────────────

async function aiCreditsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleGetCredits(req);
  return err(405, "Method Not Allowed");
}

async function aiCreditsProjectRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "PUT") return handleUpdateProjectBudget(req);
  return err(405, "Method Not Allowed");
}

async function aiCreditsUserRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "PUT") return handleUpdateUserBudget(req);
  return err(405, "Method Not Allowed");
}

async function aiCreditsUsersRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  if (req.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };
  if (req.method === "GET") return handleListUserCredits(req);
  return err(405, "Method Not Allowed");
}

// ── Registration ────────────────────────────────────────────────────────────

app.http("aiCredits", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai-credits",
  handler: withAuth(aiCreditsRouter),
});

app.http("aiCreditsProject", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai-credits/project",
  handler: withAuth(aiCreditsProjectRouter),
});

app.http("aiCreditsUser", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai-credits/user/{userId}",
  handler: withAuth(aiCreditsUserRouter),
});

app.http("aiCreditsUsers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "ai-credits/users",
  handler: withAuth(aiCreditsUsersRouter),
});
