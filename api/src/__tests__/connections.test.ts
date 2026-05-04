import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { app } from "@azure/functions";

// ── Cosmos mocks ──────────────────────────────────────────────────────────
const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockUpsert = jest.fn();
const mockRead = jest.fn();
const mockDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getConnectionsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockQuery() }),
      create: (...args: unknown[]) => mockCreate(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    item: () => ({
      read: () => mockRead(),
      delete: () => mockDelete(),
    }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  ProjectIdMissingError: class extends Error {
    constructor() {
      super("X-FlowForge-ProjectId header is required");
    }
  },
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

// ── Import the module (triggers app.http registration) ────────────────────
import "../functions/connections";

// ── Extract handlers from app.http mock calls ─────────────────────────────
type Handler = (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;

const appHttpMock = app.http as jest.Mock;
const connectionsCall = appHttpMock.mock.calls.find(
  (c: unknown[]) => c[0] === "connections"
);
const connectionItemCall = appHttpMock.mock.calls.find(
  (c: unknown[]) => c[0] === "connectionItem"
);

const connectionsHandler = connectionsCall![1].handler as Handler;
const connectionItemHandler = connectionItemCall![1].handler as Handler;

// ── Helpers ───────────────────────────────────────────────────────────────
function makeReq(
  method: string,
  body?: unknown,
  params?: Record<string, string>
): HttpRequest {
  return {
    method,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    params: params || {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: "https://example.com/api/connections",
  } as unknown as HttpRequest;
}

function parseBody(res: HttpResponseInit) {
  return JSON.parse(res.body as string);
}

const ctx = {} as InvocationContext;

// ── Sample docs ───────────────────────────────────────────────────────────
const OAUTH_DOC = {
  id: "conn-1",
  projectId: "test-project",
  type: "connection",
  name: "My OAuth",
  provider: "oauth2",
  authorizationUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  clientId: "cid-123",
  clientSecret: "super-secret",
  scopes: "read write",
  redirectUri: "/callback",
  createdAt: "2025-01-01T00:00:00Z",
  createdBy: { oid: "test-oid", name: "Test User" },
  updatedAt: "2025-01-01T00:00:00Z",
  updatedBy: { oid: "test-oid", name: "Test User" },
};

const BEARER_DOC = {
  id: "conn-2",
  projectId: "test-project",
  type: "connection",
  name: "My Bearer",
  provider: "bearer",
  credential: "tok-abc",
  createdAt: "2025-01-01T00:00:00Z",
  createdBy: { oid: "test-oid", name: "Test User" },
  updatedAt: "2025-01-01T00:00:00Z",
  updatedBy: { oid: "test-oid", name: "Test User" },
};

// ── Tests ─────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

describe("connectionsRouter", () => {
  it("OPTIONS returns 204", async () => {
    const res = await connectionsHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  it("GET lists connections with secrets sanitized", async () => {
    mockQuery.mockResolvedValueOnce({ resources: [OAUTH_DOC, BEARER_DOC] });
    const res = await connectionsHandler(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body).toHaveLength(2);
    // OAuth doc: secret stripped, hasSecret true
    expect(body[0].clientSecret).toBeUndefined();
    expect(body[0].hasSecret).toBe(true);
    expect(body[0].hasCredential).toBe(false);
    // Bearer doc: credential stripped, hasCredential true
    expect(body[1].credential).toBeUndefined();
    expect(body[1].hasCredential).toBe(true);
    expect(body[1].hasSecret).toBe(false);
  });

  it("POST creates OAuth connection successfully", async () => {
    mockCreate.mockResolvedValueOnce({});
    const req = makeReq("POST", {
      name: "New OAuth",
      provider: "oauth2",
      authorizationUrl: "https://auth.example.com/authorize",
      tokenUrl: "https://auth.example.com/token",
      clientId: "cid-456",
      clientSecret: "sec-456",
      scopes: "read",
    });
    const res = await connectionsHandler(req, ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.name).toBe("New OAuth");
    expect(body.provider).toBe("oauth2");
    expect(body.hasSecret).toBe(true);
    expect(body.clientSecret).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("POST returns 400 when name is missing", async () => {
    const res = await connectionsHandler(makeReq("POST", { provider: "oauth2" }), ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/name/i);
  });

  it("POST returns 400 for invalid provider", async () => {
    const res = await connectionsHandler(
      makeReq("POST", { name: "Bad", provider: "ftp" }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/Invalid provider/);
  });

  it("POST returns 400 when OAuth missing authorizationUrl", async () => {
    const res = await connectionsHandler(
      makeReq("POST", {
        name: "OAuth Missing",
        provider: "oauth2",
        tokenUrl: "https://tok.example.com",
        clientId: "cid",
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/authorizationUrl/);
  });

  it("POST returns 400 when bearer missing credential", async () => {
    const res = await connectionsHandler(
      makeReq("POST", { name: "Bearer No Cred", provider: "bearer" }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/credential/i);
  });

  it("POST with draft=true skips credential validation", async () => {
    mockCreate.mockResolvedValueOnce({});
    const res = await connectionsHandler(
      makeReq("POST", { name: "Draft Bearer", provider: "bearer", draft: true }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(parseBody(res).name).toBe("Draft Bearer");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("POST returns 400 when apikey_header missing authHeaderName", async () => {
    const res = await connectionsHandler(
      makeReq("POST", {
        name: "API Key Header",
        provider: "apikey_header",
        credential: "key-123",
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/authHeaderName/);
  });

  it("Method Not Allowed for unsupported methods", async () => {
    const res = await connectionsHandler(makeReq("PATCH"), ctx);
    expect(res.status).toBe(405);
  });
});

describe("connectionItemRouter", () => {
  it("OPTIONS returns 204", async () => {
    const res = await connectionItemHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  it("PUT updates connection and returns sanitized doc", async () => {
    mockRead.mockResolvedValueOnce({ resource: { ...OAUTH_DOC } });
    mockUpsert.mockResolvedValueOnce({});
    const req = makeReq("PUT", { name: "Renamed OAuth" }, { connectionId: "conn-1" });
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.name).toBe("Renamed OAuth");
    expect(body.clientSecret).toBeUndefined();
    expect(body.hasSecret).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("PUT returns 400 when connectionId is missing", async () => {
    const req = makeReq("PUT", { name: "X" }, {});
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/connectionId/);
  });

  it("PUT returns 404 when connection not found", async () => {
    mockRead.mockResolvedValueOnce({ resource: null });
    const req = makeReq("PUT", { name: "X" }, { connectionId: "no-such" });
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(404);
  });

  it("DELETE deletes connection successfully", async () => {
    mockDelete.mockResolvedValueOnce({});
    const req = makeReq("DELETE", undefined, { connectionId: "conn-1" });
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res).deleted).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("DELETE returns 404 when connection not found", async () => {
    mockDelete.mockRejectedValueOnce(new Error("Not found"));
    const req = makeReq("DELETE", undefined, { connectionId: "no-such" });
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(404);
  });

  it("Method Not Allowed for unsupported methods", async () => {
    const res = await connectionItemHandler(makeReq("PATCH"), ctx);
    expect(res.status).toBe(405);
  });
});

describe("customHeaders", () => {
  it("POST creates connection with customHeaders", async () => {
    mockCreate.mockResolvedValueOnce({});
    const res = await connectionsHandler(
      makeReq("POST", {
        name: "Bearer With Headers",
        provider: "bearer",
        credential: "tok-123",
        customHeaders: [
          { name: "projectid", value: "{{proj.d360_project_id}}" },
          { name: "", value: "empty-name-should-be-filtered" },
          { name: "X-Custom", value: "literal" },
        ],
      }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    // Empty-name header should be filtered out
    expect(body.customHeaders).toHaveLength(2);
    expect(body.customHeaders[0]).toEqual({ name: "projectid", value: "{{proj.d360_project_id}}" });
    expect(body.customHeaders[1]).toEqual({ name: "X-Custom", value: "literal" });
    // Verify what was persisted
    const created = mockCreate.mock.calls[0][0];
    expect(created.customHeaders).toHaveLength(2);
  });

  it("PUT replaces customHeaders on update", async () => {
    const existingDoc = {
      ...BEARER_DOC,
      customHeaders: [{ name: "old-header", value: "old-value" }],
    };
    mockRead.mockResolvedValueOnce({ resource: { ...existingDoc } });
    mockUpsert.mockResolvedValueOnce({});
    const req = makeReq(
      "PUT",
      { customHeaders: [{ name: "new-header", value: "new-value" }] },
      { connectionId: "conn-2" }
    );
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.customHeaders).toHaveLength(1);
    expect(body.customHeaders[0]).toEqual({ name: "new-header", value: "new-value" });
  });

  it("PUT clears customHeaders when set to empty array", async () => {
    const existingDoc = {
      ...BEARER_DOC,
      customHeaders: [{ name: "to-remove", value: "val" }],
    };
    mockRead.mockResolvedValueOnce({ resource: { ...existingDoc } });
    mockUpsert.mockResolvedValueOnce({});
    const req = makeReq("PUT", { customHeaders: [] }, { connectionId: "conn-2" });
    const res = await connectionItemHandler(req, ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.customHeaders).toEqual([]);
  });

  it("sanitize passes customHeaders through (not stripped)", async () => {
    const docWithHeaders = {
      ...OAUTH_DOC,
      customHeaders: [{ name: "projectid", value: "abc" }],
    };
    mockQuery.mockResolvedValueOnce({ resources: [docWithHeaders] });
    const res = await connectionsHandler(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body[0].customHeaders).toEqual([{ name: "projectid", value: "abc" }]);
    // Secrets still stripped
    expect(body[0].clientSecret).toBeUndefined();
  });
});
