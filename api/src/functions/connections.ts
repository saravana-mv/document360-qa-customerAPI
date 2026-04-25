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

type ConnectionProvider = "oauth2" | "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie";

interface ConnectionDoc {
  id: string;
  projectId: string;
  type: "connection";
  name: string;
  provider: ConnectionProvider;

  // OAuth-specific (provider === "oauth2")
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;          // Stored server-side, never returned to client
  scopes?: string;
  redirectUri?: string;

  // Token-based (all non-oauth providers)
  credential?: string;            // Stored server-side, never returned to client
  authHeaderName?: string;        // For apikey_header
  authQueryParam?: string;        // For apikey_query

  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

/** Strip secret fields before returning to client. */
function sanitize(doc: ConnectionDoc) {
  const { clientSecret, credential, ...rest } = doc;
  return { ...rest, hasSecret: !!clientSecret, hasCredential: !!credential };
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

const VALID_PROVIDERS = new Set<ConnectionProvider>(["oauth2", "bearer", "apikey_header", "apikey_query", "basic", "cookie"]);

async function createConnection(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const projectId = getProjectId(req);
    const user = getUserInfo(req);
    const body = (await req.json()) as Partial<ConnectionDoc> & { provider?: string; draft?: boolean };

    if (!body.name?.trim()) return err(400, "name is required");
    const provider = (body.provider || "oauth2") as ConnectionProvider;
    if (!VALID_PROVIDERS.has(provider)) return err(400, `Invalid provider: ${body.provider}`);

    // draft=true skips credential/clientId validation (auto-detected from spec)
    if (!body.draft) {
      if (provider === "oauth2") {
        if (!body.authorizationUrl?.trim()) return err(400, "authorizationUrl is required");
        if (!body.tokenUrl?.trim()) return err(400, "tokenUrl is required");
        if (!body.clientId?.trim()) return err(400, "clientId is required");
      } else {
        if (!body.credential?.trim()) return err(400, "credential is required");
        if (provider === "apikey_header" && !body.authHeaderName?.trim()) return err(400, "authHeaderName is required for API Key (Header)");
        if (provider === "apikey_query" && !body.authQueryParam?.trim()) return err(400, "authQueryParam is required for API Key (Query)");
      }
    }

    const id = randomUUID();
    const redirectUri = body.redirectUri?.trim() || `/callback`;

    const doc: ConnectionDoc = {
      id,
      projectId,
      type: "connection",
      name: body.name.trim(),
      provider,
      // OAuth fields
      authorizationUrl: provider === "oauth2" ? (body.authorizationUrl?.trim() || undefined) : undefined,
      tokenUrl: provider === "oauth2" ? (body.tokenUrl?.trim() || undefined) : undefined,
      clientId: provider === "oauth2" ? (body.clientId?.trim() || undefined) : undefined,
      clientSecret: provider === "oauth2" ? (body.clientSecret?.trim() || undefined) : undefined,
      scopes: provider === "oauth2" ? (body.scopes?.trim() ?? "") : undefined,
      redirectUri: provider === "oauth2" ? redirectUri : undefined,
      // Token fields
      credential: provider !== "oauth2" ? (body.credential?.trim() || undefined) : undefined,
      authHeaderName: provider === "apikey_header" ? (body.authHeaderName?.trim() || undefined) : undefined,
      authQueryParam: provider === "apikey_query" ? (body.authQueryParam?.trim() || undefined) : undefined,
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

    if (existing.provider === "oauth2") {
      existing.authorizationUrl = body.authorizationUrl?.trim() || existing.authorizationUrl;
      existing.tokenUrl = body.tokenUrl?.trim() || existing.tokenUrl;
      existing.clientId = body.clientId?.trim() || existing.clientId;
      existing.scopes = body.scopes?.trim() ?? existing.scopes;
      if (body.clientSecret !== undefined) {
        existing.clientSecret = body.clientSecret.trim() || undefined;
      }
    } else {
      // Token-based providers: update credential if provided
      if (body.credential !== undefined && body.credential.trim()) {
        existing.credential = body.credential.trim();
      }
      if (existing.provider === "apikey_header" && body.authHeaderName !== undefined) {
        existing.authHeaderName = body.authHeaderName.trim() || existing.authHeaderName;
      }
      if (existing.provider === "apikey_query" && body.authQueryParam !== undefined) {
        existing.authQueryParam = body.authQueryParam.trim() || existing.authQueryParam;
      }
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
