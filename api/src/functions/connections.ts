// CRUD for OAuth connections — generic OAuth app registrations.
//
// Connections store the OAuth configuration (auth URL, token URL, client ID,
// scopes) that FlowForge uses to authenticate against external APIs.
// Client secrets are stored but never returned to the frontend.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getConnectionsContainer } from "../lib/cosmosClient";
import { withAuth, getUserInfo, getProjectId, ProjectIdMissingError } from "../lib/auth";
import { randomUUID } from "crypto";
import { audit } from "../lib/auditLog";

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

interface ConnectionDoc {
  id: string;
  projectId: string;
  type: "connection";
  name: string;
  provider: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;          // Stored server-side, never returned to client
  scopes: string;
  redirectUri: string;
  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

/** Strip secret fields before returning to client. */
function sanitize(doc: ConnectionDoc): Omit<ConnectionDoc, "clientSecret"> & { hasSecret: boolean } {
  const { clientSecret, ...rest } = doc;
  return { ...rest, hasSecret: !!clientSecret };
}

async function listConnections(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const container = await getConnectionsContainer();
    const { resources } = await container.items
      .query<ConnectionDoc>({
        query: "SELECT * FROM c WHERE c.projectId = @pid AND c.type = 'connection' ORDER BY c.name",
        parameters: [{ name: "@pid", value: projectId }],
      })
      .fetchAll();
    return ok(resources.map(sanitize));
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function createConnection(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as Partial<ConnectionDoc>;

    if (!body.name?.trim()) return err(400, "name is required");
    if (!body.authorizationUrl?.trim()) return err(400, "authorizationUrl is required");
    if (!body.tokenUrl?.trim()) return err(400, "tokenUrl is required");
    if (!body.clientId?.trim()) return err(400, "clientId is required");

    const id = randomUUID();
    // All connections share a single callback URL — connectionId is tracked in sessionStorage
    const redirectUri = body.redirectUri?.trim() || `/callback`;

    const doc: ConnectionDoc = {
      id,
      projectId,
      type: "connection",
      name: body.name.trim(),
      provider: "oauth2",
      authorizationUrl: body.authorizationUrl.trim(),
      tokenUrl: body.tokenUrl.trim(),
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret?.trim() || undefined,
      scopes: body.scopes?.trim() ?? "",
      redirectUri,
      createdAt: new Date().toISOString(),
      createdBy: user,
      updatedAt: new Date().toISOString(),
      updatedBy: user,
    };

    const container = await getConnectionsContainer();
    await container.items.create(doc);
    audit(projectId, "connection.create", user, doc.name);
    return ok(sanitize(doc));
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function updateConnection(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const connectionId = req.params.connectionId;
    if (!connectionId) return err(400, "connectionId is required");

    const container = await getConnectionsContainer();
    let existing: ConnectionDoc;
    try {
      const { resource } = await container.item(connectionId, projectId).read<ConnectionDoc>();
      if (!resource) return err(404, "Connection not found");
      existing = resource;
    } catch {
      return err(404, "Connection not found");
    }

    const body = (await req.json()) as Partial<ConnectionDoc>;

    existing.name = body.name?.trim() || existing.name;
    existing.authorizationUrl = body.authorizationUrl?.trim() || existing.authorizationUrl;
    existing.tokenUrl = body.tokenUrl?.trim() || existing.tokenUrl;
    existing.clientId = body.clientId?.trim() || existing.clientId;
    existing.scopes = body.scopes?.trim() ?? existing.scopes;
    // Only update secret if explicitly provided (empty string clears it)
    if (body.clientSecret !== undefined) {
      existing.clientSecret = body.clientSecret.trim() || undefined;
    }
    existing.updatedAt = new Date().toISOString();
    existing.updatedBy = user;

    await container.items.upsert(existing);
    audit(projectId, "connection.update", user, existing.name);
    return ok(sanitize(existing));
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function deleteConnection(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const connectionId = req.params.connectionId;
    if (!connectionId) return err(400, "connectionId is required");

    const container = await getConnectionsContainer();
    try {
      await container.item(connectionId, projectId).delete();
    } catch {
      return err(404, "Connection not found");
    }
    const user = getUserInfo(req);
    audit(projectId, "connection.delete", user, connectionId);
    return ok({ deleted: true });
  } catch (e) {
    if (e instanceof ProjectIdMissingError) return err(400, e.message);
    return err(500, e instanceof Error ? e.message : String(e));
  }
}

async function connectionsRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "GET":     return listConnections(req);
    case "POST":    return createConnection(req);
    default:        return err(405, "Method Not Allowed");
  }
}

async function connectionItemRouter(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  switch (req.method) {
    case "OPTIONS": return { status: 204, headers: CORS_HEADERS };
    case "PUT":     return updateConnection(req);
    case "DELETE":  return deleteConnection(req);
    default:        return err(405, "Method Not Allowed");
  }
}

app.http("connections", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "connections",
  handler: withAuth(connectionsRouter),
});

app.http("connectionItem", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "connections/{connectionId}",
  handler: withAuth(connectionItemRouter),
});
