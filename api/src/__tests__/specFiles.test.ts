/**
 * Unit tests for the spec-files Azure Function router.
 *
 * These tests guard against:
 *  - GET requests not being dispatched (the multi-registration SWA bug)
 *  - Wrong HTTP status codes per method
 *  - Missing CORS headers on every response
 *  - Required query/body param validation
 */

import type { InvocationContext } from "@azure/functions";

jest.mock("../lib/auditLog", () => ({
  audit: jest.fn(),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  ProjectIdMissingError: class extends Error { constructor() { super("missing"); } },
}));

// Mock blobClient before importing the router
jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([
    { name: "articles/get-article.md", size: 1024, lastModified: new Date(), contentType: "text/markdown" },
  ]),
  downloadBlob: jest.fn().mockResolvedValue("# Article content"),
  uploadBlob: jest.fn().mockResolvedValue(undefined),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
  renameBlob: jest.fn().mockResolvedValue(undefined),
}));

import { specFilesRouter } from "../functions/specFiles";
import * as blobClient from "../lib/blobClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(method: string, query: Record<string, string> = {}, body?: unknown) {
  const params = new URLSearchParams(query);
  return {
    method,
    query: params,
    json: jest.fn().mockResolvedValue(body ?? {}),
  };
}

const ctx = {} as InvocationContext;

// ---------------------------------------------------------------------------
// CORS — every response must carry the required headers
// ---------------------------------------------------------------------------

describe("CORS headers", () => {
  const methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];

  test.each(methods)("%s response includes Access-Control-Allow-Origin", async (method) => {
    const body = method === "POST" ? { name: "f.md", content: "x" }
               : method === "PUT"  ? { name: "f.md", content: "x" }
               : undefined;
    const req = mockRequest(method, method === "DELETE" ? { name: "f.md" } : {}, body);
    const res = await specFilesRouter(req as any, ctx);
    const headers = res.headers as Record<string, string> | undefined;
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// OPTIONS — preflight must return 204 with no body
// ---------------------------------------------------------------------------

describe("OPTIONS /api/spec-files", () => {
  test("returns 204", async () => {
    const res = await specFilesRouter(mockRequest("OPTIONS") as any, ctx);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET — this was the route that broke when multiple functions shared a route
// ---------------------------------------------------------------------------

describe("GET /api/spec-files", () => {
  test("returns 200 with file list", async () => {
    const res = await specFilesRouter(mockRequest("GET") as any, ctx);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("name");
  });

  test("calls listBlobs with prefix when query param is set", async () => {
    const req = mockRequest("GET", { prefix: "articles/" });
    await specFilesRouter(req as any, ctx);
    expect(blobClient.listBlobs).toHaveBeenCalledWith("articles/");
  });

  test("calls listBlobs with no prefix when query param is absent", async () => {
    jest.clearAllMocks();
    (blobClient.listBlobs as jest.Mock).mockResolvedValue([]);
    await specFilesRouter(mockRequest("GET") as any, ctx);
    expect(blobClient.listBlobs).toHaveBeenCalledWith(undefined);
  });

  test("returns 500 when listBlobs throws", async () => {
    (blobClient.listBlobs as jest.Mock).mockRejectedValueOnce(new Error("storage down"));
    const res = await specFilesRouter(mockRequest("GET") as any, ctx);
    expect(res.status).toBe(500);
    expect(res.body as string).toContain("storage down");
  });
});

// ---------------------------------------------------------------------------
// POST — create / upload
// ---------------------------------------------------------------------------

describe("POST /api/spec-files", () => {
  test("returns 200 when name and content are provided", async () => {
    const req = mockRequest("POST", {}, { name: "test.md", content: "# Hello" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.uploadBlob).toHaveBeenCalledWith("test.md", "# Hello", undefined);
  });

  test("returns 400 when name is missing", async () => {
    const req = mockRequest("POST", {}, { content: "# Hello" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });

  test("returns 400 when content is missing", async () => {
    const req = mockRequest("POST", {}, { name: "test.md" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT — update / rename
// ---------------------------------------------------------------------------

describe("PUT /api/spec-files", () => {
  test("returns 200 when updating content", async () => {
    const req = mockRequest("PUT", {}, { name: "test.md", content: "updated" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.uploadBlob).toHaveBeenCalledWith("test.md", "updated");
  });

  test("returns 200 when renaming", async () => {
    const req = mockRequest("PUT", {}, { name: "old.md", newName: "new.md" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.renameBlob).toHaveBeenCalledWith("old.md", "new.md");
  });

  test("returns 400 when name is missing", async () => {
    const req = mockRequest("PUT", {}, { content: "x" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });

  test("returns 400 when neither content nor newName is provided", async () => {
    const req = mockRequest("PUT", {}, { name: "test.md" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/spec-files", () => {
  test("returns 200 when name query param is provided", async () => {
    const req = mockRequest("DELETE", { name: "test.md" });
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.deleteBlob).toHaveBeenCalledWith("test.md");
  });

  test("returns 400 when name query param is missing", async () => {
    const req = mockRequest("DELETE");
    const res = await specFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Unknown method
// ---------------------------------------------------------------------------

describe("unknown method", () => {
  test("returns 405 for PATCH", async () => {
    const res = await specFilesRouter(mockRequest("PATCH") as any, ctx);
    expect(res.status).toBe(405);
  });
});
