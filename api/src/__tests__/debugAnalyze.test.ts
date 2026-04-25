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
            summary: "The request includes a field called 'project_version_id' that the API does not accept. Remove it from the request body to fix the error.",
            whatWentWrong: "Extra field in request",
            category: "extra_field",
            canYouFixIt: true,
            howToFix: "1. Open the flow XML\n2. Find the PATCH /v3/categories/settings step\n3. Remove the project_version_id field from the request body",
            fixPrompt: "In step 'PATCH category settings' (PATCH /v3/categories/settings), remove the project_version_id field from the request body",
            developerNote: "The field project_version_id is not in the schema's properties list. The endpoint uses additionalProperties: false, so unknown fields cause a 500.",
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
    expect(parsed.diagnosis.summary).toBeTruthy();
    expect(parsed.diagnosis.category).toBe("extra_field");
    expect(parsed.diagnosis.canYouFixIt).toBe(true);
    expect(parsed.diagnosis.fixPrompt).toBeTruthy();
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.costUsd).toBeGreaterThan(0);
  });
});
