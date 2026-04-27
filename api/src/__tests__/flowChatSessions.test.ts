import { HttpRequest, InvocationContext } from "@azure/functions";

/* ── mocks ── */

const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockUpsert = jest.fn();
const mockRead = jest.fn();
const mockDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getFlowChatSessionsContainer: jest.fn().mockResolvedValue({
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

/* ── helpers ── */

function makeRequest(
  method: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): HttpRequest {
  const url = new URL("https://localhost/api/flow-chat-sessions");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  return {
    method,
    url: url.toString(),
    query: url.searchParams,
    headers: new Headers(),
    json: async () => opts.body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

/* ── import handler (after mocks) ── */

let handler: (req: HttpRequest, ctx: InvocationContext) => Promise<import("@azure/functions").HttpResponseInit>;

beforeAll(async () => {
  const mod = await import("../functions/flowChatSessions");
  // withAuth is identity, so the registered handler is the router itself
  // Azure Functions `app.http` is auto-mocked; we grab the handler from the mock call
  const { app } = await import("@azure/functions");
  const call = (app.http as jest.Mock).mock.calls[0];
  handler = call[1].handler;
});

beforeEach(() => {
  jest.clearAllMocks();
});

/* ── tests ── */

describe("flowChatSessions router", () => {
  test("OPTIONS returns 204", async () => {
    const res = await handler(makeRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("GET — lists sessions for user", async () => {
    const sessions = [
      { id: "s1", title: "Session 1", totalCost: 0.1, messageCount: 3 },
    ];
    mockQuery.mockResolvedValueOnce({ resources: sessions });

    const res = await handler(makeRequest("GET"), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(sessions);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test("GET with id — returns single session", async () => {
    const session = { id: "s1", userId: "test-oid", title: "My Session" };
    mockRead.mockResolvedValueOnce({ resource: session });

    const res = await handler(makeRequest("GET", { query: { id: "s1" } }), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(session);
  });

  test("GET with id — wrong user returns 404", async () => {
    const session = { id: "s1", userId: "other-oid", title: "Other Session" };
    mockRead.mockResolvedValueOnce({ resource: session });

    const res = await handler(makeRequest("GET", { query: { id: "s1" } }), ctx);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body as string).error).toBe("Session not found");
  });

  test("POST — creates session", async () => {
    mockCreate.mockResolvedValueOnce({});

    const body = { id: "new-1", title: "New Session", messages: [], specFiles: [] };
    const res = await handler(makeRequest("POST", { body }), ctx);
    expect(res.status).toBe(200);

    const result = JSON.parse(res.body as string);
    expect(result.id).toBe("new-1");
    expect(result.title).toBe("New Session");
    expect(result.projectId).toBe("test-project");
    expect(result.userId).toBe("test-oid");
    expect(result.type).toBe("flow_chat_session");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("POST — missing id/title returns 400", async () => {
    const res = await handler(makeRequest("POST", { body: { title: "" } }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("id and title are required");
  });

  test("PUT — updates session", async () => {
    const existing = {
      id: "s1",
      projectId: "test-project",
      userId: "test-oid",
      title: "Old Title",
      messages: [],
      confirmedPlan: null,
      totalCost: 0,
      specFiles: [],
      type: "flow_chat_session",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      createdBy: { oid: "test-oid", name: "Test User" },
    };
    mockRead.mockResolvedValueOnce({ resource: existing });
    mockUpsert.mockResolvedValueOnce({});

    const body = { id: "s1", title: "New Title" };
    const res = await handler(makeRequest("PUT", { body }), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ saved: true, id: "s1" });
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    const upserted = mockUpsert.mock.calls[0][0];
    expect(upserted.title).toBe("New Title");
  });

  test("PUT — missing id returns 400", async () => {
    const res = await handler(makeRequest("PUT", { body: { title: "X" } }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("id is required");
  });

  test("PUT — session not found returns 404", async () => {
    mockRead.mockRejectedValueOnce(new Error("Not found"));

    const res = await handler(makeRequest("PUT", { body: { id: "nope" } }), ctx);
    expect(res.status).toBe(404);
  });

  test("PUT — wrong user returns 404", async () => {
    const existing = {
      id: "s1",
      userId: "other-oid",
      title: "X",
    };
    mockRead.mockResolvedValueOnce({ resource: existing });

    const res = await handler(makeRequest("PUT", { body: { id: "s1" } }), ctx);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body as string).error).toBe("Session not found");
  });

  test("DELETE — deletes session", async () => {
    const session = { id: "s1", userId: "test-oid" };
    mockRead.mockResolvedValueOnce({ resource: session });
    mockDelete.mockResolvedValueOnce({});

    const res = await handler(makeRequest("DELETE", { query: { id: "s1" } }), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ deleted: true, id: "s1" });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  test("DELETE — missing id returns 400", async () => {
    const res = await handler(makeRequest("DELETE"), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("id query param is required");
  });

  test("DELETE — idempotent on missing session", async () => {
    mockRead.mockRejectedValueOnce(new Error("Not found"));

    const res = await handler(makeRequest("DELETE", { query: { id: "gone" } }), ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ deleted: true, id: "gone" });
  });

  test("unsupported method returns 405", async () => {
    const res = await handler(makeRequest("PATCH"), ctx);
    expect(res.status).toBe(405);
    expect(JSON.parse(res.body as string).error).toBe("Method Not Allowed");
  });
});
