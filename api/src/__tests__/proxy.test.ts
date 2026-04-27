/**
 * Unit tests for api/src/functions/proxy.ts — generic API proxy
 */

/* ---------- global fetch mock ---------- */
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/* ---------- module mocks ---------- */
jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  parseClientPrincipal: jest.fn().mockReturnValue({ userId: "test-oid", userDetails: "test@example.com" }),
}));

jest.mock("../lib/oauthTokenStore", () => ({
  getValidOAuthToken: jest.fn().mockResolvedValue({ accessToken: "oauth-token-123" }),
}));

jest.mock("../lib/versionApiKeyStore", () => ({
  getCredentialForVersion: jest.fn().mockResolvedValue({ credential: "stored-cred", authType: "bearer" }),
  getApiKeyForVersion: jest.fn(),
}));

const mockConnQuery = jest.fn();
jest.mock("../lib/cosmosClient", () => ({
  getConnectionsContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => mockConnQuery() }) },
  }),
}));

/* ---------- import after mocks ---------- */
import { parseClientPrincipal } from "../lib/auth";

/* ---------- helpers ---------- */
function makeHeaders(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    get: (k: string) => map.get(k) ?? null,
    forEach: (cb: (v: string, k: string) => void) => map.forEach(cb),
  };
}

function makeReq(
  method: string,
  opts: { path?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const hdrs = new Map(
    Object.entries({
      "x-ms-client-principal": Buffer.from(
        JSON.stringify({ userId: "test-oid", userDetails: "test@example.com" }),
      ).toString("base64"),
      "x-ff-base-url": "https://api.example.com",
      ...opts.headers,
    }),
  );
  return {
    method,
    headers: hdrs,
    params: { path: opts.path ?? "v3/articles" },
    url: `https://example.com/api/proxy/${opts.path ?? "v3/articles"}`,
    query: new URLSearchParams(),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown;
}

function makeFetchResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
) {
  return {
    status,
    headers: makeHeaders({ "content-type": "application/json", ...headers }),
    arrayBuffer: () => Promise.resolve(Buffer.from(body)),
  };
}

/* ---------- import handler ---------- */
// The module registers via app.http(); capture the handler.
import { app } from "@azure/functions";
const registeredCalls = (app.http as jest.Mock).mock.calls;
// proxy.ts calls app.http("apiProxy", { handler: ... })
import "../functions/proxy";
const registration = registeredCalls.find((c) => c[0] === "apiProxy");
if (!registration) throw new Error("apiProxy registration not found");
const handler = registration[1].handler as (req: unknown, ctx: unknown) => Promise<{ status: number; headers: Record<string, string>; body?: unknown }>;

const fakeCtx = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };

