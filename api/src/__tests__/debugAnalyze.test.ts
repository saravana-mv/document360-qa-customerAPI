/**
 * Unit tests for the debug-analyze Azure Function.
 */

import type { InvocationContext } from "@azure/functions";

jest.mock("../lib/auditLog", () => ({
  audit: jest.fn(),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  ProjectIdMissingError: class extends Error { constructor() { super("missing"); } },
}));

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([]),
  downloadBlob: jest.fn().mockResolvedValue("# Spec content"),
}));

jest.mock("../lib/specDistillCache", () => ({
  readDistilledContent: jest.fn().mockResolvedValue("# Distilled content"),
}));

jest.mock("../lib/aiCredits", () => ({
  checkCredits: jest.fn().mockResolvedValue({ allowed: true }),
  recordUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: "text",
          text: JSON.stringify({
            rootCause: "Extra field in request body",
            category: "extra_field",
            details: "The field project_version_id is not in the schema",
            problematicFields: [{ field: "project_version_id", issue: "Not in schema", suggestion: "Remove it" }],
            confidence: "high",
          }),
        }],
        usage: { input_tokens: 500, output_tokens: 200 },
      }),
    },
  }));
});

import { debugAnalyze } from "../functions/debugAnalyze";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(method: string, body?: unknown) {
  return {
    method,
    query: new URLSearchParams(),
    json: jest.fn().mockResolvedValue(body ?? {}),
  };
}

const ctx = {} as InvocationContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OPTIONS /api/debug-analyze", () => {
  test("returns 204", async () => {
    const res = await debugAnalyze(mockRequest("OPTIONS") as any, ctx);
    expect(res.status).toBe(204);
  });
});

describe("POST /api/debug-analyze", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns 400 when step data is missing", async () => {
    const res = await debugAnalyze(mockRequest("POST", {}) as any, ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/step.*required/i);
  });

  test("returns 400 when step has no method", async () => {
    const res = await debugAnalyze(
      mockRequest("POST", { step: { name: "test", path: "/v3/foo" } }) as any,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  test("returns 200 with diagnosis on valid request", async () => {
    const res = await debugAnalyze(
      mockRequest("POST", {
        step: {
          name: "PATCH category settings",
          method: "PATCH",
          path: "/v3/categories/settings",
          httpStatus: 500,
          failureReason: "Expected 200, got 500",
          requestBody: { project_version_id: "abc", name: "Test" },
          responseBody: { error: "Internal Server Error" },
          assertionResults: [
            { description: "Status 200", passed: false },
          ],
        },
      }) as any,
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.diagnosis).toBeDefined();
    expect(parsed.diagnosis.rootCause).toBeTruthy();
    expect(parsed.diagnosis.category).toBe("extra_field");
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.costUsd).toBeGreaterThan(0);
  });
});
