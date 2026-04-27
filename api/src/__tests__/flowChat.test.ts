/**
 * Unit tests for the flow-chat Azure Function.
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

jest.mock("../lib/apiRules", () => ({
  extractVersionFolder: jest.fn((paths: string[]) => paths?.[0]?.split("/")?.[0] || null),
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
  analyzeCrossStepDependencies: jest.fn().mockReturnValue(""),
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

require("../functions/flowChat");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(): (req: unknown, ctx: InvocationContext) => Promise<any> {
  const calls = (app.http as jest.Mock).mock.calls;
  const flowChatCall = calls.find((c: any[]) => c[0] === "flowChat");
  if (!flowChatCall) throw new Error("flowChat not registered via app.http");
  return flowChatCall[1].handler;
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
      source: "flowChat",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("flowChat — registration", () => {
  test("registers with app.http as flowChat on route flow-chat", () => {
    const calls = (app.http as jest.Mock).mock.calls;
    const flowChatCall = calls.find((c: any[]) => c[0] === "flowChat");
    expect(flowChatCall).toBeDefined();
    expect(flowChatCall![1].route).toBe("flow-chat");
    expect(flowChatCall![1].methods).toEqual(["POST", "OPTIONS"]);
    expect(flowChatCall![1].authLevel).toBe("anonymous");
  });
});

describe("OPTIONS /api/flow-chat", () => {
  test("returns 204 with CORS headers", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
    expect(res.headers).toHaveProperty("Access-Control-Allow-Methods");
  });
});

describe("POST /api/flow-chat — validation", () => {
  test("returns 400 for invalid JSON body", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST"), ctx); // json() rejects
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Invalid JSON body");
  });

  test("returns 400 when messages is missing", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { specFiles: [] }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("messages array is required");
  });

  test("returns 400 when messages is empty array", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { messages: [] }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("messages array is required");
  });
});

describe("POST /api/flow-chat — successful response", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockCallAI.mockResolvedValue(makeCallAIResult("Here is a flow plan for you."));
  });

  test("returns 200 with reply and usage", async () => {
    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", {
        messages: [{ role: "user", content: "Create a GET test" }],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.reply).toBe("Here is a flow plan for you.");
    expect(parsed.usage).toBeDefined();
    expect(parsed.usage.inputTokens).toBe(500);
    expect(parsed.usage.outputTokens).toBe(200);
    expect(parsed.usage.totalTokens).toBe(700);
    expect(parsed.usage.costUsd).toBe(0.0045);
  });

  test("passes messages through to callAI", async () => {
    const handler = getHandler();
    const messages = [
      { role: "user", content: "Create a flow for articles" },
      { role: "assistant", content: "Sure, here is a plan." },
      { role: "user", content: "Add a DELETE step" },
    ];
    await handler(
      mockRequest("POST", { messages }),
      ctx,
    );
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.messages).toEqual(messages);
  });

  test("passes credits to callAI with correct identity", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
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

  test("passes source flowChat and maxTokens 4096 to callAI", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.source).toBe("flowChat");
    expect(callArg.maxTokens).toBe(4096);
  });

  test("passes requestedModel from body to callAI", async () => {
    const handler = getHandler();
    await handler(
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
        model: "claude-opus-4",
      }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.requestedModel).toBe("claude-opus-4");
  });
});

describe("POST /api/flow-chat — error handling", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  test("returns 500 for AiConfigError", async () => {
    const { AiConfigError } = require("../lib/aiClient");
    mockCallAI.mockRejectedValue(new AiConfigError("API key not configured"));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
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
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
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
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
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
      mockRequest("POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("something went wrong");
  });
});
