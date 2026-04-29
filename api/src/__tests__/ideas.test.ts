/**
 * Unit tests for the ideas Azure Function router (Cosmos DB backed).
 */

import type { InvocationContext } from "@azure/functions";

const mockRead = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockFetchAll = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getIdeasContainer: jest.fn().mockResolvedValue({
    items: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      query: () => ({ fetchAll: () => mockFetchAll() }),
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

import { app } from "@azure/functions";

require("../functions/ideas");

const registered = (app.http as jest.Mock).mock.calls.find(
  (c: unknown[]) => c[0] === "ideas"
);
const handler = registered[1].handler as (
  req: unknown,
  ctx: InvocationContext
) => Promise<{ status: number; headers?: Record<string, string>; body?: string }>;

function mockRequest(
  method: string,
  query: Record<string, string> = {},
  body?: unknown
) {
  const params = new URLSearchParams(query);
  return {
    method,
    query: params,
    json: jest.fn().mockResolvedValue(body ?? {}),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-flowforge-projectid"
          ? "test-project"
          : null,
    },
  };
}

const ctx = {} as InvocationContext;

function parseBody(res: { body?: string }) {
  return res.body ? JSON.parse(res.body) : undefined;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockRejectedValue(new Error("not found"));
  mockFetchAll.mockResolvedValue({ resources: [] });
  mockDelete.mockResolvedValue({});
  mockUpsert.mockResolvedValue({});
});

