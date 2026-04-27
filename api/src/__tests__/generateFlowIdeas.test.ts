/**
 * Unit tests for the generate-flow-ideas Azure Function.
 */

import type { InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the module under test)
// ---------------------------------------------------------------------------

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
}));

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([]),
  downloadBlob: jest.fn().mockResolvedValue("# Spec content"),
}));

jest.mock("../lib/specDistillCache", () => ({
  readDistilledContent: jest.fn().mockResolvedValue("# Distilled content"),
}));

jest.mock("../lib/specDigest", () => ({
  readDigest: jest.fn().mockResolvedValue(null),
  rebuildDigest: jest.fn().mockResolvedValue("# Digest content"),
}));

jest.mock("../lib/modelPricing", () => ({
  DEFAULT_IDEAS_MODEL: "claude-sonnet-4-6",
  priceFor: jest.fn().mockReturnValue({ inputPrice: 0.000003, outputPrice: 0.000015 }),
}));

jest.mock("../lib/apiRules", () => ({
  extractVersionFolder: jest.fn((path: string) => {
    const trimmed = path.replace(/^\/+/, "");
    return trimmed.split("/")[0] || null;
  }),
}));

jest.mock("../lib/aiContext", () => ({
  loadAiContext: jest.fn().mockResolvedValue({
    rules: "",
    enumAliases: "",
    projectVariables: [],
    dependencyInfo: null,
    enrichSystemPrompt: (p: string) => p,
  }),
}));

const mockCallAI = jest.fn();
jest.mock("../lib/aiClient", () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
  AiConfigError: class extends Error {
    constructor(m: string) { super(m); this.name = "AiConfigError"; }
  },
  CreditDeniedError: class extends Error {
    creditDenied: unknown;
    constructor(b: unknown) { super("denied"); this.name = "CreditDeniedError"; this.creditDenied = b; }
  },
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { generateFlowIdeasHandler } from "../functions/generateFlowIdeas";
import { AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { listBlobs } from "../lib/blobClient";
import { readDistilledContent } from "../lib/specDistillCache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(text: string) {
  return {
    text,
    usage: {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      costUsd: 0.005,
      model: "claude-sonnet-4-6",
      source: "generateFlowIdeas",
    },
    raw: {},
  };
}

function mockRequest(method: string, body?: unknown) {
  return {
    method,
    query: new URLSearchParams(),
    json: jest.fn().mockResolvedValue(body ?? {}),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-flowforge-projectid" ? "test-project" : null,
    },
  };
}

