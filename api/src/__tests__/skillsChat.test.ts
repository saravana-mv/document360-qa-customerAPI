/**
 * Unit tests for the skills-chat Azure Function.
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

require("../functions/skillsChat");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(): (req: unknown, ctx: InvocationContext) => Promise<any> {
  const calls = (app.http as jest.Mock).mock.calls;
  const skillsChatCall = calls.find((c: any[]) => c[0] === "skillsChat");
  if (!skillsChatCall) throw new Error("skillsChat not registered via app.http");
  return skillsChatCall[1].handler;
}

function makeResult(text: string) {
  return {
    text,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.003 },
    raw: {},
  };
}

function mockRequest(method: string, body?: unknown) {
  return {
    method,
    query: new URLSearchParams(),
    json: body !== undefined
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error("no body")),
    headers: { get: () => null },
  };
}

const ctx = {} as InvocationContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skillsChat — registration", () => {
  test("registers with app.http as skillsChat on route skills-chat", () => {
    const calls = (app.http as jest.Mock).mock.calls;
    const call = calls.find((c: any[]) => c[0] === "skillsChat");
    expect(call).toBeDefined();
    expect(call![1].route).toBe("skills-chat");
    expect(call![1].methods).toEqual(["POST", "OPTIONS"]);
    expect(call![1].authLevel).toBe("anonymous");
  });
});

describe("OPTIONS /api/skills-chat", () => {
  test("returns 204 with CORS headers", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
  });
});

describe("POST /api/skills-chat — validation", () => {
  test("returns 400 for invalid JSON body", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST"), ctx); // json() rejects
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Invalid JSON body");
  });

  test("returns 400 when instruction is missing", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { currentContent: "# Rules" }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("instruction is required");
  });

  test("returns 400 when instruction is empty string", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("POST", { instruction: "   " }), ctx);
    expect(res.status).toBe(400);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("instruction is required");
  });
});

describe("POST /api/skills-chat — successful response", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  test("returns 200 with updatedContent and usage", async () => {
    const updatedText = "## Rules\n- Never skip auth headers";
    mockCallAI.mockResolvedValue(makeResult(updatedText));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { currentContent: "## Rules", instruction: "add auth rule" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.updatedContent).toBe(updatedText);
    expect(parsed.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: 0.003,
    });
  });

  test("strips markdown fences from AI response", async () => {
    const fenced = "```markdown\n## Rules\n- New rule\n```";
    mockCallAI.mockResolvedValue(makeResult(fenced));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { currentContent: "", instruction: "add rule" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.updatedContent).not.toContain("```");
    expect(parsed.updatedContent).toBe("## Rules\n- New rule");
  });

  test("strips md fence variant from AI response", async () => {
    const fenced = "```md\n## Rules\n```";
    mockCallAI.mockResolvedValue(makeResult(fenced));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { currentContent: "", instruction: "add rule" }),
      ctx,
    );
    const parsed = JSON.parse(res.body as string);
    expect(parsed.updatedContent).not.toContain("```");
    expect(parsed.updatedContent).toBe("## Rules");
  });

  test("sends different user message when currentContent is empty", async () => {
    mockCallAI.mockResolvedValue(makeResult("## Rules\n- First rule"));

    const handler = getHandler();
    await handler(
      mockRequest("POST", { currentContent: "", instruction: "add first rule" }),
      ctx,
    );
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    const callArg = mockCallAI.mock.calls[0][0];
    const userContent = callArg.messages[0].content;
    expect(userContent).toContain("currently empty");
    expect(userContent).toContain("add first rule");
    expect(userContent).not.toContain("---");
  });

  test("sends content-based user message when currentContent is present", async () => {
    mockCallAI.mockResolvedValue(makeResult("## Rules\n- Updated"));

    const handler = getHandler();
    await handler(
      mockRequest("POST", { currentContent: "## Rules\n- Old", instruction: "update rule" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    const userContent = callArg.messages[0].content;
    expect(userContent).toContain("## Rules\n- Old");
    expect(userContent).toContain("---");
    expect(userContent).toContain("update rule");
  });

  test("passes credits to callAI with correct identity", async () => {
    mockCallAI.mockResolvedValue(makeResult("content"));

    const handler = getHandler();
    await handler(
      mockRequest("POST", { instruction: "add rule" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.credits).toEqual({
      projectId: "test-project",
      userId: "test-oid",
      displayName: "test@example.com",
    });
  });

  test("passes source and maxTokens to callAI", async () => {
    mockCallAI.mockResolvedValue(makeResult("content"));

    const handler = getHandler();
    await handler(
      mockRequest("POST", { instruction: "add rule" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.source).toBe("skillsChat");
    expect(callArg.maxTokens).toBe(4096);
  });

  test("passes requestedModel from body to callAI", async () => {
    mockCallAI.mockResolvedValue(makeResult("content"));

    const handler = getHandler();
    await handler(
      mockRequest("POST", { instruction: "add rule", model: "claude-opus-4" }),
      ctx,
    );
    const callArg = mockCallAI.mock.calls[0][0];
    expect(callArg.requestedModel).toBe("claude-opus-4");
  });
});

describe("POST /api/skills-chat — error handling", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  test("returns 500 for AiConfigError", async () => {
    const { AiConfigError } = require("../lib/aiClient");
    mockCallAI.mockRejectedValue(new AiConfigError("API key not configured"));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { instruction: "add rule" }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("API key not configured");
  });

  test("returns 402 for CreditDeniedError", async () => {
    const { CreditDeniedError } = require("../lib/aiClient");
    const creditInfo = {
      reason: "Project credits exhausted",
      projectCredits: { used: 100, limit: 100 },
      userCredits: { used: 50, limit: 200 },
    };
    mockCallAI.mockRejectedValue(new CreditDeniedError(creditInfo));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { instruction: "add rule" }),
      ctx,
    );
    expect(res.status).toBe(402);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("Project credits exhausted");
  });

  test("returns 500 for generic errors", async () => {
    mockCallAI.mockRejectedValue(new Error("Network timeout"));

    const handler = getHandler();
    const res = await handler(
      mockRequest("POST", { instruction: "add rule" }),
      ctx,
    );
    expect(res.status).toBe(500);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toContain("Network timeout");
  });
});