/* ---------- tests ---------- */
describe("apiProxy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default principal
    (parseClientPrincipal as jest.Mock).mockReturnValue({ userId: "test-oid", userDetails: "test@example.com" });
  });

  it("registers with route proxy/{*path} and all methods", () => {
    expect(registration[0]).toBe("apiProxy");
    expect(registration[1].route).toBe("proxy/{*path}");
    expect(registration[1].methods).toEqual(
      expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
    );
  });

  // 1. OPTIONS → 204
  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler(makeReq("OPTIONS"), fakeCtx);
    expect(res.status).toBe(204);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 2. No client principal → 401
  it("returns 401 when no client principal", async () => {
    (parseClientPrincipal as jest.Mock).mockReturnValue(null);
    const res = await handler(makeReq("GET"), fakeCtx);
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.error).toBe("Unauthorized");
  });

  // 3. Missing path → 400
  it("returns 400 when sub-path is empty", async () => {
    const res = await handler(makeReq("GET", { path: "" }), fakeCtx);
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/Missing upstream path/i);
  });

  // 4. Missing base URL → 400
  it("returns 400 when base URL header is missing and no env default", async () => {
    const res = await handler(
      makeReq("GET", { headers: { "x-ff-base-url": "" } }),
      fakeCtx,
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/Missing upstream base URL/i);
  });

  // 5. Successful proxy — forwards request, returns response
  it("forwards GET to upstream and returns response", async () => {
    mockFetch.mockResolvedValue(makeFetchResponse(200, '{"ok":true}'));
    const res = await handler(makeReq("GET"), fakeCtx);

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/v3/articles");
    expect(init.method).toBe("GET");
    // Body should be present as buffer
    const resBody = Buffer.from(res.body as Buffer).toString("utf8");
    expect(resBody).toContain('"ok":true');
  });

  // 6. Connection-based auth (bearer) — injects Bearer header
  it("injects Bearer header for connection with provider=bearer", async () => {
    mockConnQuery.mockResolvedValue({
      resources: [{ id: "conn-1", provider: "bearer", credential: "my-bearer-tok", type: "connection" }],
    });
    mockFetch.mockResolvedValue(makeFetchResponse(200, '{"data":1}'));

    const res = await handler(
      makeReq("GET", { headers: { "x-ff-connection-id": "conn-1" } }),
      fakeCtx,
    );

    expect(res.status).toBe(200);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer my-bearer-tok");
  });

  // 7. Connection not found → 404
  it("returns 404 when connection ID not found in Cosmos", async () => {
    mockConnQuery.mockResolvedValue({ resources: [] });

    const res = await handler(
      makeReq("GET", { headers: { "x-ff-connection-id": "bad-id" } }),
      fakeCtx,
    );

    expect(res.status).toBe(404);
    const body = JSON.parse(res.body as string);
    expect(body.code).toBe("CONNECTION_NOT_FOUND");
  });

  // 8. noAuth flag — sends invalid bearer
  it("sends invalid bearer when X-FF-No-Auth is 1", async () => {
    mockFetch.mockResolvedValue(makeFetchResponse(200, "{}"));

    await handler(
      makeReq("GET", { headers: { "x-ff-no-auth": "1" } }),
      fakeCtx,
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer __invalid__");
  });

  // 9. 204 upstream → undefined body (null-body status workaround)
  it("returns undefined body when upstream responds 204", async () => {
    mockFetch.mockResolvedValue(makeFetchResponse(204, ""));
    const res = await handler(makeReq("DELETE"), fakeCtx);

    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });

  // 10. 5xx upstream → wrapped in 502 envelope
  it("wraps upstream 5xx in a 502 diagnostic envelope", async () => {
    mockFetch.mockResolvedValue(makeFetchResponse(500, '{"message":"Internal Server Error"}'));
    const res = await handler(makeReq("GET"), fakeCtx);

    expect(res.status).toBe(502);
    const body = JSON.parse(res.body as string);
    expect(body._proxyDebug).toMatch(/5xx/i);
    expect(body.upstream.status).toBe(500);
    expect(res.headers["X-FF-Upstream-Status"]).toBe("500");
  });

  // 11. Method tunneling with X-FF-Method
  it("uses X-FF-Method header to override request method", async () => {
    mockFetch.mockResolvedValue(makeFetchResponse(204, ""));

    await handler(
      makeReq("POST", { headers: { "x-ff-method": "DELETE" } }),
      fakeCtx,
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("DELETE");
    // DELETE should have no body even though incoming was POST
    expect(init.body).toBeUndefined();
  });

  // Timeout handling
  it("returns 502 with timeout info when upstream fetch is aborted", async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const res = await handler(makeReq("GET"), fakeCtx);

    expect(res.status).toBe(502);
    const body = JSON.parse(res.body as string);
    expect(body._proxyDebug).toMatch(/timeout/i);
    expect(res.headers["X-FF-Upstream-Timeout"]).toBe("1");
  });

  // Connection-based auth: apikey_header provider
  it("injects custom header for apikey_header connection", async () => {
    mockConnQuery.mockResolvedValue({
      resources: [{ id: "conn-2", provider: "apikey_header", credential: "key-123", authHeaderName: "X-Api-Key", type: "connection" }],
    });
    mockFetch.mockResolvedValue(makeFetchResponse(200, "{}"));

    await handler(
      makeReq("GET", { headers: { "x-ff-connection-id": "conn-2" } }),
      fakeCtx,
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["X-Api-Key"]).toBe("key-123");
  });

  // Connection-based auth: apikey_query provider
  it("appends query param for apikey_query connection", async () => {
    mockConnQuery.mockResolvedValue({
      resources: [{ id: "conn-3", provider: "apikey_query", credential: "qk-999", authQueryParam: "token", type: "connection" }],
    });
    mockFetch.mockResolvedValue(makeFetchResponse(200, "{}"));

    await handler(
      makeReq("GET", { headers: { "x-ff-connection-id": "conn-3" } }),
      fakeCtx,
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("token=qk-999");
  });

  // Connection with no credential → 401
  it("returns 401 when connection has no credential", async () => {
    mockConnQuery.mockResolvedValue({
      resources: [{ id: "conn-4", provider: "bearer", type: "connection" }],
    });

    const res = await handler(
      makeReq("GET", { headers: { "x-ff-connection-id": "conn-4" } }),
      fakeCtx,
    );

    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.code).toBe("CONNECTION_NO_CREDENTIAL");
  });
});
