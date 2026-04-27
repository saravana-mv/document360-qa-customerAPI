/* ------------------------------------------------------------------ */
/*  Unit tests — generateTitle Azure Function                        */
/* ------------------------------------------------------------------ */

// ---- Mocks (must be declared before any import that triggers registration) ----

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  ProjectIdMissingError: class extends Error {
    constructor() {
      super("missing");
    }
  },
}));

const mockCallAI = jest.fn();

// We need a real class reference so `instanceof` checks work inside the handler.
class MockAiConfigError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "AiConfigError";
  }
}

jest.mock("../lib/aiClient", () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
  AiConfigError: MockAiConfigError,
  CreditDeniedError: class extends Error {
    creditDenied: unknown;
    constructor(b: unknown) {
      super("denied");
      this.name = "CreditDeniedError";
      this.creditDenied = b;
    }
  },
}));

// ---- Import (triggers app.http registration via the mock) ----

import { app } from "@azure/functions";

// require() uses the same module cache as import for the @azure/functions mock,
// so app.http calls from the source module are captured on this same mock.
require("../functions/generateTitle");

// ---- Grab the registered handler ----

// The mock's app.http may have been called by other test files in the same run,
// so find the specific registration for "generateTitle".
const allCalls = (app.http as jest.Mock).mock.calls;
const gtCall = allCalls.find((c: unknown[]) => c[0] === "generateTitle");
if (!gtCall) {
  // Fallback: if module-level registration didn't fire on this mock instance,
  // we need to re-require after clearing the module from cache.
  const modPath = require.resolve("../functions/generateTitle");
  delete require.cache[modPath];
  require("../functions/generateTitle");
}
const registered = (app.http as jest.Mock).mock.calls.find((c: unknown[]) => c[0] === "generateTitle")!;
const handlerFn = registered[1].handler as (
  req: unknown,
  ctx: unknown,
) => Promise<{ status: number; headers?: Record<string, string>; body?: string }>;

// ---- Helpers ----

function mockRequest(method: string, body?: unknown) {
  const jsonMock =
    body === undefined
      ? jest.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input"))
      : jest.fn().mockResolvedValue(body);

  return {
    method,
    query: new URLSearchParams(),
    json: jsonMock,
    headers: { get: () => null },
  };
}

function parseBody(res: { body?: string }) {
  return res.body ? JSON.parse(res.body) : undefined;
}

const dummyCtx = {};

// ---- Tests ----

