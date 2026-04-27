import type { HttpRequest, InvocationContext } from "@azure/functions";

/* ── mocks ─────────────────────────────────────────────────────────── */

const mockRead = jest.fn();
const mockUpsert = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: { upsert: (...args: unknown[]) => mockUpsert(...args) },
    item: () => ({ read: () => mockRead() }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withRole: (_roles: string[], fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  ProjectIdMissingError: class extends Error {
    constructor() {
      super("X-FlowForge-ProjectId header is required");
    }
  },
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

/* ── helpers ───────────────────────────────────────────────────────── */

function makeRequest(
  method: string,
  opts?: { body?: unknown; query?: Record<string, string> },
): HttpRequest {
  const url = new URL("https://localhost/api/flow-locks");
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }
  return {
    method,
    url: url.toString(),
    query: url.searchParams,
    json: jest.fn().mockResolvedValue(opts?.body ?? {}),
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function parse(res: { body?: string | unknown }) {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

/* ── import handler (must come after mocks) ────────────────────────── */

let handler: (req: HttpRequest, ctx: InvocationContext) => Promise<{ status: number; body?: string }>;

beforeAll(async () => {
  const mod = await import("../functions/flowLocks");
  // The module registers via app.http; grab the handler from the mock
  const { app: appMock } = await import("@azure/functions");
  const httpCalls = (appMock.http as jest.Mock).mock.calls;
  const registration = httpCalls.find((c: unknown[]) => (c[0] as string) === "flowLocks");
  handler = registration![1].handler;
});

beforeEach(() => {
  jest.clearAllMocks();
});

/* ── tests ─────────────────────────────────────────────────────────── */

describe("flowLocks router", () => {
  test("OPTIONS returns 204", async () => {
    const res = await handler(makeRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("POST lock — locks flow successfully", async () => {
    mockRead.mockResolvedValueOnce({ resource: { id: "flow:some|path", projectId: "test-project" } });
    mockUpsert.mockResolvedValueOnce({});

    const res = await handler(makeRequest("POST", { body: { name: "some/path" } }), ctx);
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.locked).toBe(true);
    expect(body.lockedBy).toEqual({ oid: "test-oid", name: "Test User" });
    expect(body.lockedAt).toBeDefined();
    expect(mockUpsert).toHaveBeenCalled();
  });

  test("POST lock — missing name returns 400", async () => {
    const res = await handler(makeRequest("POST", { body: {} }), ctx);
    expect(res.status).toBe(400);
    expect(parse(res).error).toMatch(/name is required/);
  });

  test("POST lock — flow not found returns 404", async () => {
    mockRead.mockRejectedValueOnce(new Error("not found"));

    const res = await handler(makeRequest("POST", { body: { name: "missing/flow" } }), ctx);
    expect(res.status).toBe(404);
    expect(parse(res).error).toMatch(/Flow not found/);
  });

  test("POST lock — already locked by same user returns ok", async () => {
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "flow:x",
        projectId: "test-project",
        lockedBy: { oid: "test-oid", name: "Test User" },
        lockedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await handler(makeRequest("POST", { body: { name: "x" } }), ctx);
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.locked).toBe(true);
    expect(body.lockedBy.oid).toBe("test-oid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("POST lock — locked by another user returns 409", async () => {
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "flow:x",
        projectId: "test-project",
        lockedBy: { oid: "other-oid", name: "Other User" },
        lockedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await handler(makeRequest("POST", { body: { name: "x" } }), ctx);
    expect(res.status).toBe(409);
    expect(parse(res).error).toMatch(/Already locked by Other User/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("DELETE unlock — unlocks successfully", async () => {
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "flow:v3|test",
        projectId: "test-project",
        lockedBy: { oid: "test-oid", name: "Test User" },
        lockedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    mockUpsert.mockResolvedValueOnce({});

    const res = await handler(makeRequest("DELETE", { query: { name: "v3/test" } }), ctx);
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.locked).toBe(false);
    expect(mockUpsert).toHaveBeenCalled();
  });

  test("DELETE unlock — missing name query returns 400", async () => {
    const res = await handler(makeRequest("DELETE"), ctx);
    expect(res.status).toBe(400);
    expect(parse(res).error).toMatch(/name query param is required/);
  });

  test("DELETE unlock — flow not found returns 404", async () => {
    mockRead.mockRejectedValueOnce(new Error("not found"));

    const res = await handler(makeRequest("DELETE", { query: { name: "missing" } }), ctx);
    expect(res.status).toBe(404);
    expect(parse(res).error).toMatch(/Flow not found/);
  });

  test("DELETE unlock — already unlocked returns ok with locked false", async () => {
    mockRead.mockResolvedValueOnce({
      resource: { id: "flow:x", projectId: "test-project" },
    });

    const res = await handler(makeRequest("DELETE", { query: { name: "x" } }), ctx);
    expect(res.status).toBe(200);
    const body = parse(res);
    expect(body.locked).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("unsupported method returns 405", async () => {
    const res = await handler(makeRequest("PATCH"), ctx);
    expect(res.status).toBe(405);
    expect(parse(res).error).toMatch(/Method Not Allowed/);
  });
});
