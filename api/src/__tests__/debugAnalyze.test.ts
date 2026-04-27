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

const mockCallAI = jest.fn();
jest.mock("../lib/aiClient", () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
  AiConfigError: class extends Error { constructor(m: string) { super(m); this.name = "AiConfigError"; } },
  CreditDeniedError: class extends Error {
    creditDenied: unknown;
    constructor(b: unknown) { super("denied"); this.name = "CreditDeniedError"; this.creditDenied = b; }
  },
}));

const SAMPLE_FLOW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow</name>
  <entity>Test</entity>
  <steps>
    <step number="1">
      <name>GET items</name>
      <method>GET</method>
      <path>/v3/items</path>
    </step>
    <step number="2">
      <name>POST item</name>
      <method>POST</method>
      <path>/v3/items</path>
    </step>
  </steps>
</flow>`;

const mockResolveScenario = jest.fn();
jest.mock("../lib/flowRunner/scenarioResolver", () => ({
  resolveScenario: (...args: unknown[]) => mockResolveScenario(...args),
  ScenarioNotFoundError: class extends Error {
    constructor(id: string) { super(`Scenario not found: ${id}`); this.name = "ScenarioNotFoundError"; }
  },
}));

jest.mock("../lib/flowRunner/parser", () => {
  const actual = jest.requireActual("../lib/flowRunner/parser");
  return actual;
});

const mockTestRunsQuery = jest.fn();
jest.mock("../lib/cosmosClient", () => ({
  getTestRunsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({
        fetchAll: () => mockTestRunsQuery(),
      }),
    },
  }),
}));

// Default mock response for callAI
const DEFAULT_DIAGNOSIS = {
  summary: "The request includes a field called 'project_version_id' that the API does not accept. Remove it from the request body to fix the error.",
  whatWentWrong: "Extra field in request",
  category: "extra_field",
  canYouFixIt: true,
  howToFix: "1. Open the flow XML\n2. Find the PATCH /v3/categories/settings step\n3. Remove the project_version_id field from the request body",
  fixPrompt: "In step 'PATCH category settings' (PATCH /v3/categories/settings), remove the project_version_id field from the request body",
  developerNote: "The field project_version_id is not in the schema's properties list. The endpoint uses additionalProperties: false, so unknown fields cause a 500.",
  problematicFields: [{ field: "project_version_id", issue: "Not in schema", suggestion: "Remove it" }],
  confidence: "high",
};

function makeCallAIResult(text: string, inputTokens = 500, outputTokens = 200) {
  return {
    text,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd: 0.0045, model: "claude-sonnet-4-6", source: "debugAnalyze" },
    raw: { content: [{ type: "text", text }], usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
  };
}

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
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValue(makeCallAIResult(JSON.stringify(DEFAULT_DIAGNOSIS)));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns 400 when neither scenarioId nor step is provided", async () => {
    const res = await debugAnalyze(mockRequest("POST", {}) as any, ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/scenarioId.*stepNumber|step.*method.*path/i);
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

  test("returns 400 when step has no path", async () => {
    const res = await debugAnalyze(
      mockRequest("POST", { step: { name: "test", method: "GET" } }) as any,
      ctx,
    );
    expect(res.status).toBe(400);
  });

  test("strips markdown code fences from AI response", async () => {
    const fencedJson = "```json\n" + JSON.stringify({
      summary: "Extra field detected",
      whatWentWrong: "Extra field in request",
      category: "extra_field",
      canYouFixIt: true,
      howToFix: "Remove the field",
      fixPrompt: "Remove project_version_id",
      developerNote: "Field not in schema",
      confidence: "high",
    }) + "\n```";

    // callAI returns .text — debugAnalyze strips fences from it
    mockCallAI.mockResolvedValueOnce(makeCallAIResult(fencedJson, 300, 150));

    const res = await debugAnalyze(
      mockRequest("POST", {
        step: { name: "test", method: "PATCH", path: "/v3/categories/settings" },
      }) as any,
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.diagnosis.summary).toBe("Extra field detected");
    expect(parsed.diagnosis.canYouFixIt).toBe(true);
    expect(parsed.diagnosis.category).toBe("extra_field");
  });
});

describe("POST /api/debug-analyze — minimal mode", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: "test-key" };
    mockResolveScenario.mockReset();
    mockTestRunsQuery.mockReset();
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValue(makeCallAIResult(JSON.stringify(DEFAULT_DIAGNOSIS)));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns 200 with diagnosis when scenarioId + stepNumber provided", async () => {
    mockResolveScenario.mockResolvedValue({
      xml: SAMPLE_FLOW_XML,
      fileName: "V3/test-flow.flow.xml",
      projectId: "test-project",
    });
    mockTestRunsQuery.mockResolvedValue({
      resources: [{
        testResults: {
          "xml:test-flow.s1": {
            status: "fail",
            httpStatus: 500,
            failureReason: "Expected 200, got 500",
            requestBody: { bad: "field" },
            responseBody: { error: "Server Error" },
            assertionResults: [{ description: "Status 200", passed: false }],
          },
        },
      }],
    });

    const res = await debugAnalyze(
      mockRequest("POST", {
        scenarioId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        stepNumber: 1,
      }) as any,
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.diagnosis).toBeDefined();
    expect(parsed.usage).toBeDefined();
  });

  test("returns 404 when scenario not found", async () => {
    const { ScenarioNotFoundError } = require("../lib/flowRunner/scenarioResolver");
    mockResolveScenario.mockRejectedValue(new ScenarioNotFoundError("bad-id"));

    const res = await debugAnalyze(
      mockRequest("POST", {
        scenarioId: "bad-id",
        stepNumber: 1,
      }) as any,
      ctx,
    );
    expect(res.status).toBe(404);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/scenario not found/i);
  });

  test("returns 400 when step out of range", async () => {
    mockResolveScenario.mockResolvedValue({
      xml: SAMPLE_FLOW_XML,
      fileName: "V3/test-flow.flow.xml",
      projectId: "test-project",
    });

    const res = await debugAnalyze(
      mockRequest("POST", {
        scenarioId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        stepNumber: 99,
      }) as any,
      ctx,
    );
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/step 99 not found/i);
  });

  test("returns 404 when no test run found", async () => {
    mockResolveScenario.mockResolvedValue({
      xml: SAMPLE_FLOW_XML,
      fileName: "V3/test-flow.flow.xml",
      projectId: "test-project",
    });
    mockTestRunsQuery.mockResolvedValue({ resources: [] });

    const res = await debugAnalyze(
      mockRequest("POST", {
        scenarioId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        stepNumber: 1,
      }) as any,
      ctx,
    );
    expect(res.status).toBe(404);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/no test run found/i);
  });

  test("falls through to full-payload mode when scenarioId absent", async () => {
    const res = await debugAnalyze(
      mockRequest("POST", {
        step: {
          name: "PATCH test",
          method: "PATCH",
          path: "/v3/test",
        },
      }) as any,
      ctx,
    );
    expect(res.status).toBe(200);
    // resolveScenario should NOT have been called
    expect(mockResolveScenario).not.toHaveBeenCalled();
  });
});