describe("generateTitle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ---- OPTIONS / CORS ---- */

  it("returns 204 with CORS headers for OPTIONS request", async () => {
    const req = mockRequest("OPTIONS");
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(204);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    expect(res.body).toBeUndefined();
  });

  /* ---- 400 — Invalid JSON ---- */

  it("returns 400 when request body is not valid JSON", async () => {
    const req = mockRequest("POST"); // body undefined → json() rejects
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(400);
    const data = parseBody(res);
    expect(data.error).toBe("Invalid JSON body");
  });

  /* ---- 400 — Missing / empty prompt ---- */

  it("returns 400 when prompt is missing", async () => {
    const req = mockRequest("POST", {});
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(400);
    expect(parseBody(res).error).toBe("prompt is required");
  });

  it("returns 400 when prompt is an empty string", async () => {
    const req = mockRequest("POST", { prompt: "" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(400);
    expect(parseBody(res).error).toBe("prompt is required");
  });

  it("returns 400 when prompt is only whitespace", async () => {
    const req = mockRequest("POST", { prompt: "   \n\t  " });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(400);
    expect(parseBody(res).error).toBe("prompt is required");
  });

  /* ---- 200 — Successful title generation ---- */

  it("returns 200 with title and usage on success", async () => {
    mockCallAI.mockResolvedValue({
      text: "  Create article with category  ",
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, costUsd: 0.001 },
    });

    const req = mockRequest("POST", { prompt: "Generate a test that creates an article" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(200);
    const data = parseBody(res);
    expect(data.title).toBe("Create article with category");
    expect(data.usage).toEqual({
      inputTokens: 50,
      outputTokens: 10,
      totalTokens: 60,
      costUsd: 0.001,
    });
  });

  /* ---- Title truncation ---- */

  it("truncates title to 80 characters", async () => {
    const longTitle = "A".repeat(120);
    mockCallAI.mockResolvedValue({
      text: longTitle,
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, costUsd: 0.002 },
    });

    const req = mockRequest("POST", { prompt: "some prompt" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(200);
    const data = parseBody(res);
    expect(data.title).toHaveLength(80);
    expect(data.title).toBe("A".repeat(80));
  });

  /* ---- Prompt truncation to 2000 chars ---- */

  it("truncates prompt to 2000 characters before sending to AI", async () => {
    const longPrompt = "B".repeat(5000);
    mockCallAI.mockResolvedValue({
      text: "Short title",
      usage: { inputTokens: 100, outputTokens: 5, totalTokens: 105, costUsd: 0.003 },
    });

    const req = mockRequest("POST", { prompt: longPrompt });
    await handlerFn(req, dummyCtx);

    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.messages[0].content).toHaveLength(2000);
    expect(callArgs.messages[0].content).toBe("B".repeat(2000));
  });

  /* ---- callAI arguments ---- */

  it("passes correct parameters to callAI (source, maxTokens, no credits)", async () => {
    mockCallAI.mockResolvedValue({
      text: "Title",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.0005 },
    });

    const req = mockRequest("POST", { prompt: "test prompt" });
    await handlerFn(req, dummyCtx);

    const callArgs = mockCallAI.mock.calls[0][0];
    expect(callArgs.source).toBe("generateTitle");
    expect(callArgs.maxTokens).toBe(100);
    expect(callArgs.system).toBeDefined();
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe("user");
    // Title generation is free — no credits param should be present
    expect(callArgs).not.toHaveProperty("credits");
    expect(callArgs).not.toHaveProperty("projectId");
  });

  /* ---- 500 — AiConfigError ---- */

  it("returns 500 with error message for AiConfigError", async () => {
    mockCallAI.mockRejectedValue(new MockAiConfigError("API key not configured"));

    const req = mockRequest("POST", { prompt: "test prompt" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(500);
    expect(parseBody(res).error).toBe("API key not configured");
  });

  /* ---- 500 — Generic Error ---- */

  it("returns 500 with error message for generic Error", async () => {
    mockCallAI.mockRejectedValue(new Error("Connection timeout"));

    const req = mockRequest("POST", { prompt: "test prompt" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(500);
    expect(parseBody(res).error).toBe("Connection timeout");
  });

  it("returns 500 with stringified value for non-Error throws", async () => {
    mockCallAI.mockRejectedValue("unexpected string error");

    const req = mockRequest("POST", { prompt: "test prompt" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(500);
    expect(parseBody(res).error).toBe("unexpected string error");
  });

  /* ---- CORS headers on all responses ---- */

  it("includes CORS headers on 400 responses", async () => {
    const req = mockRequest("POST", { prompt: "" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(400);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": "*",
    });
  });

  it("includes CORS headers on 500 responses", async () => {
    mockCallAI.mockRejectedValue(new Error("fail"));

    const req = mockRequest("POST", { prompt: "test" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(500);
    expect(res.headers).toMatchObject({
      "Access-Control-Allow-Origin": "*",
    });
  });

  it("includes Content-Type application/json on success responses", async () => {
    mockCallAI.mockResolvedValue({
      text: "Title",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.0005 },
    });

    const req = mockRequest("POST", { prompt: "test" });
    const res = await handlerFn(req, dummyCtx);

    expect(res.status).toBe(200);
    expect(res.headers?.["Content-Type"]).toBe("application/json");
  });
});
