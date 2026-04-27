/**
 * Unit tests for two Azure Functions:
 *   auditLog     — GET/OPTIONS, route "audit-log"
 *   resetProject — DELETE/OPTIONS, route "reset-project"
 */

import type { HttpResponseInit, InvocationContext } from "@azure/functions";
import { app } from "@azure/functions";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getAuditLogContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => mockQuery() }) },
    item: () => ({ delete: () => mockDelete() }),
  }),
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => mockQuery() }) },
    item: () => ({ delete: () => mockDelete() }),
  }),
  getIdeasContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => mockQuery() }) },
    item: () => ({ delete: () => mockDelete() }),
  }),
  getTestRunsContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => mockQuery() }) },
    item: () => ({ delete: () => mockDelete() }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withRole: (_roles: string[], fn: Function) => fn,
  withAuth: (fn: Function) => fn,
  getProjectId: () => "test-project",
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  ProjectIdMissingError: class extends Error {
    constructor() {
      super("X-FlowForge-ProjectId header is required");
    }
  },
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(method: string, queryParams: Record<string, string> = {}) {
  const params = new URLSearchParams(queryParams);
  return {
    method,
    url: "https://localhost/api/audit-log",
    headers: { get: () => null },
    query: params,
    params: {},
    json: async () => ({}),
    text: async () => "",
  };
}

const ctx = {} as InvocationContext;

function parseBody(res: HttpResponseInit): unknown {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

// ── Import modules & extract handlers ───────────────────────────────────────

let auditLogHandler: Function;
let resetProjectHandler: Function;

beforeAll(async () => {
  await import("../functions/auditLog");
  await import("../functions/resetProject");

  const calls = (app.http as jest.Mock).mock.calls;
  for (const call of calls) {
    const [name, opts] = call;
    if (name === "auditLog") auditLogHandler = opts.handler;
    if (name === "resetProject") resetProjectHandler = opts.handler;
  }
});

// ── auditLog tests ──────────────────────────────────────────────────────────

describe("auditLog function", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OPTIONS returns 204", async () => {
    const res = await auditLogHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("GET returns entries with total, limit, offset", async () => {
    const entries = [
      { id: "a1", action: "flow.create", timestamp: "2026-01-01T00:00:00Z" },
      { id: "a2", action: "flow.delete", timestamp: "2026-01-02T00:00:00Z" },
    ];
    // First fetchAll = count query, second fetchAll = data query
    mockQuery
      .mockResolvedValueOnce({ resources: [2] })
      .mockResolvedValueOnce({ resources: entries });

    const res = await auditLogHandler(makeReq("GET"), ctx);
    expect(res.status).toBe(200);

    const body = parseBody(res) as {
      entries: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.total).toBe(2);
    expect(body.entries).toEqual(entries);
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
  });

  test("GET with filters builds correct query conditions", async () => {
    mockQuery
      .mockResolvedValueOnce({ resources: [1] })
      .mockResolvedValueOnce({ resources: [{ id: "x" }] });

    const res = await auditLogHandler(
      makeReq("GET", {
        action: "flow.create",
        actor: "alice",
        from: "2026-01-01",
        to: "2026-12-31",
        search: "category",
        limit: "10",
        offset: "5",
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = parseBody(res) as { limit: number; offset: number };
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(5);
    // Count + data = 2 query calls
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test("returns 400 when projectId header is missing", async () => {
    const auth = jest.requireMock("../lib/auth") as {
      getProjectId: jest.Mock;
      ProjectIdMissingError: new () => Error;
    };
    const original = auth.getProjectId;
    auth.getProjectId = jest.fn(() => {
      throw new auth.ProjectIdMissingError();
    });

    const res = await auditLogHandler(makeReq("GET"), ctx);
    expect(res.status).toBe(400);
    const body = parseBody(res) as { error: string };
    expect(body.error).toContain("ProjectId");

    auth.getProjectId = original;
  });
});

// ── resetProject tests ──────────────────────────────────────────────────────

describe("resetProject function", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OPTIONS returns 204", async () => {
    const res = await resetProjectHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("DELETE deletes from all 4 containers and returns summary", async () => {
    // Each container query returns 2 docs
    mockQuery.mockResolvedValue({
      resources: [{ id: "doc-1" }, { id: "doc-2" }],
    });
    mockDelete.mockResolvedValue({});

    const res = await resetProjectHandler(makeReq("DELETE"), ctx);
    expect(res.status).toBe(200);

    const body = parseBody(res) as {
      message: string;
      deleted: { flows: number; ideas: number; testRuns: number; auditLogs: number };
    };
    expect(body.message).toBe("Project data reset complete");
    expect(body.deleted).toEqual({
      flows: 2,
      ideas: 2,
      testRuns: 2,
      auditLogs: 2,
    });
    // 4 containers queried
    expect(mockQuery).toHaveBeenCalledTimes(4);
    // 2 docs x 4 containers = 8 deletes
    expect(mockDelete).toHaveBeenCalledTimes(8);
  });

  test("DELETE fires audit before deletion", async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    mockDelete.mockResolvedValue({});

    const { audit } = jest.requireMock("../lib/auditLog") as { audit: jest.Mock };

    await resetProjectHandler(makeReq("DELETE"), ctx);

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      "test-project",
      "project.reset",
      { oid: "test-oid", name: "Test User" },
      "test-project",
    );
  });
});
