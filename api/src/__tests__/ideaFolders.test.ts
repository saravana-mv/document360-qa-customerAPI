/**
 * Unit tests for the ideaFolders Azure Function router.
 */

import type { InvocationContext } from "@azure/functions";

const mockRead = jest.fn();
const mockCreate = jest.fn().mockResolvedValue({});
const mockUpsert = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockFetchAll = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getIdeasContainer: jest.fn().mockResolvedValue({
    items: {
      create: (...args: unknown[]) => mockCreate(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      query: () => ({ fetchAll: () => mockFetchAll() }),
    },
    item: (_id: string) => ({
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

jest.mock("crypto", () => ({
  randomUUID: () => "00000000-0000-0000-0000-000000000001",
}));

import { app } from "@azure/functions";

require("../functions/ideas");

const registered = (app.http as jest.Mock).mock.calls.find(
  (c: unknown[]) => c[0] === "ideaFolders"
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
  mockCreate.mockResolvedValue({});
  mockUpsert.mockResolvedValue({});
});

describe("ideaFolders router", () => {
  // GET returns empty array for new project
  it("GET returns empty array when no folders exist", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });
    const res = await handler(mockRequest("GET"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual([]);
  });

  // GET returns sorted docs
  it("GET returns folders sorted by order", async () => {
    const folders = [
      { id: "ifolder:1", path: "v3", name: "v3", order: 0 },
      { id: "ifolder:2", path: "v3/articles", name: "articles", order: 1 },
    ];
    mockFetchAll.mockResolvedValueOnce({ resources: folders });
    const res = await handler(mockRequest("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body).toHaveLength(2);
    expect(body[0].path).toBe("v3");
    expect(body[1].path).toBe("v3/articles");
  });

  // POST creates folder with correct slug
  it("POST creates folder with slugified path", async () => {
    // Dup check returns empty
    mockFetchAll
      .mockResolvedValueOnce({ resources: [] })  // dup check
      .mockResolvedValueOnce({ resources: [null] }); // max order (null = no siblings)

    const res = await handler(
      mockRequest("POST", {}, { name: "My Articles", parentPath: null }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.name).toBe("My Articles");
    expect(body.path).toBe("my-articles");
    expect(body.parentPath).toBeNull();
    expect(body.id).toBe("ifolder:00000000-0000-0000-0000-000000000001");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // POST with parent path
  it("POST creates subfolder with parent path", async () => {
    mockFetchAll
      .mockResolvedValueOnce({ resources: [] })  // dup check
      .mockResolvedValueOnce({ resources: [2] }); // max order = 2

    const res = await handler(
      mockRequest("POST", {}, { name: "Comments", parentPath: "v3/articles" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.path).toBe("v3/articles/comments");
    expect(body.parentPath).toBe("v3/articles");
    expect(body.order).toBe(3); // max(2) + 1
  });

  // POST duplicate path returns 409
  it("POST returns 409 for duplicate path", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [{ id: "existing" }] });

    const res = await handler(
      mockRequest("POST", {}, { name: "articles", parentPath: "v3" }),
      ctx
    );
    expect(res.status).toBe(409);
    const body = parseBody(res);
    expect(body.error).toContain("already exists");
  });

  // POST returns 400 for empty name
  it("POST returns 400 for missing name", async () => {
    const res = await handler(mockRequest("POST", {}, { name: "" }), ctx);
    expect(res.status).toBe(400);
  });

  // PUT rename cascades to descendants
  it("PUT rename updates folder and cascades to descendants", async () => {
    // Read existing folder
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "ifolder:1",
        projectId: "test-project",
        type: "idea_folder",
        name: "articles",
        path: "v3/articles",
        parentPath: "v3",
        specFilePaths: ["v3/articles/create.md"],
        order: 0,
      },
    });

    // Descendant folders query
    mockFetchAll
      .mockResolvedValueOnce({
        resources: [{
          id: "ifolder:2",
          projectId: "test-project",
          type: "idea_folder",
          name: "comments",
          path: "v3/articles/comments",
          parentPath: "v3/articles",
          specFilePaths: [],
          order: 0,
        }],
      })
      // renameIdeasInternal query
      .mockResolvedValueOnce({ resources: [] });

    const res = await handler(
      mockRequest("PUT", {}, { id: "ifolder:1", name: "items" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.path).toBe("v3/items");
    expect(body.name).toBe("items");

    // Descendant folder was updated
    const descendantUpsert = mockUpsert.mock.calls.find(
      (c: unknown[]) => (c[0] as { id: string }).id === "ifolder:2"
    );
    expect(descendantUpsert).toBeDefined();
    expect((descendantUpsert![0] as { path: string }).path).toBe("v3/items/comments");
    expect((descendantUpsert![0] as { parentPath: string }).parentPath).toBe("v3/items");
  });

  // PUT specFilePaths-only update doesn't cascade
  it("PUT specFilePaths-only update doesn't trigger cascade", async () => {
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "ifolder:1",
        projectId: "test-project",
        type: "idea_folder",
        name: "articles",
        path: "v3/articles",
        parentPath: "v3",
        specFilePaths: [],
        order: 0,
      },
    });

    const res = await handler(
      mockRequest("PUT", {}, { id: "ifolder:1", specFilePaths: ["v3/articles/create.md"] }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.specFilePaths).toEqual(["v3/articles/create.md"]);

    // Only one upsert (the folder itself), no descendant queries
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    // fetchAll should NOT have been called (no cascade)
    expect(mockFetchAll).not.toHaveBeenCalled();
  });

  // PUT returns 404 for missing folder
  it("PUT returns 404 for missing folder", async () => {
    mockRead.mockRejectedValueOnce(new Error("not found"));
    const res = await handler(
      mockRequest("PUT", {}, { id: "ifolder:missing", name: "x" }),
      ctx
    );
    expect(res.status).toBe(404);
  });

  // DELETE cascades to descendants and ideas
  it("DELETE removes folder, descendants, and ideas", async () => {
    // Read folder
    mockRead.mockResolvedValueOnce({
      resource: {
        id: "ifolder:1",
        path: "v3/articles",
      },
    });

    // Descendant folders
    mockFetchAll
      .mockResolvedValueOnce({
        resources: [{ id: "ifolder:2", path: "v3/articles/comments" }],
      })
      // Ideas docs
      .mockResolvedValueOnce({
        resources: [{ id: "ideas:v3|articles" }],
      });

    const res = await handler(
      mockRequest("DELETE", { id: "ifolder:1" }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.deleted).toBe(true);
    expect(body.path).toBe("v3/articles");

    // 3 deletes: folder itself + descendant folder + ideas doc
    expect(mockDelete).toHaveBeenCalledTimes(3);
  });

  // DELETE returns 404 for missing folder
  it("DELETE returns 404 for missing id", async () => {
    mockRead.mockRejectedValueOnce(new Error("not found"));
    const res = await handler(
      mockRequest("DELETE", { id: "ifolder:missing" }),
      ctx
    );
    expect(res.status).toBe(404);
  });

  // DELETE returns 400 when id missing
  it("DELETE returns 400 when id param missing", async () => {
    const res = await handler(mockRequest("DELETE"), ctx);
    expect(res.status).toBe(400);
  });

  // OPTIONS returns 204
  it("OPTIONS returns 204", async () => {
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });
});
