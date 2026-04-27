/**
 * Unit tests for the generate-flow Azure Function (non-streaming path).
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { app } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the module under test)
// ---------------------------------------------------------------------------

const mockCallAI = jest.fn();
const mockStreamAI = jest.fn();

jest.mock("../lib/aiClient", () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
  streamAI: (...args: unknown[]) => mockStreamAI(...args),
  AiConfigError: class extends Error {
    constructor(m: string) { super(m); this.name = "AiConfigError"; }
  },
  CreditDeniedError: class extends Error {
    creditDenied: unknown;
    constructor(b: unknown) { super("denied"); this.name = "CreditDeniedError"; this.creditDenied = b; }
  },
}));

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([]),
  downloadBlob: jest.fn().mockResolvedValue("# Spec content"),
}));

jest.mock("../lib/specDistillCache", () => ({
  readDistilledContent: jest.fn().mockResolvedValue("# Distilled spec\n## POST /v3/articles\nRequest body..."),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
}));

jest.mock("../lib/apiRules", () => ({
  extractVersionFolder: jest.fn().mockReturnValue("V3"),
}));

jest.mock("../lib/aiContext", () => ({
  loadAiContext: jest.fn().mockResolvedValue({
    rules: "",
    enumAliases: "",
    projectVariables: [],
    dependencyInfo: null,
    specContext: "",
    specSource: "none",
    flowStepSpecs: [],
    enrichSystemPrompt: (p: string) => p,
    formatUserContext: () => "",
    formatFlowStepSpecs: () => "",
  }),
}));

jest.mock("../lib/specRequiredFields", () => ({
  extractCommonRequiredFields: jest.fn().mockReturnValue([]),
  analyzeCrossStepDependencies: jest.fn().mockReturnValue(""),
  injectCrossStepCaptures: jest.fn((xml: string) => xml),
  injectSpecRequiredFields: jest.fn((xml: string) => xml),
  injectEndpointRefs: jest.fn((xml: string) => xml),
  injectRulesRequiredFields: jest.fn((xml: string) => xml),
}));

jest.mock("../lib/cosmosClient", () => ({
  getIdeasContainer: jest.fn().mockResolvedValue({
    items: { query: () => ({ fetchAll: () => Promise.resolve({ resources: [] }) }) },
    item: () => ({ read: () => Promise.resolve({ resource: null }) }),
  }),
}));

jest.mock("../lib/specFileSelection", () => ({
  filterRelevantSpecs: jest.fn().mockReturnValue(["V3/articles/create.md"]),
}));

// ---------------------------------------------------------------------------
// Import module under test (triggers app.http registration)
// ---------------------------------------------------------------------------

import "../functions/generateFlow";
import { AiConfigError, CreditDeniedError } from "../lib/aiClient";
import { readDistilledContent } from "../lib/specDistillCache";

// Extract the registered handler from the app.http mock
const appHttpMock = app.http as jest.Mock;
const registrationCall = appHttpMock.mock.calls.find(
  (c: unknown[]) => c[0] === "generateFlow",
);
if (!registrationCall) throw new Error("generateFlow handler was not registered");
const generateFlowHandler = registrationCall[1].handler as (
  req: HttpRequest,
  ctx: InvocationContext,
) => Promise<HttpResponseInit>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCallAIResult(text: string) {
  return {
    text,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: 0.001,
      model: "claude-sonnet-4-6",
    },
  };
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow</name>
  <entity>Articles</entity>
  <description>A test flow</description>
  <steps>
    <step number="1">
      <name>Create Article</name>
      <method>POST</method>
      <path>/v3/articles</path>
      <assertions>
        <assertion type="status" code="201"/>
      </assertions>
    </step>
  </steps>
</flow>`;

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

describe("generateFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the distilled content mock to default
    (readDistilledContent as jest.Mock).mockResolvedValue(
      "# Distilled spec\n## POST /v3/articles\nRequest body...",
    );
  });

  // 1. OPTIONS -> 204
  it("returns 204 for OPTIONS preflight", async () => {
    const req = mockRequest("OPTIONS");
    const res = await generateFlowHandler(req as any, ctx);
    expect(res.status).toBe(204);
  });

  // 2. Invalid JSON -> 400
  it("returns 400 for invalid JSON body", async () => {
    const req = {
      method: "POST",
      query: new URLSearchParams(),
      json: jest.fn().mockRejectedValue(new Error("bad json")),
      headers: { get: () => null },
    };
    const res = await generateFlowHandler(req as any, ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Invalid JSON body");
  });

  // 3. Missing prompt -> 400
  it("returns 400 when prompt is missing", async () => {
    const req = mockRequest("POST", { stream: false });
    const res = await generateFlowHandler(req as any, ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("prompt is required");
  });

  // 4. Non-streaming success — returns XML and usage
  it("returns XML and usage on non-streaming success", async () => {
    mockCallAI.mockResolvedValue(makeCallAIResult(SAMPLE_XML));

    const req = mockRequest("POST", {
      prompt: "Create a test flow for articles",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toContain("<?xml");
    expect(parsed.xml).toContain("<flow");
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.inputTokens).toBe(100);
    expect(parsed.usage.outputTokens).toBe(50);
    expect(parsed.usage.totalTokens).toBe(150);
    expect(parsed.usage.costUsd).toBe(0.001);
  });

  // 5. cleanXmlResponse strips markdown fences
  it("strips markdown code fences from AI response", async () => {
    const fenced = "```xml\n" + SAMPLE_XML + "\n```";
    mockCallAI.mockResolvedValue(makeCallAIResult(fenced));

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toContain("<?xml");
    expect(parsed.xml).not.toContain("```");
  });

  // 6. cleanXmlResponse strips preamble before <?xml
  it("strips preamble text before the XML declaration", async () => {
    const withPreamble =
      "Here is the generated flow:\n\n" + SAMPLE_XML;
    mockCallAI.mockResolvedValue(makeCallAIResult(withPreamble));

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toMatch(/^<\?xml/);
    expect(parsed.xml).not.toContain("Here is the generated flow");
  });

  // 7. AiConfigError -> 500
  it("returns 500 for AiConfigError", async () => {
    mockCallAI.mockRejectedValue(new AiConfigError("API key not configured"));

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("API key not configured");
  });

  // 8. CreditDeniedError -> 402
  it("returns 402 for CreditDeniedError", async () => {
    const denied = new CreditDeniedError({
      reason: "Budget exhausted",
      projectCredits: { used: 100, limit: 100 },
      userCredits: { used: 50, limit: 50 },
    });
    mockCallAI.mockRejectedValue(denied);

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(402);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Budget exhausted");
    expect(parsed.projectCredits).toBeDefined();
    expect(parsed.userCredits).toBeDefined();
  });

  // 9. Generic error -> 502
  it("returns 502 for generic errors", async () => {
    mockCallAI.mockRejectedValue(new Error("Anthropic API timeout"));

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(502);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Anthropic API timeout");
  });

  // 10. All spec files fail to read -> 422
  it("returns 422 when all spec files fail to read", async () => {
    (readDistilledContent as jest.Mock).mockRejectedValue(
      new Error("Blob not found"),
    );

    const req = mockRequest("POST", {
      prompt: "Create a test flow",
      specFiles: ["V3/articles/create.md", "V3/articles/update.md"],
      stream: false,
    });
    const res = await generateFlowHandler(req as any, ctx);

    expect(res.status).toBe(422);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toContain("Could not read any");
    expect(parsed.failedFiles).toHaveLength(2);
  });
});