describe("ideas router", () => {
  // 1. OPTIONS -> 204
  it("OPTIONS returns 204 with CORS headers", async () => {
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers?.["Access-Control-Allow-Methods"]).toContain("GET");
    expect(res.headers?.["Access-Control-Allow-Methods"]).toContain("PUT");
    expect(res.headers?.["Access-Control-Allow-Methods"]).toContain("DELETE");
  });

  // 2. GET with folderPath - returns ideas doc
  it("GET with folderPath returns ideas document", async () => {
    const doc = {
      resource: {
        folderPath: "v3/articles",
        ideas: [{ id: "idea-1", title: "Test idea" }],
        usage: { inputTokens: 100 },
        flowsUsage: { inputTokens: 50 },
        generatedFlows: ["flow-1.flow.xml"],
      },
    };
    mockRead.mockResolvedValueOnce(doc);

    const res = await handler(
      mockRequest("GET", { folderPath: "v3/articles" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.folderPath).toBe("v3/articles");
    expect(body.ideas).toEqual([{ id: "idea-1", title: "Test idea" }]);
    expect(body.usage).toEqual({ inputTokens: 100 });
    expect(body.flowsUsage).toEqual({ inputTokens: 50 });
    expect(body.generatedFlows).toEqual(["flow-1.flow.xml"]);
  });

  // 3. GET with folderPath - returns empty when not found
  it("GET with folderPath returns empty when doc not found", async () => {
    mockRead.mockRejectedValueOnce(new Error("not found"));

    const res = await handler(
      mockRequest("GET", { folderPath: "v3/missing" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.folderPath).toBe("v3/missing");
    expect(body.ideas).toEqual([]);
    expect(body.usage).toBeNull();
    expect(body.flowsUsage).toBeNull();
    expect(body.generatedFlows).toEqual([]);
  });

  // 4. GET with prefix - returns aggregated results
  it("GET with prefix returns aggregated ideas", async () => {
    mockFetchAll.mockResolvedValueOnce({
      resources: [
        {
          folderPath: "v3/articles",
          ideas: [{ id: "a1" }],
          usage: null,
          flowsUsage: null,
          generatedFlows: [],
        },
        {
          folderPath: "v3/articles/comments",
          ideas: [{ id: "b1" }],
          usage: { inputTokens: 200 },
          flowsUsage: null,
          generatedFlows: ["f1.flow.xml"],
        },
      ],
    });

    const res = await handler(
      mockRequest("GET", { prefix: "v3/articles" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body["v3/articles"].ideas).toEqual([{ id: "a1" }]);
    expect(body["v3/articles/comments"].ideas).toEqual([{ id: "b1" }]);
    expect(body["v3/articles/comments"].generatedFlows).toEqual([
      "f1.flow.xml",
    ]);
  });

  // 5. GET without params - returns all ideas
  it("GET without params returns all ideas for project", async () => {
    mockFetchAll.mockResolvedValueOnce({
      resources: [
        {
          folderPath: "v3/articles",
          ideas: [{ id: "x1" }],
          usage: null,
          flowsUsage: null,
          generatedFlows: [],
        },
      ],
    });

    const res = await handler(mockRequest("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body["v3/articles"]).toBeDefined();
    expect(body["v3/articles"].ideas).toEqual([{ id: "x1" }]);
  });

  // 6. PUT - upserts doc with correct shape
  it("PUT upserts ideas doc and returns saved: true", async () => {
    const reqBody = {
      folderPath: "v3/categories",
      ideas: [{ id: "idea-1" }],
      usage: { inputTokens: 100 },
      flowsUsage: null,
      generatedFlows: ["gen.flow.xml"],
    };

    const res = await handler(mockRequest("PUT", {}, reqBody), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.saved).toBe(true);
    expect(body.folderPath).toBe("v3/categories");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertedDoc = mockUpsert.mock.calls[0][0];
    expect(upsertedDoc.id).toBe("ideas:v3|categories");
    expect(upsertedDoc.projectId).toBe("test-project");
    expect(upsertedDoc.type).toBe("ideas");
    expect(upsertedDoc.folderPath).toBe("v3/categories");
    expect(upsertedDoc.ideas).toEqual([{ id: "idea-1" }]);
    expect(upsertedDoc.usage).toEqual({ inputTokens: 100 });
    expect(upsertedDoc.flowsUsage).toBeNull();
    expect(upsertedDoc.generatedFlows).toEqual(["gen.flow.xml"]);
    expect(upsertedDoc.updatedBy).toEqual({ oid: "test-oid", name: "Test User" });
    expect(upsertedDoc.updatedAt).toBeDefined();
  });

  // 7. PUT - returns 400 when folderPath missing
  it("PUT returns 400 when folderPath is missing", async () => {
    const res = await handler(mockRequest("PUT", {}, { ideas: [] }), ctx);
    expect(res.status).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain("folderPath");
  });

  // 8. DELETE - deletes doc
  it("DELETE deletes ideas doc and returns deleted: true", async () => {
    const res = await handler(
      mockRequest("DELETE", { folderPath: "v3/articles" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.deleted).toBe(true);
    expect(body.folderPath).toBe("v3/articles");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  // 9. DELETE - returns 400 when folderPath missing
  it("DELETE returns 400 when folderPath is missing", async () => {
    const res = await handler(mockRequest("DELETE"), ctx);
    expect(res.status).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain("folderPath");
  });

  // 10. DELETE - idempotent (swallows delete errors)
  it("DELETE is idempotent when doc does not exist", async () => {
    mockDelete.mockRejectedValueOnce(new Error("not found"));

    const res = await handler(
      mockRequest("DELETE", { folderPath: "v3/gone" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.deleted).toBe(true);
  });

  // 11. Unsupported method -> 405
  it("unsupported method returns 405", async () => {
    const res = await handler(mockRequest("POST"), ctx);
    expect(res.status).toBe(405);
    const body = parseBody(res);
    expect(body.error).toBe("Method Not Allowed");
  });

  // 12. PATCH rename — missing params returns 400
  it("PATCH rename requires oldPath and newPath", async () => {
    const res = await handler(mockRequest("PATCH", {}, { oldPath: "V3/articles" }), ctx);
    expect(res.status).toBe(400);
    const body = parseBody(res);
    expect(body.error).toBe("oldPath and newPath are required");
  });

  // 13. PATCH rename — migrates documents
  it("PATCH rename migrates ideas to new path", async () => {
    mockFetchAll.mockResolvedValueOnce({
      resources: [
        {
          id: "ideas:V3|articles",
          projectId: "test-project",
          type: "ideas",
          folderPath: "V3/articles",
          ideas: [{ id: "idea-1", title: "Test", specFiles: ["V3/articles/create.md"] }],
          usage: null,
          flowsUsage: null,
          generatedFlows: [],
          updatedAt: "2026-01-01",
          updatedBy: { oid: "x", name: "X" },
        },
      ],
    });
    const res = await handler(
      mockRequest("PATCH", {}, { oldPath: "V3/articles", newPath: "V3/items" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.migrated).toBe(1);
    // Verify delete was called for old doc
    expect(mockDelete).toHaveBeenCalled();
    // Verify upsert was called with updated paths
    const upsertCall = mockUpsert.mock.calls[0][0];
    expect(upsertCall.folderPath).toBe("V3/items");
    expect(upsertCall.id).toBe("ideas:V3|items");
    expect(upsertCall.ideas[0].specFiles[0]).toBe("V3/items/create.md");
  });
});