const ctx = {} as InvocationContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateFlowIdeas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. OPTIONS → 204
  it("returns 204 for OPTIONS preflight", async () => {
    const req = mockRequest("OPTIONS");
    const res = await generateFlowIdeasHandler(req as any, ctx);
    expect(res.status).toBe(204);
  });

  // 2. Invalid JSON → 400
  it("returns 400 for invalid JSON body", async () => {
    const req = {
      method: "POST",
      query: new URLSearchParams(),
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    };
    const res = await generateFlowIdeasHandler(req as any, ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("Invalid JSON body");
  });

  // 3. Missing folderPath → 400
  it("returns 400 when folderPath is missing", async () => {
    const req = mockRequest("POST", {});
    const res = await generateFlowIdeasHandler(req as any, ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("folderPath is required");
  });

  // 4. Single .md file path — reads single file
  it("reads a single .md file when folderPath ends with .md", async () => {
    const ideas = [{ id: "idea-1", title: "Test", steps: ["GET /v1/items"], complexity: "simple" }];
    mockCallAI.mockResolvedValue(makeResult(JSON.stringify(ideas)));

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    expect(readDistilledContent).toHaveBeenCalledWith("test-project/v1/specs/endpoint.md");
    const parsed = JSON.parse(res.body as string);
    expect(parsed.ideas).toHaveLength(1);
  });

  // 5. Explicit filePaths — reads those files
  it("reads explicit filePaths when provided", async () => {
    const ideas = [{ id: "idea-1", title: "Test", steps: [], complexity: "simple" }];
    mockCallAI.mockResolvedValue(makeResult(JSON.stringify(ideas)));

    const req = mockRequest("POST", {
      folderPath: "v1/specs",
      filePaths: ["v1/specs/a.md", "v1/specs/b.md"],
    });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    expect(readDistilledContent).toHaveBeenCalledTimes(2);
    expect(readDistilledContent).toHaveBeenCalledWith("test-project/v1/specs/a.md");
    expect(readDistilledContent).toHaveBeenCalledWith("test-project/v1/specs/b.md");
  });

  // 6. Folder mode with empty .md files → returns ideas:[], message
  it("returns empty ideas with message when folder has no .md files", async () => {
    (listBlobs as jest.Mock).mockResolvedValue([]);

    const req = mockRequest("POST", { folderPath: "v1/specs" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.ideas).toEqual([]);
    expect(parsed.message).toMatch(/No .md files/);
  });

  // 7. Successful idea generation — returns parsed ideas array and usage
  it("returns parsed ideas and usage on success", async () => {
    const ideas = [
      { id: "idea-1", title: "Create item", steps: ["POST /v1/items", "DELETE /v1/items/{id}"], complexity: "simple" },
      { id: "idea-2", title: "Update item", steps: ["POST /v1/items", "PUT /v1/items/{id}", "DELETE /v1/items/{id}"], complexity: "moderate" },
    ];
    mockCallAI.mockResolvedValue(makeResult(JSON.stringify(ideas)));

    (listBlobs as jest.Mock).mockResolvedValue([
      { name: "test-project/v1/specs/create.md" },
      { name: "test-project/v1/specs/update.md" },
    ]);

    const req = mockRequest("POST", { folderPath: "v1/specs" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.ideas).toHaveLength(2);
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.inputTokens).toBe(200);
    expect(parsed.usage.outputTokens).toBe(100);
    expect(parsed.usage.filesAnalyzed).toBe(2);
  });

  // 8. Strips markdown fences from response
  it("strips markdown code fences from AI response", async () => {
    const ideas = [{ id: "idea-1", title: "Test", steps: [], complexity: "simple" }];
    const fenced = "```json\n" + JSON.stringify(ideas) + "\n```";
    mockCallAI.mockResolvedValue(makeResult(fenced));

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.ideas).toHaveLength(1);
    expect(parsed.ideas[0].id).toBe("idea-1");
  });

  // 9. Non-array response wrapped in array
  it("wraps non-array JSON response in an array", async () => {
    const single = { id: "idea-1", title: "Single", steps: [], complexity: "simple" };
    mockCallAI.mockResolvedValue(makeResult(JSON.stringify(single)));

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(Array.isArray(parsed.ideas)).toBe(true);
    expect(parsed.ideas).toHaveLength(1);
    expect(parsed.ideas[0].id).toBe("idea-1");
  });

  // 10. Unparseable response returns parseError: true
  it("returns parseError when AI response is not valid JSON", async () => {
    mockCallAI.mockResolvedValue(makeResult("This is not JSON at all"));

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.parseError).toBe(true);
    expect(parsed.ideas).toEqual([]);
    expect(parsed.rawText).toBe("This is not JSON at all");
  });

  // 11. AiConfigError → 500
  it("returns 500 for AiConfigError", async () => {
    mockCallAI.mockRejectedValue(new AiConfigError("API key not configured"));

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(500);
    expect(JSON.parse(res.body as string).error).toBe("API key not configured");
  });

  // 12. CreditDeniedError → 402
  it("returns 402 for CreditDeniedError", async () => {
    const denied = new CreditDeniedError({
      reason: "Budget exhausted",
      projectCredits: { used: 100, limit: 100 },
      userCredits: { used: 50, limit: 50 },
    });
    mockCallAI.mockRejectedValue(denied);

    const req = mockRequest("POST", { folderPath: "v1/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(402);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Budget exhausted");
    expect(parsed.projectCredits).toBeDefined();
    expect(parsed.userCredits).toBeDefined();
  });

  // 13. Pre-estimate cost budget enforcement → 422
  it("returns 422 when estimated cost exceeds budget", async () => {
    const req = mockRequest("POST", {
      folderPath: "v1/specs/endpoint.md",
      maxBudgetUsd: 0.0001, // very small budget
    });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(422);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toMatch(/exceeds budget/);
    expect(parsed.estimatedCostUsd).toBeDefined();
    expect(parsed.budget).toBe(0.0001);
  });

  // 14. Post-processes version prefixes in steps
  it("fixes wrong version prefixes in idea steps", async () => {
    const ideas = [
      {
        id: "idea-1",
        title: "Test",
        steps: ["POST /v1/items", "GET /v2/items/{id}", "DELETE /v1/items/{id}"],
        complexity: "simple",
      },
    ];
    mockCallAI.mockResolvedValue(makeResult(JSON.stringify(ideas)));

    // Spec content contains /v3/ paths so canonicalVersion = v3
    (readDistilledContent as jest.Mock).mockResolvedValue("GET /v3/items/{id} returns 200");

    const req = mockRequest("POST", { folderPath: "v3/specs/endpoint.md" });
    const res = await generateFlowIdeasHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    // All steps should have been rewritten to /v3/
    for (const step of parsed.ideas[0].steps) {
      expect(step).toMatch(/\/v3\//);
      expect(step).not.toMatch(/\/v1\//);
      expect(step).not.toMatch(/\/v2\//);
    }
  });
});
