/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpRequest, InvocationContext } from "@azure/functions";

// ── Cosmos mocks ──────────────────────────────────────────────────────
const mockQuery = jest.fn();
const mockUpsert = jest.fn();
const mockRead = jest.fn();
const mockDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getTestRunsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockQuery() }),
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

// ── Import after mocks ───────────────────────────────────────────────
// The module registers two route handlers via app.http().
// Since @azure/functions is auto-mocked, we grab the handlers from
// the mock calls.
import "../functions/testRuns";
import { app } from "@azure/functions";

const registeredHandlers = (app.http as jest.Mock).mock.calls;
const testRunsHandler = registeredHandlers.find(
  (c: any[]) => c[0] === "testRuns",
)![1].handler as (req: HttpRequest, ctx: InvocationContext) => Promise<any>;

const testRunDetailHandler = registeredHandlers.find(
  (c: any[]) => c[0] === "testRunDetail",
)![1].handler as (req: HttpRequest, ctx: InvocationContext) => Promise<any>;

// ── Helpers ──────────────────────────────────────────────────────────
function makeReq(method: string, body?: unknown, urlPath = "/api/test-runs") {
  return {
    method,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    params: {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: `https://example.com${urlPath}`,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function parseBody(res: any) {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

// ── Tests ────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

describe("testRunsRouter", () => {
  test("OPTIONS returns 204", async () => {
    const res = await testRunsHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("POST saveRun — upserts doc with correct shape", async () => {
    mockUpsert.mockResolvedValue({});
    const body = {
      id: "run-1",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      summary: { total: 1, passed: 1 },
      tagResults: {},
      testResults: {},
      log: [{ msg: "hello" }],
    };
    const res = await testRunsHandler(makeReq("POST", body), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ saved: true, id: "run-1" });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const doc = mockUpsert.mock.calls[0][0];
    expect(doc.id).toBe("run-1");
    expect(doc.projectId).toBe("test-project");
    expect(doc.type).toBe("test_run");
    expect(doc.triggeredBy).toEqual({ oid: "test-oid", name: "Test User" });
    expect(doc.log).toEqual([{ msg: "hello" }]);
  });

  test("POST saveRun — missing id returns 400", async () => {
    const res = await testRunsHandler(makeReq("POST", { noId: true }), ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toBe("id is required");
  });

  test("POST saveRun — caps log at 500 entries", async () => {
    mockUpsert.mockResolvedValue({});
    const bigLog = Array.from({ length: 700 }, (_, i) => ({ i }));
    const body = {
      id: "run-cap",
      startedAt: "t0",
      completedAt: "t1",
      summary: {},
      tagResults: {},
      testResults: {},
      log: bigLog,
    };
    await testRunsHandler(makeReq("POST", body), ctx);
    const doc = mockUpsert.mock.calls[0][0];
    expect(doc.log).toHaveLength(500);
    expect(doc.log[0]).toEqual({ i: 0 });
    expect(doc.log[499]).toEqual({ i: 499 });
  });

  test("POST saveRun — includes scenarioIds when provided", async () => {
    mockUpsert.mockResolvedValue({});
    const body = {
      id: "run-sc",
      startedAt: "t0",
      completedAt: "t1",
      summary: {},
      tagResults: {},
      testResults: {},
      log: [],
      scenarioIds: { "flow-a": "sid-1" },
    };
    await testRunsHandler(makeReq("POST", body), ctx);
    const doc = mockUpsert.mock.calls[0][0];
    expect(doc.scenarioIds).toEqual({ "flow-a": "sid-1" });
  });

  test("GET listRuns — returns resources from query", async () => {
    const runs = [{ id: "r1" }, { id: "r2" }];
    mockQuery.mockResolvedValue({ resources: runs });
    const res = await testRunsHandler(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual(runs);
  });

  test("Method Not Allowed returns 405", async () => {
    const res = await testRunsHandler(makeReq("PATCH"), ctx);
    expect(res.status).toBe(405);
  });
});

describe("testRunDetailRouter", () => {
  test("OPTIONS returns 204", async () => {
    const res = await testRunDetailHandler(makeReq("OPTIONS", undefined, "/api/test-runs/abc"), ctx);
    expect(res.status).toBe(204);
  });

  test("GET getRun — returns full run", async () => {
    const run = { id: "abc", projectId: "test-project", log: [] };
    mockRead.mockResolvedValue({ resource: run });
    const res = await testRunDetailHandler(makeReq("GET", undefined, "/api/test-runs/abc"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual(run);
  });

  test("GET getRun — not found returns 404", async () => {
    mockRead.mockResolvedValue({ resource: undefined });
    const res = await testRunDetailHandler(makeReq("GET", undefined, "/api/test-runs/missing"), ctx);
    expect(res.status).toBe(404);
    expect(parseBody(res).error).toBe("Run not found");
  });

  test("DELETE deleteRun — returns deleted confirmation", async () => {
    mockDelete.mockResolvedValue({});
    const res = await testRunDetailHandler(makeReq("DELETE", undefined, "/api/test-runs/abc"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ deleted: true, id: "abc" });
  });

  test("DELETE deleteRun — idempotent on missing doc", async () => {
    mockDelete.mockRejectedValue(new Error("Not Found"));
    const res = await testRunDetailHandler(makeReq("DELETE", undefined, "/api/test-runs/gone"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ deleted: true, id: "gone" });
  });

  test("Method Not Allowed returns 405", async () => {
    const res = await testRunDetailHandler(makeReq("PUT", undefined, "/api/test-runs/abc"), ctx);
    expect(res.status).toBe(405);
  });
});
