/**
 * Unit tests for the edit-flow Azure Function.
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
  ProjectIdMissingError: class extends Error { constructor() { super("missing"); } },
}));

const mockLoadAiContext = jest.fn().mockResolvedValue({
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
});

jest.mock("../lib/aiContext", () => ({
  loadAiContext: (...args: unknown[]) => mockLoadAiContext(...args),
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
// Import module under test — triggers app.http() registration
// ---------------------------------------------------------------------------

import { app } from "@azure/functions";

require("../functions/editFlow");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(): (req: unknown, ctx: InvocationContext) => Promise<any> {
  const calls = (app.http as jest.Mock).mock.calls;
  const editFlowCall = calls.find((c: any[]) => c[0] === "editFlow");
  if (!editFlowCall) throw new Error("editFlow not registered via app.http");
  return editFlowCall[1].handler;
}

function makeCallAIResult(text: string, inputTokens = 500, outputTokens = 200) {
  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: 0.0045,
      model: "claude-sonnet-4-6",
      source: "editFlow",
    },
    raw: {
      content: [{ type: "text", text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
}

function mockRequest(method: string, body?: unknown) {
  return {
    method,
    query: new URLSearchParams(),
    headers: new Map(),
    json: body !== undefined
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error("no body")),
  };
}

const ctx = {} as InvocationContext;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow</name>
  <entity>Test</entity>
  <description>A test flow</description>
  <steps>
    <step number="1">
      <name>GET items</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;

const EDITED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow - Edited</name>
  <entity>Test</entity>
  <description>An edited test flow</description>
  <steps>
    <step number="1">
      <name>GET items</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("editFlow — registration", () => {
  test("registers with app.http as editFlow on route edit-flow", () => {
    const calls = (app.http as jest.Mock).mock.calls;
    const editFlowCall = calls.find((c: any[]) => c[0] === "editFlow");
    expect(editFlowCall).toBeDefined();
    expect(editFlowCall![1].route).toBe("edit-flow");
    expect(editFlowCall![1].methods).toEqual(["POST", "OPTIONS"]);
    expect(editFlowCall![1].authLevel).toBe("anonymous");
  });
});

describe("OPTIONS /api/edit-flow", () => {
  test("returns 204 with CORS headers", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
    expect(res.headers).toHaveProperty("Access-Control-Allow-Methods");
  });
});

describe("POST /api/edit-flow — validation", () => {
  test("returns 400 for invalid JSON body", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST"), ctx); // json() rejects
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Invalid JSON body");
  });

  test("returns 400 when xml is missing", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { prompt: "add a step" }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("xml and prompt are required");
  });

  test("returns 400 when prompt is missing", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { xml: SAMPLE_XML }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("xml and prompt are required");
  });

  test("returns 400 when both xml and prompt are missing", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", {}), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("xml and prompt are required");
  });

  test("returns 400 when xml is empty string", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { xml: "", prompt: "edit" }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("xml and prompt are required");
  });
});

describe("POST /api/edit-flow — successful edit", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLoadAiContext.mockClear();
    mockCallAI.mockResolvedValue(makeCallAIResult(EDITED_XML));
  });

  test("returns 200 with xml and usage on valid request", async () => {
    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "rename the flow" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toContain("<?xml");
    expect(parsed.xml).toContain("Test Flow - Edited");
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.inputTokens).toBe(500);
    expect(parsed.usage.outputTokens).toBe(200);
    expect(parsed.usage.totalTokens).toBe(700);
    expect(parsed.usage.costUsd).toBe(0.0045);
  });

  test("passes credits to callAI with correct identity", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit it" }),
      ctx,
    );
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.credits).toEqual({
      projectId: "test-project",
      userId: "test-oid",
      displayName: "test@example.com",
    });
  });

  test("passes source and maxTokens to callAI", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit it" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.source).toBe("editFlow");
    expect(callArg.maxTokens).toBe(8192);
  });

  test("passes requestedModel from body to callAI", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit it", model: "claude-opus-4" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.requestedModel).toBe("claude-opus-4");
  });

  test("sends user message containing the xml and prompt", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "add a DELETE step" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    const userContent = callArg.messages[0].content;
    expect(userContent).toContain(SAMPLE_XML);
    expect(userContent).toContain("add a DELETE step");
  });
});

describe("POST /api/edit-flow — cleanXmlResponse", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLoadAiContext.mockClear();
  });

  test("strips markdown xml fences from response", async () => {
    const fenced = "```xml\n" + EDITED_XML + "\n```";
    mockCallAI.mockResolvedValue(makeCallAIResult(fenced));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "rename" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).not.toContain("```");
    expect(parsed.xml).toContain("<?xml");
  });

  test("strips plain markdown fences (no language tag)", async () => {
    const fenced = "```\n" + EDITED_XML + "\n```";
    mockCallAI.mockResolvedValue(makeCallAIResult(fenced));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).not.toContain("```");
    expect(parsed.xml).toContain("<?xml");
  });

  test("strips preamble text before <?xml declaration", async () => {
    const withPreamble = "Here is the updated XML:\n\n" + EDITED_XML;
    mockCallAI.mockResolvedValue(makeCallAIResult(withPreamble));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toMatch(/^<\?xml/);
    expect(parsed.xml).not.toContain("Here is the updated XML");
  });

  test("handles both fences and preamble together", async () => {
    const messy = "```xml\nSure, here is your XML:\n" + EDITED_XML + "\n```";
    mockCallAI.mockResolvedValue(makeCallAIResult(messy));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toMatch(/^<\?xml/);
  });

  test("returns clean xml unchanged", async () => {
    mockCallAI.mockResolvedValue(makeCallAIResult(EDITED_XML));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    const parsed = JSON.parse(res.body as string);
    expect(parsed.xml).toBe(EDITED_XML);
  });
});

describe("POST /api/edit-flow — AI context loading", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLoadAiContext.mockClear();
    mockCallAI.mockResolvedValue(makeCallAIResult(EDITED_XML));
  });

  test("loads AI context with versionFolder when provided", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", {
        xml: SAMPLE_XML,
        prompt: "edit",
        versionFolder: "V3",
      }),
      ctx,
    );
    expect(mockLoadAiContext).toHaveBeenCalledTimes(1);
    const arg = mockLoadAiContext.mock.calls[0][0];
    expect(arg.projectId).toBe("test-project");
    expect(arg.versionFolder).toBe("V3");
  });

  test("loads spec and dependencies when method + path provided (Fix-it path)", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", {
        xml: SAMPLE_XML,
        prompt: "fix the step",
        method: "PATCH",
        path: "/v3/items/{id}",
        versionFolder: "V3",
      }),
      ctx,
    );
    const arg = mockLoadAiContext.mock.calls[0][0];
    expect(arg.endpointHint).toEqual({ method: "PATCH", path: "/v3/items/{id}" });
    expect(arg.flowXml).toBe(SAMPLE_XML);
    expect(arg.loadSpec).toBe(true);
    expect(arg.loadDependencies).toBe(true);
  });

  test("does not load spec when method/path not provided (manual edit)", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "rename" }),
      ctx,
    );
    const arg = mockLoadAiContext.mock.calls[0][0];
    expect(arg.endpointHint).toBeUndefined();
    expect(arg.flowXml).toBeUndefined();
    expect(arg.loadSpec).toBe(false);
    expect(arg.loadDependencies).toBe(false);
  });

  test("includes spec context in user message when available", async () => {
    mockLoadAiContext.mockResolvedValueOnce({
      rules: "",
      enumAliases: "",
      projectVariables: [],
      dependencyInfo: null,
      specContext: "## PATCH /v3/items/{id}\nUpdates an item",
      specSource: "distilled",
      flowStepSpecs: [],
      enrichSystemPrompt: (p: string) => p,
      formatUserContext: () => "",
      formatFlowStepSpecs: () => "",
    });

    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "fix it" }),
      ctx,
    );
    const userContent = mockCallAI.mock.calls[0][0].messages[0].content;
    expect(userContent).toContain("Endpoint Specification");
    expect(userContent).toContain("PATCH /v3/items/{id}");
    expect(userContent).toContain("(source: distilled)");
  });

  test("includes flowStepSpecs in user message when available", async () => {
    mockLoadAiContext.mockResolvedValueOnce({
      rules: "",
      enumAliases: "",
      projectVariables: [],
      dependencyInfo: null,
      specContext: "",
      specSource: "none",
      flowStepSpecs: [{ step: 1, spec: "spec content" }],
      enrichSystemPrompt: (p: string) => p,
      formatUserContext: () => "",
      formatFlowStepSpecs: () => "## Step Specs\nStep 1: spec content",
    });

    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "fix it" }),
      ctx,
    );
    const userContent = mockCallAI.mock.calls[0][0].messages[0].content;
    expect(userContent).toContain("Step Specs");
  });

  test("includes dependency info in user message when available", async () => {
    mockLoadAiContext.mockResolvedValueOnce({
      rules: "",
      enumAliases: "",
      projectVariables: [],
      dependencyInfo: "## Dependencies\nCategory must exist before Article",
      specContext: "",
      specSource: "none",
      flowStepSpecs: [],
      enrichSystemPrompt: (p: string) => p,
      formatUserContext: () => "",
      formatFlowStepSpecs: () => "",
    });

    const handler = getHandler();
    await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "fix deps" }),
      ctx,
    );
    const userContent = mockCallAI.mock.calls[0][0].messages[0].content;
    expect(userContent).toContain("Dependencies");
    expect(userContent).toContain("Category must exist before Article");
  });
});

describe("POST /api/edit-flow — error handling", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLoadAiContext.mockClear();
  });

  test("returns 500 for AiConfigError", async () => {
    const { AiConfigError } = require("../lib/aiClient");
    mockCallAI.mockRejectedValue(new AiConfigError("API key not configured"));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("API key not configured");
  });

  test("returns 402 for CreditDeniedError with credit details", async () => {
    const { CreditDeniedError } = require("../lib/aiClient");
    const creditInfo = {
      reason: "Project credits exhausted",
      projectCredits: { used: 100, limit: 100 },
      userCredits: { used: 50, limit: 200 },
    };
    mockCallAI.mockRejectedValue(new CreditDeniedError(creditInfo));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(402);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Project credits exhausted");
    expect(parsed.projectCredits).toEqual({ used: 100, limit: 100 });
    expect(parsed.userCredits).toEqual({ used: 50, limit: 200 });
  });

  test("returns 500 for generic errors with message", async () => {
    mockCallAI.mockRejectedValue(new Error("Network timeout"));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Network timeout");
  });

  test("returns 500 for non-Error throws with stringified value", async () => {
    mockCallAI.mockRejectedValue("something went wrong");

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("something went wrong");
  });
});

describe("POST /api/edit-flow — projectId fallback", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLoadAiContext.mockClear();
    mockCallAI.mockResolvedValue(makeCallAIResult(EDITED_XML));
  });

  test("uses 'unknown' projectId when getProjectId throws", async () => {
    // Temporarily override the auth mock's getProjectId
    const authModule = require("../lib/auth");
    const originalGetProjectId = authModule.getProjectId;
    authModule.getProjectId = () => { throw new Error("no project"); };

    try {
      const handler = getHandler();
      await handler(
        mockRequest("POST", { xml: SAMPLE_XML, prompt: "edit" }),
        ctx,
      );
      const arg = mockLoadAiContext.mock.calls[0][0];
      expect(arg.projectId).toBe("unknown");
    } finally {
      authModule.getProjectId = originalGetProjectId;
    }
  });
});
