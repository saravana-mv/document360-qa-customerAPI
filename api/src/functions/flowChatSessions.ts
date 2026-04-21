import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFlowChatSessionsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";

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

interface ChatSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  plan?: unknown;
}

interface FlowChatSessionDocument {
  id: string;
  projectId: string;
  type: "flow_chat_session";
  userId: string;
  title: string;
  messages: ChatSessionMessage[];
  confirmedPlan: unknown | null;
  totalCost: number;
  specFiles: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: { oid: string; name: string };
}

/** GET /api/flow-chat-sessions — list sessions for current user (most recent first)
 *  GET /api/flow-chat-sessions?id=<sessionId> — get a single session */
async function getSessions(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const sessionId = req.query.get("id");
    const container = await getFlowChatSessionsContainer();

    if (sessionId) {
      try {
        const { resource } = await container.item(sessionId, projectId).read<FlowChatSessionDocument>();
        if (!resource || resource.userId !== user.oid) return err(404, "Session not found");
        return ok(resource);
      } catch {
        return err(404, "Session not found");
      }
    }

    // List all sessions for this user, most recent first
    const query = `SELECT c.id, c.title, c.totalCost, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.messages) AS messageCount FROM c WHERE c.type="flow_chat_session" AND c.projectId=@pid AND c.userId=@uid ORDER BY c.updatedAt DESC`;
    const { resources } = await container.items.query<{
      id: string; title: string; totalCost: number; createdAt: string; updatedAt: string; messageCount: number;
    }>({ query, parameters: [
      { name: "@pid", value: projectId },
      { name: "@uid", value: user.oid },
    ] }, { partitionKey: projectId }).fetchAll();

    return ok(resources);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** POST /api/flow-chat-sessions — create a new session */
async function createSession(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      id: string;
      title: string;
      messages: ChatSessionMessage[];
      confirmedPlan?: unknown;
      totalCost?: number;
      specFiles?: string[];
    };
    if (!body.id || !body.title) return err(400, "id and title are required");

    const now = new Date().toISOString();
    const doc: FlowChatSessionDocument = {
      id: body.id,
      projectId,
      type: "flow_chat_session",
      userId: user.oid,
      title: body.title,
      messages: body.messages ?? [],
      confirmedPlan: body.confirmedPlan ?? null,
      totalCost: body.totalCost ?? 0,
      specFiles: body.specFiles ?? [],
      createdAt: now,
      updatedAt: now,
      createdBy: { oid: user.oid, name: user.name },
    };

    const container = await getFlowChatSessionsContainer();
    await container.items.create(doc);
    return ok(doc);
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** PUT /api/flow-chat-sessions — update an existing session (upsert messages, cost, plan) */
async function updateSession(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as {
      id: string;
      title?: string;
      messages?: ChatSessionMessage[];
      confirmedPlan?: unknown;
      totalCost?: number;
      specFiles?: string[];
    };
    if (!body.id) return err(400, "id is required");

    const container = await getFlowChatSessionsContainer();

    // Read existing to verify ownership
    let existing: FlowChatSessionDocument | undefined;
    try {
      const { resource } = await container.item(body.id, projectId).read<FlowChatSessionDocument>();
      existing = resource;
    } catch {
      return err(404, "Session not found");
    }
    if (!existing || existing.userId !== user.oid) return err(404, "Session not found");

    // Merge updates
    const updated: FlowChatSessionDocument = {
      ...existing,
      title: body.title ?? existing.title,
      messages: body.messages ?? existing.messages,
      confirmedPlan: body.confirmedPlan !== undefined ? body.confirmedPlan : existing.confirmedPlan,
      totalCost: body.totalCost ?? existing.totalCost,
      specFiles: body.specFiles ?? existing.specFiles,
      updatedAt: new Date().toISOString(),
    };

    await container.items.upsert(updated);
    return ok({ saved: true, id: body.id });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

/** DELETE /api/flow-chat-sessions?id=<sessionId> */
async function deleteSession(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const sessionId = req.query.get("id");
    if (!sessionId) return err(400, "id query param is required");

    const container = await getFlowChatSessionsContainer();

    // Verify ownership before deleting
    try {
      const { resource } = await container.item(sessionId, projectId).read<FlowChatSessionDocument>();
      if (!resource || resource.userId !== user.oid) return err(404, "Session not found");
    } catch {
      return ok({ deleted: true, id: sessionId }); // idempotent
    }

    try {
      await container.item(sessionId, projectId).delete();
    } catch {
      // idempotent
    }
    return ok({ deleted: true, id: sessionId });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function flowChatSessionsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return getSessions(req);
    case "POST":    return createSession(req);
    case "PUT":     return updateSession(req);
    case "DELETE":  return deleteSession(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("flowChatSessions", {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "flow-chat-sessions",
  handler: withAuth(flowChatSessionsRouter),
});
