/**
 * Unit tests for the flow-files Azure Function router (Cosmos DB backed).
 */

import type { InvocationContext } from "@azure/functions";

// Mock Cosmos container
const mockRead = jest.fn();
const mockDelete = jest.fn();
const mockUpsert = jest.fn();
const mockFetchAll = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: mockFetchAll }),
      upsert: mockUpsert,
    },
    item: () => ({
      read: mockRead,
      delete: mockDelete,
    }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  ProjectIdMissingError: class extends Error { constructor() { super("missing"); } },
}));

import { flowFilesRouter } from "../functions/flowFiles";

function mockRequest(method: string, query: Record<string, string> = {}, body?: unknown) {
  const params = new URLSearchParams(query);
  return {
    method,
    url: "http://localhost/api/flow-files",
    query: params,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    json: jest.fn().mockResolvedValue(body ?? {}),
  };
}

const ctx = {} as InvocationContext;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAll.mockResolvedValue({ resources: [] });
  mockRead.mockRejectedValue(new Error("not found"));
  mockDelete.mockResolvedValue(undefined);
  mockUpsert.mockResolvedValue(undefined);
});

describe("CORS", () => {
  test("OPTIONS returns 204", async () => {
    const res = await flowFilesRouter(mockRequest("OPTIONS") as any, ctx);
    expect(res.status).toBe(204);
  });

  test("GET includes CORS headers", async () => {
    const res = await flowFilesRouter(mockRequest("GET") as any, ctx);
    const headers = res.headers as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });
});

describe("GET /api/flow-files", () => {
  test("returns list of flow files", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{ path: "v3/articles/test.flow.xml", size: 512, updatedAt: "2026-01-01T00:00:00Z" }],
    });
    const res = await flowFilesRouter(mockRequest("GET") as any, ctx);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toContain(".flow.xml");
  });
});

describe("POST /api/flow-files", () => {
  test("creates when no conflict", async () => {
    const req = mockRequest("POST", {}, { name: "v3/f.flow.xml", xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalled();
  });

  test("returns 409 when exists and overwrite=false", async () => {
    mockRead.mockResolvedValue({ resource: { id: "flow:v3/dup.flow.xml" } });
    const req = mockRequest("POST", {}, { name: "v3/dup.flow.xml", xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(409);
  });

  test("returns 400 when name missing", async () => {
    const req = mockRequest("POST", {}, { xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/flow-files", () => {
  test("returns 200 when name provided", async () => {
    const req = mockRequest("DELETE", { name: "f.flow.xml" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
  });

  test("returns 400 when name missing", async () => {
    const res = await flowFilesRouter(mockRequest("DELETE") as any, ctx);
    expect(res.status).toBe(400);
  });
});

describe("Unknown method", () => {
  test("returns 405 for PUT", async () => {
    const res = await flowFilesRouter(mockRequest("PUT") as any, ctx);
    expect(res.status).toBe(405);
  });
});
