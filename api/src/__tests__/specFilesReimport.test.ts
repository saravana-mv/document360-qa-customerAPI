/**
 * Unit tests for the spec-files/reimport Azure Function.
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

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([
    { name: "test-project/V3/articles/get-article.md", size: 100, lastModified: new Date(), contentType: "text/markdown" },
    { name: "test-project/V3/_system/_swagger.json", size: 200, lastModified: new Date(), contentType: "application/json" },
  ]),
  downloadBlob: jest.fn().mockImplementation((path: string) => {
    if (path.endsWith("_skills.md")) return Promise.resolve("# Skills\n## Lessons Learned\n- lesson1");
    if (path.endsWith("_rules.json")) return Promise.resolve('{"rules":[],"enumAliases":[]}');
    return Promise.reject(new Error("not found"));
  }),
  uploadBlob: jest.fn().mockResolvedValue(undefined),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/cosmosClient", () => ({
  getIdeasContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({
        fetchAll: () => Promise.resolve({ resources: [{ id: "ideas:V3/articles" }] }),
      }),
    },
    item: () => ({ delete: jest.fn().mockResolvedValue(undefined) }),
  }),
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({
        fetchAll: () => Promise.resolve({ resources: [{ id: "flow:V3/articles/get-article.flow.xml" }] }),
      }),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    item: (id: string) => ({
      delete: jest.fn().mockResolvedValue(undefined),
      read: () => Promise.resolve({ resource: id === "__active_tests__" ? { id: "__active_tests__", projectId: "test-project", flows: ["V3/articles/get-article.flow.xml", "V4/other.flow.xml"] } : null }),
    }),
  }),
  getFlowChatSessionsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({
        fetchAll: () => Promise.resolve({ resources: [{ id: "chat-1" }] }),
      }),
    },
    item: () => ({ delete: jest.fn().mockResolvedValue(undefined) }),
  }),
}));

jest.mock("../lib/swaggerSplitter", () => ({
  splitSwagger: jest.fn().mockReturnValue({
    files: [
      { folder: "articles", filename: "get-article.md", content: "# GET /articles" },
      { folder: "articles", filename: "post-article.md", content: "# POST /articles" },
    ],
    stats: { endpoints: 2, folders: 1, skipped: 0 },
    suggestedVariables: [{ name: "project_id", description: "Project ID", type: "string" }],
    suggestedConnections: [{ name: "Bearer", provider: "bearer" }],
  }),
}));

jest.mock("../lib/specBatchHelpers", () => ({
  batchUpload: jest.fn().mockResolvedValue(undefined),
  batchDistillAll: jest.fn().mockResolvedValue([
    { file: "test-project/V3/articles/get-article.md", status: "distilled" },
    { file: "test-project/V3/articles/post-article.md", status: "distilled" },
  ]),
}));

jest.mock("../lib/specDigest", () => ({
  rebuildDigest: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/specDependencies", () => ({
  rebuildDependencies: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/browserFetch", () => ({
  browserFetch: jest.fn(),
}));

// We need to import the handler after mocks
// The module registers with app.http so we need to mock that too
const mockHandler = { fn: null as Function | null };
jest.mock("@azure/functions", () => ({
  app: {
    http: (_name: string, config: { handler: Function }) => {
      mockHandler.fn = config.handler;
    },
  },
}));

import * as blobClient from "../lib/blobClient";

// Trigger module load (registers handler)
require("../functions/specFilesReimport");

const ctx = {} as InvocationContext;

function mockRequest(body: unknown) {
  return {
    method: "POST",
    query: new URLSearchParams(),
    json: jest.fn().mockResolvedValue(body),
  };
}

describe("POST /api/spec-files/reimport", () => {
  const handler = () => mockHandler.fn!;

  test("returns 400 if folderPath is missing", async () => {
    const res = await handler()(mockRequest({}), ctx);
    expect(res.status).toBe(400);
  });

  test("returns 400 if neither specContent nor specUrl provided", async () => {
    const res = await handler()(mockRequest({ folderPath: "V3" }), ctx);
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid JSON in specContent", async () => {
    const res = await handler()(mockRequest({ folderPath: "V3", specContent: "not-json" }), ctx);
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toContain("Invalid JSON");
  });

  test("returns 400 for non-OpenAPI spec", async () => {
    const res = await handler()(mockRequest({ folderPath: "V3", specContent: '{"foo":"bar"}' }), ctx);
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toContain("OpenAPI");
  });

  test("successful reimport preserves skills and rules", async () => {
    const specContent = JSON.stringify({ openapi: "3.0.0", paths: { "/articles": { get: {} } } });
    const res = await handler()(mockRequest({ folderPath: "V3", specContent }), ctx);
    expect(res.status).toBe(200);

    const body = JSON.parse(res.body as string);
    expect(body.stats.endpoints).toBe(2);
    expect(body.suggestedVariables).toHaveLength(1);
    expect(body.suggestedConnections).toHaveLength(1);

    // Verify blobs were deleted
    expect(blobClient.deleteBlob).toHaveBeenCalled();

    // Verify skills and rules were re-uploaded
    const uploadCalls = (blobClient.uploadBlob as jest.Mock).mock.calls;
    const skillsUpload = uploadCalls.find((c: string[]) => c[0].includes("_skills.md"));
    const rulesUpload = uploadCalls.find((c: string[]) => c[0].includes("_rules.json"));
    expect(skillsUpload).toBeDefined();
    expect(rulesUpload).toBeDefined();
  });

  test("OPTIONS returns 204", async () => {
    const req = { method: "OPTIONS", query: new URLSearchParams() };
    const res = await handler()(req, ctx);
    expect(res.status).toBe(204);
  });
});
